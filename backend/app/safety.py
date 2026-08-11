"""Safety preflight helpers used before CALL-E planning or execution."""

from __future__ import annotations

from .domain import CallSuitability, PreflightRow, Recipient
from .validation import validate_recipient


def mask_phone(phone: str) -> str:
    stripped = phone.strip()
    if len(stripped) <= 6:
        return "***"
    return f"{stripped[:2]}{'*' * max(len(stripped) - 6, 3)}{stripped[-4:]}"


def call_route(recipient: Recipient) -> str:
    suitability = recipient.care_profile.call_suitability
    if suitability == CallSuitability.DIRECT_CALL_OK:
        return "recipient"
    if suitability == CallSuitability.CAREGIVER_FIRST:
        return "caregiver"
    if suitability == CallSuitability.STAFF_ONLY:
        return "staff"
    return "blocked"


def build_preflight_row(recipient: Recipient) -> PreflightRow:
    issues = validate_recipient(recipient)
    ready = not any(issue.blocks_call for issue in issues)
    route = call_route(recipient) if ready else "blocked"
    masked_phone = mask_phone(recipient.phone_e164)

    if ready:
        summary = f"{recipient.display_name} can be planned via {route} route."
    else:
        summary = "; ".join(issue.message for issue in issues)

    return PreflightRow(
        recipient_id=recipient.id,
        recipient_label=recipient.display_name,
        masked_phone=masked_phone,
        ready=ready,
        route=route,
        summary=summary,
        issues=issues,
    )


def build_preflight_report(recipients: list[Recipient]) -> list[PreflightRow]:
    return [build_preflight_row(recipient) for recipient in recipients]
