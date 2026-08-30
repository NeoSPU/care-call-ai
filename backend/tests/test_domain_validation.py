import unittest

from app.domain import (
    CallSuitability,
    CallbackRequestStatus,
    CareProfile,
    Condition,
    Consent,
    ConsentStatus,
    Recipient,
    RecipientCard,
    SafetyCategory,
    Severity,
    initial_callback_request_status,
)
from app.validation import is_e164, validate_recipient


def recipient(**overrides):
    data = {
        "id": "r-1",
        "display_name": "Test Recipient",
        "phone_e164": "+15550101234",
        "consent": Consent(
            status=ConsentStatus.EXPLICIT_CONSENT,
            evidence="Signed consent form 2026-08-01",
        ),
        "care_profile": CareProfile(
            condition=Condition.GENERAL,
            severity=Severity.MILD,
            language="en",
            timezone="Europe/London",
            call_suitability=CallSuitability.DIRECT_CALL_OK,
        ),
    }
    data.update(overrides)
    return Recipient(**data)


def recipient_card(**overrides):
    data = {
        "id": "rec-1",
        "display_name": "Test Recipient",
        "masked_phone": "+1******1234",
        "safety_category": SafetyCategory.NON_CRITICAL,
        "blocked": False,
        "blocked_reasons": (),
        "route": "recipient",
    }
    data.update(overrides)
    return RecipientCard(**data)


class DomainValidationTest(unittest.TestCase):
    def test_accepts_valid_e164(self):
        self.assertTrue(is_e164("+15550108750"))

    def test_rejects_invalid_e164(self):
        self.assertFalse(is_e164("020 7183 8750"))

    def test_valid_recipient_has_no_issues(self):
        self.assertEqual(validate_recipient(recipient()), ())

    def test_missing_consent_blocks_call(self):
        issues = validate_recipient(
            recipient(consent=Consent(status=ConsentStatus.MISSING, evidence=""))
        )
        self.assertTrue(any(issue.field == "consent.status" for issue in issues))
        self.assertTrue(any(issue.blocks_call for issue in issues))

    def test_do_not_call_blocks_call(self):
        issues = validate_recipient(
            recipient(
                care_profile=CareProfile(
                    condition=Condition.DEMENTIA,
                    severity=Severity.SEVERE,
                    language="en",
                    timezone="Europe/London",
                    call_suitability=CallSuitability.DO_NOT_CALL,
                )
            )
        )
        self.assertTrue(
            any(issue.field == "care_profile.call_suitability" for issue in issues)
        )

    def test_caregiver_route_requires_caregiver_phone(self):
        issues = validate_recipient(
            recipient(
                care_profile=CareProfile(
                    condition=Condition.ALZHEIMER,
                    severity=Severity.MODERATE,
                    language="en",
                    timezone="Europe/London",
                    call_suitability=CallSuitability.CAREGIVER_FIRST,
                ),
                caregiver_phone_e164=None,
            )
        )
        self.assertTrue(any(issue.field == "caregiver_phone_e164" for issue in issues))

    def test_initial_callback_request_status_keeps_risky_callbacks_in_operator_review(self):
        safe_card = recipient_card()
        critical_card = recipient_card(safety_category=SafetyCategory.CRITICAL)
        staff_route_card = recipient_card(route="staff")

        self.assertEqual(
            initial_callback_request_status("siri_shortcut", safe_card),
            CallbackRequestStatus.AUTO_CALLBACK_REQUESTED,
        )
        self.assertEqual(
            initial_callback_request_status("operator_created", safe_card),
            CallbackRequestStatus.OPERATOR_REVIEW,
        )
        self.assertEqual(
            initial_callback_request_status("siri_shortcut", critical_card),
            CallbackRequestStatus.OPERATOR_REVIEW,
        )
        self.assertEqual(
            initial_callback_request_status("siri_shortcut", staff_route_card),
            CallbackRequestStatus.OPERATOR_REVIEW,
        )


if __name__ == "__main__":
    unittest.main()
