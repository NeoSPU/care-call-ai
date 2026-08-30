"""Application workflow for importing terminal CALL-E call results."""

from __future__ import annotations

from typing import Any, Callable

from .api_models import result_bundle_payload, run_status_payload
from .calle_execution import fetch_call_result
from .callback_workflow import FAILED_PROVIDER_STATUSES, TERMINAL_PROVIDER_STATUSES, mark_callback_run_terminal
from .call_result_normalization import normalized_provider_result, provider_status as get_provider_status
from .domain import CallbackRequestStatus
from .repository import Repository


LogEvent = Callable[..., None]


def import_call_result(repo: Repository, run_id: str, runner=None, log_event: LogEvent | None = None) -> dict[str, Any]:
    run = repo.get_call_run(run_id)
    if run.status == "canceled":
        return {
            "imported": False,
            "provider_status": "canceled",
            "run": run_status_payload(run)["run"],
        }
    if not run.provider_run_id:
        raise ValueError("Stored run has no provider_run_id to import.")

    provider_payload = fetch_call_result(run.provider_run_id) if runner is None else fetch_call_result(run.provider_run_id, runner)
    provider_status = get_provider_status(provider_payload)
    if provider_status not in TERMINAL_PROVIDER_STATUSES:
        _log(
            log_event,
            "call_result_not_terminal",
            run_id=run_id,
            provider_run_id=run.provider_run_id,
            provider_status=provider_status or "unknown",
        )
        return {
            "imported": False,
            "provider_status": provider_status or "unknown",
            "run": run_status_payload(run)["run"],
        }

    bundle = repo.save_run_result_bundle(run_id, normalized_provider_result(provider_payload, provider_status))
    if provider_status in FAILED_PROVIDER_STATUSES:
        _log(
            log_event,
            "call_result_failed",
            run_id=run_id,
            provider_run_id=run.provider_run_id,
            provider_status=provider_status,
        )
    mark_callback_run_terminal(repo, run_id, provider_status)
    payload = result_bundle_payload(bundle)
    payload["imported"] = True
    payload["provider_status"] = provider_status
    return payload


def import_pending_callback_results(repo: Repository, runner=None, log_event: LogEvent | None = None) -> tuple[dict[str, Any], ...]:
    imported: list[dict[str, Any]] = []
    for request in repo.list_callback_requests():
        if not request.auto_run_id or _callback_result_is_terminal(request.status):
            continue
        try:
            result = import_call_result(repo, request.auto_run_id, runner=runner, log_event=log_event)
        except Exception as exc:
            _log(
                log_event,
                "pending_callback_import_failed",
                callback_id=request.id,
                run_id=request.auto_run_id,
                error=str(exc),
            )
            continue
        if result.get("imported"):
            imported.append(result)
    return tuple(imported)


def _callback_result_is_terminal(status: str) -> bool:
    return status in {
        CallbackRequestStatus.RESOLVED.value,
        CallbackRequestStatus.AUTO_CALLBACK_COMPLETED.value,
        CallbackRequestStatus.AUTO_CALLBACK_NO_CONTACT.value,
        CallbackRequestStatus.AUTO_CALLBACK_FAILED.value,
        CallbackRequestStatus.DISMISSED_DUPLICATE.value,
    }


def _log(log_event: LogEvent | None, event: str, **fields: Any) -> None:
    if log_event is not None:
        log_event(event, **fields)
