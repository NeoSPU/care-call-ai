import unittest

from app.call_goals import compile_call_goal
from app.domain import (
    AuthorizedContact,
    CallSuitability,
    CareProfile,
    Condition,
    Consent,
    ConsentStatus,
    Recipient,
    Severity,
)


def recipient(
    condition=Condition.GENERAL,
    severity=Severity.MILD,
    suitability=CallSuitability.DIRECT_CALL_OK,
    authorized_contacts=(),
):
    return Recipient(
        id="r-1",
        display_name="Test Recipient",
        phone_e164="+15550101234",
        caregiver_phone_e164="+15550109999",
        consent=Consent(
            status=ConsentStatus.EXPLICIT_CONSENT,
            evidence="Signed consent form",
        ),
        care_profile=CareProfile(
            condition=condition,
            severity=severity,
            language="en",
            timezone="Europe/London",
            call_suitability=suitability,
        ),
        authorized_contacts=authorized_contacts,
    )


class CallGoalTest(unittest.TestCase):
    def test_general_goal_contains_safety_boundaries(self):
        goal = compile_call_goal(recipient())
        self.assertEqual(goal.route, "recipient")
        self.assertTrue(any("medical diagnosis" in item for item in goal.prohibited_topics))

    def test_mild_dementia_uses_soft_check_in(self):
        goal = compile_call_goal(recipient(condition=Condition.ALZHEIMER, severity=Severity.MILD))
        self.assertIn("Gentle check-in", goal.purpose)
        self.assertTrue(any("How are you feeling" in question for question in goal.allowed_questions))

    def test_moderate_dementia_uses_short_structured_intake(self):
        goal = compile_call_goal(recipient(condition=Condition.DEMENTIA, severity=Severity.MODERATE))
        self.assertIn("Short structured", goal.purpose)
        self.assertTrue(any("one short question" in style for style in goal.communication_style))

    def test_severe_dementia_blocks_direct_goal(self):
        goal = compile_call_goal(recipient(condition=Condition.DEMENTIA, severity=Severity.SEVERE))
        self.assertEqual(goal.route, "blocked")

    def test_caregiver_first_asks_about_future_call_suitability(self):
        goal = compile_call_goal(recipient(suitability=CallSuitability.CAREGIVER_FIRST))
        self.assertEqual(goal.route, "caregiver")
        self.assertTrue(any("direct future" in question for question in goal.allowed_questions))

    def test_goal_verifies_authorized_speaker_and_uses_personal_goodbye(self):
        goal = compile_call_goal(
            recipient(
                condition=Condition.ALZHEIMER,
                severity=Severity.MILD,
                authorized_contacts=(
                    AuthorizedContact(
                        name="Marija Chen",
                        relationship="spouse",
                        preferred_goodbye="All the best, Ms Marija.",
                    ),
                ),
            )
        )

        style = " ".join(goal.communication_style)
        self.assertIn("Ask who is speaking", style)
        self.assertIn("Test Recipient; authorized contacts: Marija Chen (spouse)", style)
        self.assertIn("If someone else answers", style)
        self.assertIn("All the best, Ms Marija", style)


if __name__ == "__main__":
    unittest.main()
