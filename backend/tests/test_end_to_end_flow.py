import tempfile
import unittest
from pathlib import Path

from app.repository import Repository, connect, init_schema, seed_database
from app.server import (
    approve_preflight_api_payload,
    create_batch_api_payload,
    create_preflight_api_payload,
    execute_dry_run_api_payload,
    print_orders_api_payload,
    run_result_api_payload,
    run_status_api_payload,
    service_requests_api_payload,
    dashboard_api_payload,
)
from app.storage import load_seed_recipients


class EndToEndFakeResultFlowTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "carecall.sqlite3"
        conn = connect(self.db_path)
        init_schema(conn)
        seed_database(Repository(conn), load_seed_recipients())
        conn.close()

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_fake_completed_run_result_flows_to_dashboard_service_requests_and_print_orders(self):
        batch = create_batch_api_payload(
            self.db_path,
            {"selected_recipient_ids": ["rec-005"], "call_date": "2026-08-01"},
        )
        preflight = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        approval = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"],
                "operator": "carecall-coordinator",
                "note": "Approved exact dry-run list for fake result processing.",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )
        execution = execute_dry_run_api_payload(
            self.db_path,
            {"plan_id": preflight["plan_id"], "approval_id": approval["approval"]["id"]},
        )
        run_id = execution["records"][0]["id"]

        status_before = run_status_api_payload(self.db_path, run_id)
        self.assertEqual(status_before["run"]["status"], "planned")

        result = run_result_api_payload(
            self.db_path,
            run_id,
            {
                "status": "completed",
                "summary": "George needs transport tomorrow and groceries this week.",
                "needs": [
                    {
                        "category": "transport",
                        "items": ["ride to clinic"],
                        "urgency": "tomorrow",
                        "notes": "Pickup after 09:30.",
                    },
                    {
                        "category": "groceries",
                        "items": ["eggs", "tea"],
                        "urgency": "this_week",
                    },
                ],
            },
        )

        self.assertEqual(result["run"]["status"], "completed")
        self.assertEqual(result["intake_result"]["recipient_id"], "rec-005")
        self.assertEqual(len(result["service_requests"]), 2)
        requests = service_requests_api_payload(self.db_path)
        dashboard = dashboard_api_payload(self.db_path, "2026-08-01")
        print_orders = print_orders_api_payload(self.db_path)

        self.assertTrue(any(item["recipient_id"] == "rec-005" for item in requests["service_requests"]))
        self.assertTrue(any(item["recipient_id"] == "rec-005" for item in dashboard["service_requests"]))
        self.assertTrue(any(item["recipient_id"] == "rec-005" for item in print_orders["service_requests"]))
        self.assertNotIn("+15550101005", repr(dashboard))


if __name__ == "__main__":
    unittest.main()
