"""Structured extraction from CALL-E call result payloads."""

from __future__ import annotations

from .intake_models import (
    ExtractedNeed,
    IntakeResult,
    IntakeStatus,
    NeedCategory,
    ReviewState,
    ReviewReasonCode,
    Urgency,
)
from .intake_text_extraction import (
    fallback_needs_from_text,
    normalize_text,
    prohibited_request_reason,
    summary_from_payload,
)


def extract_intake_result(recipient_id: str, payload: dict) -> IntakeResult:
    if not isinstance(payload, dict):
        return _malformed(recipient_id, {"raw": payload}, "Payload is not an object.")

    status = _status_from_payload(payload)
    reasons = _review_reasons_for_status(status)
    reason_codes = _review_reason_codes_for_status(status)
    needs_raw = payload.get("needs", [])
    if needs_raw is None:
        needs_raw = []
    if not isinstance(needs_raw, list):
        return _malformed(recipient_id, payload, "Payload needs field must be a list.")

    summary = summary_from_payload(payload)
    prohibited_reason = prohibited_request_reason(_policy_scan_text(summary, needs_raw)) if status == IntakeStatus.COMPLETED else ""
    allowed_needs_raw, excluded_count = _split_allowed_needs(needs_raw)
    if excluded_count:
        reasons.append(_prohibited_request_reason())
        reason_codes.append(ReviewReasonCode.PROHIBITED_REQUEST_EXCLUDED)
    needs = _needs_from_payload(allowed_needs_raw, reasons, reason_codes)
    fallback_needs = fallback_needs_from_text(summary) if status == IntakeStatus.COMPLETED and summary else []
    if prohibited_reason:
        reasons.append(prohibited_reason)
        reason_codes.append(ReviewReasonCode.PROHIBITED_REQUEST_EXCLUDED)
        if not fallback_needs:
            needs = []
    if needs and fallback_needs and _structured_needs_are_broader_than_summary(needs, fallback_needs):
        needs = fallback_needs
    if needs and fallback_needs and _summary_says_no_additional_needs(summary):
        needs = fallback_needs
    if status == IntakeStatus.COMPLETED and not needs:
        needs.extend(fallback_needs)
        if summary and not needs and not prohibited_reason:
            reasons.append("CALL-E returned a completed summary without structured practical needs.")
            reason_codes.append(ReviewReasonCode.COMPLETED_WITHOUT_STRUCTURED_NEEDS)

    if payload.get("human_review") is True:
        reasons.append("Payload explicitly requested human review.")
        reason_codes.append(ReviewReasonCode.HUMAN_REVIEW_REQUESTED)

    return IntakeResult(
        recipient_id=recipient_id,
        status=status,
        needs=tuple(needs),
        summary=summary,
        human_review=bool(reasons),
        review_reasons=tuple(reasons),
        review_reason_codes=tuple(dict.fromkeys(reason_codes)),
        raw=payload,
    )


def _status_from_payload(payload: dict) -> IntakeStatus:
    if payload.get("emergency_flag") is True:
        return IntakeStatus.EMERGENCY
    if payload.get("distress_flag") is True:
        return IntakeStatus.DISTRESS

    raw_status = str(payload.get("status", payload.get("overall_status", "completed")))
    status_mapping = {
        "no_contact": IntakeStatus.NO_CONTACT,
        "failed_no_answer": IntakeStatus.NO_CONTACT,
        "malformed": IntakeStatus.MALFORMED,
        "failed": IntakeStatus.MALFORMED,
        "canceled": IntakeStatus.MALFORMED,
        "cancelled": IntakeStatus.MALFORMED,
        "emergency": IntakeStatus.EMERGENCY,
        "urgent_danger": IntakeStatus.EMERGENCY,
        "distress": IntakeStatus.DISTRESS,
        "too_upset": IntakeStatus.DISTRESS,
    }
    return status_mapping.get(raw_status, IntakeStatus.COMPLETED)


def _review_reasons_for_status(status: IntakeStatus) -> list[str]:
    if status in {IntakeStatus.NO_CONTACT, IntakeStatus.EMERGENCY, IntakeStatus.DISTRESS}:
        return [f"Call status requires human review: {status.value}."]
    return []


def _review_reason_codes_for_status(status: IntakeStatus) -> list[ReviewReasonCode]:
    if status in {IntakeStatus.NO_CONTACT, IntakeStatus.EMERGENCY, IntakeStatus.DISTRESS}:
        return [ReviewReasonCode.STATUS_REQUIRES_REVIEW]
    return []


