"""Structured extraction from CALL-E call result payloads."""

from __future__ import annotations

from .intake_models import (
    ExtractedNeed,
    IntakeResult,
    IntakeStatus,
    NeedCategory,
    ReviewState,
    Urgency,
)
from .intake_text_extraction import fallback_needs_from_text, summary_from_payload


def extract_intake_result(recipient_id: str, payload: dict) -> IntakeResult:
    if not isinstance(payload, dict):
        return _malformed(recipient_id, {"raw": payload}, "Payload is not an object.")

    status = _status_from_payload(payload)
    reasons = _review_reasons_for_status(status)
    needs_raw = payload.get("needs", [])
    if needs_raw is None:
        needs_raw = []
    if not isinstance(needs_raw, list):
        return _malformed(recipient_id, payload, "Payload needs field must be a list.")

    needs = _needs_from_payload(needs_raw, reasons)
    summary = summary_from_payload(payload)
    if status == IntakeStatus.COMPLETED and not needs:
        needs.extend(fallback_needs_from_text(summary))
        if summary and not needs:
            reasons.append("CALL-E returned a completed summary without structured practical needs.")

    if payload.get("human_review") is True:
        reasons.append("Payload explicitly requested human review.")

    return IntakeResult(
        recipient_id=recipient_id,
        status=status,
        needs=tuple(needs),
        summary=summary,
        human_review=bool(reasons),
        review_reasons=tuple(reasons),
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


def _needs_from_payload(needs_raw: list, reasons: list[str]) -> list[ExtractedNeed]:
    needs: list[ExtractedNeed] = []
    for index, item in enumerate(needs_raw):
        if not isinstance(item, dict):
            reasons.append(f"Need at index {index} is not an object.")
            continue
        needs.append(_need_from_payload(item, reasons, index))
    return needs


def _need_from_payload(payload: dict, reasons: list[str], index: int) -> ExtractedNeed:
    category = _enum_or_review(
        NeedCategory,
        payload.get("category"),
        NeedCategory.OTHER,
        reasons,
        f"Need {index} has unknown category.",
    )
    urgency = _enum_or_review(
        Urgency,
        payload.get("urgency"),
        Urgency.UNKNOWN,
        reasons,
        f"Need {index} has unknown urgency.",
    )
    items = _items_from_payload(payload.get("items", []), reasons, index)
    review_state = ReviewState.HUMAN_REVIEW if category == NeedCategory.OTHER or urgency == Urgency.UNKNOWN else ReviewState.READY
    return ExtractedNeed(
        category=category,
        items=items,
        urgency=urgency,
        notes=str(payload.get("notes", "")),
        review_state=review_state,
    )


def _items_from_payload(raw_items, reasons: list[str], index: int) -> tuple[str, ...]:
    if isinstance(raw_items, str):
        return (raw_items,)
    if isinstance(raw_items, list):
        return tuple(str(item) for item in raw_items if str(item).strip())
    reasons.append(f"Need {index} has malformed items.")
    return ()


def _enum_or_review(enum_type, raw_value, fallback, reasons: list[str], reason: str):
    try:
        return enum_type(str(raw_value))
    except ValueError:
        reasons.append(reason)
        return fallback


def _malformed(recipient_id: str, raw: dict, reason: str) -> IntakeResult:
    return IntakeResult(
        recipient_id=recipient_id,
        status=IntakeStatus.MALFORMED,
        human_review=True,
        review_reasons=(reason,),
        raw=raw,
    )
