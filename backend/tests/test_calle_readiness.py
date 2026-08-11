import subprocess
import unittest

from app.calle_readiness import SAFE_CALLE_ENV, check_calle_readiness


class FakeRunner:
    def __init__(self, responses):
        self.responses = responses
        self.commands = []

    def __call__(self, command, env):
        self.commands.append(command)
        self.last_env = env
        response = self.responses[command]
        return subprocess.CompletedProcess(command, response[0], response[1], response[2])


class CalleReadinessTest(unittest.TestCase):
    def test_ready_when_cli_auth_and_tools_exist(self):
        runner = FakeRunner(
            {
                ("calle", "--help"): (0, "CALL-E help", ""),
                ("calle", "auth", "status"): (0, "logged in", ""),
                ("calle", "mcp", "tools"): (0, "plan_call\nrun_call\nget_call_run", ""),
            }
        )
        readiness = check_calle_readiness(runner)
        self.assertTrue(readiness.ready)
        self.assertEqual(readiness.missing_tools, ())
        self.assertEqual(runner.last_env, SAFE_CALLE_ENV)

    def test_missing_required_tool_blocks_readiness(self):
        runner = FakeRunner(
            {
                ("calle", "--help"): (0, "CALL-E help", ""),
                ("calle", "auth", "status"): (0, "logged in", ""),
                ("calle", "mcp", "tools"): (0, "plan_call\nget_call_run", ""),
            }
        )
        readiness = check_calle_readiness(runner)
        self.assertFalse(readiness.ready)
        self.assertEqual(readiness.missing_tools, ("run_call",))

    def test_auth_failure_blocks_readiness(self):
        runner = FakeRunner(
            {
                ("calle", "--help"): (0, "CALL-E help", ""),
                ("calle", "auth", "status"): (1, "", "not logged in"),
                ("calle", "mcp", "tools"): (0, "plan_call\nrun_call\nget_call_run", ""),
            }
        )
        readiness = check_calle_readiness(runner)
        self.assertFalse(readiness.ready)
        self.assertFalse(readiness.authenticated)

    def test_never_runs_call_execution_command(self):
        runner = FakeRunner(
            {
                ("calle", "--help"): (0, "CALL-E help", ""),
                ("calle", "auth", "status"): (0, "logged in", ""),
                ("calle", "mcp", "tools"): (0, "plan_call\nrun_call\nget_call_run", ""),
            }
        )
        check_calle_readiness(runner)
        self.assertNotIn(("calle", "run_call"), runner.commands)


if __name__ == "__main__":
    unittest.main()
