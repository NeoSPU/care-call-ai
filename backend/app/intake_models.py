"""Domain models for CALL-E intake extraction."""

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
