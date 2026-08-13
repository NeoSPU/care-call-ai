import json
import unittest
from unittest.mock import patch

from app.calle_mcp_http import McpHttpRunner, McpHttpSettings


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")
        self.headers = {}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return self.payload


class CalleMcpHttpRunnerTests(unittest.TestCase):
    def test_plan_and_run_call_through_mcp_tools(self):
        requests = []

        def fake_urlopen(request, timeout):
            body = json.loads(request.data.decode("utf-8"))
            requests.append(
                {
                    "authorization": request.headers.get("Authorization"),
                    "method": body["method"],
                    "params": body["params"],
                    "timeout": timeout,
                }
            )
            if body["method"] == "initialize":
                return FakeResponse({"jsonrpc": "2.0", "id": body["id"], "result": {"protocolVersion": "2025-06-18"}})
            if body["method"] == "notifications/initialized":
                return FakeResponse({})
            tool = body["params"].get("name")
            if tool == "plan_call":
                return FakeResponse({"jsonrpc": "2.0", "id": body["id"], "result": {"structuredContent": {"plan_id": "plan-123", "confirm_token": "confirm-123"}}})
            if tool == "run_call":
                return FakeResponse({"jsonrpc": "2.0", "id": body["id"], "result": {"structuredContent": {"run_id": "run-456"}}})
            return FakeResponse({"jsonrpc": "2.0", "id": body["id"], "result": {"structuredContent": {"status": "completed"}}})

        runner = McpHttpRunner(
            McpHttpSettings(
                server_url="https://call-e.example/mcp/openagent_oauth",
                auth_token="secret-token",
                region="GB",
                timeout_seconds=12,
            )
        )

        with patch("urllib.request.urlopen", fake_urlopen):
            plan = runner(
                (
                    "calle",
                    "plan_call",
                    json.dumps(
                        {
                            "to_phone": "+447700900123",
                            "goal": "Ask about groceries.",
                            "language": "en",
                            "timezone": "Europe/London",
                            "idempotency_key": "key-123",
                            "recipient_id": "rec-001",
                            "route": "recipient",
                        }
                    ),
                ),
                {},
            )
            run = runner(("calle", "run_call", "plan-123"), {})
            status = runner(("calle", "get_call_run", "run-456"), {})

        self.assertEqual(plan.returncode, 0)
        self.assertEqual(json.loads(plan.stdout), {"plan_id": "plan-123", "confirm_token": "confirm-123"})
        self.assertEqual(json.loads(run.stdout), {"run_id": "run-456"})
        self.assertEqual(json.loads(status.stdout), {"status": "completed"})
        plan_request = next(request for request in requests if request["params"].get("name") == "plan_call")
        self.assertEqual(requests[0]["authorization"], "Bearer secret-token")
        self.assertEqual(requests[0]["timeout"], 12)
        self.assertEqual(requests[0]["method"], "initialize")
        self.assertEqual(plan_request["method"], "tools/call")
        self.assertEqual(plan_request["params"]["arguments"]["to_phones"], ["+447700900123"])
        self.assertEqual(plan_request["params"]["arguments"]["goal"], "Ask about groceries.")
        self.assertEqual(plan_request["params"]["arguments"]["user_input"], "Call +447700900123. Ask about groceries.")
        self.assertNotIn("metadata", plan_request["params"]["arguments"])

    def test_run_call_sends_confirm_token_when_supplied(self):
        requests = []

        def fake_urlopen(request, timeout):
            body = json.loads(request.data.decode("utf-8"))
            requests.append(body)
            if body["method"] == "initialize":
                return FakeResponse({"jsonrpc": "2.0", "id": body["id"], "result": {"protocolVersion": "2025-06-18"}})
            if body["method"] == "notifications/initialized":
                return FakeResponse({})
            return FakeResponse({"jsonrpc": "2.0", "id": body["id"], "result": {"structuredContent": {"run_id": "run-456"}}})

        runner = McpHttpRunner(
            McpHttpSettings(
                server_url="https://call-e.example/mcp/openagent_oauth",
                auth_token="secret-token",
            )
        )

        with patch("urllib.request.urlopen", fake_urlopen):
            run = runner(("calle", "run_call", "plan-123", "confirm-123"), {})

        self.assertEqual(run.returncode, 0)
        run_request = next(request for request in requests if request["params"].get("name") == "run_call")
        self.assertEqual(
            run_request["params"]["arguments"],
            {"plan_id": "plan-123", "confirm_token": "confirm-123"},
        )


if __name__ == "__main__":
    unittest.main()
