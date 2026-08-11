"""Validation helpers for recipient safety gates."""

from __future__ import annotations

import re

from .domain import (
    CallSuitability,
    ConsentStatus,
    Recipient,
    ValidationIssue,
)

E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")


def is_e164(phone: str) -> bool:
    return bool(E164_RE.fullmatch(phone.strip()))


def validate_recipient(recipient: Recipient) -> tuple[ValidationIssue, ...]:
    issues: list[ValidationIssue] = []

    if not recipient.id.strip():
        issues.append(ValidationIssue("id", "Recipient ID is required."))

    if not recipient.display_name.strip():
        issues.append(ValidationIssue("display_name", "Display name is required."))

    if not is_e164(recipient.phone_e164):
        issues.append(
            ValidationIssue("phone_e164", "Phone number must be valid E.164.")
        )

    if recipient.consent.status not in {
        ConsentStatus.EXPLICIT_CONSENT,
        ConsentStatus.APPROVED_OUTREACH,
    }:
        issues.append(
            ValidationIssue(
                "consent.status",
                "Explicit consent or approved outreach basis is required.",
            )
        )

    if not recipient.consent.evidence.strip():
        issues.append(
            ValidationIssue("consent.evidence", "Consent evidence is required.")
        )

    profile = recipient.care_profile
    if not profile.language.strip():
        issues.append(ValidationIssue("care_profile.language", "Language is required."))

    if not profile.timezone.strip():
        issues.append(ValidationIssue("care_profile.timezone", "Timezone is required."))

    if profile.call_suitability == CallSuitability.DO_NOT_CALL:
        issues.append(
            ValidationIssue(
                "care_profile.call_suitability",
                "Recipient is marked do_not_call.",
            )
        )

    if profile.call_suitability in {
        CallSuitability.CAREGIVER_FIRST,
        CallSuitability.STAFF_ONLY,
    } and not recipient.caregiver_phone_e164:
        issues.append(
            ValidationIssue(
                "caregiver_phone_e164",
                "Caregiver/staff phone is required for non-direct call routes.",
            )
        )

    if recipient.caregiver_phone_e164 and not is_e164(recipient.caregiver_phone_e164):
        issues.append(
            ValidationIssue(
                "caregiver_phone_e164",
                "Caregiver/staff phone number must be valid E.164.",
            )
        )

    return tuple(issues)
