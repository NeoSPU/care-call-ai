import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from app.call_result_import import import_call_result
from app.calle_execution import CallRunRecord, CallRunStatus
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


class CallResultImportTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.conn = connect(Path(self.tmpdir.name) / "carecall.sqlite3")
        init_schema(self.conn)
        self.repo = Repository(self.conn)
        seed_database(self.repo, load_seed_recipients())

    def tearDown(self):
        self.conn.close()
        self.tmpdir.cleanup()

    def _save_running_call(self, provider_run_id: str = "provider-run-1"):
        return self.repo.save_call_runs(
            "plan-1",
            "approval-1",
            (
                CallRunRecord(
                    "rec-001",
                    "key-1",
                    CallRunStatus.RUNNING,
                    plan_id="provider-plan-1",
                    run_id=provider_run_id,
                    masked_phone="+4*******1263",
                ),
            ),
            mode="live",
        )[0]

    def test_imports_terminal_completed_result_and_creates_service_request(self):
        run = self._save_running_call()
        runner = FakeRunner(
            {
                ("calle", "get_call_run", "provider-run-1"): (
                    0,
                    json.dumps(
                        {
                            "status": "completed",
                            "summary": "Alex asked for one package of bread for tomorrow.",
                            "needs": [
                                {
                                    "category": "groceries",
                                    "items": ["1 package of bread"],
                                    "urgency": "tomorrow",
                                }
                            ],
                        }
                    ),
                    "",
                )
            }
        )

        imported = import_call_result(self.repo, run.id, runner=runner)

        self.assertTrue(imported["imported"])
        self.assertEqual(imported["provider_status"], "completed")
        self.assertEqual(imported["service_requests"][0]["items"], ["1 package of bread"])

    def test_non_terminal_result_is_not_imported_and_logs_status(self):
        run = self._save_running_call()
        runner = FakeRunner({("calle", "get_call_run", "provider-run-1"): (0, '{"status":"running"}', "")})
        events = []

        imported = import_call_result(self.repo, run.id, runner=runner, log_event=lambda event, **fields: events.append((event, fields)))

        self.assertFalse(imported["imported"])
        self.assertEqual(imported["provider_status"], "running")
        self.assertEqual(events[0][0], "call_result_not_terminal")

    def test_canceled_run_is_not_imported(self):
        run = self._save_running_call()
        canceled = self.repo.cancel_call_run(run.id, reason="Operator stopped the session.")

        imported = import_call_result(self.repo, canceled.id, runner=FakeRunner({}))

        self.assertFalse(imported["imported"])
        self.assertEqual(imported["provider_status"], "canceled")


if __name__ == "__main__":
    unittest.main()
