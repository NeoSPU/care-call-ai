import subprocess
import tempfile
import unittest
from pathlib import Path

from app.calle_readiness import CalleReadiness
from app.callback_workflow import attempt_immediate_callback, max_auto_callback_calls_per_day
from app.repository import Repository, connect, init_schema, seed_database
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


class CallbackWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "carecall.sqlite3"
        self.conn = connect(self.db_path)
        init_schema(self.conn)
        self.repo = Repository(self.conn)
        seed_database(self.repo, load_seed_recipients())

    def tearDown(self):
        self.conn.close()
        self.tmpdir.cleanup()

    def test_operator_created_callback_waits_for_operator_without_dialing(self):
        request = self.repo.create_callback_request(
            recipient_id="rec-001",
            source="operator_created",
            request_text="Coordinator wants to review this first.",
            priority="urgent",
            operator="Max Neous",
        )
        runner = FakeRunner({})

        result = attempt_immediate_callback(
            self.repo,
            request,
            {"CARECALL_LIVE_CALLS_ENABLED": "true"},
            ready(),
            runner,
        )

        self.assertEqual(result["status"], "operator_review")
        self.assertEqual(runner.commands, [])

    def test_recipient_callback_starts_live_call_when_eligible(self):
        request = self.repo.create_callback_request(
            recipient_id="rec-001",
            source="siri_shortcut",
            request_text="Please call me back.",
            priority="urgent",
            operator="",
        )
        runner = FakeRunner(
            {
                ("calle", "plan_call"): (0, '{"plan_id":"callback-plan-123"}', ""),
                ("calle", "run_call", "callback-plan-123"): (0, '{"run_id":"callback-run-456"}', ""),
            }
        )

        result = attempt_immediate_callback(
            self.repo,
            request,
            {"CARECALL_LIVE_CALLS_ENABLED": "true", "CARECALL_MAX_AUTO_CALLBACK_CALLS_PER_DAY": "3"},
            ready(),
            runner,
        )

        updated = self.repo.get_callback_request(request.id)
        self.assertEqual(result["status"], "auto_callback_started")
        self.assertEqual(result["real_calls_placed"], 1)
        self.assertEqual(updated.status, "auto_callback_started")
        self.assertTrue(updated.auto_run_id.startswith("run-"))

    def test_invalid_callback_limit_falls_back_to_default(self):
        self.assertEqual(max_auto_callback_calls_per_day({"CARECALL_MAX_AUTO_CALLBACK_CALLS_PER_DAY": "not-a-number"}), 3)

    def test_callback_limit_can_be_raised_for_one_test_recipient(self):
        env = {
            "CARECALL_MAX_AUTO_CALLBACK_CALLS_PER_DAY": "3",
            "CARECALL_RECIPIENT_CALLBACK_CALL_LIMIT_OVERRIDES": "rec-001=5",
        }

        self.assertEqual(max_auto_callback_calls_per_day(env, "rec-001"), 5)
        self.assertEqual(max_auto_callback_calls_per_day(env, "rec-002"), 3)


if __name__ == "__main__":
    unittest.main()
