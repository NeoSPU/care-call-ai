"""Operator approval gate for future real outbound calls."""

from __future__ import annotations

from dataclasses import dataclass, field

from .call_planning import CallPlanPreview, ready_previews


@dataclass(frozen=True)
class OperatorApproval:
    approved_keys: tuple[str, ...]
    approver: str
    approved_at: str
    note: str = ""


@dataclass(frozen=True)
class ApprovalDecision:
    approved: bool
    reasons: tuple[str, ...] = field(default_factory=tuple)


def validate_operator_approval(
    previews: tuple[CallPlanPreview, ...],
    approval: OperatorApproval | None,
) -> ApprovalDecision:
    if approval is None:
        return ApprovalDecision(False, ("Operator approval is required.",))

    reasons: list[str] = []
    blocked_keys = {preview.idempotency_key for preview in previews if not preview.ready}
    approved_keys = set(approval.approved_keys)
    ready_keys = {preview.idempotency_key for preview in ready_previews(previews)}

    if not approval.approver.strip():
        reasons.append("Approver name is required.")

    if not approval.approved_at.strip():
        reasons.append("Approval timestamp is required.")

    blocked_approved = approved_keys & blocked_keys
    if blocked_approved:
        reasons.append("Approval includes blocked call plans.")

    missing = ready_keys - approved_keys
    extra = approved_keys - ready_keys
    if missing:
        reasons.append("Approval is missing ready call plans.")
    if extra:
        reasons.append("Approval includes call plans not in the current preview.")

    return ApprovalDecision(approved=not reasons, reasons=tuple(reasons))
