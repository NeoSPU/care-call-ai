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

    def test_emergency_payload_routes_to_review(self):
        record = CallRunRecord("r-1", "key-1", CallRunStatus.COMPLETED)
        bundle = process_call_result(record, {"emergency_flag": True, "needs": []})
        self.assertTrue(bundle.intake_result.human_review)
        self.assertEqual(bundle.service_requests[0].status, "review")

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
