import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

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

    def test_repeat_limit_can_be_raised_for_controlled_test_calls(self):
        for index in range(2):
            self.repo.save_call_runs(
                plan_id=f"plan-repeat-test-{index}",
                approval_id=f"approval-repeat-test-{index}",
                records=[
                    CallRunRecord(
                        recipient_id="rec-001",
                        idempotency_key=f"repeat-key-001-{index}",
                        status=CallRunStatus.COMPLETED,
                        masked_phone="+1******1001",
                    )
                ],
                mode="live",
            )

        with patch.dict("os.environ", {"CARECALL_RECIPIENT_OPERATOR_CALL_LIMIT_OVERRIDES": "rec-001=3"}):
            payload = dashboard_payload(self.repo.get_dashboard_state(date.today().isoformat()))

        preview = next(item for item in payload["planned_calls"] if item["recipient_id"] == "rec-001")
        self.assertEqual(preview["same_day_call_count"], 2)
        self.assertFalse(preview["operator_repeat_limit_reached"])

    def test_operator_can_correct_and_void_review_service_requests(self):
        review_request = next(request for request in self.repo.list_service_requests() if request.status != "ready_to_print")

        corrected = self.repo.update_service_request(
            review_request.id,
            category="groceries",
            items=("1 package of bread",),
            notes="Corrected from callback transcript.",
            priority="urgent",
            status="ready_to_print",
            operator="Max Neous",
            reason="Caller requested bread for tomorrow.",
        )

        self.assertEqual(corrected.category, "groceries")
        self.assertEqual(corrected.items, ("1 package of bread",))
        self.assertEqual(corrected.status, "ready_to_print")
        self.assertEqual(corrected.human_review_reason, "")
        self.assertEqual(corrected.update_count, review_request.update_count + 1)
        self.assertEqual(corrected.update_history[-1]["event"], "operator_updated")

        voided = self.repo.void_service_request(corrected.id, operator="Max Neous", reason="Duplicate test result.")

        self.assertEqual(voided.status, "void")
        self.assertEqual(voided.update_history[-1]["event"], "operator_removed")

    def test_fresh_allowed_import_releases_existing_review_row_without_old_transcript(self):
        self.repo.conn.execute(
            """
            INSERT INTO service_requests (
                id, recipient_id, category, queue, sla_hours, priority, status,
                items, notes, human_review_reason, created_at, updated_at, update_count, update_history
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?)
            """,
            (
                "svc-run-old-review-1",
                "rec-001",
                "groceries",
                "coordinator_review",
                8,
                "review",
                "review",
                "[]",
                "Old callback transcript about 1 package of broth.",
                "Need category or urgency requires coordinator review.",
                "[]",
            ),
        )
        self.repo.conn.commit()
        run = self.repo.save_call_runs(
            plan_id="plan-fresh-milk",
            approval_id="approval-fresh-milk",
            records=[
                CallRunRecord(
                    recipient_id="rec-001",
                    idempotency_key="fresh-milk-key",
                    status=CallRunStatus.RUNNING,
                    plan_id="provider-plan-fresh-milk",
                    run_id="provider-run-fresh-milk",
                    masked_phone="+1******1001",
                )
            ],
            mode="live",
        )[0]

        bundle = self.repo.save_run_result_bundle(
            run.id,
            {
                "status": "completed",
                "summary": (
                    "The recipient asked for 10 cans of beer, which the agent refused. "
                    "The recipient then asked for a bottle of milk for tomorrow."
                ),
            },
        )

        request = bundle["service_requests"][0]
        self.assertEqual(request.id, "svc-run-old-review-1")
        self.assertEqual(request.status, "ready_to_print")
        self.assertEqual(request.items, ("a bottle of milk",))
        self.assertEqual(request.human_review_reason, "")
        self.assertNotIn("broth", request.notes)

    def test_reimport_can_repair_stale_review_row_for_same_run(self):
        self.repo.conn.execute(
            """
            INSERT INTO service_requests (
                id, recipient_id, category, queue, sla_hours, priority, status,
                items, notes, human_review_reason, created_at, updated_at, update_count, update_history
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?)
            """,
            (
                "svc-run-older-review-1",
                "rec-001",
                "groceries",
                "coordinator_review",
                8,
                "review",
                "review",
                "[]",
                "Old callback transcript about 1 package of broth.",
                "Need category or urgency requires coordinator review.",
                '[{"event":"updated","run_id":"run-stale-same-run","source":"same_day_repeat_import"}]',
            ),
        )
        self.repo.conn.execute(
            """
            INSERT INTO call_runs (
                id, plan_id, approval_id, recipient_id, idempotency_key, status, mode,
                provider_plan_id, provider_run_id, masked_phone, started_at, completed_at, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, '', '')
            """,
            (
                "run-stale-same-run",
                "plan-stale",
                "approval-stale",
                "rec-001",
                "key-stale",
                "running",
                "live",
                "provider-plan-stale",
                "provider-run-stale",
                "+1******1001",
            ),
        )
        self.repo.conn.commit()

        bundle = self.repo.save_run_result_bundle(
            "run-stale-same-run",
            {
                "status": "completed",
                "summary": (
                    "The recipient asked for 10 cans of beer, which the agent refused. "
                    "The recipient then asked for a bottle of milk for tomorrow."
                ),
            },
        )

        request = bundle["service_requests"][0]
        self.assertEqual(request.id, "svc-run-older-review-1")
        self.assertEqual(request.status, "ready_to_print")
        self.assertEqual(request.items, ("a bottle of milk",))
        self.assertEqual(request.human_review_reason, "")
        self.assertNotIn("broth", request.notes)
        self.assertTrue(request.update_history[-1]["reprocessed"])

    def test_callback_grocery_addition_keeps_existing_same_day_cleaning_order_in_print_view(self):
        cleaning_run = self.repo.save_call_runs(
            plan_id="plan-filming-cleaning",
            approval_id="approval-filming-cleaning",
            records=[
                CallRunRecord(
                    recipient_id="rec-001",
                    idempotency_key="filming-cleaning-key",
                    status=CallRunStatus.RUNNING,
                    plan_id="provider-plan-filming-cleaning",
                    run_id="provider-run-filming-cleaning",
                    masked_phone="+1******1001",
                )
            ],
            mode="live",
        )[0]
        self.repo.save_run_result_bundle(
            cleaning_run.id,
            {
                "status": "completed",
                "needs": [
                    {
                        "category": "cleaning",
                        "items": ["flat cleaning"],
                        "urgency": "tomorrow",
                        "notes": "Requested during the first filming call.",
                    }
                ],
            },
        )
        callback_run = self.repo.save_call_runs(
            plan_id="plan-filming-callback",
            approval_id="approval-filming-callback",
            records=[
                CallRunRecord(
                    recipient_id="rec-001",
                    idempotency_key="filming-callback-key",
                    status=CallRunStatus.RUNNING,
                    plan_id="provider-plan-filming-callback",
                    run_id="provider-run-filming-callback",
                    masked_phone="+1******1001",
                )
            ],
            mode="live",
        )[0]

        self.repo.save_run_result_bundle(
            callback_run.id,
            {
                "status": "completed",
                "needs": [
                    {
                        "category": "groceries",
                        "items": ["1 pack of porridge", "1 carton of oat milk", "1 pack of eggs"],
                        "urgency": "tomorrow",
                        "notes": "Added during the urgent callback.",
                    }
                ],
            },
        )

        rec_requests = [
            request
            for request in self.repo.list_latest_call_result_service_requests()
            if request.recipient_id == "rec-001"
        ]
        by_category = {request.category: request for request in rec_requests}

        self.assertEqual(by_category["cleaning"].items, ("flat cleaning",))
        self.assertEqual(
            by_category["groceries"].items,
            ("1 pack of porridge", "1 carton of oat milk", "1 pack of eggs"),
        )
        self.assertEqual(by_category["cleaning"].status, "ready_to_print")
        self.assertEqual(by_category["groceries"].status, "ready_to_print")


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
