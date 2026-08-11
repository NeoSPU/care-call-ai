"""Structured extraction from call result payloads.

The extractor is deterministic and conservative. Ambiguous payloads are
preserved for human review instead of being silently normalised away.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .domain import StrEnum


class NeedCategory(StrEnum):
    GROCERIES = "groceries"
    MEDICATION = "medication"
    CLEANING = "cleaning"
    TRANSPORT = "transport"
    MEDICAL_VISIT = "medical_visit"
    COMPANIONSHIP = "companionship"
    REPAIR = "repair"
    DOCUMENTS = "documents"
    OTHER = "other"


class Urgency(StrEnum):
    TODAY = "today"
    TOMORROW = "tomorrow"
    THIS_WEEK = "this_week"
    NOT_URGENT = "not_urgent"
    UNKNOWN = "unknown"


class ReviewState(StrEnum):
    READY = "ready"
    HUMAN_REVIEW = "human_review"


class IntakeStatus(StrEnum):
    COMPLETED = "completed"
    NO_CONTACT = "no_contact"
    EMERGENCY = "emergency"
    DISTRESS = "distress"
    MALFORMED = "malformed"


@dataclass(frozen=True)
class ExtractedNeed:
    category: NeedCategory
    items: tuple[str, ...]
    urgency: Urgency
    notes: str = ""
    review_state: ReviewState = ReviewState.READY


@dataclass(frozen=True)
class IntakeResult:
    recipient_id: str
    status: IntakeStatus
    needs: tuple[ExtractedNeed, ...] = field(default_factory=tuple)
    summary: str = ""
    human_review: bool = False
    review_reasons: tuple[str, ...] = field(default_factory=tuple)
    raw: dict | None = None


def extract_intake_result(recipient_id: str, payload: dict) -> IntakeResult:
    if not isinstance(payload, dict):
        return _malformed(recipient_id, {"raw": payload}, "Payload is not an object.")

    status = _status_from_payload(payload)
    reasons: list[str] = []

    if status in {IntakeStatus.NO_CONTACT, IntakeStatus.EMERGENCY, IntakeStatus.DISTRESS}:
        reasons.append(f"Call status requires human review: {status.value}.")

    needs_raw = payload.get("needs", [])
    if needs_raw is None:
        needs_raw = []
    if not isinstance(needs_raw, list):
        return _malformed(recipient_id, payload, "Payload needs field must be a list.")

    needs: list[ExtractedNeed] = []
    for index, item in enumerate(needs_raw):
        if not isinstance(item, dict):
            reasons.append(f"Need at index {index} is not an object.")
            continue
        needs.append(_need_from_payload(item, reasons, index))

    human_review = bool(reasons)
    if payload.get("human_review") is True:
        human_review = True
        reasons.append("Payload explicitly requested human review.")

    return IntakeResult(
        recipient_id=recipient_id,
        status=status,
        needs=tuple(needs),
        summary=str(payload.get("summary", "")),
        human_review=human_review,
        review_reasons=tuple(reasons),
        raw=payload,
    )


def _status_from_payload(payload: dict) -> IntakeStatus:
    if payload.get("emergency_flag") is True:
        return IntakeStatus.EMERGENCY
    if payload.get("distress_flag") is True:
        return IntakeStatus.DISTRESS
    raw_status = str(payload.get("status", payload.get("overall_status", "completed")))
    if raw_status in {"no_contact", "failed_no_answer"}:
        return IntakeStatus.NO_CONTACT
    if raw_status in {"emergency", "urgent_danger"}:
        return IntakeStatus.EMERGENCY
    if raw_status in {"distress", "too_upset"}:
        return IntakeStatus.DISTRESS
    return IntakeStatus.COMPLETED


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
    raw_items = payload.get("items", [])
    if isinstance(raw_items, str):
        items = (raw_items,)
    elif isinstance(raw_items, list):
        items = tuple(str(item) for item in raw_items if str(item).strip())
    else:
        items = ()
        reasons.append(f"Need {index} has malformed items.")

    review_state = ReviewState.HUMAN_REVIEW if category == NeedCategory.OTHER or urgency == Urgency.UNKNOWN else ReviewState.READY
    return ExtractedNeed(
        category=category,
        items=items,
        urgency=urgency,
        notes=str(payload.get("notes", "")),
        review_state=review_state,
    )


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
