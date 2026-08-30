import tempfile
import unittest
from pathlib import Path

from app.calle_execution import CallRunRecord, CallRunStatus
from app.extraction import IntakeStatus
from app.routing import NeedCategory
from app.run_results import load_run_bundle, process_call_result, save_run_bundle


class RunResultsTest(unittest.TestCase):
    def test_completed_payload_produces_service_request(self):
        record = CallRunRecord(
            recipient_id="r-1",
            idempotency_key="key-1",
            status=CallRunStatus.COMPLETED,
            run_id="run-1",
            masked_phone="+1******1234",
        )
        bundle = process_call_result(
            record,
            {
                "status": "completed",
                "needs": [
                    {
                        "category": "groceries",
                        "items": ["milk"],
                        "urgency": "today",
                    }
                ],
            },
        )
        self.assertEqual(bundle.intake_result.status, IntakeStatus.COMPLETED)
        self.assertEqual(bundle.service_requests[0].category, NeedCategory.GROCERIES)

    def test_completed_summary_only_payload_can_produce_printable_request(self):
        record = CallRunRecord(
            recipient_id="r-1",
            idempotency_key="key-1",
            status=CallRunStatus.COMPLETED,
            run_id="run-1",
            masked_phone="+1******1234",
        )
        bundle = process_call_result(
            record,
            {
                "status": "completed",
                "summary": "Alex asked for milk and bread for tomorrow.",
            },
        )

        self.assertEqual(bundle.service_requests[0].category, NeedCategory.GROCERIES)
        self.assertEqual(bundle.service_requests[0].items, ("bread", "milk"))
        self.assertEqual(bundle.service_requests[0].priority, "urgent")
        self.assertEqual(bundle.service_requests[0].status, "ready_to_print")

    def test_callback_broth_summary_produces_printable_grocery_request(self):
        record = CallRunRecord(
            recipient_id="r-1",
            idempotency_key="key-1",
            status=CallRunStatus.COMPLETED,
            run_id="run-1",
            masked_phone="+1******1234",
        )
        bundle = process_call_result(
            record,
            {
                "status": "completed",
                "summary": (
                    "The recipient authorized the conversation and confirmed an added practical support "
                    "request: 1 package of broth needed for tomorrow, with no other additions."
                ),
            },
        )

        self.assertFalse(bundle.intake_result.human_review)
        self.assertEqual(bundle.service_requests[0].category, NeedCategory.GROCERIES)
        self.assertEqual(bundle.service_requests[0].items, ("1 package of broth",))
        self.assertEqual(bundle.service_requests[0].status, "ready_to_print")

    def test_emergency_payload_routes_to_review(self):
        record = CallRunRecord("r-1", "key-1", CallRunStatus.COMPLETED)
        bundle = process_call_result(record, {"emergency_flag": True, "needs": []})
        self.assertTrue(bundle.intake_result.human_review)
        self.assertEqual(bundle.service_requests[0].status, "review")

    def test_structured_prohibited_item_does_not_create_fulfilment_order(self):
        record = CallRunRecord("r-1", "key-1", CallRunStatus.COMPLETED)
        bundle = process_call_result(
            record,
            {
                "status": "completed",
                "needs": [
                    {
                        "category": "groceries",
                        "items": ["10 cans of beer"],
                        "urgency": "tomorrow",
                    }
                ],
            },
        )

        self.assertTrue(bundle.intake_result.human_review)
        self.assertEqual(bundle.service_requests, ())

    def test_mixed_allowed_and_prohibited_items_prints_only_allowed_items(self):
        record = CallRunRecord("r-1", "key-1", CallRunStatus.COMPLETED)
        bundle = process_call_result(
            record,
            {
                "status": "completed",
                "summary": "The recipient asked for 1 package of bread and 10 cans of beer for tomorrow.",
                "needs": [
                    {
                        "category": "groceries",
                        "items": ["1 package of bread"],
                        "urgency": "tomorrow",
                    },
                    {
                        "category": "groceries",
                        "items": ["10 cans of beer"],
                        "urgency": "tomorrow",
                    },
                ],
            },
        )

        self.assertTrue(bundle.intake_result.human_review)
        self.assertEqual(len(bundle.service_requests), 1)
        self.assertEqual(bundle.service_requests[0].category, NeedCategory.GROCERIES)
        self.assertEqual(bundle.service_requests[0].items, ("1 package of bread",))
        self.assertEqual(bundle.service_requests[0].status, "ready_to_print")

    def test_summary_with_rejected_prohibited_items_keeps_allowed_milk_request(self):
        record = CallRunRecord("r-1", "key-1", CallRunStatus.COMPLETED)
        bundle = process_call_result(
            record,
            {
                "status": "completed",
                "summary": (
                    "The recipient asked for 10 cans of beer, which the agent refused. "
                    "The recipient then asked for a bottle of milk for tomorrow."
                ),
            },
        )

        self.assertTrue(bundle.intake_result.human_review)
        self.assertEqual(len(bundle.service_requests), 1)
        self.assertEqual(bundle.service_requests[0].category, NeedCategory.GROCERIES)
        self.assertEqual(bundle.service_requests[0].items, ("a bottle of milk",))
        self.assertEqual(bundle.service_requests[0].status, "ready_to_print")

    def test_menu_like_agent_options_do_not_become_service_orders(self):
        record = CallRunRecord("r-1", "key-1", CallRunStatus.COMPLETED)
        bundle = process_call_result(
            record,
            {
                "status": "completed",
                "summary": (
                    "The only potentially valid practical-support request captured was 1 bottle of milk for tomorrow. "
                    "The agent asked whether the recipient wanted practical support, such as groceries, medicines, "
                    "transport, companionship, cleaning, repairs, or documents."
                ),
            },
        )

        self.assertEqual(len(bundle.service_requests), 1)
        self.assertEqual(bundle.service_requests[0].category, NeedCategory.GROCERIES)
        self.assertEqual(bundle.service_requests[0].items, ("1 bottle of milk",))

    def test_failed_record_routes_to_review(self):
        record = CallRunRecord("r-1", "key-1", CallRunStatus.FAILED, error="provider down")
        bundle = process_call_result(record, {"status": "completed", "needs": []})
        self.assertTrue(bundle.intake_result.human_review)
        self.assertEqual(bundle.service_requests[0].status, "review")

    def test_save_bundle_persists_masked_record_only(self):
        record = CallRunRecord(
            recipient_id="r-1",
            idempotency_key="key-1",
            status=CallRunStatus.COMPLETED,
            run_id="run-1",
            masked_phone="+1******1234",
        )
        bundle = process_call_result(record, {"status": "completed", "needs": []})
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bundle.json"
            save_run_bundle(bundle, path)
            saved = load_run_bundle(path)
        self.assertEqual(saved["call_record"]["masked_phone"], "+1******1234")
        self.assertNotIn("+15550101234", str(saved))


if __name__ == "__main__":
    unittest.main()
