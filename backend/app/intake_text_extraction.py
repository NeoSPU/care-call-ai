"""Conservative text fallback extraction for CALL-E intake summaries."""

from __future__ import annotations

import re

from .intake_models import ExtractedNeed, NeedCategory, ReviewState, Urgency


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

GROCERY_CATEGORY_KEYWORDS = ("groceries", "grocery", "food", "products", "продукты", "еда")
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

AGENT_OPTION_LIST_PATTERNS = (
    r"do you need groceries,\s*medication pickup,\s*cleaning,\s*transport,\s*companionship,\s*repairs,\s*documents help,\s*or another practical service\??",
    r"do you need groceries,\s*medication pickup,\s*cleaning,\s*transport,\s*companionship,\s*or another kind of help\??",
    r"groceries,\s*medication pickup,\s*cleaning,\s*transport,\s*companionship,\s*repairs,\s*documents help,\s*or another practical service",
)
URGENCY_OPTION_LIST_PATTERNS = (
    r"today,\s*tomorrow,\s*this week,\s*or\s*(?:is it\s*)?not urgent",
    r"today,\s*tomorrow,\s*this week",
    r"сегодня,\s*завтра,\s*на этой неделе",
)


def summary_from_payload(payload: dict) -> str:
    parts: list[str] = []
    for key in ("summary", "post_summary", "message"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())

    evidence = payload.get("evidence")
    if isinstance(evidence, list):
        parts.extend(str(item).strip() for item in evidence if str(item).strip())

    for recipient in _dicts_from(payload.get("recipients")) + _dicts_from(payload.get("recipient_results")):
        parts.extend(_summary_parts_from_result(recipient))
    return "\n".join(dict.fromkeys(parts))


def fallback_needs_from_text(text: str) -> list[ExtractedNeed]:
    request_text = _request_evidence_text(text)
    normalized = normalize_text(request_text)
    if not normalized:
        return []

    needs: list[ExtractedNeed] = []
    grocery_need = _grocery_need_from_text(request_text, text, normalized)
    if grocery_need:
        needs.append(grocery_need)

    if any(contains_word(normalized, keyword) for keyword in MEDICATION_ALIASES):
        needs.append(_need(NeedCategory.MEDICATION, ("medication pickup",), text))

    for category, keywords in SERVICE_KEYWORDS.items():
        if any(contains_word(normalized, keyword) for keyword in keywords):
            needs.append(_need(category, (category.value.replace("_", " "),), text))
    return needs


def urgency_from_text(text: str) -> Urgency:
    answer_text = strip_urgency_question_lists(text)
    if _has_tomorrow_signal(answer_text):
        return Urgency.TOMORROW
    if _has_today_signal(answer_text):
        return Urgency.TODAY
    if _has_this_week_signal(answer_text):
        return Urgency.THIS_WEEK
    if _has_tomorrow_signal(text):
        return Urgency.TOMORROW
    if _has_today_signal(text):
        return Urgency.TODAY
    if _has_this_week_signal(text):
        return Urgency.THIS_WEEK
    return Urgency.UNKNOWN


def normalize_text(text: str) -> str:
    return " ".join(text.lower().split())


def contains_word(text: str, word: str) -> bool:
    return bool(re.search(rf"(?<!\w){re.escape(word.lower())}(?!\w)", text))


def strip_urgency_question_lists(text: str) -> str:
    return _remove_patterns(text, URGENCY_OPTION_LIST_PATTERNS)


def _summary_parts_from_result(result: dict) -> list[str]:
    parts: list[str] = []
    for key in ("summary", "post_summary", "message"):
        value = result.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
    for attempt in _dicts_from(result.get("attempts")):
        value = attempt.get("summary")
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
        for turn in _dicts_from(attempt.get("transcript_turns")):
            text = turn.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
    return parts


def _dicts_from(value) -> list[dict]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _grocery_need_from_text(request_text: str, full_text: str, normalized: str) -> ExtractedNeed | None:
    grocery_items = _grocery_items_from_text(request_text, quantity_source=full_text)
    has_grocery_category = any(contains_word(normalized, keyword) for keyword in GROCERY_CATEGORY_KEYWORDS)
    if not grocery_items and not has_grocery_category:
        return None
    return ExtractedNeed(
        category=NeedCategory.GROCERIES,
        items=grocery_items or ("groceries",),
        urgency=urgency_from_text(full_text),
        notes="Extracted from CALL-E summary.",
        review_state=ReviewState.READY if grocery_items else ReviewState.HUMAN_REVIEW,
    )


def _need(category: NeedCategory, items: tuple[str, ...], text: str) -> ExtractedNeed:
    return ExtractedNeed(
        category=category,
        items=items,
        urgency=urgency_from_text(text),
        notes="Extracted from CALL-E summary.",
    )


def _request_evidence_text(text: str) -> str:
    request_segments = [segment for segment in _split_evidence_segments(text) if _looks_like_request_evidence(segment)]
    if request_segments:
        return " ".join(request_segments)
    return _strip_agent_option_lists(text)


def _split_evidence_segments(text: str) -> list[str]:
    compact = " ".join(text.split())
    return [segment.strip() for segment in re.split(r"(?<=[.!?])\s+|\n+", compact) if segment.strip()]


def _looks_like_request_evidence(segment: str) -> bool:
    normalized = normalize_text(segment)
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
    return _mentions_supported_need(segment, normalized)


def _mentions_supported_need(segment: str, normalized: str) -> bool:
    return bool(
        _grocery_items_from_text(segment)
        or any(contains_word(normalized, keyword) for keyword in GROCERY_CATEGORY_KEYWORDS)
        or any(contains_word(normalized, keyword) for keyword in MEDICATION_ALIASES)
        or any(contains_word(normalized, keyword) for keywords in SERVICE_KEYWORDS.values() for keyword in keywords)
    )


def _strip_agent_option_lists(text: str) -> str:
    return _remove_patterns(strip_urgency_question_lists(text), AGENT_OPTION_LIST_PATTERNS)


def _remove_patterns(text: str, patterns: tuple[str, ...]) -> str:
    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)
    return cleaned


def _grocery_items_from_text(text: str, quantity_source: str | None = None) -> tuple[str, ...]:
    normalized = normalize_text(text)
    quantity_text = quantity_source or text
    items: list[str] = []
    for item, aliases in GROCERY_ITEM_ALIASES.items():
        if not any(contains_word(normalized, alias) for alias in aliases):
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
        direct = re.search(rf"\b({quantity}[-\s]+{unit}\s+{alias_pattern})\b", text, flags=re.IGNORECASE)
        if direct:
            return _normalize_item_label(direct.group(1))
        after = re.search(rf"\b({alias_pattern}\s+{quantity}[-\s]+{unit})\b", text, flags=re.IGNORECASE)
        if after:
            return _normalize_item_label(after.group(1))
    return ""


def _normalize_item_label(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    return re.sub(r"^own(?=\s+package\b)", "one", normalized)


def _has_today_signal(text: str) -> bool:
    return any(contains_word(text, keyword) for keyword in ("today", "сегодня", "urgent", "urgently", "срочно"))


def _has_tomorrow_signal(text: str) -> bool:
    explicit_patterns = (
        r"\b(?:for|by|needed|requested|deliver(?:ed)?|delivery|to)\s+tomorrow\b",
        r"\btomorrow\s*(?:please|morning|afternoon|evening)?\b",
        r"\bзавтра\b",
    )
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in explicit_patterns)


def _has_this_week_signal(text: str) -> bool:
    return "this week" in text or "на этой неделе" in text
