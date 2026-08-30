"""Practical-support intake skill configuration.

This module is the small runtime catalog for the CALL-E agent's practical-care
conversation. It keeps service examples, grocery aliases, and text-extraction
keywords together so prompt wording and fallback parsing evolve in one place.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..intake_models import NeedCategory


@dataclass(frozen=True)
class PracticalSupportSkill:
    name: str
    service_options: tuple[str, ...]
    repeat_update_options: tuple[str, ...]
    explicit_need_rules: tuple[str, ...]
    quantity_capture_rules: tuple[str, ...]
    prohibited_request_keywords: tuple[str, ...]
    grocery_item_aliases: dict[str, tuple[str, ...]]
    grocery_category_keywords: tuple[str, ...]
    medication_aliases: tuple[str, ...]
    service_keywords: dict[NeedCategory, tuple[str, ...]]

    def service_options_text(self) -> str:
        return _oxford_join(self.service_options)

    def repeat_update_options_text(self) -> str:
        return _oxford_join(self.repeat_update_options)

    def explicit_need_rules_text(self) -> str:
        return " ".join(self.explicit_need_rules)

    def quantity_capture_rules_text(self) -> str:
        return " ".join(self.quantity_capture_rules)


PRACTICAL_SUPPORT_SKILL = PracticalSupportSkill(
    name="practical_support_intake",
    service_options=(
        "groceries",
        "medication pickup",
        "cleaning",
        "transport",
        "companionship",
        "repairs",
        "documents help",
        "another practical service",
    ),
    repeat_update_options=(
        "new groceries",
        "medicines",
        "transport",
        "companionship",
        "cleaning",
        "repairs",
        "other practical support needs",
    ),
    explicit_need_rules=(
        "Order only explicit requests or confirmations from the recipient or authorized answerer.",
        "Never order menu examples, declined services, or services covered by 'no other needs'.",
    ),
    quantity_capture_rules=(
        "Keep spoken quantities, sizes, dates, and constraints in item names, e.g. '1-litre bottle of milk'.",
        "Ask one short quantity clarification for countable items when needed.",
    ),
    prohibited_request_keywords=(
        "alcohol",
        "beer",
        "wine",
        "spirits",
        "vodka",
        "tobacco",
        "cigarettes",
        "vape",
        "weapon",
        "gun",
        "knife",
        "ammunition",
        "explosive",
        "illegal drugs",
        "controlled substance",
        "cannabis",
        "marijuana",
        "sexual service",
        "sex work",
        "escort service",
        "porn",
        "pornography",
        "adult content",
        "explicit sexual material",
        "fraud",
        "stolen",
        "fake id",
        "password",
        "bank card",
        "payment card",
        "government id",
        "biohazard",
        "hazardous waste",
        "body fluid",
        "алкоголь",
        "пиво",
        "вино",
        "водка",
        "каннабис",
        "марихуана",
        "табак",
        "сигареты",
        "оружие",
        "боеприпасы",
        "наркотики",
        "порно",
        "сексуальные услуги",
        "мошенничество",
        "краденое",
        "поддельный документ",
        "пароль",
        "банковская карта",
        "биологические отходы",
    ),
    grocery_item_aliases={
        "bread": ("bread", "loaf", "батон", "хлеб"),
        "broth": ("broth", "stock", "бульон"),
        "soup": ("soup", "суп"),
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
    },
    grocery_category_keywords=("groceries", "grocery", "food", "products", "продукты", "еда"),
    medication_aliases=(
        "medication",
        "medicine",
        "prescription",
        "pharmacy",
        "лекарство",
        "лекарства",
        "рецепт",
        "аптека",
    ),
    service_keywords={
        NeedCategory.CLEANING: ("cleaning", "clean", "уборка", "убрать"),
        NeedCategory.TRANSPORT: ("transport", "taxi", "ride", "такси", "транспорт"),
        NeedCategory.COMPANIONSHIP: ("companionship", "visit", "call back", "поговорить", "визит"),
        NeedCategory.REPAIR: ("repair", "tap", "plumber", "fix", "ремонт", "кран", "сантехник"),
        NeedCategory.DOCUMENTS: ("documents", "paperwork", "forms", "документы"),
    },
)


def _oxford_join(items: tuple[str, ...]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + f", or {items[-1]}"
