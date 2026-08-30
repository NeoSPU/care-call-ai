import json
import unittest
from io import BytesIO

from scripts import judge_path_smoke


class FakeHeaders(dict):
    def get(self, key, default=None):
        return super().get(key, default)


class FakeResponse:
    def __init__(self, status: int, content_type: str, payload: str):
        self.status = status
        self.headers = FakeHeaders({"Content-Type": content_type})
        self.payload = payload.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _tb):
        return False

    def read(self):
        return BytesIO(self.payload).read()


class FakeOpener:
    def __init__(self):
        self.requests = []

    def open(self, request, timeout=20):
        self.requests.append((request, timeout))
        url = request.full_url
        if url.endswith("/api/carecall/api/dashboard"):
            return FakeResponse(200, "application/json", json.dumps({"summary": {"recipients": 6}}))
        if url.endswith("/api/carecall/api/orders/print"):
            return FakeResponse(200, "application/json", json.dumps({"service_requests": []}))
        if url.endswith("/login") or url.endswith("/dashboard"):
            return FakeResponse(200, "text/html; charset=utf-8", "<html></html>")
        if url.endswith("/api/auth/login"):
            return FakeResponse(200, "text/html; charset=utf-8", "<html>dashboard</html>")
        return FakeResponse(404, "application/json", "{}")


class JudgePathSmokeTests(unittest.TestCase):
    def test_require_env_reports_missing_operator_credentials_without_values(self):
        results = judge_path_smoke.require_env({})

        self.assertIn("CARECALL_OPERATOR_USERNAME is missing", results[0].message)
        self.assertIn("frontend/.env.local", results[0].message)
        self.assertIn("CARECALL_OPERATOR_PASSWORD is missing", results[1].message)
        self.assertIn("frontend/.env.production.local", results[1].message)
        self.assertTrue(all(not result.ok for result in results))

    def test_login_posts_operator_credentials_to_login_route(self):
        opener = FakeOpener()

        result = judge_path_smoke.login(
            opener,
            "https://care.example.test",
            {"CARECALL_OPERATOR_USERNAME": "operator", "CARECALL_OPERATOR_PASSWORD": "secret"},
            10,
        )

        request, timeout = opener.requests[0]
        body = request.data.decode("utf-8")
        self.assertTrue(result.ok)
        self.assertEqual(10, timeout)
        self.assertEqual("https://care.example.test/api/auth/login", request.full_url)
        self.assertIn("username=operator", body)
        self.assertIn("password=secret", body)
        self.assertIn("next=%2Fdashboard", body)

    def test_dashboard_proxy_checks_dashboard_and_print_order_payload_shape(self):
        results = judge_path_smoke.check_dashboard_proxy(FakeOpener(), "https://care.example.test", 10)

        self.assertTrue(all(result.ok for result in results))
        self.assertEqual(
            [
                "frontend proxy returns dashboard JSON 200",
                "dashboard JSON contains recipient summary",
                "frontend proxy returns print-orders JSON 200",
                "print-orders JSON contains service_requests list",
            ],
            [result.message for result in results],
        )


if __name__ == "__main__":
    unittest.main()
