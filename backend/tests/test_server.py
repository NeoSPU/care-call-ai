import unittest
import tempfile
from io import BytesIO
from pathlib import Path

from app.demo_reset import reset_demo_database
from app.repository import Repository, connect, init_schema, seed_database
from app.server import (
    dashboard_api_payload,
    initialize_database,
    preflight_payload,
    print_orders_api_payload,
    recipient_api_payload,
    update_recipient_card,
    update_recipient_safety,
    CareCallHandler,
    authorized_backend_request,
)
from app.storage import load_seed_recipients


class ServerPayloadTests(unittest.TestCase):
    def test_preflight_payload_is_no_call_demo_data(self):
        payload = preflight_payload("2026-08-01")

        self.assertTrue(payload["dry_run"])
        self.assertEqual(payload["real_calls_placed"], 0)
        self.assertEqual(payload["summary"]["recipients"], 6)
        self.assertGreaterEqual(payload["summary"]["ready"], 2)
        self.assertGreaterEqual(payload["summary"]["blocked"], 1)
        self.assertEqual(len(payload["previews"]), 6)

    def test_preflight_payload_includes_idempotency_keys(self):
        payload = preflight_payload("2026-08-01")
        keys = [preview.idempotency_key for preview in payload["previews"]]

        self.assertTrue(all(key.startswith("carecall-2026-08-01-") for key in keys))


class ServerApiPayloadTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "carecall.sqlite3"
        conn = connect(self.db_path)
        init_schema(conn)
        seed_database(Repository(conn), load_seed_recipients())
        conn.close()

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_dashboard_api_payload_is_sqlite_backed_and_masks_phones(self):
        payload = dashboard_api_payload(self.db_path, "2026-08-01")

        self.assertEqual(payload["service"], "carecall-backend")
        self.assertGreaterEqual(payload["summary"]["recipients"], 5)
        self.assertGreaterEqual(len(payload["recipients"]), 5)
        self.assertGreaterEqual(len(payload["service_requests"]), 1)
        self.assertNotIn("+15550101001", repr(payload))

    def test_runtime_demo_max_override_adds_masked_fictional_recipient(self):
        initialize_database(self.db_path, env={"CARECALL_DEMO_MAX_PHONE": "+447700900123"})
        payload = dashboard_api_payload(self.db_path, "2026-08-01")

        max_preview = next(item for item in payload["planned_calls"] if item["recipient_id"] == "rec-demo-max")
        self.assertEqual(max_preview["recipient_label"], "Max Neous")
        self.assertEqual(max_preview["masked_phone"], "+4*******0123")
        self.assertEqual(max_preview["authorized_contacts"][0]["name"], "Marija Neous")
        self.assertNotIn("+447700900123", repr(payload))

    def test_recipient_api_payload_returns_detail_contract(self):
        payload = recipient_api_payload(self.db_path, "rec-003")

        self.assertEqual(payload["recipient"]["id"], "rec-003")
        self.assertEqual(payload["recipient"]["safety_category"], "critical")
        self.assertTrue(payload["recipient"]["blocked"])
        self.assertTrue(payload["recipient"]["blocked_reasons"])
        self.assertIn("risk_audit", payload)

    def test_d05_d06_safety_patch_requires_reason_and_marks_approval_stale(self):
        with self.assertRaises(ValueError):
            update_recipient_safety(self.db_path, "rec-002", {"safety_category": "non_critical", "reason": ""})

        payload = update_recipient_safety(
            self.db_path,
            "rec-002",
            {
                "safety_category": "non_critical",
                "reason": "Reviewed special handling with care coordinator.",
            },
        )

        self.assertEqual(payload["recipient"]["safety_category"], "non_critical")
        self.assertEqual(payload["risk_audit"][0]["operator"], "carecall-coordinator")
        self.assertTrue(payload["approval_invalidated"])

    def test_client_card_patch_updates_editable_fields_contacts_and_audit(self):
        payload = update_recipient_card(
            self.db_path,
            "rec-002",
            {
                "display_name": "Morgan Updated",
                "phone_e164": "+15550105555",
                "caregiver_phone_e164": "+15550107777",
                "delivery_area": "Wallingford East",
                "address": "12 Updated Street",
                "notes": "Use the side entrance.",
                "safety_category": "non_critical",
                "condition": "hearing_impairment",
                "severity": "mild",
                "language": "ru",
                "timezone": "Europe/London",
                "communication_rules": ["short_simple_sentences", "ask_speaker_identity_first"],
                "authorized_contacts": [
                    {
                        "name": "Maria Updated",
                        "relationship": "daughter",
                        "can_answer_intake": True,
                        "preferred_goodbye": "All the best, Ms Maria.",
                    }
                ],
                "safety_change_reason": "Coordinator reviewed card and consent.",
                "operator": "carecall-coordinator",
            },
        )

        self.assertEqual(payload["recipient"]["display_name"], "Morgan Updated")
        self.assertEqual(payload["recipient"]["masked_phone"], "+1******5555")
        self.assertEqual(payload["recipient"]["safety_category"], "non_critical")
        self.assertTrue(payload["recipient"]["automation_eligible"])
        self.assertEqual(payload["recipient"]["automation_status"], "auto_call")
        self.assertEqual(payload["recipient"]["delivery_area"], "Wallingford East")
        self.assertEqual(payload["contact_channels"]["phone_e164"], "+15550105555")
        self.assertEqual(payload["contact_channels"]["caregiver_phone_e164"], "+15550107777")
        self.assertEqual(payload["care_profile"]["condition"], "hearing_impairment")
        self.assertEqual(payload["care_profile"]["language"], "ru")
        self.assertEqual(payload["care_profile"]["authorized_contacts"][0]["name"], "Maria Updated")
        self.assertEqual(payload["card_audit"][0]["operator"], "carecall-coordinator")
        self.assertIn("client card", payload["card_audit"][0]["summary"])
        self.assertEqual(payload["risk_audit"][0]["new_value"], "non_critical")
        self.assertEqual(payload["risk_audit"][0]["note"], "Coordinator reviewed card and consent.")
        self.assertTrue(payload["approval_invalidated"])

    def test_client_card_patch_requires_reason_when_safety_category_changes(self):
        with self.assertRaises(ValueError):
            update_recipient_card(
                self.db_path,
                "rec-002",
                {
                    "display_name": "Morgan Updated",
                    "phone_e164": "+15550105555",
                    "caregiver_phone_e164": "+15550107777",
                    "delivery_area": "Wallingford East",
                    "address": "12 Updated Street",
                    "notes": "Use the side entrance.",
                    "safety_category": "non_critical",
                    "condition": "hearing_impairment",
                    "severity": "mild",
                    "language": "ru",
                    "timezone": "Europe/London",
                    "communication_rules": ["short_simple_sentences"],
                    "authorized_contacts": [],
                    "operator": "carecall-coordinator",
                },
            )

    def test_print_orders_require_processed_ready_status_unless_demo_flag_is_enabled(self):
        default_payload = print_orders_api_payload(self.db_path, env={})
        demo_payload = print_orders_api_payload(self.db_path, env={"CARECALL_DEMO_PRINT_ORDERS": "true"})

        self.assertGreaterEqual(len(default_payload["service_requests"]), 1)
        self.assertTrue(all(item["status"] != "ready_to_print" for item in default_payload["service_requests"]))
        self.assertTrue(all(item["status"] == "ready_to_print" for item in demo_payload["service_requests"]))

    def test_demo_reset_recreates_clean_seed_state(self):
        conn = connect(self.db_path)
        repo = Repository(conn)
        batch = repo.create_batch(["rec-001"], label="Temporary smoke noise")
        repo.save_preflight_plan(batch.id, ("temporary-key",))
        self.assertGreater(len(repo.list_preflight_plans()), 1)
        conn.close()

        summary = reset_demo_database(self.db_path, env={})

        conn = connect(self.db_path)
        try:
            repo = Repository(conn)
            self.assertEqual(summary["preflight_plans"], 1)
            self.assertEqual(tuple(plan.id for plan in repo.list_preflight_plans()), ("plan-seed-preflight",))
            self.assertEqual(tuple(approval.id for approval in repo.list_approvals()), ("approval-seed-rec-002",))
            self.assertGreaterEqual(summary["recipients"], 5)
            self.assertGreaterEqual(summary["service_requests"], 1)
        finally:
            conn.close()


