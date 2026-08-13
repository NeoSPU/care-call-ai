import subprocess
import unittest
import json

from app.approval import OperatorApproval
from app.call_planning import build_call_plan_previews
from app.calle_execution import CallRunStatus, execute_approved_previews, fetch_call_result
from app.calle_readiness import CalleReadiness
from app.domain import (
    CallSuitability,
    CareProfile,
    Condition,
    Consent,
    ConsentStatus,
    Recipient,
    Severity,
)


def recipient(**overrides):
    data = {
        "id": "r-1",
        "display_name": "Test Recipient",
        "phone_e164": "+15550101234",
        "caregiver_phone_e164": "+15550109999",
        "consent": Consent(ConsentStatus.EXPLICIT_CONSENT, "Signed consent form"),
        "care_profile": CareProfile(
            Condition.GENERAL,
            Severity.MILD,
            "en",
            "Europe/London",
            CallSuitability.DIRECT_CALL_OK,
        ),
    }
    data.update(overrides)
    return Recipient(**data)


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


def approval_for(previews):
    return OperatorApproval(
        approved_keys=tuple(preview.idempotency_key for preview in previews if preview.ready),
        approver="Coordinator",
        approved_at="2026-08-01T10:00:00Z",
    )


class CalleExecutionTest(unittest.TestCase):
    def test_unapproved_batch_does_not_call_runner(self):
        previews = build_call_plan_previews([recipient()], "2026-08-01")
        runner = FakeRunner({})
        batch = execute_approved_previews(previews, None, ready(), runner)
        self.assertFalse(batch.success)
        self.assertEqual(runner.commands, [])

    def test_readiness_failure_does_not_call_runner(self):
        previews = build_call_plan_previews([recipient()], "2026-08-01")
        runner = FakeRunner({})
        readiness = CalleReadiness(cli_available=False, authenticated=False, tools_available=False)
        batch = execute_approved_previews(previews, approval_for(previews), readiness, runner)
        self.assertFalse(batch.success)
        self.assertEqual(runner.commands, [])

    def test_blocked_preview_does_not_call_runner(self):
        previews = build_call_plan_previews(
            [
                recipient(
                    care_profile=CareProfile(
                        Condition.DEMENTIA,
                        Severity.SEVERE,
                        "en",
                        "Europe/London",
                        CallSuitability.DO_NOT_CALL,
                    )
                )
            ],
            "2026-08-01",
        )
        runner = FakeRunner({})
        batch = execute_approved_previews(previews, approval_for(previews), ready(), runner)
        self.assertFalse(batch.success)
        self.assertEqual(runner.commands, [])

    def test_executes_plan_and_run_with_fake_runner(self):
        previews = build_call_plan_previews([recipient()], "2026-08-01")
        runner = FakeRunner(
            {
                ("calle", "plan_call"): (0, '{"plan_id":"plan-123"}', ""),
                ("calle", "run_call", "plan-123"): (0, '{"run_id":"run-456"}', ""),
            }
        )
        batch = execute_approved_previews(previews, approval_for(previews), ready(), runner)
        self.assertTrue(batch.success)
        self.assertEqual(batch.records[0].status, CallRunStatus.RUNNING)
        self.assertEqual(batch.records[0].plan_id, "plan-123")
        self.assertEqual(batch.records[0].run_id, "run-456")
        self.assertEqual(runner.commands[0][0:2], ("calle", "plan_call"))
        self.assertEqual(json.loads(runner.commands[0][2])["to_phone"], "+15550101234")
        self.assertEqual(runner.commands[1], ("calle", "run_call", "plan-123"))

    def test_fetch_call_result_parses_json(self):
        runner = FakeRunner({("calle", "get_call_run", "run-456"): (0, '{"status":"completed"}', "")})
        self.assertEqual(fetch_call_result("run-456", runner), {"status": "completed"})


if __name__ == "__main__":
    unittest.main()
