import unittest

from app.call_result_normalization import normalized_provider_result, provider_status


class CallResultNormalizationTest(unittest.TestCase):
    def test_provider_status_prefers_status_then_state(self):
        self.assertEqual(provider_status({"status": " Completed "}), "completed")
        self.assertEqual(provider_status({"state": "failed"}), "failed")

    def test_normalizes_nested_structured_result_and_preserves_top_level_summary(self):
        result = normalized_provider_result(
            {
                "status": "completed",
                "summary": "Alex asked for one loaf of bread.",
                "recipient_results": [
                    {
                        "structured_result": {
                            "needs": [
                                {
                                    "category": "groceries",
                                    "items": ["1 loaf of bread"],
                                    "urgency": "tomorrow",
                                }
                            ]
                        }
                    }
                ],
            },
            "completed",
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["summary"], "Alex asked for one loaf of bread.")
        self.assertEqual(result["needs"][0]["items"], ["1 loaf of bread"])

    def test_failed_provider_result_routes_to_malformed_human_review_payload(self):
        result = normalized_provider_result({"status": "failed"}, "failed")

        self.assertEqual(result["status"], "malformed")
        self.assertTrue(result["human_review"])
        self.assertEqual(result["needs"], [])

    def test_no_contact_provider_result_routes_to_no_contact_payload(self):
        result = normalized_provider_result({"status": "no_answer"}, "no_answer")

        self.assertEqual(result["status"], "no_contact")
        self.assertTrue(result["human_review"])
        self.assertEqual(result["needs"], [])


if __name__ == "__main__":
    unittest.main()
