"""Structured extraction from call result payloads.

The extractor is deterministic and conservative. Ambiguous payloads are
preserved for human review instead of being silently normalised away.
"""

from __future__ import annotations

import re
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


GROCERY_ITEM_ALIASES = {
    "bread": ("bread", "loaf", "батон", "хлеб"),
    "milk": ("milk", "молоко"),
    "eggs": ("eggs", "egg", "яйца", "яиц"),
    "cheese": ("cheese", "сыр"),
    "butter": ("butter", "масло"),
    "tea": ("tea", "чай"),
    "coffee": ("coffee", "кофе"),
    "rice": ("rice", "рис"),
    "porridge oats": ("porridge oats", "oats", "овсянка", "овсяные хлопья"),
    "pasta": ("pasta", "макароны", "паста"),
    "potatoes": ("potatoes", "potato", "картофель", "картошка"),
    "fruit": ("fruit", "fruits", "фрукты"),
    "vegetables": ("vegetables", "vegetable", "овощи"),
    "water": ("drinking water", "water", "вода"),
}

MEDICATION_ALIASES = ("medication", "medicine", "prescription", "pharmacy", "лекарство", "лекарства", "рецепт", "аптека")
SERVICE_KEYWORDS = {
    NeedCategory.CLEANING: ("cleaning", "clean", "уборка", "убрать"),
    NeedCategory.TRANSPORT: ("transport", "taxi", "ride", "такси", "транспорт"),
    NeedCategory.COMPANIONSHIP: ("companionship", "visit", "call back", "поговорить", "визит"),
    NeedCategory.REPAIR: ("repair", "tap", "plumber", "fix", "ремонт", "кран", "сантехник"),
    NeedCategory.DOCUMENTS: ("documents", "paperwork", "forms", "документы"),
}
REQUEST_SIGNALS = (
    "asked for",
    "asked to",
    "requested",
    "request was",
    "need was captured",
    "need captured",
    "need for",
    "needs",
    "need",
    "wants",
    "would like",
    "could you",
    "please buy",
    "please bring",
    "нужно",
    "нужен",
    "нужна",
    "просит",
    "попросил",
    "пожалуйста",
)
QUESTION_STARTERS = (
    "do you need",
    "what other",
    "is anything",
    "anything else",
    "would it be okay",
    "are you comfortable",
    "какая помощь",
    "вам нужно",
)
NEGATED_REQUEST_PATTERNS = (
    r"\bno\s+.+\brequest\b",
    r"\bno\s+.+\bneed\b",
    r"\bnot\s+requested\b",
    r"\bnot\s+confirmed\b",
    r"\bwithout\s+.+\brequest\b",
    r"\bне\s+просил",
    r"\bне\s+нужно",
)


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

    summary = _summary_from_payload(payload)
    if status == IntakeStatus.COMPLETED and not needs:
        needs.extend(_fallback_needs_from_text(summary))
        if summary and not needs:
            reasons.append("CALL-E returned a completed summary without structured practical needs.")

    human_review = bool(reasons)
    if payload.get("human_review") is True:
        human_review = True
        reasons.append("Payload explicitly requested human review.")

    return IntakeResult(
        recipient_id=recipient_id,
        status=status,
        needs=tuple(needs),
        summary=summary,
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
    if raw_status in {"malformed", "failed", "canceled", "cancelled"}:
        return IntakeStatus.MALFORMED
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


def _summary_from_payload(payload: dict) -> str:
    parts: list[str] = []
    for key in ("summary", "post_summary", "message"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
    evidence = payload.get("evidence")
    if isinstance(evidence, list):
        parts.extend(str(item).strip() for item in evidence if str(item).strip())
    for recipient in _dicts_from(payload.get("recipients")) + _dicts_from(payload.get("recipient_results")):
        for key in ("summary", "post_summary", "message"):
            value = recipient.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(value.strip())
        for attempt in _dicts_from(recipient.get("attempts")):
            value = attempt.get("summary")
            if isinstance(value, str) and value.strip():
                parts.append(value.strip())
            for turn in _dicts_from(attempt.get("transcript_turns")):
                text = turn.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
    return "\n".join(dict.fromkeys(parts))


def _dicts_from(value) -> list[dict]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _fallback_needs_from_text(text: str) -> list[ExtractedNeed]:
    request_text = _request_evidence_text(text)
    normalized = _normalize_text(request_text)
    if not normalized:
        return []

    needs: list[ExtractedNeed] = []
    grocery_items = _grocery_items_from_text(request_text, quantity_source=text)
    if grocery_items or any(_contains_word(normalized, keyword) for keyword in ("groceries", "grocery", "food", "products", "продукты", "еда")):
        needs.append(
            ExtractedNeed(
                category=NeedCategory.GROCERIES,
                items=grocery_items or ("groceries",),
                urgency=_urgency_from_text(text),
                notes="Extracted from CALL-E summary.",
                review_state=ReviewState.READY if grocery_items else ReviewState.HUMAN_REVIEW,
            )
        )

    if any(_contains_word(normalized, keyword) for keyword in MEDICATION_ALIASES):
        needs.append(
            ExtractedNeed(
                category=NeedCategory.MEDICATION,
                items=("medication pickup",),
                urgency=_urgency_from_text(text),
                notes="Extracted from CALL-E summary.",
            )
        )

    for category, keywords in SERVICE_KEYWORDS.items():
        if any(_contains_word(normalized, keyword) for keyword in keywords):
            needs.append(
                ExtractedNeed(
                    category=category,
                    items=(category.value.replace("_", " "),),
                    urgency=_urgency_from_text(text),
                    notes="Extracted from CALL-E summary.",
                )
            )
    return needs


def _request_evidence_text(text: str) -> str:
    segments = _split_evidence_segments(text)
    request_segments = [segment for segment in segments if _looks_like_request_evidence(segment)]
    if request_segments:
        return " ".join(request_segments)
    return _strip_agent_option_lists(text)


def _split_evidence_segments(text: str) -> list[str]:
    compact = " ".join(text.split())
    return [segment.strip() for segment in re.split(r"(?<=[.!?])\s+|\n+", compact) if segment.strip()]


def _looks_like_request_evidence(segment: str) -> bool:
    normalized = _normalize_text(segment)
    if not normalized:
        return False
    if "?" in segment:
        return False
    if any(normalized.startswith(starter) for starter in QUESTION_STARTERS):
        return False
    if any(starter in normalized for starter in ("allowed questions:", "prohibited topics:", "completion criteria:")):
        return False
    if any(re.search(pattern, normalized, flags=re.IGNORECASE) for pattern in NEGATED_REQUEST_PATTERNS):
        return False
    if not any(signal in normalized for signal in REQUEST_SIGNALS):
        return False
    return bool(
        _grocery_items_from_text(segment)
        or any(_contains_word(normalized, keyword) for keyword in ("groceries", "grocery", "food", "products", "продукты", "еда"))
        or any(_contains_word(normalized, keyword) for keyword in MEDICATION_ALIASES)
        or any(
            _contains_word(normalized, keyword)
            for keywords in SERVICE_KEYWORDS.values()
            for keyword in keywords
        )
    )


def _strip_agent_option_lists(text: str) -> str:
    cleaned = _strip_urgency_question_lists(text)
    option_patterns = (
        r"do you need groceries,\s*medication pickup,\s*cleaning,\s*transport,\s*companionship,\s*repairs,\s*documents help,\s*or another practical service\??",
        r"do you need groceries,\s*medication pickup,\s*cleaning,\s*transport,\s*companionship,\s*or another kind of help\??",
        r"groceries,\s*medication pickup,\s*cleaning,\s*transport,\s*companionship,\s*repairs,\s*documents help,\s*or another practical service",
    )
    for pattern in option_patterns:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)
    return cleaned


def _grocery_items_from_text(text: str, quantity_source: str | None = None) -> tuple[str, ...]:
    normalized = _normalize_text(text)
    quantity_text = quantity_source or text
    items: list[str] = []
    for item, aliases in GROCERY_ITEM_ALIASES.items():
        if not any(_contains_word(normalized, alias) for alias in aliases):
            continue
        quantified = _quantity_for_item(quantity_text, aliases)
        items.append(quantified or item)
    return tuple(dict.fromkeys(items))


def _quantity_for_item(text: str, aliases: tuple[str, ...]) -> str:
    quantity = r"(?:a|an|one|own|two|three|four|five|\d+(?:[.,]\d+)?)"
    unit = r"(?:litre|liter|litres|liters|l|ml|bottle|bottles|loaf|loaves|pack|packs|package|packages|kg|g)"
    for alias in aliases:
        alias_pattern = re.escape(alias)
        before = re.search(
            rf"\b({quantity}(?:[-\s]+{unit})?(?:[-\s]+(?:bottle|pack))?\s+of\s+{alias_pattern})\b",
            text,
            flags=re.IGNORECASE,
        )
        if before:
            return _normalize_item_label(before.group(1))
        direct = re.search(
            rf"\b({quantity}[-\s]+{unit}\s+{alias_pattern})\b",
            text,
            flags=re.IGNORECASE,
        )
        if direct:
            return _normalize_item_label(direct.group(1))
        after = re.search(
            rf"\b({alias_pattern}\s+{quantity}[-\s]+{unit})\b",
            text,
            flags=re.IGNORECASE,
        )
        if after:
            return _normalize_item_label(after.group(1))
    return ""


def _normalize_item_label(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    return re.sub(r"^own(?=\s+package\b)", "one", normalized)


def _urgency_from_text(text: str) -> Urgency:
    answer_text = _strip_urgency_question_lists(text)
    if _has_tomorrow_signal(answer_text):
        return Urgency.TOMORROW
    if _has_today_signal(answer_text):
        return Urgency.TODAY
    if "this week" in answer_text or "на этой неделе" in answer_text:
        return Urgency.THIS_WEEK
    if _has_tomorrow_signal(text):
        return Urgency.TOMORROW
    if _has_today_signal(text):
        return Urgency.TODAY
    if "this week" in text or "на этой неделе" in text:
        return Urgency.THIS_WEEK
    return Urgency.UNKNOWN


def _strip_urgency_question_lists(text: str) -> str:
    patterns = (
        r"today,\s*tomorrow,\s*this week,\s*or\s*(?:is it\s*)?not urgent",
        r"today,\s*tomorrow,\s*this week",
        r"сегодня,\s*завтра,\s*на этой неделе",
    )
    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)
    return cleaned


def _has_today_signal(text: str) -> bool:
    if any(_contains_word(text, keyword) for keyword in ("today", "сегодня", "urgent", "urgently", "срочно")):
        return True
    return False


def _has_tomorrow_signal(text: str) -> bool:
    explicit_patterns = (
        r"\b(?:for|by|needed|requested|deliver(?:ed)?|delivery|to)\s+tomorrow\b",
        r"\btomorrow\s*(?:please|morning|afternoon|evening)?\b",
        r"\bзавтра\b",
    )
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in explicit_patterns)


def _normalize_text(text: str) -> str:
    return " ".join(text.lower().split())


def _contains_word(text: str, word: str) -> bool:
    return bool(re.search(rf"(?<!\w){re.escape(word.lower())}(?!\w)", text))


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
