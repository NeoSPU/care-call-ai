import tempfile
import unittest
import subprocess
from pathlib import Path

from app.calle_readiness import CalleReadiness
from app.repository import Repository, connect, init_schema, seed_database
from app.server import (
    approve_preflight_api_payload,
    callback_requests_api_payload,
    create_batch_api_payload,
    create_callback_request_api_payload,
    create_preflight_api_payload,
    execute_dry_run_api_payload,
    execute_live_api_payload,
    import_run_result_api_payload,
    operations_dashboard_api_payload,
    service_requests_api_payload,
    save_special_handling_approval_api_payload,
    update_callback_request_api_payload,
    update_recipient_safety,
)
from app.storage import load_seed_recipients


class FakeRunner:
    def __init__(self, responses):
        self.responses = responses
        self.commands = []

    def __call__(self, command, env):
        self.commands.append(command)
        response = self.responses.get(command)
        if response is None:
            response = self.responses.get(command[0:2])
        if response is None:
            response = (0, "{}", "")
        return subprocess.CompletedProcess(command, response[0], response[1], response[2])


def ready():
    return CalleReadiness(cli_available=True, authenticated=True, tools_available=True)


class ServerCallApiTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "carecall.sqlite3"
        conn = connect(self.db_path)
        init_schema(conn)
        seed_database(Repository(conn), load_seed_recipients())
        conn.close()

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_post_preflight_creates_current_plan_excluding_blocked_and_unreviewed_special_handling(self):
        batch = create_batch_api_payload(
            self.db_path,
            {
                "selected_recipient_ids": ["rec-001", "rec-002", "rec-003", "rec-005"],
                "label": "Daily Wallingford round",
                "call_date": "2026-08-01",
            },
        )
        payload = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})

        self.assertEqual(payload["batch_id"], batch["batch"]["id"])
        self.assertEqual(payload["call_date"], "2026-08-01")
        self.assertTrue(payload["current"])
        self.assertEqual(
            {item["recipient_id"] for item in payload["ready_previews"]},
            {"rec-001", "rec-005"},
        )
        self.assertIn("rec-002", {item["recipient_id"] for item in payload["manual_previews"]})
        self.assertIn("rec-003", {item["recipient_id"] for item in payload["blocked_previews"]})
        self.assertTrue(all("rec-002" not in key for key in payload["ready_keys"]))
        self.assertTrue(all("rec-003" not in key for key in payload["ready_keys"]))

    def test_special_handling_requires_card_review_and_per_recipient_approval(self):
        batch = create_batch_api_payload(
            self.db_path,
            {
                "selected_recipient_ids": ["rec-002", "rec-003", "rec-004"],
                "label": "Special handling check",
                "call_date": "2026-08-01",
            },
        )
        before = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        self.assertEqual(before["ready_previews"], [])

        severe = save_special_handling_approval_api_payload(
            self.db_path,
            "rec-004",
            {
                "operator": "carecall-coordinator",
                "card_reviewed": True,
                "approved_for_automated_round": True,
                "note": "Attempted severe direct-call approval should not enable automation.",
            },
        )
        self.assertFalse(severe["approved_for_automated_round"])
        self.assertIn("manual", severe["route"])

        approval = save_special_handling_approval_api_payload(
            self.db_path,
            "rec-002",
            {
                "operator": "carecall-coordinator",
                "card_reviewed": True,
                "approved_for_automated_round": True,
                "note": "Caregiver route reviewed for this automated round.",
            },
        )
        self.assertTrue(approval["approved_for_automated_round"])

        after = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        self.assertEqual({item["recipient_id"] for item in after["ready_previews"]}, {"rec-002"})
        self.assertTrue(all("rec-003" not in key and "rec-004" not in key for key in after["ready_keys"]))

    def test_safety_category_update_releases_operator_only_routes_when_marked_non_critical(self):
        batch = create_batch_api_payload(
            self.db_path,
            {
                "selected_recipient_ids": ["rec-002", "rec-004"],
                "label": "Safety category route release",
                "call_date": "2026-08-01",
            },
        )
        before = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        self.assertEqual(before["ready_previews"], [])
        self.assertEqual(
            {item["recipient_id"] for item in before["manual_previews"]},
            {"rec-002"},
        )
        self.assertEqual({item["recipient_id"] for item in before["blocked_previews"]}, {"rec-004"})

        rec_002 = update_recipient_safety(
            self.db_path,
            "rec-002",
            {
                "safety_category": "non_critical",
                "reason": "Coordinator reviewed the card and removed special handling.",
            },
        )
        rec_004 = update_recipient_safety(
            self.db_path,
            "rec-004",
            {
                "safety_category": "non_critical",
                "reason": "Coordinator removed critical flag and cleared operator-only routing.",
            },
        )

        self.assertEqual(rec_002["recipient"]["safety_category"], "non_critical")
        self.assertTrue(rec_002["approval_invalidated"])
        self.assertEqual(rec_004["recipient"]["safety_category"], "non_critical")
        self.assertFalse(rec_004["recipient"]["blocked"])
        self.assertEqual(rec_004["recipient"]["route"], "recipient")

        after = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        self.assertEqual({item["recipient_id"] for item in after["ready_previews"]}, {"rec-002", "rec-004"})
        self.assertEqual({item["recipient_id"] for item in after["manual_previews"]}, set())
        self.assertEqual({item["recipient_id"] for item in after["blocked_previews"]}, set())
        self.assertTrue(any("-rec-002-" in key for key in after["ready_keys"]))
        self.assertTrue(any("-rec-004-" in key for key in after["ready_keys"]))

    def test_operations_dashboard_payload_splits_care_seen_statistics_from_operator_controls(self):
        create_batch_api_payload(
            self.db_path,
            {
                "selected_recipient_ids": ["rec-001"],
                "label": "Operator selected session",
                "call_date": "2026-08-01",
            },
        )
        create_callback_request_api_payload(
            self.db_path,
            {
                "recipient_id": "rec-001",
                "source": "siri_shortcut",
                "request_text": "Please call me back about medicine.",
                "operator": "carecall-coordinator",
            },
        )

        payload = operations_dashboard_api_payload(self.db_path, "2026-08-01")

        self.assertEqual(payload["slogan"]["care_seen"], "Dashboard")
        self.assertGreaterEqual(payload["summary"]["registered_recipients"], 5)
        self.assertGreaterEqual(payload["summary"]["ready_for_auto_call"], 1)
        self.assertGreaterEqual(payload["summary"]["eligible_not_selected"], 1)
        self.assertGreaterEqual(payload["summary"]["operator_control_required"], 1)
        self.assertGreaterEqual(payload["summary"]["not_allowed_for_auto_call"], 1)
        self.assertEqual(payload["summary"]["urgent_callbacks"], 1)
        self.assertIn("non_critical", payload["by_safety_category"])
        self.assertIn("alzheimer", payload["by_condition"])
        self.assertGreaterEqual(payload["session"]["orders_generated"], 1)

    def test_callback_request_queue_creates_updates_and_enriches_urgent_sidebar_count(self):
        created = create_callback_request_api_payload(
            self.db_path,
            {
                "recipient_id": "rec-001",
                "source": "siri_shortcut",
                "request_text": "Need an urgent callback about pharmacy delivery.",
                "priority": "urgent",
            },
        )
        request = created["callback_requests"][0]

        self.assertEqual(created["summary"]["new"], 1)
        self.assertEqual(request["recipient_name"], "Eleanor Thompson")
        self.assertEqual(request["source"], "siri_shortcut")
        self.assertEqual(request["status"], "operator_review")
        self.assertEqual(request["priority"], "urgent")
        self.assertEqual(request["safety_category"], "non_critical")
        self.assertTrue(request["masked_phone"].startswith("+"))

        listed = callback_requests_api_payload(self.db_path)
        self.assertEqual(listed["summary"]["new"], 1)
        self.assertEqual(listed["callback_requests"][0]["id"], request["id"])

        updated = update_callback_request_api_payload(
            self.db_path,
            request["id"],
            {
                "status": "approved_callback",
                "operator": "carecall-coordinator",
                "resolution_note": "Operator approved callback after review.",
            },
        )

        self.assertEqual(updated["summary"]["callback_approved"], 1)
        self.assertEqual(updated["callback_requests"][0]["status"], "approved_callback")
        self.assertEqual(updated["callback_requests"][0]["resolution_note"], "Operator approved callback after review.")

    def test_approval_accepts_only_current_exact_ready_keyset_with_confirmations(self):
        batch = create_batch_api_payload(
            self.db_path,
            {"selected_recipient_ids": ["rec-001", "rec-005"], "call_date": "2026-08-01"},
        )
        preflight = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})

        rejected = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"][:-1],
                "operator": "carecall-coordinator",
                "note": "Missing one key.",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )
        self.assertFalse(rejected["approved"])
        self.assertEqual(rejected["status"], "rejected")

        accepted = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"],
                "operator": "carecall-coordinator",
                "note": "Exact list reviewed.",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )
        self.assertTrue(accepted["approved"])
        self.assertEqual(accepted["approval"]["operator"], "carecall-coordinator")
        self.assertEqual(set(accepted["approval"]["approved_keys"]), set(preflight["ready_keys"]))

    def test_dry_run_execution_persists_no_call_records_after_approval(self):
        batch = create_batch_api_payload(
            self.db_path,
            {"selected_recipient_ids": ["rec-001"], "call_date": "2026-08-01"},
        )
        preflight = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        approval = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"],
                "operator": "carecall-coordinator",
                "note": "Dry-run approval.",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )

        payload = execute_dry_run_api_payload(
            self.db_path,
            {"plan_id": preflight["plan_id"], "approval_id": approval["approval"]["id"]},
        )

        self.assertTrue(payload["accepted"])
        self.assertEqual(payload["mode"], "dry_run")
        self.assertEqual(payload["real_calls_placed"], 0)
        self.assertEqual(payload["runner_commands"], [])
        self.assertEqual(payload["records"][0]["status"], "planned")

    def test_execution_rejects_stale_approval_after_safety_change(self):
        batch = create_batch_api_payload(
            self.db_path,
            {"selected_recipient_ids": ["rec-001"], "call_date": "2026-08-01"},
        )
        preflight = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        approval = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"],
                "operator": "carecall-coordinator",
                "note": "Approved before safety change.",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )

        update_recipient_safety(
            self.db_path,
            "rec-001",
            {
                "safety_category": "critical",
                "reason": "New safeguarding concern before execution.",
            },
        )

        dry_run = execute_dry_run_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approval_id": approval["approval"]["id"],
                "approved_keys": preflight["ready_keys"],
            },
        )
        live = execute_live_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approval_id": approval["approval"]["id"],
                "approved_keys": preflight["ready_keys"],
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
            env={"CARECALL_LIVE_CALLS_ENABLED": "true"},
        )

        self.assertFalse(dry_run["accepted"])
        self.assertIn("Approval is stale", " ".join(dry_run["blocked_reasons"]))
        self.assertEqual(dry_run["records"], [])
        self.assertFalse(live["accepted"])
        self.assertIn("Approval is stale", " ".join(live["blocked_reasons"]))
        self.assertEqual(live["records"], [])

    def test_live_run_import_fetches_provider_result_and_creates_idempotent_service_request(self):
        batch = create_batch_api_payload(
            self.db_path,
            {"selected_recipient_ids": ["rec-001"], "call_date": "2026-08-01"},
        )
        preflight = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        approval = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"],
                "operator": "carecall-coordinator",
                "note": "Final demo import test.",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )
        live_runner = FakeRunner(
            {
                ("calle", "plan_call"): (0, '{"plan_id":"plan-123"}', ""),
                ("calle", "run_call", "plan-123"): (0, '{"run_id":"provider-run-456"}', ""),
            }
        )
        live = execute_live_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approval_id": approval["approval"]["id"],
                "approved_keys": preflight["ready_keys"],
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
            env={"CARECALL_LIVE_CALLS_ENABLED": "true"},
            readiness=ready(),
            runner=live_runner,
        )

        stored_run_id = live["records"][0]["id"]
        result_runner = FakeRunner(
            {
                (
                    "calle",
                    "get_call_run",
                    "provider-run-456",
                ): (
                    0,
                    """
                    {
                      "status": "completed",
                      "summary": "Alex asked for milk and bread for tomorrow.",
                      "needs": [
                        {
                          "category": "groceries",
                          "items": ["milk", "bread"],
                          "urgency": "tomorrow",
                          "notes": "Deliver with the regular Wallingford round."
                        }
                      ]
                    }
                    """,
                    "",
                )
            }
        )

        imported = import_run_result_api_payload(self.db_path, stored_run_id, runner=result_runner)
        imported_again = import_run_result_api_payload(self.db_path, stored_run_id, runner=result_runner)
        requests = service_requests_api_payload(self.db_path)["service_requests"]
        imported_requests = [request for request in requests if request["id"].startswith(f"svc-{stored_run_id}-")]

        self.assertTrue(imported["imported"])
        self.assertEqual(imported["provider_status"], "completed")
        self.assertEqual(imported["intake_result"]["summary"], "Alex asked for milk and bread for tomorrow.")
        self.assertEqual(imported["service_requests"][0]["category"], "groceries")
        self.assertEqual(imported_again["service_requests"][0]["id"], imported["service_requests"][0]["id"])
        self.assertEqual(len(imported_requests), 1)
        self.assertIn(("calle", "get_call_run", "provider-run-456"), result_runner.commands)


if __name__ == "__main__":
    unittest.main()
