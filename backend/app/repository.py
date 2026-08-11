"""SQLite-backed CareCall product state repository."""

from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path
from typing import Iterable

from .calle_execution import CallRunRecord, CallRunStatus
from .call_planning import build_call_plan_previews
from .domain import (
    ApprovalRecord,
    AuthorizedContact,
    CallbackRequest,
    CallSuitability,
    CareProfile,
    Condition,
    Consent,
    ConsentStatus,
    DashboardState,
    PreflightPlanRecord,
    Recipient,
    RecipientCard,
    RecipientCardAuditEntry,
    RecipientDetail,
    RiskAuditEntry,
    RoundBatch,
    SafetyCategory,
    Severity,
    StoredCallRun,
    StoredIntakeResult,
    StoredServiceRequest,
)
from .extraction import extract_intake_result
from .routing import route_intake_result
from .safety import build_preflight_row, mask_phone
from .validation import is_e164

DEFAULT_OPERATOR = "carecall-coordinator"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS recipients (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    phone_e164 TEXT NOT NULL,
    caregiver_phone_e164 TEXT,
    consent_status TEXT NOT NULL,
    consent_evidence TEXT NOT NULL,
    condition TEXT NOT NULL,
    severity TEXT NOT NULL,
    language TEXT NOT NULL,
    timezone TEXT NOT NULL,
    call_suitability TEXT NOT NULL,
    communication_rules TEXT NOT NULL,
    notes TEXT NOT NULL,
    authorized_contacts TEXT NOT NULL DEFAULT '[]',
    safety_category TEXT NOT NULL,
    delivery_area TEXT NOT NULL,
    address TEXT NOT NULL,
    special_handling_reviewed INTEGER NOT NULL DEFAULT 0,
    special_handling_approved INTEGER NOT NULL DEFAULT 0,
    special_handling_note TEXT NOT NULL DEFAULT '',
    special_handling_operator TEXT NOT NULL DEFAULT '',
    special_handling_approved_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS risk_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    operator TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipient_card_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    operator TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS round_batches (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    call_date TEXT NOT NULL,
    selected_recipient_ids TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preflight_plans (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES round_batches(id) ON DELETE CASCADE,
    call_date TEXT NOT NULL,
    ready_keys TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES preflight_plans(id) ON DELETE CASCADE,
    batch_id TEXT NOT NULL REFERENCES round_batches(id) ON DELETE CASCADE,
    recipient_ids TEXT NOT NULL,
    approved_keys TEXT NOT NULL,
    operator TEXT NOT NULL,
    approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note TEXT NOT NULL DEFAULT '',
    confirmations TEXT NOT NULL DEFAULT '{}',
    authorization_phrase TEXT NOT NULL DEFAULT '',
    stale INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS call_runs (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL DEFAULT '',
    approval_id TEXT NOT NULL DEFAULT '',
    recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'dry_run',
    provider_plan_id TEXT NOT NULL DEFAULT '',
    provider_run_id TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    masked_phone TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS intake_results (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    human_review INTEGER NOT NULL,
    needs TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_requests (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    queue TEXT NOT NULL,
    sla_hours INTEGER NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    items TEXT NOT NULL,
    notes TEXT NOT NULL,
    human_review_reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS callback_requests (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    request_text TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    operator TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolution_note TEXT NOT NULL DEFAULT ''
);
"""


def connect(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    _ensure_column(conn, "recipients", "special_handling_approved", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "recipients", "authorized_contacts", "TEXT NOT NULL DEFAULT '[]'")
    _ensure_column(conn, "recipients", "special_handling_note", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "recipients", "special_handling_operator", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "recipients", "special_handling_approved_at", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "approvals", "note", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "approvals", "confirmations", "TEXT NOT NULL DEFAULT '{}'")
    _ensure_column(conn, "approvals", "authorization_phrase", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "call_runs", "plan_id", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "call_runs", "approval_id", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "call_runs", "idempotency_key", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "call_runs", "mode", "TEXT NOT NULL DEFAULT 'dry_run'")
    _ensure_column(conn, "call_runs", "provider_plan_id", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "call_runs", "masked_phone", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "callback_requests", "operator", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "callback_requests", "updated_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")
    _ensure_column(conn, "callback_requests", "resolution_note", "TEXT NOT NULL DEFAULT ''")
    conn.commit()


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def seed_database(repo: "Repository", recipients: Iterable[Recipient], call_date: str = "2026-08-01") -> None:
    for recipient in recipients:
        repo.upsert_recipient(recipient)
    repo.ensure_seed_product_state(call_date)


class Repository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def upsert_recipient(self, recipient: Recipient) -> None:
        safety_category = _default_safety_category(recipient)
        self.conn.execute(
            """
            INSERT INTO recipients (
                id, display_name, phone_e164, caregiver_phone_e164, consent_status,
                consent_evidence, condition, severity, language, timezone,
                call_suitability, communication_rules, notes, authorized_contacts, safety_category,
                delivery_area, address, special_handling_reviewed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                display_name=excluded.display_name,
                phone_e164=excluded.phone_e164,
                caregiver_phone_e164=excluded.caregiver_phone_e164,
                consent_status=excluded.consent_status,
                consent_evidence=excluded.consent_evidence,
                condition=excluded.condition,
                severity=excluded.severity,
                language=excluded.language,
                timezone=excluded.timezone,
                call_suitability=excluded.call_suitability,
                communication_rules=excluded.communication_rules,
                notes=excluded.notes,
                authorized_contacts=excluded.authorized_contacts
            """,
            (
                recipient.id,
                recipient.display_name,
                recipient.phone_e164,
                recipient.caregiver_phone_e164,
                recipient.consent.status.value,
                recipient.consent.evidence,
                recipient.care_profile.condition.value,
                recipient.care_profile.severity.value,
                recipient.care_profile.language,
                recipient.care_profile.timezone,
                _call_suitability_for_safety(safety_category).value,
                json.dumps(list(recipient.care_profile.communication_rules)),
                recipient.notes,
                _authorized_contacts_json(recipient),
                safety_category.value,
                _default_delivery_area(recipient.id),
                _default_address(recipient),
                int(safety_category != SafetyCategory.SPECIAL_HANDLING),
            ),
        )
        self._ensure_initial_audit(recipient.id, safety_category)
        self.conn.commit()

    def reconcile_safety_routes(self) -> None:
        for category in SafetyCategory:
            self.conn.execute(
                "UPDATE recipients SET call_suitability = ? WHERE safety_category = ?",
                (_call_suitability_for_safety(category).value, category.value),
            )
        self.conn.commit()

    def ensure_seed_product_state(self, call_date: str) -> None:
        recipients = self.list_recipients()
        recipient_ids = tuple(recipient.id for recipient in recipients)
        batch = RoundBatch("batch-seed-daily-round", "Seed daily round", call_date, recipient_ids)
        self.conn.execute(
            """
            INSERT OR IGNORE INTO round_batches (id, label, call_date, selected_recipient_ids)
            VALUES (?, ?, ?, ?)
            """,
            (batch.id, batch.label, batch.call_date, json.dumps(list(batch.selected_recipient_ids))),
        )
        previews = build_call_plan_previews(list(recipients), call_date)
        ready_keys = tuple(preview.idempotency_key for preview in previews if preview.ready)
        self.conn.execute(
            """
            INSERT OR IGNORE INTO preflight_plans (id, batch_id, call_date, ready_keys)
            VALUES (?, ?, ?, ?)
            """,
            ("plan-seed-preflight", batch.id, call_date, json.dumps(list(ready_keys))),
        )
        self.conn.execute(
            """
            INSERT OR IGNORE INTO approvals (id, plan_id, batch_id, recipient_ids, approved_keys, operator)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "approval-seed-rec-002",
                "plan-seed-preflight",
                batch.id,
                json.dumps(["rec-002"]),
                json.dumps([key for key in ready_keys if "-rec-002-" in key]),
                DEFAULT_OPERATOR,
            ),
        )
        self._ensure_seed_result("rec-001")
        self.conn.commit()

    def create_batch(
        self,
        selected_recipient_ids: Iterable[str],
        label: str = "CareCall daily round",
        call_date: str = "2026-08-01",
    ) -> RoundBatch:
        recipient_ids = tuple(str(item) for item in selected_recipient_ids if str(item).strip())
        if not recipient_ids:
            raise ValueError("At least one selected recipient is required.")
        for recipient_id in recipient_ids:
            self.get_recipient(recipient_id)
        batch = RoundBatch(
            id=f"batch-{uuid.uuid4().hex[:12]}",
            label=label.strip() or "CareCall daily round",
            call_date=call_date,
            selected_recipient_ids=recipient_ids,
        )
        self.conn.execute(
            """
            INSERT INTO round_batches (id, label, call_date, selected_recipient_ids)
            VALUES (?, ?, ?, ?)
            """,
            (batch.id, batch.label, batch.call_date, json.dumps(list(batch.selected_recipient_ids))),
        )
        self.conn.commit()
        return batch

    def get_batch(self, batch_id: str) -> RoundBatch:
        row = self.conn.execute("SELECT * FROM round_batches WHERE id = ?", (batch_id,)).fetchone()
        if row is None:
            raise KeyError(batch_id)
        return RoundBatch(
            id=row["id"],
            label=row["label"],
            call_date=row["call_date"],
            selected_recipient_ids=_json_tuple(row["selected_recipient_ids"]),
        )

    def list_batches(self) -> tuple[RoundBatch, ...]:
        rows = self.conn.execute("SELECT * FROM round_batches ORDER BY rowid DESC").fetchall()
        return tuple(
            RoundBatch(
                id=row["id"],
                label=row["label"],
                call_date=row["call_date"],
                selected_recipient_ids=_json_tuple(row["selected_recipient_ids"]),
            )
            for row in rows
        )

    def save_special_handling_review(
        self,
        recipient_id: str,
        card_reviewed: bool,
        approved_for_automated_round: bool,
        note: str,
        operator: str = DEFAULT_OPERATOR,
    ) -> dict:
        recipient = self.get_recipient(recipient_id)
        note = note.strip()
        if not operator.strip():
            raise ValueError("Operator is required.")
        if not card_reviewed:
            raise ValueError("Explicit card review is required.")
        if not note:
            raise ValueError("Special-handling approval note is required.")

        row = self.conn.execute("SELECT safety_category FROM recipients WHERE id = ?", (recipient.id,)).fetchone()
        safety_category = SafetyCategory(row["safety_category"]) if row else SafetyCategory.CRITICAL
        route = "operator_review"
        allowed = safety_category == SafetyCategory.SPECIAL_HANDLING and bool(approved_for_automated_round)

        self.conn.execute(
            """
            UPDATE recipients
            SET special_handling_reviewed = ?,
                special_handling_approved = ?,
                special_handling_note = ?,
                special_handling_operator = ?,
                special_handling_approved_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (int(card_reviewed), int(allowed), note, operator.strip(), recipient_id),
        )
        self.invalidate_approvals_for_recipient(recipient_id)
        self.conn.commit()
        return {
            "recipient_id": recipient_id,
            "operator": operator.strip(),
            "card_reviewed": bool(card_reviewed),
            "approved_for_automated_round": allowed,
            "route": route if allowed else "manual",
            "note": note,
        }

    def is_ready_for_automated_round(self, recipient: Recipient) -> bool:
        row = self.conn.execute(
            """
            SELECT safety_category, special_handling_reviewed, special_handling_approved
            FROM recipients WHERE id = ?
            """,
            (recipient.id,),
        ).fetchone()
        if row is None or SafetyCategory(row["safety_category"]) != SafetyCategory.SPECIAL_HANDLING:
            return True
        return bool(row and row["special_handling_reviewed"] and row["special_handling_approved"])

    def save_preflight_plan(
        self,
        batch_id: str,
        ready_keys: tuple[str, ...],
    ) -> PreflightPlanRecord:
        batch = self.get_batch(batch_id)
        plan = PreflightPlanRecord(
            id=f"plan-{uuid.uuid4().hex[:12]}",
            batch_id=batch.id,
            call_date=batch.call_date,
            ready_keys=tuple(sorted(ready_keys)),
            created_at="",
        )
        self.conn.execute(
            """
            UPDATE approvals SET stale = 1 WHERE batch_id = ? AND stale = 0
            """,
            (batch_id,),
        )
        self.conn.execute(
            """
            INSERT INTO preflight_plans (id, batch_id, call_date, ready_keys)
            VALUES (?, ?, ?, ?)
            """,
            (plan.id, plan.batch_id, plan.call_date, json.dumps(list(plan.ready_keys))),
        )
        self.conn.commit()
        return self.get_preflight_plan(plan.id)

    def get_preflight_plan(self, plan_id: str) -> PreflightPlanRecord:
        row = self.conn.execute("SELECT * FROM preflight_plans WHERE id = ?", (plan_id,)).fetchone()
        if row is None:
            raise KeyError(plan_id)
        return PreflightPlanRecord(
            id=row["id"],
            batch_id=row["batch_id"],
            call_date=row["call_date"],
            ready_keys=_json_tuple(row["ready_keys"]),
            created_at=row["created_at"],
        )

    def save_approval(
        self,
        plan_id: str,
        approved_keys: tuple[str, ...],
        operator: str,
        note: str,
        confirmations: dict,
        authorization_phrase: str,
    ) -> ApprovalRecord:
        plan = self.get_preflight_plan(plan_id)
        batch = self.get_batch(plan.batch_id)
        approval = ApprovalRecord(
            id=f"approval-{uuid.uuid4().hex[:12]}",
            plan_id=plan.id,
            batch_id=batch.id,
            recipient_ids=batch.selected_recipient_ids,
            approved_keys=tuple(sorted(approved_keys)),
            operator=operator.strip(),
            note=note.strip(),
            confirmations=dict(confirmations),
            authorization_phrase=authorization_phrase,
            approved_at="",
        )
        self.conn.execute(
            """
            INSERT INTO approvals (
                id, plan_id, batch_id, recipient_ids, approved_keys, operator,
                note, confirmations, authorization_phrase
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                approval.id,
                approval.plan_id,
                approval.batch_id,
                json.dumps(list(approval.recipient_ids)),
                json.dumps(list(approval.approved_keys)),
                approval.operator,
                approval.note,
                json.dumps(approval.confirmations),
                approval.authorization_phrase,
            ),
        )
        self.conn.commit()
        return self.get_approval(approval.id)

    def get_approval(self, approval_id: str) -> ApprovalRecord:
        row = self.conn.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
        if row is None:
            raise KeyError(approval_id)
        return _approval_from_row(row)

    def save_call_runs(
        self,
        plan_id: str,
        approval_id: str,
        records: Iterable[CallRunRecord],
        mode: str,
    ) -> tuple[StoredCallRun, ...]:
        stored: list[StoredCallRun] = []
        for record in records:
            run_id = f"run-{uuid.uuid4().hex[:12]}"
            self.conn.execute(
                """
                INSERT INTO call_runs (
                    id, plan_id, approval_id, recipient_id, idempotency_key, status, mode,
                    provider_plan_id, provider_run_id, completed_at, error, masked_phone
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    plan_id,
                    approval_id,
                    record.recipient_id,
                    record.idempotency_key,
                    record.status.value,
                    mode,
                    record.plan_id,
                    record.run_id,
                    record.completed_at,
                    record.error,
                    record.masked_phone,
                ),
            )
            stored.append(self.get_call_run(run_id))
        self.conn.commit()
        return tuple(stored)

    def get_call_run(self, run_id: str) -> StoredCallRun:
        row = self.conn.execute("SELECT * FROM call_runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            raise KeyError(run_id)
        return _call_run_from_row(row)

    def save_run_result_bundle(self, run_id: str, payload: dict) -> dict:
        run = self.get_call_run(run_id)
        record = CallRunRecord(
            recipient_id=run.recipient_id,
            idempotency_key=run.idempotency_key,
            status=CallRunStatus.COMPLETED,
            plan_id=run.provider_plan_id,
            run_id=run.provider_run_id,
            masked_phone=run.masked_phone,
        )
        from .run_results import process_call_result

        bundle = process_call_result(record, payload)
        self.conn.execute(
            "UPDATE call_runs SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (CallRunStatus.COMPLETED.value, run_id),
        )
        intake_id = f"intake-{run_id}"
        service_id_prefix = f"svc-{run_id}"
        self.conn.execute("DELETE FROM service_requests WHERE id LIKE ?", (f"{service_id_prefix}-%",))
        needs_json = [
            {
                "category": need.category.value,
                "items": list(need.items),
                "urgency": need.urgency.value,
                "notes": need.notes,
                "review_state": need.review_state.value,
            }
            for need in bundle.intake_result.needs
        ]
        self.conn.execute(
            """
            INSERT OR REPLACE INTO intake_results (id, recipient_id, status, summary, human_review, needs)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                intake_id,
                bundle.intake_result.recipient_id,
                bundle.intake_result.status.value,
                bundle.intake_result.summary,
                int(bundle.intake_result.human_review),
                json.dumps(needs_json),
            ),
        )
        service_ids: list[str] = []
        for index, request in enumerate(bundle.service_requests, start=1):
            service_id = f"{service_id_prefix}-{index}"
            service_ids.append(service_id)
            self.conn.execute(
                """
                INSERT INTO service_requests (
                    id, recipient_id, category, queue, sla_hours, priority, status,
                    items, notes, human_review_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    service_id,
                    request.recipient_id,
                    request.category.value,
                    request.queue,
                    request.sla_hours,
                    request.priority,
                    request.status,
                    json.dumps(list(request.items)),
                    request.notes,
                    request.human_review_reason,
                ),
            )
        self.conn.commit()
        intake_result = next(
            result for result in self.list_intake_results(bundle.intake_result.recipient_id) if result.id == intake_id
        )
        return {
            "run": self.get_call_run(run_id),
            "intake_result": intake_result,
            "service_requests": tuple(
                request for request in self.list_service_requests(bundle.intake_result.recipient_id) if request.id in service_ids
            ),
        }

    def list_recipients(self) -> tuple[Recipient, ...]:
        rows = self.conn.execute("SELECT * FROM recipients ORDER BY id").fetchall()
        return tuple(_recipient_from_row(row) for row in rows)

    def get_dashboard_state(self, call_date: str = "2026-08-01") -> DashboardState:
        recipients = self.list_recipients()
        return DashboardState(
            recipients=tuple(self._card_for_recipient(recipient) for recipient in recipients),
            preflight_previews=build_call_plan_previews(list(recipients), call_date),
            preflight_plans=self.list_preflight_plans(),
            approvals=self.list_approvals(),
            intake_results=self.list_intake_results(),
            service_requests=self.list_service_requests(),
            callback_requests=self.list_callback_requests(),
        )

    def create_callback_request(
        self,
        *,
        recipient_id: str,
        source: str,
        request_text: str,
        priority: str = "urgent",
        operator: str = "",
    ) -> CallbackRequest:
        recipient = self.get_recipient(recipient_id)
        card = self._card_for_recipient(recipient)
        source = source.strip() or "operator_created"
        request_text = request_text.strip() or "Please call me back."
        if priority not in {"urgent", "normal"}:
            raise ValueError("Callback priority must be urgent or normal.")

        status = "operator_review"
        if card.blocked or card.safety_category == SafetyCategory.CRITICAL or card.route != "recipient":
            status = "operator_review"

        request = CallbackRequest(
            id=f"cb-{uuid.uuid4().hex[:12]}",
            recipient_id=recipient.id,
            source=source,
            request_text=request_text,
            status=status,
            priority=priority,
            operator=operator.strip(),
            created_at="",
            updated_at="",
        )
        self.conn.execute(
            """
            INSERT INTO callback_requests (
                id, recipient_id, source, request_text, status, priority, operator
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request.id,
                request.recipient_id,
                request.source,
                request.request_text,
                request.status,
                request.priority,
                request.operator,
            ),
        )
        self.conn.commit()
        return self.get_callback_request(request.id)

    def get_callback_request(self, callback_id: str) -> CallbackRequest:
        row = self.conn.execute("SELECT * FROM callback_requests WHERE id = ?", (callback_id,)).fetchone()
        if row is None:
            raise KeyError(callback_id)
        return _callback_request_from_row(row)

    def list_callback_requests(self, status: str | None = None) -> tuple[CallbackRequest, ...]:
        if status:
            rows = self.conn.execute(
                "SELECT * FROM callback_requests WHERE status = ? ORDER BY created_at DESC, id",
                (status,),
            ).fetchall()
        else:
            rows = self.conn.execute("SELECT * FROM callback_requests ORDER BY created_at DESC, id").fetchall()
        return tuple(_callback_request_from_row(row) for row in rows)

    def update_callback_request(
        self,
        callback_id: str,
        *,
        status: str,
        operator: str,
        resolution_note: str = "",
    ) -> CallbackRequest:
        if status not in {"operator_review", "approved_callback", "operator_call", "dismissed_duplicate", "resolved"}:
            raise ValueError("Unsupported callback request status.")
        self.get_callback_request(callback_id)
        self.conn.execute(
            """
            UPDATE callback_requests
            SET status = ?, operator = ?, resolution_note = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (status, operator.strip() or DEFAULT_OPERATOR, resolution_note.strip(), callback_id),
        )
        self.conn.commit()
        return self.get_callback_request(callback_id)

    def get_recipient_detail(self, recipient_id: str) -> RecipientDetail:
        recipient = self.get_recipient(recipient_id)
        return RecipientDetail(
            card=self._card_for_recipient(recipient),
            risk_audit=self.list_risk_audit(recipient_id),
            card_audit=self.list_recipient_card_audit(recipient_id),
            intake_results=self.list_intake_results(recipient_id),
            service_requests=self.list_service_requests(recipient_id),
            approvals=self.list_approvals(recipient_id),
        )

    def get_recipient(self, recipient_id: str) -> Recipient:
        row = self.conn.execute("SELECT * FROM recipients WHERE id = ?", (recipient_id,)).fetchone()
        if row is None:
            raise KeyError(recipient_id)
        return _recipient_from_row(row)

    def update_safety_category(
        self,
        recipient_id: str,
        safety_category: SafetyCategory,
        reason: str,
        operator: str = DEFAULT_OPERATOR,
    ) -> RiskAuditEntry:
        note = reason.strip()
        if not note:
            raise ValueError("Reason for safety category change is required.")
        row = self.conn.execute("SELECT safety_category FROM recipients WHERE id = ?", (recipient_id,)).fetchone()
        if row is None:
            raise KeyError(recipient_id)
        old_value = SafetyCategory(row["safety_category"])
        self.conn.execute(
            "UPDATE recipients SET safety_category = ?, call_suitability = ? WHERE id = ?",
            (safety_category.value, _call_suitability_for_safety(safety_category).value, recipient_id),
        )
        self.conn.execute(
            """
            INSERT INTO risk_audit (recipient_id, old_value, new_value, operator, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (recipient_id, old_value.value, safety_category.value, operator, note),
        )
        self.invalidate_approvals_for_recipient(recipient_id)
        self.conn.commit()
        audit_id = int(self.conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"])
        return self.list_risk_audit(recipient_id, audit_id=audit_id)[0]

    def update_recipient_card(
        self,
        recipient_id: str,
        *,
        display_name: str,
        phone_e164: str,
        caregiver_phone_e164: str | None,
        delivery_area: str,
        address: str,
        notes: str,
        safety_category: SafetyCategory,
        condition: Condition,
        severity: Severity,
        language: str,
        timezone: str,
        communication_rules: tuple[str, ...],
        authorized_contacts: tuple[AuthorizedContact, ...],
        safety_change_reason: str = "",
        operator: str = DEFAULT_OPERATOR,
    ) -> RecipientDetail:
        current = self.get_recipient(recipient_id)
        current_safety_row = self.conn.execute(
            "SELECT safety_category FROM recipients WHERE id = ?",
            (recipient_id,),
        ).fetchone()
        if current_safety_row is None:
            raise KeyError(recipient_id)
        current_safety = SafetyCategory(current_safety_row["safety_category"])
        cleaned_phone = phone_e164.strip()
        cleaned_caregiver_phone = (caregiver_phone_e164 or "").strip() or None
        if not display_name.strip():
            raise ValueError("Display name is required.")
        if not is_e164(cleaned_phone):
            raise ValueError("Phone number must be valid E.164.")
        if cleaned_caregiver_phone and not is_e164(cleaned_caregiver_phone):
            raise ValueError("Caregiver/staff phone number must be valid E.164.")
        if not delivery_area.strip():
            raise ValueError("Delivery area is required.")
        if not address.strip():
            raise ValueError("Address is required.")
        if not language.strip():
            raise ValueError("Language is required.")
        if not timezone.strip():
            raise ValueError("Timezone is required.")
        cleaned_safety_reason = safety_change_reason.strip()
        if current_safety != safety_category and not cleaned_safety_reason:
            raise ValueError("Reason for safety category change is required.")
        derived_call_suitability = _call_suitability_for_safety(safety_category)

        self.conn.execute(
            """
            UPDATE recipients
            SET display_name = ?,
                phone_e164 = ?,
                caregiver_phone_e164 = ?,
                delivery_area = ?,
                address = ?,
                notes = ?,
                safety_category = ?,
                condition = ?,
                severity = ?,
                call_suitability = ?,
                language = ?,
                timezone = ?,
                communication_rules = ?,
                authorized_contacts = ?,
                special_handling_reviewed = CASE
                    WHEN ? = 'special_handling' THEN special_handling_reviewed
                    ELSE 1
                END,
                special_handling_approved = CASE
                    WHEN ? = 'special_handling' THEN special_handling_approved
                    ELSE 0
                END
            WHERE id = ?
            """,
            (
                display_name.strip(),
                cleaned_phone,
                cleaned_caregiver_phone,
                delivery_area.strip(),
                address.strip(),
                notes.strip(),
                safety_category.value,
                condition.value,
                severity.value,
                derived_call_suitability.value,
                language.strip(),
                timezone.strip(),
                json.dumps(list(communication_rules)),
                _contacts_json(authorized_contacts),
                safety_category.value,
                safety_category.value,
                recipient_id,
            ),
        )
        self.conn.execute(
            """
            INSERT INTO recipient_card_audit (recipient_id, operator, summary)
            VALUES (?, ?, ?)
            """,
            (recipient_id, operator.strip() or DEFAULT_OPERATOR, _card_update_summary(current, safety_category)),
        )
        if current_safety != safety_category:
            self.conn.execute(
                """
                INSERT INTO risk_audit (recipient_id, old_value, new_value, operator, note)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    recipient_id,
                    current_safety.value,
                    safety_category.value,
                    operator.strip() or DEFAULT_OPERATOR,
                    cleaned_safety_reason,
                ),
            )
        self.invalidate_approvals_for_recipient(recipient_id)
        self.conn.commit()
        return self.get_recipient_detail(recipient_id)

    def invalidate_approvals_for_recipient(self, recipient_id: str) -> None:
        approvals = self.conn.execute("SELECT id, recipient_ids FROM approvals WHERE stale = 0").fetchall()
        for approval in approvals:
            if recipient_id in _json_tuple(approval["recipient_ids"]):
                self.conn.execute("UPDATE approvals SET stale = 1 WHERE id = ?", (approval["id"],))

    def count_stale_approvals_for_recipient(self, recipient_id: str) -> int:
        rows = self.conn.execute("SELECT recipient_ids FROM approvals WHERE stale = 1").fetchall()
        return sum(1 for row in rows if recipient_id in _json_tuple(row["recipient_ids"]))

    def list_preflight_plans(self) -> tuple[PreflightPlanRecord, ...]:
        rows = self.conn.execute("SELECT * FROM preflight_plans ORDER BY created_at DESC, id").fetchall()
        return tuple(
            PreflightPlanRecord(
                id=row["id"],
                batch_id=row["batch_id"],
                call_date=row["call_date"],
                ready_keys=_json_tuple(row["ready_keys"]),
                created_at=row["created_at"],
            )
            for row in rows
        )

    def list_approvals(self, recipient_id: str | None = None) -> tuple[ApprovalRecord, ...]:
        rows = self.conn.execute("SELECT * FROM approvals ORDER BY approved_at DESC, id").fetchall()
        approvals = tuple(
            ApprovalRecord(
                id=row["id"],
                plan_id=row["plan_id"],
                batch_id=row["batch_id"],
                recipient_ids=_json_tuple(row["recipient_ids"]),
                approved_keys=_json_tuple(row["approved_keys"]),
                operator=row["operator"],
                approved_at=row["approved_at"],
                note=row["note"],
                confirmations=json.loads(row["confirmations"] or "{}"),
                authorization_phrase=row["authorization_phrase"],
                stale=bool(row["stale"]),
            )
            for row in rows
        )
        if recipient_id is None:
            return approvals
        return tuple(approval for approval in approvals if recipient_id in approval.recipient_ids)

    def list_risk_audit(self, recipient_id: str, audit_id: int | None = None) -> tuple[RiskAuditEntry, ...]:
        params: tuple = (recipient_id,) if audit_id is None else (recipient_id, audit_id)
        where = "recipient_id = ?" if audit_id is None else "recipient_id = ? AND id = ?"
        rows = self.conn.execute(
            f"SELECT * FROM risk_audit WHERE {where} ORDER BY id DESC",
            params,
        ).fetchall()
        return tuple(
            RiskAuditEntry(
                id=int(row["id"]),
                recipient_id=row["recipient_id"],
                old_value=SafetyCategory(row["old_value"]),
                new_value=SafetyCategory(row["new_value"]),
                operator=row["operator"],
                changed_at=row["changed_at"],
                note=row["note"],
            )
            for row in rows
        )

    def list_recipient_card_audit(self, recipient_id: str) -> tuple[RecipientCardAuditEntry, ...]:
        rows = self.conn.execute(
            "SELECT * FROM recipient_card_audit WHERE recipient_id = ? ORDER BY id DESC",
            (recipient_id,),
        ).fetchall()
        return tuple(
            RecipientCardAuditEntry(
                id=int(row["id"]),
                recipient_id=row["recipient_id"],
                operator=row["operator"],
                changed_at=row["changed_at"],
                summary=row["summary"],
            )
            for row in rows
        )

    def list_intake_results(self, recipient_id: str | None = None) -> tuple[StoredIntakeResult, ...]:
        if recipient_id is None:
            rows = self.conn.execute("SELECT * FROM intake_results ORDER BY id").fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM intake_results WHERE recipient_id = ? ORDER BY id",
                (recipient_id,),
            ).fetchall()
        return tuple(
            StoredIntakeResult(
                id=row["id"],
                recipient_id=row["recipient_id"],
                status=row["status"],
                summary=row["summary"],
                human_review=bool(row["human_review"]),
                needs=tuple(json.loads(row["needs"])),
            )
            for row in rows
        )

    def list_service_requests(self, recipient_id: str | None = None) -> tuple[StoredServiceRequest, ...]:
        if recipient_id is None:
            rows = self.conn.execute("SELECT * FROM service_requests ORDER BY priority, id").fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM service_requests WHERE recipient_id = ? ORDER BY priority, id",
                (recipient_id,),
            ).fetchall()
        return tuple(_service_request_from_row(row) for row in rows)

    def _card_for_recipient(self, recipient: Recipient) -> RecipientCard:
        row = self.conn.execute(
            "SELECT safety_category, delivery_area, address, special_handling_reviewed FROM recipients WHERE id = ?",
            (recipient.id,),
        ).fetchone()
        preflight = build_preflight_row(recipient)
        return RecipientCard(
            id=recipient.id,
            display_name=recipient.display_name,
            masked_phone=mask_phone(recipient.phone_e164),
            safety_category=SafetyCategory(row["safety_category"]),
            blocked=not preflight.ready,
            blocked_reasons=tuple(issue.message for issue in preflight.issues),
            route=preflight.route,
            delivery_area=row["delivery_area"],
            address=row["address"],
            notes=recipient.notes,
            condition=recipient.care_profile.condition,
            severity=recipient.care_profile.severity,
            special_handling_reviewed=bool(row["special_handling_reviewed"]),
            recipient=recipient,
        )

    def _ensure_initial_audit(self, recipient_id: str, category: SafetyCategory) -> None:
        exists = self.conn.execute("SELECT 1 FROM risk_audit WHERE recipient_id = ? LIMIT 1", (recipient_id,)).fetchone()
        if exists:
            return
        self.conn.execute(
            """
            INSERT INTO risk_audit (recipient_id, old_value, new_value, operator, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (recipient_id, category.value, category.value, "seed-import", "Initial seed safety category."),
        )

    def _ensure_seed_result(self, recipient_id: str) -> None:
        exists = self.conn.execute("SELECT 1 FROM intake_results WHERE recipient_id = ? LIMIT 1", (recipient_id,)).fetchone()
        if exists:
            return
        payload = {
            "status": "completed",
            "summary": "Needs groceries and a pharmacy delivery this week.",
            "needs": [
                {
                    "category": "groceries",
                    "items": ["milk", "bread", "fresh fruit"],
                    "urgency": "tomorrow",
                    "notes": "Prefers delivery after 10:00.",
                },
                {
                    "category": "medication",
                    "items": ["repeat prescription pickup"],
                    "urgency": "this_week",
                    "notes": "Coordinate with usual pharmacy.",
                },
            ],
        }
        intake = extract_intake_result(recipient_id, payload)
        needs_json = [
            {
                "category": need.category.value,
                "items": list(need.items),
                "urgency": need.urgency.value,
                "notes": need.notes,
                "review_state": need.review_state.value,
            }
            for need in intake.needs
        ]
        self.conn.execute(
            """
            INSERT INTO intake_results (id, recipient_id, status, summary, human_review, needs)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            ("intake-seed-rec-001", recipient_id, intake.status.value, intake.summary, int(intake.human_review), json.dumps(needs_json)),
        )
        for index, request in enumerate(route_intake_result(intake), start=1):
            self.conn.execute(
                """
                INSERT OR IGNORE INTO service_requests (
                    id, recipient_id, category, queue, sla_hours, priority, status,
                    items, notes, human_review_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"svc-seed-rec-001-{index}",
                    request.recipient_id,
                    request.category.value,
                    request.queue,
                    request.sla_hours,
                    request.priority,
                    request.status,
                    json.dumps(list(request.items)),
                    request.notes,
                    request.human_review_reason,
                ),
            )


def _recipient_from_row(row: sqlite3.Row) -> Recipient:
    return Recipient(
        id=row["id"],
        display_name=row["display_name"],
        phone_e164=row["phone_e164"],
        caregiver_phone_e164=row["caregiver_phone_e164"],
        notes=row["notes"],
        authorized_contacts=tuple(
            AuthorizedContact(
                name=str(contact.get("name", "")),
                relationship=str(contact.get("relationship", "")),
                can_answer_intake=bool(contact.get("can_answer_intake", True)),
                preferred_goodbye=str(contact.get("preferred_goodbye", "")),
            )
            for contact in json.loads(row["authorized_contacts"] or "[]")
            if str(contact.get("name", "")).strip()
        ),
        consent=Consent(ConsentStatus(row["consent_status"]), row["consent_evidence"]),
        care_profile=CareProfile(
            condition=Condition(row["condition"]),
            severity=Severity(row["severity"]),
            language=row["language"],
            timezone=row["timezone"],
            call_suitability=CallSuitability(row["call_suitability"]),
            communication_rules=_json_tuple(row["communication_rules"]),
        ),
    )


def _service_request_from_row(row: sqlite3.Row) -> StoredServiceRequest:
    return StoredServiceRequest(
        id=row["id"],
        recipient_id=row["recipient_id"],
        category=row["category"],
        queue=row["queue"],
        sla_hours=int(row["sla_hours"]),
        priority=row["priority"],
        status=row["status"],
        items=_json_tuple(row["items"]),
        notes=row["notes"],
        human_review_reason=row["human_review_reason"],
    )


def _approval_from_row(row: sqlite3.Row) -> ApprovalRecord:
    return ApprovalRecord(
        id=row["id"],
        plan_id=row["plan_id"],
        batch_id=row["batch_id"],
        recipient_ids=_json_tuple(row["recipient_ids"]),
        approved_keys=_json_tuple(row["approved_keys"]),
        operator=row["operator"],
        approved_at=row["approved_at"],
        note=row["note"],
        confirmations=json.loads(row["confirmations"] or "{}"),
        authorization_phrase=row["authorization_phrase"],
        stale=bool(row["stale"]),
    )


def _call_run_from_row(row: sqlite3.Row) -> StoredCallRun:
    return StoredCallRun(
        id=row["id"],
        plan_id=row["plan_id"],
        approval_id=row["approval_id"],
        recipient_id=row["recipient_id"],
        idempotency_key=row["idempotency_key"],
        status=row["status"],
        mode=row["mode"],
        provider_plan_id=row["provider_plan_id"],
        provider_run_id=row["provider_run_id"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        error=row["error"],
        masked_phone=row["masked_phone"],
    )


def _callback_request_from_row(row: sqlite3.Row) -> CallbackRequest:
    return CallbackRequest(
        id=row["id"],
        recipient_id=row["recipient_id"],
        source=row["source"],
        request_text=row["request_text"],
        status=row["status"],
        priority=row["priority"],
        operator=row["operator"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        resolution_note=row["resolution_note"],
    )


def _json_tuple(raw: str) -> tuple:
    value = json.loads(raw or "[]")
    return tuple(value)


def _authorized_contacts_json(recipient: Recipient) -> str:
    return _contacts_json(recipient.authorized_contacts)


def _contacts_json(contacts: tuple[AuthorizedContact, ...]) -> str:
    return json.dumps(
        [
            {
                "name": contact.name.strip(),
                "relationship": contact.relationship.strip(),
                "can_answer_intake": contact.can_answer_intake,
                "preferred_goodbye": contact.preferred_goodbye.strip(),
            }
            for contact in contacts
            if contact.name.strip()
        ]
    )


def _card_update_summary(previous: Recipient, safety_category: SafetyCategory) -> str:
    return f"Updated client card for {previous.display_name}; safety category set to {safety_category.value}."


def _default_safety_category(recipient: Recipient) -> SafetyCategory:
    if recipient.care_profile.call_suitability in {CallSuitability.DO_NOT_CALL, CallSuitability.STAFF_ONLY}:
        return SafetyCategory.CRITICAL
    if recipient.care_profile.call_suitability == CallSuitability.CAREGIVER_FIRST:
        return SafetyCategory.SPECIAL_HANDLING
    return SafetyCategory.NON_CRITICAL


def _call_suitability_for_safety(safety_category: SafetyCategory) -> CallSuitability:
    if safety_category == SafetyCategory.CRITICAL:
        return CallSuitability.DO_NOT_CALL
    return CallSuitability.DIRECT_CALL_OK


def _default_delivery_area(recipient_id: str) -> str:
    areas = {
        "rec-001": "Wallingford North",
        "rec-002": "Wallingford South",
        "rec-003": "Manual review",
        "rec-004": "Wallingford North",
        "rec-005": "Cholsey",
    }
    return areas.get(recipient_id, "Unassigned")


def _default_address(recipient: Recipient) -> str:
    suffix = recipient.id.rsplit("-", 1)[-1]
    return f"{suffix} Fictional Care Street"
