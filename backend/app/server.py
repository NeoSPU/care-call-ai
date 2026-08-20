"""Small HTTP dev server for Docker/local demo checks.

The production CALL-E execution path stays behind explicit approval gates. This
server only exposes health and no-call preflight data for local verification.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, is_dataclass, replace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .api_models import (
    approval_record_payload,
    callback_requests_payload,
    dashboard_payload,
    execution_payload,
    operations_dashboard_payload,
    preflight_plan_payload,
    print_orders_payload,
    recipient_detail_payload,
    result_bundle_payload,
    run_status_payload,
    service_requests_payload,
)
from .approval import OperatorApproval, validate_operator_approval
from .call_planning import build_call_plan_previews
from .calle_execution import CallRunRecord, CallRunStatus, execute_approved_previews, fetch_call_result
from .calle_readiness import CalleReadiness, check_calle_readiness
from .domain import (
    AuthorizedContact,
    CallSuitability,
    CareProfile,
    Condition,
    Consent,
    ConsentStatus,
    Recipient,
    SafetyCategory,
    Severity,
)
from .repository import Repository, connect, init_schema, seed_database
from .storage import DEFAULT_SEED_PATH, load_seed_recipients


DEFAULT_DB_PATH = Path(os.environ.get("CARECALL_DB_PATH", "data/carecall.sqlite3"))
BACKEND_API_CREDENTIAL_ENV = "CARECALL_BACKEND_API_TOKEN"
REQUIRED_CONFIRMATIONS = ("active_consent", "care_route_match", "exact_keyset", "real_side_effects")
LIVE_AUTHORIZATION_PHRASE = "EXECUTE LIVE CALLS"
TERMINAL_PROVIDER_STATUSES = {
    "busy",
    "canceled",
    "cancelled",
    "completed",
    "declined",
    "expired",
    "failed",
    "no_answer",
    "voicemail",
}
NO_CONTACT_PROVIDER_STATUSES = {"busy", "declined", "expired", "no_answer", "voicemail"}
FAILED_PROVIDER_STATUSES = {"canceled", "cancelled", "failed"}


def backend_api_credential(env: dict[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    configured = env.get(BACKEND_API_CREDENTIAL_ENV, "").strip()
    if configured:
        return configured
    if env.get("CARECALL_ENV") == "production":
        return ""
    return "carecall-local-backend-token"


def protected_backend_path(path: str) -> bool:
    return path == "/preflight" or path.startswith("/api/")


def authorized_backend_request(headers, path: str, env: dict[str, str] | None = None) -> bool:
    if not protected_backend_path(path):
        return True
    expected_value = backend_api_credential(env)
    if not expected_value:
        return False
    return headers.get("Authorization", "") == f"Bearer {expected_value}"


def _json_default(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, tuple):
        return list(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def preflight_payload(call_date: str = "2026-08-01") -> dict[str, Any]:
    recipients = load_seed_recipients()
    previews = build_call_plan_previews(recipients, call_date)
    ready_count = sum(1 for preview in previews if preview.ready)

    return {
        "service": "carecall-backend",
        "call_date": call_date,
        "dry_run": True,
        "real_calls_placed": 0,
        "summary": {
            "recipients": len(previews),
            "ready": ready_count,
            "blocked": len(previews) - ready_count,
        },
        "previews": previews,
    }


def initialize_database(db_path: str | Path = DEFAULT_DB_PATH, env: dict[str, str] | None = None) -> None:
    env = env or os.environ
    conn = connect(db_path)
    try:
        init_schema(conn)
        repo = Repository(conn)
        if not repo.list_recipients():
            seed_database(repo, load_seed_recipients(DEFAULT_SEED_PATH))
        _apply_runtime_demo_overrides(repo, env)
        repo.reconcile_safety_routes()
    finally:
        conn.close()


def _apply_runtime_demo_overrides(repo: Repository, env: dict[str, str]) -> None:
    phone = env.get("CARECALL_DEMO_MAX_PHONE", "").strip()
    if not phone:
        return
    repo.upsert_recipient(
        Recipient(
            id="rec-demo-max",
            display_name="Max Neous",
            phone_e164=phone,
            consent=Consent(
                status=ConsentStatus.EXPLICIT_CONSENT,
                evidence="Runtime demo participant configured through CARECALL_DEMO_MAX_PHONE; do not commit real numbers.",
            ),
            care_profile=CareProfile(
                condition=Condition.ALZHEIMER,
                severity=Severity.MILD,
                language="en",
                timezone="Europe/London",
                call_suitability=CallSuitability.DIRECT_CALL_OK,
                communication_rules=(
                    "short_simple_sentences",
                    "ask_speaker_identity_first",
                    "do_not_test_memory",
                    "offer_simple_choices",
                ),
            ),
            authorized_contacts=(
                AuthorizedContact(
                    name="Marija Neous",
                    relationship="trusted_contact",
                    can_answer_intake=True,
                    preferred_goodbye="All the best, Ms Marija.",
                ),
            ),
            notes="Runtime-only fictional demo card for the final CALL-E test; phone comes from local env.",
        )
    )


def dashboard_api_payload(db_path: str | Path = DEFAULT_DB_PATH, call_date: str = "2026-08-01") -> dict[str, Any]:
    conn = connect(db_path)
    try:
        return dashboard_payload(Repository(conn).get_dashboard_state(call_date))
    finally:
        conn.close()


def operations_dashboard_api_payload(db_path: str | Path = DEFAULT_DB_PATH, call_date: str = "2026-08-01") -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        batches = repo.list_batches()
        selected_ids = batches[0].selected_recipient_ids if batches else ()
        return operations_dashboard_payload(repo.get_dashboard_state(call_date), selected_ids)
    finally:
        conn.close()


def recipient_api_payload(db_path: str | Path, recipient_id: str) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        return recipient_detail_payload(Repository(conn).get_recipient_detail(recipient_id))
    finally:
        conn.close()


def update_recipient_safety(db_path: str | Path, recipient_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    category = SafetyCategory(str(payload.get("safety_category", "")))
    reason = str(payload.get("reason", payload.get("note", "")))
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        repo.update_safety_category(recipient_id, category, reason)
        detail = repo.get_recipient_detail(recipient_id)
        response = recipient_detail_payload(detail)
        response["approval_invalidated"] = any(approval.stale for approval in detail.approvals)
        return response
    finally:
        conn.close()


def update_recipient_card(db_path: str | Path, recipient_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        detail = repo.update_recipient_card(
            recipient_id,
            display_name=str(payload.get("display_name", "")),
            phone_e164=str(payload.get("phone_e164", "")),
            caregiver_phone_e164=str(payload.get("caregiver_phone_e164", "")),
            delivery_area=str(payload.get("delivery_area", "")),
            address=str(payload.get("address", "")),
            notes=str(payload.get("notes", "")),
            safety_category=SafetyCategory(str(payload.get("safety_category", ""))),
            condition=Condition(str(payload.get("condition", ""))),
            severity=Severity(str(payload.get("severity", ""))),
            language=str(payload.get("language", "")),
            timezone=str(payload.get("timezone", "")),
            communication_rules=tuple(
                str(rule).strip()
                for rule in payload.get("communication_rules", ())
                if str(rule).strip()
            ),
            authorized_contacts=_authorized_contacts_from_payload(payload.get("authorized_contacts", ())),
            safety_change_reason=str(payload.get("safety_change_reason", payload.get("reason", ""))),
            operator=str(payload.get("operator", "carecall-coordinator")),
        )
        response = recipient_detail_payload(detail)
        response["approval_invalidated"] = any(approval.stale for approval in detail.approvals)
        return response
    finally:
        conn.close()


def _authorized_contacts_from_payload(value: Any) -> tuple[AuthorizedContact, ...]:
    if not isinstance(value, list):
        raise ValueError("Authorized contacts must be a list.")
    contacts: list[AuthorizedContact] = []
    for raw_contact in value:
        if not isinstance(raw_contact, dict):
            raise ValueError("Authorized contact must be an object.")
        name = str(raw_contact.get("name", "")).strip()
        if not name:
            continue
        contacts.append(
            AuthorizedContact(
                name=name,
                relationship=str(raw_contact.get("relationship", "")).strip(),
                can_answer_intake=bool(raw_contact.get("can_answer_intake", True)),
                preferred_goodbye=str(raw_contact.get("preferred_goodbye", "")).strip(),
            )
        )
    return tuple(contacts)


def create_batch_api_payload(db_path: str | Path, payload: dict[str, Any]) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        batch = repo.create_batch(
            payload.get("selected_recipient_ids", ()),
            label=str(payload.get("label", "CareCall daily round")),
            call_date=str(payload.get("call_date", "2026-08-01")),
        )
        return {
            "batch": {
                "id": batch.id,
                "label": batch.label,
                "call_date": batch.call_date,
                "selected_recipient_ids": list(batch.selected_recipient_ids),
            }
        }
    finally:
        conn.close()


def save_special_handling_approval_api_payload(
    db_path: str | Path,
    recipient_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        return Repository(conn).save_special_handling_review(
            recipient_id,
            card_reviewed=bool(payload.get("card_reviewed")),
            approved_for_automated_round=bool(payload.get("approved_for_automated_round")),
            note=str(payload.get("note", "")),
            operator=str(payload.get("operator", "carecall-coordinator")),
        )
    finally:
        conn.close()


def create_preflight_api_payload(db_path: str | Path, payload: dict[str, Any]) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        batch = repo.get_batch(str(payload.get("batch_id", "")))
        ready_previews, manual_previews, blocked_previews = _categorized_previews(repo, batch.id)
        plan = repo.save_preflight_plan(
            batch.id,
            tuple(preview.idempotency_key for preview in ready_previews),
        )
        return preflight_plan_payload(plan, ready_previews, manual_previews, blocked_previews)
    finally:
        conn.close()


def approve_preflight_api_payload(db_path: str | Path, payload: dict[str, Any]) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        plan = repo.get_preflight_plan(str(payload.get("plan_id", "")))
        ready_previews, manual_previews, blocked_previews = _categorized_previews(repo, plan.batch_id)
        current_previews = ready_previews + manual_previews + blocked_previews
        approval = OperatorApproval(
            approved_keys=tuple(str(key) for key in payload.get("approved_keys", ())),
            approver=str(payload.get("operator", "")),
            approved_at="api-request",
            note=str(payload.get("note", "")),
        )
        decision = validate_operator_approval(current_previews, approval)
        reasons = list(decision.reasons)
        if tuple(sorted(payload.get("approved_keys", ()))) != tuple(sorted(plan.ready_keys)):
            reasons.append("Approval must match the current exact ready keyset.")
        if not _all_confirmations(payload.get("confirmations", {})):
            reasons.append("All four confirmations are required.")
        if str(payload.get("authorization_phrase", "")) != LIVE_AUTHORIZATION_PHRASE:
            reasons.append("Authorization phrase must equal EXECUTE LIVE CALLS.")
        if reasons:
            return approval_record_payload(None, False, "rejected", tuple(reasons))

        record = repo.save_approval(
            plan.id,
            tuple(str(key) for key in payload.get("approved_keys", ())),
            operator=approval.approver,
            note=approval.note,
            confirmations=dict(payload.get("confirmations", {})),
            authorization_phrase=str(payload.get("authorization_phrase", "")),
        )
        return approval_record_payload(record, True)
    finally:
        conn.close()


def execute_dry_run_api_payload(db_path: str | Path, payload: dict[str, Any]) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        plan = repo.get_preflight_plan(str(payload.get("plan_id", "")))
        approval = repo.get_approval(str(payload.get("approval_id", "")))
        ready_previews, manual_previews, blocked_previews = _categorized_previews(repo, plan.batch_id)
        blockers = _approval_execution_blockers(plan, approval, ready_previews, manual_previews, blocked_previews)
        if blockers:
            return execution_payload((), False, "dry_run", blockers)
        records = tuple(
            CallRunRecord(
                recipient_id=preview.recipient_id,
                idempotency_key=preview.idempotency_key,
                status=CallRunStatus.PLANNED,
                masked_phone=preview.masked_phone,
            )
            for preview in ready_previews
        )
        stored = repo.save_call_runs(plan.id, approval.id, records, mode="dry_run")
        return execution_payload(stored, True, "dry_run")
    finally:
        conn.close()


def execute_live_api_payload(
    db_path: str | Path,
    payload: dict[str, Any],
    env: dict[str, str] | None = None,
    readiness: CalleReadiness | None = None,
    runner=None,
) -> dict[str, Any]:
    env = os.environ if env is None else env
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        plan = repo.get_preflight_plan(str(payload.get("plan_id", "")))
        approval = repo.get_approval(str(payload.get("approval_id", "")))
        ready_previews, manual_previews, blocked_previews = _categorized_previews(repo, plan.batch_id)
        blockers = list(_approval_execution_blockers(plan, approval, ready_previews, manual_previews, blocked_previews))
        submitted_keys = payload.get("approved_keys")
        if submitted_keys is not None and tuple(sorted(submitted_keys)) != tuple(sorted(plan.ready_keys)):
            blockers.append("Live execution requires the current exact keyset.")
        if env.get("CARECALL_LIVE_CALLS_ENABLED") != "true":
            blockers.append("Live calls are disabled unless CARECALL_LIVE_CALLS_ENABLED=true.")
        if not _all_confirmations(payload.get("confirmations", {})):
            blockers.append("All four confirmations are required for live execution.")
        if str(payload.get("authorization_phrase", "")) != LIVE_AUTHORIZATION_PHRASE:
            blockers.append("Authorization phrase must equal EXECUTE LIVE CALLS.")
        max_batch_size = _max_live_batch_size(env)
        if len(ready_previews) > max_batch_size:
            blockers.append(f"Live batch size exceeds CARECALL_MAX_LIVE_BATCH_SIZE={max_batch_size}.")

        readiness = readiness if readiness is not None else check_calle_readiness()
        if not readiness.ready:
            blockers.append("CALL-E readiness check is not passing.")
        if blockers:
            return execution_payload((), False, "live", tuple(blockers))

        operator_approval = OperatorApproval(
            approved_keys=approval.approved_keys,
            approver=approval.operator,
            approved_at=approval.approved_at,
            note=approval.note,
        )
        if runner is None:
            batch = execute_approved_previews(ready_previews, operator_approval, readiness)
            runner_commands = ()
        else:
            batch = execute_approved_previews(ready_previews, operator_approval, readiness, runner)
            runner_commands = tuple(getattr(runner, "commands", ()))
        if batch.blocked_reasons:
            return execution_payload((), False, "live", batch.blocked_reasons, runner_commands)
        stored = repo.save_call_runs(plan.id, approval.id, batch.records, mode="live")
        if not batch.success:
            reasons = tuple(record.error for record in batch.records if record.error) or ("CALL-E execution failed.",)
            return execution_payload(stored, False, "live", reasons, runner_commands=runner_commands)
        return execution_payload(stored, True, "live", runner_commands=runner_commands)
    finally:
        conn.close()


def run_status_api_payload(db_path: str | Path, run_id: str) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        return run_status_payload(Repository(conn).get_call_run(run_id))
    finally:
        conn.close()


def run_result_api_payload(db_path: str | Path, run_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        return result_bundle_payload(Repository(conn).save_run_result_bundle(run_id, payload))
    finally:
        conn.close()


def import_run_result_api_payload(db_path: str | Path, run_id: str, runner=None) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        run = repo.get_call_run(run_id)
        if not run.provider_run_id:
            raise ValueError("Stored run has no provider_run_id to import.")

        provider_payload = fetch_call_result(run.provider_run_id) if runner is None else fetch_call_result(run.provider_run_id, runner)
        provider_status = _provider_status(provider_payload)
        if provider_status not in TERMINAL_PROVIDER_STATUSES:
            return {
                "imported": False,
                "provider_status": provider_status or "unknown",
                "run": run_status_payload(run)["run"],
            }

        bundle = repo.save_run_result_bundle(run_id, _normalized_provider_result(provider_payload, provider_status))
        payload = result_bundle_payload(bundle)
        payload["imported"] = True
        payload["provider_status"] = provider_status
        return payload
    finally:
        conn.close()


def service_requests_api_payload(db_path: str | Path) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        return service_requests_payload(Repository(conn).list_service_requests())
    finally:
        conn.close()


def print_orders_api_payload(db_path: str | Path, env: dict[str, str] | None = None) -> dict[str, Any]:
    env = os.environ if env is None else env
    conn = connect(db_path)
    try:
        return print_orders_payload(
            Repository(conn).get_dashboard_state(),
            include_demo_ready=env.get("CARECALL_DEMO_PRINT_ORDERS") == "true",
        )
    finally:
        conn.close()


def callback_requests_api_payload(db_path: str | Path) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        return callback_requests_payload(repo.list_callback_requests(), repo.get_dashboard_state())
    finally:
        conn.close()


def create_callback_request_api_payload(db_path: str | Path, payload: dict[str, Any]) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        request = repo.create_callback_request(
            recipient_id=str(payload.get("recipient_id", "")),
            source=str(payload.get("source", "operator_created")),
            request_text=str(payload.get("request_text", "Please call me back.")),
            priority=str(payload.get("priority", "urgent")),
            operator=str(payload.get("operator", "")),
        )
        return callback_requests_payload((request,), repo.get_dashboard_state())
    finally:
        conn.close()


def update_callback_request_api_payload(db_path: str | Path, callback_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        request = repo.update_callback_request(
            callback_id,
            status=str(payload.get("status", "")),
            operator=str(payload.get("operator", "carecall-coordinator")),
            resolution_note=str(payload.get("resolution_note", "")),
        )
        return callback_requests_payload((request,), repo.get_dashboard_state())
    finally:
        conn.close()


class CareCallHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json({"ok": True, "service": "carecall-backend"})
            return
        if not self._authorized(path):
            return
        if path == "/preflight":
            self._send_json(preflight_payload())
            return
        if path == "/api/dashboard":
            initialize_database(DEFAULT_DB_PATH)
            self._send_json(dashboard_api_payload(DEFAULT_DB_PATH))
            return
        if path == "/api/operations/dashboard":
            initialize_database(DEFAULT_DB_PATH)
            self._send_json(operations_dashboard_api_payload(DEFAULT_DB_PATH))
            return
        if path == "/api/callback-requests":
            initialize_database(DEFAULT_DB_PATH)
            self._send_json(callback_requests_api_payload(DEFAULT_DB_PATH))
            return
        if path == "/api/service-requests":
            initialize_database(DEFAULT_DB_PATH)
            self._send_json(service_requests_api_payload(DEFAULT_DB_PATH))
            return
        if path == "/api/orders/print":
            initialize_database(DEFAULT_DB_PATH)
            self._send_json(print_orders_api_payload(DEFAULT_DB_PATH))
            return
        if path.startswith("/api/runs/"):
            initialize_database(DEFAULT_DB_PATH)
            run_id = path.removeprefix("/api/runs/").strip("/")
            try:
                self._send_json(run_status_api_payload(DEFAULT_DB_PATH, run_id))
            except KeyError:
                self._send_json({"error": "run_not_found"}, status=404)
            return
        if path.startswith("/api/recipients/"):
            initialize_database(DEFAULT_DB_PATH)
            recipient_id = path.removeprefix("/api/recipients/")
            try:
                self._send_json(recipient_api_payload(DEFAULT_DB_PATH, recipient_id))
            except KeyError:
                self._send_json({"error": "recipient_not_found"}, status=404)
            return

        self._send_json({"error": "not_found"}, status=404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if not self._authorized(path):
            return
        initialize_database(DEFAULT_DB_PATH)
        try:
            if path == "/api/batches":
                self._send_json(create_batch_api_payload(DEFAULT_DB_PATH, self._read_json()), status=201)
                return
            if path == "/api/callback-requests":
                self._send_json(create_callback_request_api_payload(DEFAULT_DB_PATH, self._read_json()), status=201)
                return
            if path == "/api/preflight":
                self._send_json(create_preflight_api_payload(DEFAULT_DB_PATH, self._read_json()), status=201)
                return
            if path == "/api/approvals":
                payload = approve_preflight_api_payload(DEFAULT_DB_PATH, self._read_json())
                self._send_json(payload, status=200 if payload["approved"] else 409)
                return
            if path == "/api/execution/dry-run":
                payload = execute_dry_run_api_payload(DEFAULT_DB_PATH, self._read_json())
                self._send_json(payload, status=200 if payload["accepted"] else 409)
                return
            if path == "/api/execution/live":
                payload = execute_live_api_payload(DEFAULT_DB_PATH, self._read_json())
                self._send_json(payload, status=200 if payload["accepted"] else 409)
                return
            if path.startswith("/api/runs/") and path.endswith("/import"):
                run_id = path.removeprefix("/api/runs/").removesuffix("/import").strip("/")
                self._send_json(import_run_result_api_payload(DEFAULT_DB_PATH, run_id), status=200)
                return
            if path.startswith("/api/recipients/") and path.endswith("/special-handling-approval"):
                recipient_id = path.removeprefix("/api/recipients/").removesuffix("/special-handling-approval").strip("/")
                self._send_json(
                    save_special_handling_approval_api_payload(DEFAULT_DB_PATH, recipient_id, self._read_json()),
                    status=201,
                )
                return
            if path.startswith("/api/runs/") and path.endswith("/result"):
                run_id = path.removeprefix("/api/runs/").removesuffix("/result").strip("/")
                self._send_json(run_result_api_payload(DEFAULT_DB_PATH, run_id, self._read_json()), status=201)
                return
        except KeyError as exc:
            self._send_json({"error": "not_found", "detail": str(exc)}, status=404)
            return
        except ValueError as exc:
            self._send_json({"error": "bad_request", "detail": str(exc)}, status=400)
            return
        self._send_json({"error": "not_found"}, status=404)

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path
        if not self._authorized(path):
            return
        if path.startswith("/api/recipients/") and path.endswith("/card"):
            initialize_database(DEFAULT_DB_PATH)
            recipient_id = path.removeprefix("/api/recipients/").removesuffix("/card").strip("/")
            try:
                self._send_json(update_recipient_card(DEFAULT_DB_PATH, recipient_id, self._read_json()))
            except KeyError:
                self._send_json({"error": "recipient_not_found"}, status=404)
            except ValueError as exc:
                self._send_json({"error": "bad_request", "detail": str(exc)}, status=400)
            return
        if path.startswith("/api/recipients/") and path.endswith("/safety"):
            initialize_database(DEFAULT_DB_PATH)
            recipient_id = path.removeprefix("/api/recipients/").removesuffix("/safety").strip("/")
            try:
                self._send_json(update_recipient_safety(DEFAULT_DB_PATH, recipient_id, self._read_json()))
            except (KeyError, ValueError) as exc:
                self._send_json({"error": str(exc)}, status=400)
            return
        if path.startswith("/api/callback-requests/"):
            initialize_database(DEFAULT_DB_PATH)
            callback_id = path.removeprefix("/api/callback-requests/").strip("/")
            try:
                self._send_json(update_callback_request_api_payload(DEFAULT_DB_PATH, callback_id, self._read_json()))
            except KeyError:
                self._send_json({"error": "callback_request_not_found"}, status=404)
            except ValueError as exc:
                self._send_json({"error": "bad_request", "detail": str(exc)}, status=400)
            return
        self._send_json({"error": "not_found"}, status=404)

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw)

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, default=_json_default, indent=2).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        allowed_origins = {"http://127.0.0.1:3000", "http://localhost:3000"}
        if origin in allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")

    def _authorized(self, path: str) -> bool:
        if authorized_backend_request(self.headers, path):
            return True
        self._send_json({"error": "unauthorized"}, status=401)
        return False


def run(host: str = "0.0.0.0", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), CareCallHandler)
    print(f"CareCall backend dev server listening on http://{host}:{port}")
    server.serve_forever()


def _categorized_previews(repo: Repository, batch_id: str):
    batch = repo.get_batch(batch_id)
    recipients = [repo.get_recipient(recipient_id) for recipient_id in batch.selected_recipient_ids]
    previews = build_call_plan_previews(recipients, batch.call_date)
    ready = []
    manual = []
    blocked = []
    for recipient, preview in zip(recipients, previews):
        if not preview.ready or preview.route == "blocked":
            blocked.append(preview)
            continue
        card = repo.get_recipient_detail(recipient.id).card
        if card.safety_category == SafetyCategory.CRITICAL or preview.route == "staff":
            manual.append(
                replace(
                    preview,
                    ready=False,
                    blocked_reasons=preview.blocked_reasons + ("Recipient requires manual/staff handling.",),
                )
            )
            continue
        if card.safety_category == SafetyCategory.SPECIAL_HANDLING and not repo.is_ready_for_automated_round(recipient):
            manual.append(
                replace(
                    preview,
                    ready=False,
                    blocked_reasons=preview.blocked_reasons
                    + ("Special-handling recipient requires explicit card review and per-recipient approval.",),
                )
            )
            continue
        ready.append(preview)
    return tuple(ready), tuple(manual), tuple(blocked)


def _approval_execution_blockers(
    plan,
    approval,
    ready_previews,
    manual_previews,
    blocked_previews,
) -> tuple[str, ...]:
    reasons: list[str] = []
    if approval.stale:
        reasons.append("Approval is stale and must be regenerated from the current preflight.")
    if approval.plan_id != plan.id:
        reasons.append("Approval does not belong to the requested plan.")
    if tuple(sorted(plan.ready_keys)) != tuple(sorted(preview.idempotency_key for preview in ready_previews)):
        reasons.append("Current preflight ready keyset has changed.")
    if tuple(sorted(approval.approved_keys)) != tuple(sorted(plan.ready_keys)):
        reasons.append("Approval does not match the current exact ready keyset.")
    decision = validate_operator_approval(
        ready_previews + manual_previews + blocked_previews,
        OperatorApproval(
            approved_keys=approval.approved_keys,
            approver=approval.operator,
            approved_at=approval.approved_at,
            note=approval.note,
        ),
    )
    if not decision.approved:
        reasons.extend(decision.reasons)
    if not ready_previews:
        reasons.append("No ready call plans are available for execution.")
    return tuple(reasons)


def _all_confirmations(confirmations: dict) -> bool:
    return all(confirmations.get(name) is True for name in REQUIRED_CONFIRMATIONS)


def _max_live_batch_size(env: dict[str, str]) -> int:
    try:
        return int(env.get("CARECALL_MAX_LIVE_BATCH_SIZE", "1"))
    except ValueError:
        return 1


def _provider_status(payload: dict[str, Any]) -> str:
    return str(payload.get("status", payload.get("state", ""))).strip().lower()


def _normalized_provider_result(payload: dict[str, Any], provider_status: str) -> dict[str, Any]:
    normalized = dict(payload)
    if provider_status in NO_CONTACT_PROVIDER_STATUSES:
        normalized["status"] = "no_contact"
        normalized.setdefault("summary", f"CALL-E ended with {provider_status}; route for human review.")
        normalized["human_review"] = True
        normalized.setdefault("needs", [])
    elif provider_status in FAILED_PROVIDER_STATUSES:
        normalized["status"] = "malformed"
        normalized.setdefault("summary", f"CALL-E ended with {provider_status}; route for technical/human review.")
        normalized["human_review"] = True
        normalized.setdefault("needs", [])
    else:
        normalized["status"] = "completed"
        normalized.setdefault("needs", [])
    return normalized


if __name__ == "__main__":
    run(
        host=os.environ.get("CARECALL_BACKEND_HOST", "0.0.0.0"),
        port=int(os.environ.get("CARECALL_BACKEND_PORT", "8000")),
    )
