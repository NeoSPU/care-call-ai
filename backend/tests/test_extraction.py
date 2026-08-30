import unittest

from app.extraction import (
    IntakeStatus,
    NeedCategory,
    ReviewReasonCode,
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

    def test_completed_summary_without_structured_needs_extracts_clear_groceries(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": "Alex asked for milk and bread for tomorrow.",
            },
        )

        self.assertEqual(result.status, IntakeStatus.COMPLETED)
        self.assertFalse(result.human_review)
        self.assertEqual(result.needs[0].category, NeedCategory.GROCERIES)
        self.assertEqual(result.needs[0].items, ("bread", "milk"))
        self.assertEqual(result.needs[0].urgency, Urgency.TOMORROW)

    def test_callback_summary_extracts_broth_quantity_as_groceries(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": (
                    "The call was completed. The recipient authorized the conversation and confirmed "
                    "an added practical support request: 1 package of broth needed for tomorrow, "
                    "with no other additions."
                ),
            },
        )

        self.assertFalse(result.human_review)
        self.assertEqual(result.needs[0].category, NeedCategory.GROCERIES)
        self.assertEqual(result.needs[0].items, ("1 package of broth",))
        self.assertEqual(result.needs[0].urgency, Urgency.TOMORROW)

    def test_urgency_prefers_answer_over_agent_question_options(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": (
                    "A grocery need was captured: a 1-litre bottle of milk. "
                    "Is that milk needed today, tomorrow, this week, or is it not urgent? "
                    "Thank you. To tomorrow. Tomorrow, please."
                ),
            },
        )

        self.assertEqual(result.needs[0].category, NeedCategory.GROCERIES)
        self.assertEqual(result.needs[0].items, ("1-litre bottle of milk",))
        self.assertEqual(result.needs[0].urgency, Urgency.TOMORROW)

    def test_fallback_ignores_agent_service_options_and_keeps_quantities(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": (
                    "Do you need groceries, medication pickup, cleaning, transport, "
                    "companionship, repairs, documents help, or another practical service? "
                    "A grocery need was captured: a 1-litre bottle of milk and two packs of rice. "
                    "No transport, cleaning, or companionship request was confirmed. "
                    "The milk and rice are requested for tomorrow."
                ),
            },
        )

        self.assertEqual(len(result.needs), 1)
        self.assertEqual(result.needs[0].category, NeedCategory.GROCERIES)
        self.assertEqual(result.needs[0].items, ("1-litre bottle of milk", "two packs of rice"))
        self.assertEqual(result.needs[0].urgency, Urgency.TOMORROW)

    def test_fallback_keeps_quantities_from_real_call_summary(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": (
                    "The call completed successfully. The caller collected a practical-support "
                    "request for groceries needed tomorrow: 1 litre of milk, porridge oats, "
                    "bread, eggs, and 5 litres of drinking water. "
                    "One package of porridge oats. One package of bread and one package of eggs."
                ),
            },
        )

        self.assertEqual(len(result.needs), 1)
        self.assertEqual(result.needs[0].category, NeedCategory.GROCERIES)
        self.assertEqual(
            result.needs[0].items,
            (
                "one package of bread",
                "1 litre of milk",
                "one package of eggs",
                "one package of porridge oats",
                "5 litres of drinking water",
            ),
        )
        self.assertEqual(result.needs[0].urgency, Urgency.TOMORROW)

    def test_fallback_normalizes_own_package_as_one_package(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": "The recipient requested groceries: own package of porridge oats for tomorrow.",
            },
        )

        self.assertEqual(result.needs[0].items, ("one package of porridge oats",))

    def test_summary_with_no_additional_needs_overrides_structured_example_categories(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": (
                    "Call completed. CareCall captured the practical support request and urgency: "
                    "a grocery need for a 1-litre bottle of milk, requested for tomorrow, "
                    "with no additional practical needs reported. "
                    "What other practical support do you need, if any? No need."
                ),
                "needs": [
                    {"category": "groceries", "items": ["milk"], "urgency": "today"},
                    {"category": "transport", "items": ["transport"], "urgency": "today"},
                    {"category": "companionship", "items": ["companionship"], "urgency": "today"},
                    {"category": "cleaning", "items": ["cleaning"], "urgency": "today"},
                ],
            },
        )

        self.assertEqual(len(result.needs), 1)
        self.assertEqual(result.needs[0].category, NeedCategory.GROCERIES)
        self.assertEqual(result.needs[0].items, ("1-litre bottle of milk",))
        self.assertEqual(result.needs[0].urgency, Urgency.TOMORROW)

    def test_summary_request_overrides_broader_structured_menu_examples(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": (
                    "The caller requested groceries for tomorrow: "
                    "one 1-litre bottle of milk."
                ),
                "needs": [
                    {"category": "groceries", "items": ["milk"], "urgency": "tomorrow"},
                    {"category": "transport", "items": ["transport"], "urgency": "tomorrow"},
                    {"category": "companionship", "items": ["companionship"], "urgency": "tomorrow"},
                    {"category": "cleaning", "items": ["cleaning"], "urgency": "tomorrow"},
                    {"category": "documents", "items": ["documents help"], "urgency": "tomorrow"},
                ],
            },
        )

        self.assertFalse(result.human_review)
        self.assertEqual(len(result.needs), 1)
        self.assertEqual(result.needs[0].category, NeedCategory.GROCERIES)
        self.assertEqual(result.needs[0].items, ("1-litre bottle of milk",))
        self.assertEqual(result.needs[0].urgency, Urgency.TOMORROW)

    def test_prohibited_goods_request_excludes_blocked_items_without_printable_needs(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": "The recipient asked for 10 cans of beer for tomorrow.",
                "needs": [
                    {"category": "groceries", "items": ["beer"], "urgency": "tomorrow"},
                    {"category": "transport", "items": ["transport"], "urgency": "tomorrow"},
                ],
            },
        )

        self.assertTrue(result.human_review)
        self.assertEqual(result.needs, ())
        self.assertIn("prohibited", " ".join(result.review_reasons))
        self.assertEqual(result.review_reason_codes, (ReviewReasonCode.PROHIBITED_REQUEST_EXCLUDED,))

    def test_mixed_allowed_and_prohibited_request_keeps_allowed_items(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": "The recipient asked for bread and 10 cans of beer for tomorrow.",
                "needs": [
                    {"category": "groceries", "items": ["1 package of bread"], "urgency": "tomorrow"},
                    {"category": "groceries", "items": ["10 cans of beer"], "urgency": "tomorrow"},
                ],
            },
        )

        self.assertTrue(result.human_review)
        self.assertEqual(len(result.needs), 1)
        self.assertEqual(result.needs[0].category, NeedCategory.GROCERIES)
        self.assertEqual(result.needs[0].items, ("1 package of bread",))
        self.assertIn("prohibited", " ".join(result.review_reasons))
        self.assertEqual(result.review_reason_codes, (ReviewReasonCode.PROHIBITED_REQUEST_EXCLUDED,))

    def test_structured_prohibited_goods_without_summary_creates_no_needs(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "needs": [
                    {
                        "category": "groceries",
                        "items": ["10 cans of beer"],
                        "urgency": "tomorrow",
                        "notes": "",
                    }
                ],
            },
        )

        self.assertTrue(result.human_review)
        self.assertEqual(result.needs, ())
        self.assertIn("excluded from fulfilment", result.review_reasons[0])
        self.assertEqual(result.review_reason_codes, (ReviewReasonCode.PROHIBITED_REQUEST_EXCLUDED,))

    def test_completed_summary_without_extractable_needs_routes_to_human_review(self):
        result = extract_intake_result(
            "r-1",
            {
                "status": "completed",
                "summary": "The recipient had a friendly conversation but did not request specific help.",
            },
        )

        self.assertTrue(result.human_review)
        self.assertEqual(result.needs, ())
        self.assertIn("without structured practical needs", result.review_reasons[0])
        self.assertEqual(result.review_reason_codes, (ReviewReasonCode.COMPLETED_WITHOUT_STRUCTURED_NEEDS,))


if __name__ == "__main__":
    unittest.main()
