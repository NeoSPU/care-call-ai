"""Simple seed-data loading for Phase 1."""

from __future__ import annotations

import json
from pathlib import Path

from .domain import (
    AuthorizedContact,
    CallSuitability,
    CareProfile,
    Condition,
    Consent,
    ConsentStatus,
    Recipient,
    Severity,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SEED_PATH = PROJECT_ROOT / "data" / "seed_recipients.json"


def load_seed_recipients(path: Path = DEFAULT_SEED_PATH) -> list[Recipient]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [recipient_from_dict(item) for item in raw]


def recipient_from_dict(data: dict) -> Recipient:
    profile = data["care_profile"]
    consent = data["consent"]
    return Recipient(
        id=data["id"],
        display_name=data["display_name"],
        phone_e164=data["phone_e164"],
        caregiver_phone_e164=data.get("caregiver_phone_e164"),
        notes=data.get("notes", ""),
        authorized_contacts=tuple(
            AuthorizedContact(
                name=str(contact.get("name", "")),
                relationship=str(contact.get("relationship", "")),
                can_answer_intake=bool(contact.get("can_answer_intake", True)),
                preferred_goodbye=str(contact.get("preferred_goodbye", "")),
            )
            for contact in data.get("authorized_contacts", [])
            if str(contact.get("name", "")).strip()
        ),
        consent=Consent(
            status=ConsentStatus(consent["status"]),
            evidence=consent.get("evidence", ""),
        ),
        care_profile=CareProfile(
            condition=Condition(profile["condition"]),
            severity=Severity(profile["severity"]),
            language=profile["language"],
            timezone=profile["timezone"],
            call_suitability=CallSuitability(profile["call_suitability"]),
            communication_rules=tuple(profile.get("communication_rules", [])),
        ),
    )