class _HeaderCaptureHandler(CareCallHandler):
    def __init__(self):
        self.headers = {"Origin": "http://127.0.0.1:3000"}
        self.wfile = BytesIO()
        self.status = None
        self.sent_headers = []

    def send_response(self, code, message=None):
        self.status = code

    def send_header(self, keyword, value):
        self.sent_headers.append((keyword, value))

    def end_headers(self):
        return


class ServerCorsTests(unittest.TestCase):
    def test_options_preflight_allows_local_frontend_to_post_json(self):
        handler = _HeaderCaptureHandler()

        handler.do_OPTIONS()

        self.assertEqual(handler.status, 204)
        self.assertIn(("Access-Control-Allow-Origin", "http://127.0.0.1:3000"), handler.sent_headers)
        self.assertIn(("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS"), handler.sent_headers)
        self.assertIn(("Access-Control-Allow-Headers", "Authorization, Content-Type"), handler.sent_headers)


class BackendApiAuthTests(unittest.TestCase):
    def test_health_is_public_but_api_paths_require_bearer_credential(self):
        env = {"CARECALL_BACKEND_API_TOKEN": "backend-key"}

        self.assertTrue(authorized_backend_request({}, "/health", env=env))
        self.assertFalse(authorized_backend_request({}, "/api/dashboard", env=env))
        self.assertFalse(authorized_backend_request({"Authorization": "Bearer wrong"}, "/preflight", env=env))
        self.assertTrue(
            authorized_backend_request(
                {"Authorization": "Bearer backend-key"},
                "/api/dashboard",
                env=env,
            )
        )

    def test_production_without_backend_credential_fails_closed(self):
        env = {"CARECALL_ENV": "production"}

        self.assertFalse(authorized_backend_request({}, "/api/dashboard", env=env))


if __name__ == "__main__":
    unittest.main()
