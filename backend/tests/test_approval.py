import unittest

from app.approval import OperatorApproval, validate_operator_approval
from app.call_planning import build_call_plan_previews
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


class ApprovalTest(unittest.TestCase):
    def test_requires_approval(self):
        previews = build_call_plan_previews([recipient()], "2026-08-01")
        decision = validate_operator_approval(previews, None)
        self.assertFalse(decision.approved)

    def test_accepts_exact_ready_key_set(self):
        previews = build_call_plan_previews([recipient()], "2026-08-01")
        approval = OperatorApproval(
            approved_keys=(previews[0].idempotency_key,),
            approver="Coordinator",
            approved_at="2026-08-01T10:00:00Z",
        )
        decision = validate_operator_approval(previews, approval)
        self.assertTrue(decision.approved)

    def test_rejects_changed_preview(self):
        old_previews = build_call_plan_previews([recipient()], "2026-08-01")
        new_previews = build_call_plan_previews([recipient()], "2026-08-02")
        approval = OperatorApproval(
            approved_keys=(old_previews[0].idempotency_key,),
            approver="Coordinator",
            approved_at="2026-08-01T10:00:00Z",
        )
        decision = validate_operator_approval(new_previews, approval)
        self.assertFalse(decision.approved)
        self.assertTrue(any("missing" in reason for reason in decision.reasons))
        self.assertTrue(any("not in the current preview" in reason for reason in decision.reasons))

    def test_rejects_blocked_plan_key(self):
        previews = build_call_plan_previews(
            [
                recipient(
                    care_profile=CareProfile(
                        condition=Condition.DEMENTIA,
                        severity=Severity.SEVERE,
                        language="en",
                        timezone="Europe/London",
                        call_suitability=CallSuitability.DO_NOT_CALL,
                    )
                )
            ],
            "2026-08-01",
        )
        approval = OperatorApproval(
            approved_keys=(previews[0].idempotency_key,),
            approver="Coordinator",
            approved_at="2026-08-01T10:00:00Z",
        )
        decision = validate_operator_approval(previews, approval)
        self.assertFalse(decision.approved)
        self.assertTrue(any("blocked" in reason for reason in decision.reasons))


if __name__ == "__main__":
    unittest.main()
