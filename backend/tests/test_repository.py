import tempfile
import unittest
from datetime import date
from pathlib import Path

from app.api_models import dashboard_payload, print_orders_payload, recipient_detail_payload
from app.calle_execution import CallRunRecord, CallRunStatus
from app.domain import SafetyCategory
from app.repository import Repository, connect, init_schema, seed_database
from app.storage import load_seed_recipients


class RepositoryProductStateTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "carecall.sqlite3"
        self.conn = connect(self.db_path)
        init_schema(self.conn)
        seed_database(Repository(self.conn), load_seed_recipients())
        self.repo = Repository(self.conn)

    def tearDown(self):
        self.conn.close()
        self.tmpdir.cleanup()

    def test_d15_d16_seed_sqlite_creates_product_state_rows_for_dashboard(self):
        state = self.repo.get_dashboard_state("2026-08-01")

        self.assertGreaterEqual(len(state.recipients), 5)
        self.assertGreaterEqual(len(state.preflight_plans), 1)
        self.assertGreaterEqual(len(state.intake_results), 1)
        self.assertGreaterEqual(len(state.service_requests), 1)
        self.assertTrue(any(rec.safety_category == SafetyCategory.SPECIAL_HANDLING for rec in state.recipients))
        self.assertTrue(any(rec.blocked for rec in state.recipients))

    def test_d04_d07_recipient_detail_separates_safety_category_from_blocked_hard_stop(self):
        detail = self.repo.get_recipient_detail("rec-003")

        self.assertEqual(detail.card.safety_category, SafetyCategory.CRITICAL)
        self.assertTrue(detail.card.blocked)
        self.assertTrue(detail.card.blocked_reasons)
        self.assertEqual(detail.card.masked_phone, "+1******1003")
        self.assertEqual(recipient_detail_payload(detail)["contact_channels"]["phone_e164"], "+15550101003")

    def test_d05_d06_safety_update_requires_reason_audits_and_invalidates_approvals(self):
        stale_before = self.repo.count_stale_approvals_for_recipient("rec-002")
        self.assertEqual(stale_before, 0)

        with self.assertRaises(ValueError):
            self.repo.update_safety_category("rec-002", SafetyCategory.NON_CRITICAL, reason=" ")

        audit = self.repo.update_safety_category(
            "rec-002",
            SafetyCategory.NON_CRITICAL,
            reason="Coordinator reviewed caregiver route for tomorrow.",
        )
        detail = self.repo.get_recipient_detail("rec-002")

        self.assertEqual(audit.operator, "carecall-coordinator")
        self.assertEqual(audit.old_value, SafetyCategory.SPECIAL_HANDLING)
        self.assertEqual(audit.new_value, SafetyCategory.NON_CRITICAL)
        self.assertIn("Coordinator reviewed", audit.note)
        self.assertEqual(detail.card.safety_category, SafetyCategory.NON_CRITICAL)
        self.assertEqual(self.repo.count_stale_approvals_for_recipient("rec-002"), 1)

    def test_same_day_live_call_history_marks_repeat_warning_on_preview(self):
        self.repo.save_call_runs(
            plan_id="plan-repeat-test",
            approval_id="approval-repeat-test",
            records=[
                CallRunRecord(
                    recipient_id="rec-001",
                    idempotency_key="repeat-key-001",
                    status=CallRunStatus.RUNNING,
                    masked_phone="+1******1001",
                )
            ],
            mode="live",
        )

        payload = dashboard_payload(self.repo.get_dashboard_state(date.today().isoformat()))
        preview = next(item for item in payload["planned_calls"] if item["recipient_id"] == "rec-001")

        self.assertEqual(preview["same_day_call_count"], 1)
        self.assertTrue(preview["operator_repeat_available"])
        self.assertFalse(preview["operator_repeat_limit_reached"])
        self.assertIn("already received one live call today", preview["same_day_repeat_warning"])


class ApiModelProductStateTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        conn = connect(Path(self.tmpdir.name) / "carecall.sqlite3")
        init_schema(conn)
        seed_database(Repository(conn), load_seed_recipients())
        self.conn = conn
        self.repo = Repository(conn)

    def tearDown(self):
        self.conn.close()
        self.tmpdir.cleanup()

    def test_dash01_dashboard_payload_uses_backend_rows_masked_phones_and_service_requests(self):
        payload = dashboard_payload(self.repo.get_dashboard_state("2026-08-01"))

        self.assertIn("recipients", payload)
        self.assertIn("planned_calls", payload)
        self.assertIn("call_status", payload)
        self.assertIn("service_requests", payload)
        self.assertGreaterEqual(len(payload["recipients"]), 5)
        self.assertGreaterEqual(len(payload["service_requests"]), 1)
        self.assertTrue(all("condition" in item and "severity" in item for item in payload["recipients"]))
        self.assertTrue(all("need_categories" in item for item in payload["recipients"]))
        rec_001 = next(item for item in payload["recipients"] if item["id"] == "rec-001")
        self.assertIn("groceries", rec_001["need_categories"])
        self.assertIn("medication", rec_001["need_categories"])
        self.assertTrue(all("phone_e164" not in item for item in payload["recipients"]))
        self.assertNotIn("+15550101001", repr(payload))
        self.assertTrue(any(not item["ready"] for item in payload["planned_calls"]))
        rec_002_plan = next(item for item in payload["planned_calls"] if item["recipient_id"] == "rec-002")
        self.assertEqual(rec_002_plan["authorized_contacts"][0]["name"], "Marija Chen")

    def test_dash03_detail_payload_contains_care_outcome_needs_requests_audit(self):
        payload = recipient_detail_payload(self.repo.get_recipient_detail("rec-001"))

        self.assertEqual(payload["recipient"]["id"], "rec-001")
        self.assertIn("groceries", payload["recipient"]["need_categories"])
        self.assertIn("care_profile", payload)
        self.assertIn("call_outcome", payload)
        self.assertIn("extracted_needs", payload)
        self.assertIn("service_requests", payload)
        self.assertIn("risk_audit", payload)
        self.assertIn("contact_channels", payload)
        self.assertGreaterEqual(len(payload["extracted_needs"]), 1)
        self.assertGreaterEqual(len(payload["service_requests"]), 1)
        self.assertEqual(payload["contact_channels"]["phone_e164"], "+15550101001")

    def test_detail_payload_exposes_authorized_answerers_and_editable_phone_channel(self):
        payload = recipient_detail_payload(self.repo.get_recipient_detail("rec-002"))

        self.assertEqual(payload["recipient"]["id"], "rec-002")
        self.assertIn("authorized_contacts", payload["care_profile"])
        self.assertEqual(payload["care_profile"]["authorized_contacts"][0]["name"], "Marija Chen")
        self.assertEqual(payload["care_profile"]["authorized_contacts"][0]["relationship"], "spouse")
        self.assertTrue(payload["care_profile"]["authorized_contacts"][0]["can_answer_intake"])
        self.assertEqual(payload["contact_channels"]["phone_e164"], "+15550101002")

    def test_print_orders_payload_keeps_seed_request_statuses_by_default(self):
        payload = print_orders_payload(self.repo.get_dashboard_state("2026-08-01"))

        self.assertGreaterEqual(len(payload["service_requests"]), 1)
        self.assertTrue(all(item["status"] != "ready_to_print" for item in payload["service_requests"]))

    def test_print_orders_payload_can_prepare_seed_requests_for_demo_only(self):
        payload = print_orders_payload(self.repo.get_dashboard_state("2026-08-01"), include_demo_ready=True)

        self.assertGreaterEqual(len(payload["service_requests"]), 1)
        self.assertTrue(all(item["status"] == "ready_to_print" for item in payload["service_requests"]))


if __name__ == "__main__":
    unittest.main()
