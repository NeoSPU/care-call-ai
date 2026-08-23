import io
import urllib.error
import unittest
from unittest.mock import patch

from app.calle_key_diagnostics import diagnose_key


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return b"{}"


def env(credential_value="test-api-key"):
    return {
        "CARECALL_CALLE_PROVIDER": "api",
        "CARECALL_CALLE_API_BASE_URL": "https://api.heycall-e.com",
        "CARECALL_CALLE_API_KEY": credential_value,
        "CARECALL_CALLE_REGION": "GB",
        "CARECALL_CALLE_TIMEOUT_SECONDS": "45",
    }


class CalleKeyDiagnosticsTests(unittest.TestCase):
    def test_reports_key_fingerprint_without_key_value(self):
        diagnostic = diagnose_key(env(credential_value="sample-value"), probe=False)

        self.assertEqual(diagnostic.provider, "api")
        self.assertTrue(diagnostic.key_present)
        self.assertEqual(diagnostic.key_length, len("sample-value"))
        self.assertEqual(len(diagnostic.key_sha256_12), 12)
        self.assertNotEqual(diagnostic.key_sha256_12, "sample-value")
        self.assertFalse(diagnostic.probe_ran)

    def test_404_probe_means_key_was_accepted_and_call_was_not_found(self):
        def fake_urlopen(request, timeout):
            self.assertEqual(timeout, 45)
            self.assertEqual(request.headers["Authorization"], "Bearer test-api-key")
            raise urllib.error.HTTPError(
                request.full_url,
                404,
                "Not Found",
                {},
                io.BytesIO(b'{"error":{"code":"not_found"}}'),
            )

        with patch("urllib.request.urlopen", fake_urlopen):
            diagnostic = diagnose_key(env(), probe=True)

        self.assertTrue(diagnostic.probe_ran)
        self.assertTrue(diagnostic.probe_authenticated)
        self.assertEqual(diagnostic.probe_http_status, 404)
        self.assertEqual(diagnostic.probe_result, "authenticated_not_found_expected")

    def test_401_probe_means_key_failed_authentication(self):
        def fake_urlopen(request, timeout):
            raise urllib.error.HTTPError(
                request.full_url,
                401,
                "Unauthorized",
                {},
                io.BytesIO(b'{"error":"unauthorized"}'),
            )

        with patch("urllib.request.urlopen", fake_urlopen):
            diagnostic = diagnose_key(env(), probe=True)

        self.assertFalse(diagnostic.probe_authenticated)
        self.assertEqual(diagnostic.probe_http_status, 401)
        self.assertEqual(diagnostic.probe_result, "auth_failed")

    def test_503_probe_is_provider_or_request_error_not_auth_proof(self):
        def fake_urlopen(request, timeout):
            raise urllib.error.HTTPError(
                request.full_url,
                503,
                "Service Unavailable",
                {},
                io.BytesIO(b'{"error":{"code":"provider_unavailable"}}'),
            )

        with patch("urllib.request.urlopen", fake_urlopen):
            diagnostic = diagnose_key(env(), probe=True)

        self.assertIsNone(diagnostic.probe_authenticated)
        self.assertEqual(diagnostic.probe_http_status, 503)
        self.assertEqual(diagnostic.probe_result, "provider_or_request_error")


if __name__ == "__main__":
    unittest.main()
