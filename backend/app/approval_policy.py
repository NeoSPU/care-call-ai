"""Approval and execution gate policy for live CareCall rounds."""

from __future__ import annotations

from .approval import OperatorApproval, validate_operator_approval


REQUIRED_CONFIRMATIONS = ("active_consent", "care_route_match", "exact_keyset", "real_side_effects")
REPEAT_CALL_CONFIRMATION = "same_day_repeat_acknowledged"
LIVE_AUTHORIZATION_PHRASE = "EXECUTE LIVE CALLS"


def approval_execution_blockers(
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


def all_confirmations(confirmations: dict) -> bool:
    return all(confirmations.get(name) is True for name in REQUIRED_CONFIRMATIONS)


def repeat_call_blockers(ready_previews, confirmations: dict) -> tuple[str, ...]:
    repeat_previews = [preview for preview in ready_previews if preview.same_day_call_count > 0]
    if not repeat_previews:
        return ()

    reasons: list[str] = []
    limit_reached = [preview.recipient_label for preview in repeat_previews if preview.operator_repeat_limit_reached]
    if limit_reached:
        reasons.append(
            "Operator-initiated same-day repeat call limit has been reached for: "
            + ", ".join(limit_reached)
            + "."
        )

    acknowledgement_missing = any(preview.operator_repeat_available for preview in repeat_previews) and confirmations.get(
        REPEAT_CALL_CONFIRMATION
    ) is not True
    if acknowledgement_missing:
        reasons.append("Same-day repeat call acknowledgement is required.")

    return tuple(reasons)
