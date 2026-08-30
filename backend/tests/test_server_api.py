import tempfile
import unittest
import subprocess
import json
from datetime import date
from pathlib import Path

from app.calle_execution import CallRunRecord, CallRunStatus
from app.calle_readiness import CalleReadiness
from app.api_models import service_requests_payload
from app.domain import StoredServiceRequest
from app.repository import Repository, connect, init_schema, seed_database
from app.server import (
    approve_preflight_api_payload,
    callback_requests_api_payload,
    create_batch_api_payload,
    create_callback_request_api_payload,
    create_preflight_api_payload,
    execute_dry_run_api_payload,
    execute_live_api_payload,
    cancel_run_api_payload,
    import_run_result_api_payload,
    operations_dashboard_api_payload,
    print_orders_api_payload,
    run_status_api_payload,
    service_requests_api_payload,
    save_special_handling_approval_api_payload,
    update_callback_request_api_payload,
    update_service_request_api_payload,
    void_service_request_api_payload,
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


class ServiceRequestPayloadTests(unittest.TestCase):
    def test_review_request_payload_includes_backend_release_suggestion_for_safe_notes(self):
        payload = service_requests_payload(
            (
                StoredServiceRequest(
                    id="svc-run-review-1",
                    recipient_id="rec-001",
                    category="other",
                    queue="coordinator_review",
                    sla_hours=8,
                    priority="review",
                    status="review",
                    items=(),
                    notes="The recipient confirmed an added practical support request: 1 package of broth needed for tomorrow.",
                    human_review_reason="CALL-E returned a completed summary without structured practical needs.",
                ),
            )
        )

        request = payload["service_requests"][0]

        self.assertEqual(request["suggested_category"], "groceries")
        self.assertEqual(request["suggested_items"], ["1 package of broth"])

    def test_review_request_payload_suppresses_suggestion_for_prohibited_notes(self):
        payload = service_requests_payload(
            (
                StoredServiceRequest(
                    id="svc-run-review-2",
                    recipient_id="rec-001",
                    category="other",
                    queue="coordinator_review",
                    sla_hours=8,
                    priority="review",
                    status="review",
                    items=(),
                    notes="The recipient asked for beer for tomorrow.",
                    human_review_reason="Restricted request.",
                ),
            )
        )

        request = payload["service_requests"][0]

        self.assertEqual(request["suggested_category"], "")
        self.assertEqual(request["suggested_items"], [])


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
        self.assertEqual(request["same_day_callback_count"], 1)
        self.assertFalse(request["callback_repeat_review_required"])
        self.assertIn("requested 1 same-day callback", request["callback_repeat_warning"])

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

    def test_operator_can_update_and_remove_service_request_payloads(self):
        current = service_requests_api_payload(self.db_path)["service_requests"][0]

        updated = update_service_request_api_payload(
            self.db_path,
            current["id"],
            {
                "category": "groceries",
                "items": ["1 package of bread"],
                "notes": "Corrected by coordinator.",
                "priority": "urgent",
                "status": "ready_to_print",
                "operator": "Max Neous",
                "reason": "Callback result corrected.",
            },
        )["service_requests"][0]

        self.assertEqual(updated["category"], "groceries")
        self.assertEqual(updated["items"], ["1 package of bread"])
        self.assertEqual(updated["status"], "ready_to_print")
        self.assertEqual(updated["human_review_reason"], "")

        removed = void_service_request_api_payload(
            self.db_path,
            current["id"],
            {"operator": "Max Neous", "reason": "Duplicate."},
        )["service_requests"][0]

        self.assertEqual(removed["status"], "void")

    def test_siri_callback_request_starts_immediate_live_callback_when_eligible(self):
        runner = FakeRunner(
            {
                ("calle", "plan_call"): (0, '{"plan_id":"callback-plan-123"}', ""),
                ("calle", "run_call", "callback-plan-123"): (0, '{"run_id":"callback-run-456"}', ""),
            }
        )

        created = create_callback_request_api_payload(
            self.db_path,
            {
                "recipient_id": "rec-001",
                "source": "siri_shortcut",
                "request_text": "Please call me back now.",
                "priority": "urgent",
            },
            env={"CARECALL_LIVE_CALLS_ENABLED": "true", "CARECALL_MAX_AUTO_CALLBACK_CALLS_PER_DAY": "3"},
            readiness=ready(),
            runner=runner,
        )

        request = created["callback_requests"][0]
        auto_callback = created["auto_callback"]
        self.assertEqual(request["status"], "auto_callback_started")
        self.assertEqual(request["auto_call_status"], "auto_callback_started")
        self.assertTrue(request["auto_run_id"].startswith("run-"))
        self.assertEqual(auto_callback["status"], "auto_callback_started")
        self.assertEqual(auto_callback["real_calls_placed"], 1)
        self.assertEqual(runner.commands[0][0:2], ("calle", "plan_call"))
        self.assertEqual(runner.commands[1], ("calle", "run_call", "callback-plan-123"))

        run = run_status_api_payload(self.db_path, request["auto_run_id"])["run"]
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["mode"], "live")
        self.assertEqual(run["provider_run_id"], "callback-run-456")

    def test_siri_callback_import_marks_callback_completed_and_creates_order(self):
        runner = FakeRunner(
            {
                ("calle", "plan_call"): (0, '{"plan_id":"callback-plan-123"}', ""),
                ("calle", "run_call", "callback-plan-123"): (0, '{"run_id":"callback-run-456"}', ""),
            }
        )
        created = create_callback_request_api_payload(
            self.db_path,
            {
                "recipient_id": "rec-001",
                "source": "siri_shortcut",
                "request_text": "Please call me back.",
                "priority": "urgent",
            },
            env={"CARECALL_LIVE_CALLS_ENABLED": "true", "CARECALL_MAX_AUTO_CALLBACK_CALLS_PER_DAY": "3"},
            readiness=ready(),
            runner=runner,
        )
        request = created["callback_requests"][0]
        run_id = request["auto_run_id"]
        result_runner = FakeRunner(
            {
                ("calle", "get_call_run", "callback-run-456"): (
                    0,
                    json.dumps(
                        {
                            "status": "completed",
                            "summary": "Alex asked for milk for tomorrow.",
                            "needs": [
                                {
                                    "category": "groceries",
                                    "items": ["1 litre milk"],
                                    "urgency": "tomorrow",
                                    "notes": "Requested during automatic callback.",
                                }
                            ],
                        }
                    ),
                    "",
                )
            }
        )

        imported = import_run_result_api_payload(self.db_path, run_id, runner=result_runner)
        listed = callback_requests_api_payload(self.db_path)
        updated = next(item for item in listed["callback_requests"] if item["id"] == request["id"])
        print_orders = print_orders_api_payload(self.db_path)
        callback_orders = [
            item for item in print_orders["service_requests"] if item["id"].startswith(f"svc-{run_id}-")
        ]

        self.assertTrue(imported["imported"])
        self.assertEqual(updated["status"], "auto_callback_completed")
        self.assertEqual(updated["auto_call_status"], "auto_callback_completed")
        self.assertEqual(updated["auto_run_id"], run_id)
        self.assertTrue(updated["call_started_at"])
        self.assertTrue(updated["call_completed_at"])
        self.assertEqual(updated["provider_run_id"], "callback-run-456")
        self.assertEqual(callback_orders[0]["category"], "groceries")
        self.assertEqual(callback_orders[0]["items"], ["1 litre milk"])

    def test_siri_callback_request_daily_limit_blocks_fourth_auto_callback(self):
        for index in range(3):
            create_callback_request_api_payload(
                self.db_path,
                {
                    "recipient_id": "rec-001",
                    "source": "siri_shortcut",
                    "request_text": f"Please call me back #{index + 1}.",
                    "priority": "urgent",
                },
                env={"CARECALL_LIVE_CALLS_ENABLED": "false", "CARECALL_MAX_AUTO_CALLBACK_CALLS_PER_DAY": "3"},
                readiness=ready(),
                runner=FakeRunner({}),
            )

        runner = FakeRunner({})
        limited = create_callback_request_api_payload(
            self.db_path,
            {
                "recipient_id": "rec-001",
                "source": "siri_shortcut",
                "request_text": "Please call me back again.",
                "priority": "urgent",
            },
            env={"CARECALL_LIVE_CALLS_ENABLED": "true", "CARECALL_MAX_AUTO_CALLBACK_CALLS_PER_DAY": "3"},
            readiness=ready(),
            runner=runner,
        )

        request = limited["callback_requests"][0]
        self.assertEqual(request["status"], "callback_limit_reached")
        self.assertEqual(request["same_day_callback_count"], 4)
        self.assertTrue(request["callback_repeat_review_required"])
        self.assertIn("3 recipient-triggered calls per day", request["callback_repeat_warning"])
        self.assertEqual(limited["auto_callback"]["status"], "callback_limit_reached")
        self.assertEqual(runner.commands, [])

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
        self.assertTrue(imported["service_requests"][0]["created_at"])
        self.assertTrue(imported["service_requests"][0]["updated_at"])
        self.assertEqual(imported["service_requests"][0]["update_count"], 0)
        self.assertEqual(imported["service_requests"][0]["update_history"][0]["event"], "created")
        self.assertEqual(imported["service_requests"][0]["update_history"][0]["run_id"], stored_run_id)
        self.assertEqual(imported_again["service_requests"][0]["id"], imported["service_requests"][0]["id"])
        self.assertEqual(len(imported_requests), 1)
        self.assertIn(("calle", "get_call_run", "provider-run-456"), result_runner.commands)

    def test_print_orders_keep_same_day_ready_orders_but_exclude_latest_prohibited_items(self):
        conn = connect(self.db_path)
        try:
            repo = Repository(conn)
            old_run = repo.save_call_runs(
                plan_id="plan-old-order",
                approval_id="approval-old-order",
                records=[
                    CallRunRecord(
                        recipient_id="rec-001",
                        idempotency_key="old-order-key",
                        status=CallRunStatus.RUNNING,
                        plan_id="provider-plan-old",
                        run_id="provider-run-old-order",
                        masked_phone="+1******1001",
                    )
                ],
                mode="live",
            )[0]
        finally:
            conn.close()

        runner = FakeRunner(
            {
                ("calle", "get_call_run", "provider-run-old-order"): (
                    0,
                    json.dumps(
                        {
                            "status": "completed",
                            "summary": "Alex asked for bread and milk tomorrow.",
                            "needs": [
                                {
                                    "category": "groceries",
                                    "items": ["bread", "milk"],
                                    "urgency": "tomorrow",
                                }
                            ],
                        }
                    ),
                    "",
                )
            }
        )
        import_run_result_api_payload(self.db_path, old_run.id, runner=runner)

        conn = connect(self.db_path)
        try:
            repo = Repository(conn)
            latest_run = repo.save_call_runs(
                plan_id="plan-restricted",
                approval_id="approval-restricted",
                records=[
                    CallRunRecord(
                        recipient_id="rec-001",
                        idempotency_key="restricted-key",
                        status=CallRunStatus.RUNNING,
                        plan_id="provider-plan-restricted",
                        run_id="provider-run-restricted",
                        masked_phone="+1******1001",
                    )
                ],
                mode="live",
            )[0]
        finally:
            conn.close()

        restricted_runner = FakeRunner(
            {
                ("calle", "get_call_run", "provider-run-restricted"): (
                    0,
                    json.dumps(
                        {
                            "status": "completed",
                            "summary": "Alex asked for 10 cans of beer.",
                            "needs": [
                                {
                                    "category": "groceries",
                                    "items": ["10 cans of beer"],
                                    "urgency": "today",
                                }
                            ],
                        }
                    ),
                    "",
                )
            }
        )
        import_run_result_api_payload(self.db_path, latest_run.id, runner=restricted_runner)

        print_orders = print_orders_api_payload(self.db_path, env={})["service_requests"]

        self.assertEqual(len(print_orders), 1)
        self.assertEqual(print_orders[0]["category"], "groceries")
        self.assertEqual(print_orders[0]["items"], ["bread", "milk"])
        self.assertNotIn("beer", json.dumps(print_orders))

    def test_print_orders_imports_completed_auto_callback_before_rendering_orders(self):
        conn = connect(self.db_path)
        try:
            repo = Repository(conn)
            cleaning_run = repo.save_call_runs(
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
            repo.save_run_result_bundle(
                cleaning_run.id,
                {
                    "status": "completed",
                    "needs": [
                        {
                            "category": "cleaning",
                            "items": ["flat cleaning"],
                            "urgency": "tomorrow",
                        }
                    ],
                },
            )
            callback = repo.create_callback_request(
                recipient_id="rec-001",
                source="siri_shortcut",
                request_text="Please call me back.",
                priority="urgent",
            )
            callback_run = repo.save_call_runs(
                plan_id=f"callback-{callback.id}",
                approval_id=callback.id,
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
            repo.attach_callback_auto_call(
                callback.id,
                run_id=callback_run.id,
                status="operator_review",
                resolution_note="Operator review was selected after the automatic callback had already started.",
            )
        finally:
            conn.close()

        callback_runner = FakeRunner(
            {
                ("calle", "get_call_run", "provider-run-filming-callback"): (
                    0,
                    json.dumps(
                        {
                            "status": "completed",
                            "summary": "Angela asked to add porridge, oat milk, and eggs for tomorrow.",
                            "needs": [
                                {
                                    "category": "groceries",
                                    "items": ["1 pack of porridge", "1 carton of oat milk", "1 pack of eggs"],
                                    "urgency": "tomorrow",
                                }
                            ],
                        }
                    ),
                    "",
                )
            }
        )

        print_orders = print_orders_api_payload(self.db_path, env={}, runner=callback_runner)["service_requests"]
        callback_queue = callback_requests_api_payload(self.db_path, runner=callback_runner)["callback_requests"]
        by_category = {request["category"]: request for request in print_orders if request["recipient_id"] == "rec-001"}

        self.assertEqual(by_category["cleaning"]["items"], ["flat cleaning"])
        self.assertEqual(
            by_category["groceries"]["items"],
            ["1 pack of porridge", "1 carton of oat milk", "1 pack of eggs"],
        )
        self.assertEqual(callback_queue[0]["status"], "auto_callback_completed")

    def test_same_day_repeat_call_requires_explicit_repeat_acknowledgement(self):
        call_date = date.today().isoformat()
        conn = connect(self.db_path)
        try:
            repo = Repository(conn)
            repo.save_call_runs(
                plan_id="plan-repeat-existing",
                approval_id="approval-repeat-existing",
                records=[
                    CallRunRecord(
                        recipient_id="rec-001",
                        idempotency_key="repeat-existing-key",
                        status=CallRunStatus.RUNNING,
                        masked_phone="+1******1001",
                    )
                ],
                mode="live",
            )
        finally:
            conn.close()

        batch = create_batch_api_payload(
            self.db_path,
            {"selected_recipient_ids": ["rec-001"], "call_date": call_date},
        )
        preflight = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        self.assertEqual(preflight["ready_previews"][0]["same_day_call_count"], 1)

        rejected = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"],
                "operator": "carecall-coordinator",
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
        self.assertIn("Same-day repeat call acknowledgement is required.", rejected["blocked_reasons"])

        approved = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"],
                "operator": "carecall-coordinator",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                    "same_day_repeat_acknowledged": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )
        self.assertTrue(approved["approved"])

    def test_operator_same_day_repeat_limit_blocks_third_operator_call(self):
        call_date = date.today().isoformat()
        conn = connect(self.db_path)
        try:
            repo = Repository(conn)
            repo.save_call_runs(
                plan_id="plan-repeat-existing",
                approval_id="approval-repeat-existing",
                records=[
                    CallRunRecord(
                        recipient_id="rec-001",
                        idempotency_key="repeat-existing-key-1",
                        status=CallRunStatus.RUNNING,
                        masked_phone="+1******1001",
                    ),
                    CallRunRecord(
                        recipient_id="rec-001",
                        idempotency_key="repeat-existing-key-2",
                        status=CallRunStatus.RUNNING,
                        masked_phone="+1******1001",
                    ),
                ],
                mode="live",
            )
        finally:
            conn.close()

        batch = create_batch_api_payload(
            self.db_path,
            {"selected_recipient_ids": ["rec-001"], "call_date": call_date},
        )
        preflight = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        rejected = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"],
                "operator": "carecall-coordinator",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                    "same_day_repeat_acknowledged": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )

        self.assertFalse(rejected["approved"])
        self.assertIn("Operator-initiated same-day repeat call limit", " ".join(rejected["blocked_reasons"]))

    def test_same_day_callback_requests_are_counted_separately_from_operator_repeat_limit(self):
        call_date = date.today().isoformat()
        conn = connect(self.db_path)
        try:
            repo = Repository(conn)
            for index in range(5):
                repo.create_callback_request(
                    recipient_id="rec-001",
                    source="siri",
                    request_text=f"Please call me back about groceries {index}.",
                    priority="urgent",
                    operator="",
                )
        finally:
            conn.close()

        batch = create_batch_api_payload(
            self.db_path,
            {"selected_recipient_ids": ["rec-001"], "call_date": call_date},
        )
        preflight = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        preview = preflight["ready_previews"][0]

        self.assertEqual(preview["same_day_call_count"], 0)
        self.assertFalse(preview["operator_repeat_limit_reached"])
        self.assertEqual(preview["same_day_callback_count"], 5)
        self.assertTrue(preview["callback_repeat_review_required"])
        self.assertIn("limited to 3 recipient-triggered calls per day", preview["callback_repeat_warning"])

    def test_repeat_call_import_merges_into_same_day_category_order(self):
        conn = connect(self.db_path)
        try:
            repo = Repository(conn)
            first_run = repo.save_call_runs(
                plan_id="plan-repeat-merge",
                approval_id="approval-repeat-merge",
                records=[
                    CallRunRecord(
                        recipient_id="rec-001",
                        idempotency_key="repeat-merge-key-1",
                        status=CallRunStatus.RUNNING,
                        plan_id="provider-plan-1",
                        run_id="provider-run-merge-1",
                        masked_phone="+1******1001",
                    )
                ],
                mode="live",
            )[0]
            second_run = repo.save_call_runs(
                plan_id="plan-repeat-merge",
                approval_id="approval-repeat-merge",
                records=[
                    CallRunRecord(
                        recipient_id="rec-001",
                        idempotency_key="repeat-merge-key-2",
                        status=CallRunStatus.RUNNING,
                        plan_id="provider-plan-2",
                        run_id="provider-run-merge-2",
                        masked_phone="+1******1001",
                    )
                ],
                mode="live",
            )[0]
        finally:
            conn.close()

        runner = FakeRunner(
            {
                ("calle", "get_call_run", "provider-run-merge-1"): (
                    0,
                    json.dumps(
                        {
                            "status": "completed",
                            "summary": "Alex asked for milk.",
                            "needs": [
                                {
                                    "category": "groceries",
                                    "items": ["milk"],
                                    "urgency": "tomorrow",
                                    "notes": "First call.",
                                }
                            ],
                        }
                    ),
                    "",
                ),
                ("calle", "get_call_run", "provider-run-merge-2"): (
                    0,
                    json.dumps(
                        {
                            "status": "completed",
                            "summary": "Alex added bread.",
                            "needs": [
                                {
                                    "category": "groceries",
                                    "items": ["bread"],
                                    "urgency": "today",
                                    "notes": "Repeat call update.",
                                }
                            ],
                        }
                    ),
                    "",
                ),
            }
        )

        first = import_run_result_api_payload(self.db_path, first_run.id, runner=runner)
        second = import_run_result_api_payload(self.db_path, second_run.id, runner=runner)
        requests = service_requests_api_payload(self.db_path)["service_requests"]
        merged = [
            request
            for request in requests
            if request["id"].startswith("svc-run-")
            and request["recipient_id"] == "rec-001"
            and request["category"] == "groceries"
            and "milk" in request["items"]
        ]

        self.assertEqual(first["service_requests"][0]["id"], second["service_requests"][0]["id"])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["items"], ["milk", "bread"])
        self.assertEqual(merged[0]["priority"], "urgent")
        self.assertEqual(merged[0]["update_count"], 1)
        self.assertEqual([entry["event"] for entry in merged[0]["update_history"]], ["created", "updated"])

        imported_again = import_run_result_api_payload(self.db_path, second_run.id, runner=runner)
        self.assertEqual(imported_again["service_requests"][0]["update_count"], 1)

    def test_cancelled_run_does_not_import_or_create_orders(self):
        conn = connect(self.db_path)
        try:
            repo = Repository(conn)
            run = repo.save_call_runs(
                plan_id="plan-cancel",
                approval_id="approval-cancel",
                records=[
                    CallRunRecord(
                        recipient_id="rec-001",
                        idempotency_key="cancel-key",
                        status=CallRunStatus.RUNNING,
                        plan_id="provider-plan-cancel",
                        run_id="provider-run-cancel",
                        masked_phone="+1******1001",
                    )
                ],
                mode="live",
            )[0]
        finally:
            conn.close()

        canceled = cancel_run_api_payload(
            self.db_path,
            run.id,
            {"reason": "Operator stopped the active session after noticing a card error."},
        )
        runner = FakeRunner(
            {
                ("calle", "get_call_run", "provider-run-cancel"): (
                    0,
                    '{"status":"completed","summary":"Alex asked for milk.","needs":[{"category":"groceries","items":["milk"],"urgency":"tomorrow"}]}',
                    "",
                )
            }
        )
        imported = import_run_result_api_payload(self.db_path, run.id, runner=runner)
        requests = service_requests_api_payload(self.db_path)["service_requests"]

        self.assertTrue(canceled["canceled"])
        self.assertEqual(canceled["run"]["status"], "canceled")
        self.assertIn("Operator stopped", canceled["run"]["error"])
        self.assertFalse(imported["imported"])
        self.assertEqual(imported["provider_status"], "canceled")
        self.assertEqual(runner.commands, [])
        self.assertFalse(any(request["id"].startswith(f"svc-{run.id}-") for request in requests))

    def test_import_extracts_developer_api_recipient_structured_result(self):
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
                "note": "Developer API nested result test.",
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
                ("calle", "run_call", "plan-123"): (0, '{"run_id":"provider-run-nested"}', ""),
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
        result_runner = FakeRunner(
            {
                ("calle", "get_call_run", "provider-run-nested"): (
                    0,
                    json.dumps(
                        {
                            "id": "provider-run-nested",
                            "status": "completed",
                            "recipient_results": [
                                {
                                    "structured_result": {
                                        "summary": "Sofiia asked for bread and milk.",
                                        "needs": [
                                            {
                                                "category": "groceries",
                                                "items": ["bread", "milk"],
                                                "urgency": "tomorrow",
                                            }
                                        ],
                                    }
                                }
                            ],
                        }
                    ),
                    "",
                )
            }
        )

        imported = import_run_result_api_payload(self.db_path, live["records"][0]["id"], runner=result_runner)

        self.assertTrue(imported["imported"])
        self.assertEqual(imported["service_requests"][0]["status"], "ready_to_print")
        self.assertEqual(imported["service_requests"][0]["items"], ["bread", "milk"])

    def test_failed_provider_import_marks_run_failed_and_routes_review_only(self):
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
                "note": "Failed provider import test.",
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
                ("calle", "run_call", "plan-123"): (0, '{"run_id":"provider-run-failed"}', ""),
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
                ("calle", "get_call_run", "provider-run-failed"): (
                    0,
                    '{"id":"provider-run-failed","status":"failed"}',
                    "",
                )
            }
        )

        imported = import_run_result_api_payload(self.db_path, stored_run_id, runner=result_runner)
        status = run_status_api_payload(self.db_path, stored_run_id)

        self.assertTrue(imported["imported"])
        self.assertEqual(imported["provider_status"], "failed")
        self.assertEqual(status["run"]["status"], "failed")
        self.assertEqual(imported["service_requests"][0]["status"], "review")

    def test_live_execution_rejects_when_provider_returns_failed_record(self):
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
                "note": "Provider failure test.",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )
        live_runner = FakeRunner({("calle", "plan_call"): (1, "", "HTTP Error 401: Unauthorized")})

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

        self.assertFalse(live["accepted"])
        self.assertEqual(live["real_calls_placed"], 0)
        self.assertEqual(live["records"][0]["status"], "failed")
        self.assertIn("401", " ".join(live["blocked_reasons"]))


if __name__ == "__main__":
    unittest.main()
