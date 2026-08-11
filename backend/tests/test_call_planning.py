import unittest

from app.call_planning import build_call_plan_preview, build_call_plan_previews
from app.domain import (
    CallSuitability,
    CareProfile,
    Condition,
    Consent,
    ConsentStatus,
    Recipient,
    Severity,
)


def recipient(**overrides):
    data = {
        "id": "r-1",
        "display_name": "Test Recipient",
        "phone_e164": "+15550101234",
        "caregiver_phone_e164": "+15550109999",
        "consent": Consent(
            status=ConsentStatus.EXPLICIT_CONSENT,
            evidence="Signed consent form",
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


class CallPlanningTest(unittest.TestCase):
    def test_ready_preview_contains_masked_phone_and_prompt(self):
        preview = build_call_plan_preview(recipient(), "2026-08-01")
        self.assertTrue(preview.ready)
        self.assertEqual(preview.masked_phone, "+1******1234")
        self.assertIn("Purpose:", preview.prompt_preview)
        self.assertIn("carecall-2026-08-01-r-1-", preview.idempotency_key)

    def test_idempotency_key_is_stable_for_same_inputs(self):
        first = build_call_plan_preview(recipient(), "2026-08-01")
        second = build_call_plan_preview(recipient(), "2026-08-01")
        self.assertEqual(first.idempotency_key, second.idempotency_key)

    def test_idempotency_key_changes_when_call_date_changes(self):
        first = build_call_plan_preview(recipient(), "2026-08-01")
        second = build_call_plan_preview(recipient(), "2026-08-02")
        self.assertNotEqual(first.idempotency_key, second.idempotency_key)

    def test_blocked_preview_preserves_reasons(self):
        preview = build_call_plan_preview(
            recipient(consent=Consent(status=ConsentStatus.MISSING, evidence="")),
            "2026-08-01",
        )
        self.assertFalse(preview.ready)
        self.assertTrue(preview.blocked_reasons)

    def test_bulk_preview_keeps_ready_and_blocked_rows(self):
        previews = build_call_plan_previews(
            [
                recipient(id="r-1"),
                recipient(
                    id="r-2",
                    care_profile=CareProfile(
                        condition=Condition.DEMENTIA,
                        severity=Severity.SEVERE,
                        language="en",
                        timezone="Europe/London",
                        call_suitability=CallSuitability.DO_NOT_CALL,
                    ),
                ),
            ],
            "2026-08-01",
        )
        self.assertEqual(len(previews), 2)
        self.assertTrue(previews[0].ready)
        self.assertFalse(previews[1].ready)


if __name__ == "__main__":
    unittest.main()
