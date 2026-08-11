import unittest

from app.extraction import (
    IntakeStatus,
    NeedCategory,
    ReviewState,
    Urgency,
    extract_intake_result,
)


class ExtractionTest(unittest.TestCase):
    def test_extracts_valid_need(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": "Needs groceries today.",
                "needs": [
                    {
                        "category": "groceries",
                        "items": ["milk", "bread"],
                        "urgency": "today",
                        "notes": "Prefers delivery after lunch.",
                    }
                ],
            },
        )
        self.assertEqual(result.status, IntakeStatus.COMPLETED)
        self.assertFalse(result.human_review)
        self.assertEqual(result.needs[0].category, NeedCategory.GROCERIES)
        self.assertEqual(result.needs[0].urgency, Urgency.TODAY)

    def test_unknown_category_goes_to_review(self):
        result = extract_intake_result(
            "r-1",
            {"needs": [{"category": "mystery", "items": ["x"], "urgency": "today"}]},
        )
        self.assertTrue(result.human_review)
        self.assertEqual(result.needs[0].category, NeedCategory.OTHER)
        self.assertEqual(result.needs[0].review_state, ReviewState.HUMAN_REVIEW)

    def test_emergency_flag_requires_review(self):
        result = extract_intake_result("r-1", {"emergency_flag": True, "needs": []})
        self.assertEqual(result.status, IntakeStatus.EMERGENCY)
        self.assertTrue(result.human_review)

    def test_no_contact_requires_review(self):
        result = extract_intake_result("r-1", {"status": "no_contact", "needs": []})
        self.assertEqual(result.status, IntakeStatus.NO_CONTACT)
        self.assertTrue(result.human_review)

    def test_malformed_payload_requires_review(self):
        result = extract_intake_result("r-1", {"needs": "not-a-list"})
        self.assertEqual(result.status, IntakeStatus.MALFORMED)
        self.assertTrue(result.human_review)


if __name__ == "__main__":
    unittest.main()
