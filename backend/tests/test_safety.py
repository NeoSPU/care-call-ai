import unittest

from app.domain import (
    CallSuitability,
    CareProfile,
    Condition,
    Consent,
    ConsentStatus,
    Recipient,
    Severity,
)
from app.safety import build_preflight_row, mask_phone


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


class SafetyTest(unittest.TestCase):
    def test_masks_phone(self):
        self.assertEqual(mask_phone("+15550101234"), "+1******1234")

    def test_ready_direct_recipient(self):
        row = build_preflight_row(recipient())
        self.assertTrue(row.ready)
        self.assertEqual(row.route, "recipient")
        self.assertEqual(row.masked_phone, "+1******1234")

    def test_blocks_missing_consent(self):
        row = build_preflight_row(
            recipient(consent=Consent(status=ConsentStatus.MISSING, evidence=""))
        )
        self.assertFalse(row.ready)
        self.assertEqual(row.route, "blocked")

    def test_routes_caregiver_first(self):
        row = build_preflight_row(
            recipient(
                caregiver_phone_e164="+15550109999",
                care_profile=CareProfile(
                    condition=Condition.ALZHEIMER,
                    severity=Severity.MODERATE,
                    language="en",
                    timezone="Europe/London",
                    call_suitability=CallSuitability.CAREGIVER_FIRST,
                    communication_rules=("one_question_at_a_time",),
                ),
            )
        )
        self.assertTrue(row.ready)
        self.assertEqual(row.route, "caregiver")


if __name__ == "__main__":
    unittest.main()