def _needs_from_payload(
    needs_raw: list,
    reasons: list[str],
    reason_codes: list[ReviewReasonCode],
) -> list[ExtractedNeed]:
    needs: list[ExtractedNeed] = []
    for index, item in enumerate(needs_raw):
        if not isinstance(item, dict):
            reasons.append(f"Need at index {index} is not an object.")
            reason_codes.append(ReviewReasonCode.MALFORMED_NEED)
            continue
        needs.append(_need_from_payload(item, reasons, reason_codes, index))
    return needs


def _split_allowed_needs(needs_raw: list) -> tuple[list, int]:
    allowed: list = []
    excluded = 0
    for item in needs_raw:
        if isinstance(item, dict) and prohibited_request_reason_from_need(item):
            excluded += 1
            continue
        allowed.append(item)
    return allowed, excluded


def prohibited_request_reason_from_need(item: dict) -> str:
    return prohibited_request_reason(_policy_scan_text("", [item]))


def _prohibited_request_reason() -> str:
    return (
        "One or more prohibited or region-restricted items were excluded from fulfilment; "
        "allowed practical support items may still be processed."
    )


def _policy_scan_text(summary: str, needs_raw: list) -> str:
    parts = [summary]
    for item in needs_raw:
        if not isinstance(item, dict):
            continue
        for key in ("category", "notes"):
            value = item.get(key)
            if isinstance(value, str):
                parts.append(value)
        raw_items = item.get("items")
        if isinstance(raw_items, str):
            parts.append(raw_items)
        elif isinstance(raw_items, list):
            parts.extend(str(value) for value in raw_items)
    return "\n".join(part for part in parts if part)


def _need_from_payload(
    payload: dict,
    reasons: list[str],
    reason_codes: list[ReviewReasonCode],
    index: int,
) -> ExtractedNeed:
    category = _enum_or_review(
        NeedCategory,
        payload.get("category"),
        NeedCategory.OTHER,
        reasons,
        reason_codes,
        ReviewReasonCode.UNKNOWN_NEED_CATEGORY,
        f"Need {index} has unknown category.",
    )
    urgency = _enum_or_review(
        Urgency,
        payload.get("urgency"),
        Urgency.UNKNOWN,
        reasons,
        reason_codes,
        ReviewReasonCode.UNKNOWN_URGENCY,
        f"Need {index} has unknown urgency.",
    )
    items = _items_from_payload(payload.get("items", []), reasons, reason_codes, index)
    review_state = ReviewState.HUMAN_REVIEW if category == NeedCategory.OTHER or urgency == Urgency.UNKNOWN else ReviewState.READY
    return ExtractedNeed(
        category=category,
        items=items,
        urgency=urgency,
        notes=str(payload.get("notes", "")),
        review_state=review_state,
    )


def _items_from_payload(
    raw_items,
    reasons: list[str],
    reason_codes: list[ReviewReasonCode],
    index: int,
) -> tuple[str, ...]:
    if isinstance(raw_items, str):
        return (raw_items,)
    if isinstance(raw_items, list):
        return tuple(str(item) for item in raw_items if str(item).strip())
    reasons.append(f"Need {index} has malformed items.")
    reason_codes.append(ReviewReasonCode.MALFORMED_NEED)
    return ()


def _summary_says_no_additional_needs(summary: str) -> bool:
    normalized = normalize_text(summary)
    markers = (
        "no additional practical needs",
        "no additional needs",
        "no other practical needs",
        "no other needs",
        "nothing else",
        "no further needs",
    )
    return any(marker in normalized for marker in markers)


def _structured_needs_are_broader_than_summary(
    structured_needs: list[ExtractedNeed],
    fallback_needs: list[ExtractedNeed],
) -> bool:
    structured_categories = {need.category for need in structured_needs}
    fallback_categories = {need.category for need in fallback_needs}
    if not structured_categories or not fallback_categories:
        return False
    if not fallback_categories.issubset(structured_categories):
        return False
    return bool(structured_categories - fallback_categories)


def _enum_or_review(
    enum_type,
    raw_value,
    fallback,
    reasons: list[str],
    reason_codes: list[ReviewReasonCode],
    reason_code: ReviewReasonCode,
    reason: str,
):
    try:
        return enum_type(str(raw_value))
    except ValueError:
        reasons.append(reason)
        reason_codes.append(reason_code)
        return fallback


def _malformed(recipient_id: str, raw: dict, reason: str) -> IntakeResult:
    return IntakeResult(
        recipient_id=recipient_id,
        status=IntakeStatus.MALFORMED,
        human_review=True,
        review_reasons=(reason,),
        review_reason_codes=(ReviewReasonCode.MALFORMED_PAYLOAD,),
        raw=raw,
    )
