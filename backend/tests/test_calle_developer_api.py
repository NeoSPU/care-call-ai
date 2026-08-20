import json
import unittest
from unittest.mock import patch

from app.calle_developer_api import DeveloperApiRunner, DeveloperApiSettings


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


class DeveloperApiRunnerTests(unittest.TestCase):
    def test_plan_and_run_create_call_with_dashboard_api_key(self):
        requests = []

        def fake_urlopen(request, timeout):
            requests.append(request)
            self.assertEqual(timeout, 45)
            body = json.loads(request.data.decode("utf-8"))
            self.assertEqual(body["task"], "Ask Alex what groceries are needed tomorrow.")
            self.assertEqual(body["recipients"][0]["phones"], ["+447700900123"])
            self.assertEqual(body["recipients"][0]["region"], "GB")
            self.assertEqual(body["recipients"][0]["locale"], "en-GB")
            self.assertEqual(body["metadata"]["recipient_id"], "rec-demo-max")
            return FakeResponse({"id": "call-123", "status": "queued"})

        runner = DeveloperApiRunner(
            DeveloperApiSettings(
                api_key="calle_live_key_test",
                base_url="https://api.heycall-e.com",
                region="GB",
                timeout_seconds=45,
            )
        )

        with patch("urllib.request.urlopen", fake_urlopen):
            plan = runner(
                (
                    "calle",
                    "plan_call",
                    json.dumps(
                        {
                            "idempotency_key": "carecall-key-1",
                            "recipient_id": "rec-demo-max",
                            "to_phone": "+447700900123",
                            "goal": "Ask Alex what groceries are needed tomorrow.",
                            "language": "en",
                        }
                    ),
                ),
                {},
            )
            run = runner(("calle", "run_call", "carecall-key-1"), {})

        self.assertEqual(plan.returncode, 0)
        self.assertEqual(json.loads(plan.stdout)["plan_id"], "carecall-key-1")
        self.assertEqual(run.returncode, 0)
        self.assertEqual(json.loads(run.stdout)["run_id"], "call-123")
        self.assertEqual(requests[0].full_url, "https://api.heycall-e.com/v1/calls")
        self.assertEqual(requests[0].headers["Authorization"], "Bearer calle_live_key_test")
        self.assertEqual(requests[0].headers["Idempotency-key"], "carecall-key-1")

    def test_get_call_result_reads_call_status(self):
        requests = []

        def fake_urlopen(request, timeout):
            requests.append(request)
            return FakeResponse({"id": "call-123", "status": "completed", "structured_result": {"completed_count": 1}})

        runner = DeveloperApiRunner(DeveloperApiSettings(api_key="calle_live_key_test"))
        with patch("urllib.request.urlopen", fake_urlopen):
            result = runner(("calle", "get_call_run", "call-123"), {})

        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["status"], "completed")
        self.assertEqual(requests[0].full_url, "https://api.heycall-e.com/v1/calls/call-123")
        self.assertEqual(requests[0].headers["Authorization"], "Bearer calle_live_key_test")

    def test_missing_api_key_blocks_runner(self):
        runner = DeveloperApiRunner(DeveloperApiSettings(api_key=""))
        result = runner(("calle", "plan_call", "{}"), {})

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Developer API settings", result.stderr)


if __name__ == "__main__":
    unittest.main()
