"""Controlled CALL-E execution adapter.

The functions in this module can call real CALL-E commands when supplied with
the default runner. Tests use fake runners. Do not call these functions with the
default runner unless an operator has explicitly approved the exact preview.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from typing import Callable

from .approval import OperatorApproval, validate_operator_approval
from .call_planning import CallPlanPreview
from .calle_developer_api import developer_api_enabled, developer_api_runner_from_env
from .calle_mcp_http import mcp_http_enabled, mcp_http_runner_from_env
from .calle_readiness import CalleReadiness, SAFE_CALLE_ENV, default_runner
from .domain import StrEnum

ExecutionRunner = Callable[[tuple[str, ...], dict[str, str]], subprocess.CompletedProcess]


class CallRunStatus(StrEnum):
    BLOCKED = "blocked"
    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(frozen=True)
class CallRunRecord:
    recipient_id: str
    idempotency_key: str
    status: CallRunStatus
    plan_id: str = ""
    run_id: str = ""
    started_at: str = ""
    completed_at: str = ""
    error: str = ""
    masked_phone: str = ""


@dataclass(frozen=True)
class ExecutionBatch:
    records: tuple[CallRunRecord, ...]
    blocked_reasons: tuple[str, ...] = field(default_factory=tuple)

    @property
    def success(self) -> bool:
        return not self.blocked_reasons and all(
            record.status != CallRunStatus.FAILED for record in self.records
        )


def execute_approved_previews(
    previews: tuple[CallPlanPreview, ...],
    approval: OperatorApproval | None,
    readiness: CalleReadiness,
    runner: ExecutionRunner | None = None,
) -> ExecutionBatch:
    blocked = _execution_blockers(previews, approval, readiness)
    if blocked:
        return ExecutionBatch(records=(), blocked_reasons=blocked)

    runner = default_execution_runner() if runner is None else runner
    records = tuple(_execute_single_preview(preview, runner) for preview in previews if preview.ready)
    return ExecutionBatch(records=records)


def fetch_call_result(run_id: str, runner: ExecutionRunner | None = None) -> dict:
    runner = default_execution_runner() if runner is None else runner
    result = runner(("calle", "get_call_run", run_id), SAFE_CALLE_ENV)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or f"CALL-E get_call_run failed for {run_id}")
    return _json_or_text(result.stdout)


def default_execution_runner() -> ExecutionRunner:
    if developer_api_enabled():
        return developer_api_runner_from_env()
    if mcp_http_enabled():
        return mcp_http_runner_from_env()
    return default_runner


def _execution_blockers(
    previews: tuple[CallPlanPreview, ...],
    approval: OperatorApproval | None,
    readiness: CalleReadiness,
) -> tuple[str, ...]:
    reasons: list[str] = []
    if not readiness.ready:
        reasons.append("CALL-E readiness check is not passing.")

    approval_decision = validate_operator_approval(previews, approval)
    if not approval_decision.approved:
        reasons.extend(approval_decision.reasons)

    if any(not preview.ready for preview in previews):
        reasons.append("Preview includes blocked call plans.")

    return tuple(reasons)


def _execute_single_preview(preview: CallPlanPreview, runner: ExecutionRunner) -> CallRunRecord:
    plan_payload = {
        "idempotency_key": preview.idempotency_key,
        "recipient_id": preview.recipient_id,
        "to_phone": preview.target_phone_e164,
        "route": preview.route,
        "prompt": preview.prompt_preview,
        "goal": preview.prompt_preview,
        "language": preview.language,
        "timezone": preview.timezone,
    }
    plan_result = runner(("calle", "plan_call", json.dumps(plan_payload)), SAFE_CALLE_ENV)
    if plan_result.returncode != 0:
        return _failed_record(preview, plan_result.stderr or plan_result.stdout)

    plan_response = _json_or_text(plan_result.stdout)
    plan_id = str(plan_response.get("plan_id", plan_response.get("id", "")))
    if not plan_id:
        return _failed_record(preview, "CALL-E plan_call returned no plan_id.")

    confirm_token = str(plan_response.get("confirm_token", ""))
    run_command = ("calle", "run_call", plan_id, confirm_token) if confirm_token else ("calle", "run_call", plan_id)
    run_result = runner(run_command, SAFE_CALLE_ENV)
    if run_result.returncode != 0:
        return _failed_record(preview, run_result.stderr or run_result.stdout, plan_id=plan_id)

    run_response = _json_or_text(run_result.stdout)
    run_id = str(run_response.get("run_id", run_response.get("id", "")))
    if not run_id:
        return _failed_record(preview, "CALL-E run_call returned no run_id.", plan_id=plan_id)

    return CallRunRecord(
        recipient_id=preview.recipient_id,
        idempotency_key=preview.idempotency_key,
        status=CallRunStatus.RUNNING,
        plan_id=plan_id,
        run_id=run_id,
        masked_phone=preview.masked_phone,
    )


def _failed_record(preview: CallPlanPreview, error: str, plan_id: str = "") -> CallRunRecord:
    return CallRunRecord(
        recipient_id=preview.recipient_id,
        idempotency_key=preview.idempotency_key,
        status=CallRunStatus.FAILED,
        plan_id=plan_id,
        error=error.strip() or "Unknown CALL-E execution failure.",
        masked_phone=preview.masked_phone,
    )


def _json_or_text(output: str) -> dict:
    text = output.strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {"text": text}
    if isinstance(parsed, dict):
        return parsed
    return {"value": parsed}
