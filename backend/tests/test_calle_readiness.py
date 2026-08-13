import os
import subprocess
import unittest
from unittest.mock import patch

from app.calle_readiness import SAFE_CALLE_ENV, check_calle_readiness, check_configured_provider_readiness


class FakeResponse:
    def __init__(self, payload):
        self.payload = __import__("json").dumps(payload).encode("utf-8")
        self.headers = {}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return self.payload


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

    def test_mcp_http_provider_uses_server_side_token_configuration(self):
        env = {
            "CARECALL_CALLE_PROVIDER": "mcp_http",
            "CARECALL_CALLE_MCP_SERVER_URL": "https://call-e.example/mcp/openagent_oauth",
            "CARECALL_CALLE_AUTH_TOKEN": "secret-token",
        }
        runner = FakeRunner({("calle", "mcp", "tools"): (0, "plan_call\nrun_call\nget_call_run", "")})
        readiness = check_configured_provider_readiness(env, runner)
        self.assertTrue(readiness.ready)
        self.assertNotIn("secret-token", readiness.checks[0].output)

    def test_default_readiness_switches_to_mcp_http_provider_when_configured(self):
        env = {
            **os.environ,
            "CARECALL_CALLE_PROVIDER": "mcp_http",
            "CARECALL_CALLE_MCP_SERVER_URL": "https://call-e.example/mcp/openagent_oauth",
            "CARECALL_CALLE_AUTH_TOKEN": "secret-token",
        }
        def fake_urlopen(request, timeout):
            body = __import__("json").loads(request.data.decode("utf-8"))
            if body["method"] == "initialize":
                return FakeResponse({"jsonrpc": "2.0", "id": body["id"], "result": {"protocolVersion": "2025-06-18"}})
            if body["method"] == "notifications/initialized":
                return FakeResponse({})
            return FakeResponse(
                {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {"tools": [{"name": "plan_call"}, {"name": "run_call"}, {"name": "get_call_run"}]},
                }
            )

        with patch.dict(os.environ, env, clear=True), patch("urllib.request.urlopen", fake_urlopen):
            readiness = check_calle_readiness()

        self.assertTrue(readiness.ready)
        self.assertEqual(readiness.checks[0].name, "mcp_http_tools")


if __name__ == "__main__":
    unittest.main()
