"""Application workflow for recipient-triggered callback calls."""

from __future__ import annotations

import json
import sys
from datetime import date
from typing import Any

from .calle_execution import execute_callback_preview
from .calle_readiness import CalleReadiness, check_calle_readiness
from .daily_limits import DEFAULT_CALLBACK_CALL_LIMIT, callback_call_limit
from .domain import CallbackRequestStatus, SafetyCategory
from .repository import Repository


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


def attempt_immediate_callback(
    repo: Repository,
    request,
    env: dict[str, str],
    readiness: CalleReadiness | None,
    runner,
) -> dict[str, Any]:
    if request.source == "operator_created":
        return {
            "status": CallbackRequestStatus.OPERATOR_REVIEW.value,
            "message": "Operator-created callback requests wait for operator handling.",
        }

    limit = max_auto_callback_calls_per_day(env, request.recipient_id)
    today = date.today().isoformat()
    callback_count = repo.count_same_day_callback_requests(request.recipient_id, today)
    if callback_count > limit:
        note = (
            f"Automatic callback limit reached: {callback_count} recipient-triggered callback requests today. "
            "Coordinator review is required before another callback."
        )
        updated = repo.attach_callback_auto_call(
            request.id,
            status=CallbackRequestStatus.CALLBACK_LIMIT_REACHED.value,
            error=note,
            resolution_note=note,
        )
        return {
            "status": CallbackRequestStatus.CALLBACK_LIMIT_REACHED.value,
            "message": "Daily automatic callback limit reached. A coordinator will review the request.",
            "callback_request_id": updated.id,
            "same_day_callback_count": callback_count,
            "limit": limit,
        }

    recipient = repo.get_recipient(request.recipient_id)
    preview = repo.call_plan_previews_with_same_day_history((recipient,), today)[0]
    blockers: list[str] = []
    if env.get("CARECALL_LIVE_CALLS_ENABLED") != "true":
        blockers.append("Live callback calls are disabled for this backend environment.")
    if not preview.ready or preview.route != "recipient":
        blockers.append("Recipient is not eligible for automatic callback dialing.")

    if blockers:
        note = " ".join(blockers)
        updated = repo.attach_callback_auto_call(
            request.id,
            status=CallbackRequestStatus.OPERATOR_REVIEW.value,
            error=note,
            resolution_note=note,
        )
        return {
            "status": CallbackRequestStatus.OPERATOR_REVIEW.value,
            "message": "The callback request needs coordinator review before calling.",
            "callback_request_id": updated.id,
            "blocked_reasons": blockers,
        }

    readiness = readiness if readiness is not None else check_calle_readiness()
    batch = execute_callback_preview(preview, readiness, runner)
    runner_commands = tuple(getattr(runner, "commands", ())) if runner is not None else ()
    if batch.blocked_reasons:
        note = " ".join(batch.blocked_reasons)
        updated = repo.attach_callback_auto_call(
            request.id,
            status=CallbackRequestStatus.AUTO_CALLBACK_FAILED.value,
            error=note,
            resolution_note=note,
        )
        return {
            "status": CallbackRequestStatus.AUTO_CALLBACK_FAILED.value,
            "message": "The callback request was accepted, but the automatic call could not be started.",
            "callback_request_id": updated.id,
            "blocked_reasons": list(batch.blocked_reasons),
            "runner_commands": list(runner_commands),
        }

    stored = repo.save_call_runs(f"callback-{request.id}", request.id, batch.records, mode="live")
    if not batch.success:
        reasons = tuple(record.error for record in batch.records if record.error) or ("CALL-E callback execution failed.",)
        updated = repo.attach_callback_auto_call(
            request.id,
            status=CallbackRequestStatus.AUTO_CALLBACK_FAILED.value,
            error=" ".join(reasons),
            resolution_note="Automatic callback could not be started. Coordinator review is required.",
        )
        _log_event(
            "callback_execution_failed",
            callback_id=request.id,
            recipient_id=request.recipient_id,
            provider_plan_ids=[record.provider_plan_id for record in stored if record.provider_plan_id],
            reasons=list(reasons),
        )
        return {
            "status": CallbackRequestStatus.AUTO_CALLBACK_FAILED.value,
            "message": "The callback request was accepted, but the automatic call could not be started.",
            "callback_request_id": updated.id,
            "run_ids": [record.id for record in stored],
            "blocked_reasons": list(reasons),
            "runner_commands": list(runner_commands),
        }

    updated = repo.attach_callback_auto_call(
        request.id,
        run_id=stored[0].id if stored else "",
        status=CallbackRequestStatus.AUTO_CALLBACK_STARTED.value,
        resolution_note="Automatic callback started after recipient request.",
    )
    return {
        "status": CallbackRequestStatus.AUTO_CALLBACK_STARTED.value,
        "message": "Care Call has started your callback.",
        "callback_request_id": updated.id,
        "run_ids": [record.id for record in stored],
        "real_calls_placed": len(stored),
        "runner_commands": list(runner_commands),
        "same_day_callback_count": callback_count,
        "limit": limit,
    }


def mark_callback_run_terminal(repo: Repository, run_id: str, provider_status: str) -> None:
    if provider_status in NO_CONTACT_PROVIDER_STATUSES:
        repo.mark_callback_run_terminal(
            run_id,
            status=CallbackRequestStatus.AUTO_CALLBACK_NO_CONTACT.value,
            provider_status=provider_status,
            note="Automatic callback reached a no-contact terminal status.",
        )
        return
    if provider_status in FAILED_PROVIDER_STATUSES:
        repo.mark_callback_run_terminal(
            run_id,
            status=CallbackRequestStatus.AUTO_CALLBACK_FAILED.value,
            provider_status=provider_status,
            note="Automatic callback failed at the provider.",
        )
        return
    repo.mark_callback_run_terminal(
        run_id,
        status=CallbackRequestStatus.AUTO_CALLBACK_COMPLETED.value,
        provider_status=provider_status,
        note="Automatic callback completed and the result was imported.",
    )


def max_auto_callback_calls_per_day(env: dict[str, str], recipient_id: str = "") -> int:
    return callback_call_limit(recipient_id, env)


def callback_terminal_status(provider_status: str) -> str:
    if provider_status in NO_CONTACT_PROVIDER_STATUSES:
        return CallbackRequestStatus.AUTO_CALLBACK_NO_CONTACT.value
    if provider_status in FAILED_PROVIDER_STATUSES:
        return CallbackRequestStatus.AUTO_CALLBACK_FAILED.value
    return CallbackRequestStatus.AUTO_CALLBACK_COMPLETED.value


def _log_event(event: str, **fields: Any) -> None:
    try:
        print(json.dumps({"event": event, **fields}, ensure_ascii=False), file=sys.stderr, flush=True)
    except Exception:
        print(f'{{"event":"{event}","logging_error":true}}', file=sys.stderr, flush=True)
