import subprocess
import tempfile
import unittest
from pathlib import Path

from app.calle_readiness import CalleReadiness
from app.repository import Repository, connect, init_schema, seed_database
from app.server import (
    approve_preflight_api_payload,
    create_batch_api_payload,
    create_preflight_api_payload,
    execute_live_api_payload,
)
from app.storage import load_seed_recipients


class FakeRunner:
    def __init__(self):
        self.commands = []

    def __call__(self, command, env):
        self.commands.append(command)
        if command[0:2] == ("calle", "plan_call"):
            return subprocess.CompletedProcess(command, 0, '{"plan_id":"plan-123"}', "")
        if command[0:2] == ("calle", "run_call"):
            return subprocess.CompletedProcess(command, 0, '{"run_id":"run-456"}', "")
        return subprocess.CompletedProcess(command, 0, "{}", "")


class LiveExecutionGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "carecall.sqlite3"
        conn = connect(self.db_path)
        init_schema(conn)
        seed_database(Repository(conn), load_seed_recipients())
        conn.close()

    def tearDown(self):
        self.tmpdir.cleanup()

    def _approved_plan(self, selected=("rec-001",)):
        batch = create_batch_api_payload(
            self.db_path,
            {"selected_recipient_ids": list(selected), "call_date": "2026-08-01"},
        )
        preflight = create_preflight_api_payload(self.db_path, {"batch_id": batch["batch"]["id"]})
        approval = approve_preflight_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approved_keys": preflight["ready_keys"],
                "operator": "carecall-coordinator",
                "note": "Exact live gate reviewed.",
                "confirmations": {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                },
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
        )
        return preflight, approval

    def test_live_rejects_without_env_flag_readiness_confirmations_phrase_and_exact_keyset(self):
        preflight, approval = self._approved_plan()
        runner = FakeRunner()

        attempts = [
            (
                {"CARECALL_LIVE_CALLS_ENABLED": "false"},
                {"confirmations": _confirmations(), "authorization_phrase": "EXECUTE LIVE CALLS"},
                CalleReadiness(True, True, True),
                "live calls are disabled",
            ),
            (
                {"CARECALL_LIVE_CALLS_ENABLED": "true"},
                {"confirmations": _confirmations(), "authorization_phrase": "EXECUTE LIVE CALLS"},
                CalleReadiness(False, True, True),
                "readiness",
            ),
            (
                {"CARECALL_LIVE_CALLS_ENABLED": "true"},
                {
                    "confirmations": {**_confirmations(), "real_side_effects": False},
                    "authorization_phrase": "EXECUTE LIVE CALLS",
                },
                CalleReadiness(True, True, True),
                "four confirmations",
            ),
            (
                {"CARECALL_LIVE_CALLS_ENABLED": "true"},
                {"confirmations": _confirmations(), "authorization_phrase": "EXECUTE CALLS"},
                CalleReadiness(True, True, True),
                "authorization phrase",
            ),
            (
                {"CARECALL_LIVE_CALLS_ENABLED": "true"},
                {
                    "confirmations": _confirmations(),
                    "authorization_phrase": "EXECUTE LIVE CALLS",
                    "approved_keys": preflight["ready_keys"] + ["stale-key"],
                },
                CalleReadiness(True, True, True),
                "exact keyset",
            ),
        ]

        for env, payload, readiness, expected_reason in attempts:
            with self.subTest(expected_reason=expected_reason):
                response = execute_live_api_payload(
                    self.db_path,
                    {
                        "plan_id": preflight["plan_id"],
                        "approval_id": approval["approval"]["id"],
                        **payload,
                    },
                    env=env,
                    readiness=readiness,
                    runner=runner,
                )
                self.assertFalse(response["accepted"])
                self.assertIn(expected_reason, " ".join(response["blocked_reasons"]).lower())

        self.assertEqual(runner.commands, [])

    def test_live_rejects_stale_approval_and_batch_size_above_default_one(self):
        preflight, approval = self._approved_plan(("rec-001", "rec-005"))
        runner = FakeRunner()

        too_large = execute_live_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approval_id": approval["approval"]["id"],
                "confirmations": _confirmations(),
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
            env={"CARECALL_LIVE_CALLS_ENABLED": "true"},
            readiness=CalleReadiness(True, True, True),
            runner=runner,
        )
        self.assertFalse(too_large["accepted"])
        self.assertIn("batch size", " ".join(too_large["blocked_reasons"]).lower())

        Repository(connect(self.db_path)).update_safety_category(
            "rec-001",
            safety_category=__import__("app.domain", fromlist=["SafetyCategory"]).SafetyCategory.NON_CRITICAL,
            reason="Risk recertified after approval.",
        )
        stale = execute_live_api_payload(
            self.db_path,
            {
                "plan_id": preflight["plan_id"],
                "approval_id": approval["approval"]["id"],
                "confirmations": _confirmations(),
                "authorization_phrase": "EXECUTE LIVE CALLS",
            },
            env={"CARECALL_LIVE_CALLS_ENABLED": "true", "CARECALL_MAX_LIVE_BATCH_SIZE": "3"},
            readiness=CalleReadiness(True, True, True),
            runner=runner,
        )
        self.assertFalse(stale["accepted"])
        self.assertIn("stale", " ".join(stale["blocked_reasons"]).lower())
        self.assertEqual(runner.commands, [])


def _confirmations():
    return {
        "active_consent": True,
        "care_route_match": True,
        "exact_keyset": True,
        "real_side_effects": True,
    }


if __name__ == "__main__":
    unittest.main()
