import tempfile
import unittest
from pathlib import Path

from app.calle_payload_diagnostics import diagnose_payload
from app.repository import Repository, connect, init_schema, seed_database
from app.storage import DEFAULT_SEED_PATH, load_seed_recipients


class CallePayloadDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "carecall.sqlite3"
        conn = connect(self.db_path)
        try:
            init_schema(conn)
            seed_database(Repository(conn), load_seed_recipients(DEFAULT_SEED_PATH))
        finally:
            conn.close()

    def tearDown(self):
        self.tempdir.cleanup()

    def test_builds_sanitized_payload_for_recipient_without_real_phone(self):
        diagnostic = diagnose_payload(
            "rec-001",
            db_path=self.db_path,
            env={
                "CARECALL_CALLE_PROVIDER": "api",
                "CARECALL_CALLE_API_BASE_URL": "https://api.heycall-e.com",
                "CARECALL_CALLE_API_KEY": "sample-value",
                "CARECALL_CALLE_REGION": "GB",
            },
        )

        self.assertEqual(diagnostic.recipient_id, "rec-001")
        self.assertTrue(diagnostic.ready)
        self.assertFalse(diagnostic.recipients_included)
        self.assertEqual(diagnostic.recipient_count, 0)
        self.assertEqual(diagnostic.recipient_region, "")
        self.assertEqual(diagnostic.recipient_locale, "")
        self.assertFalse(diagnostic.schemas_included)
        self.assertEqual(diagnostic.result_schema_keys, ())
        self.assertEqual(diagnostic.recipient_result_schema_keys, ())
        self.assertTrue(diagnostic.provider_idempotency_key.startswith("cc-live-"))
        self.assertEqual(diagnostic.provider_idempotency_key_length, len(diagnostic.provider_idempotency_key))
        self.assertEqual(diagnostic.metadata["preview_idempotency_key"], diagnostic.preview_idempotency_key)
        self.assertGreater(diagnostic.task_length, 100)
        self.assertLess(diagnostic.task_length, 1000)
        self.assertIn("Only collect practical support needs", diagnostic.sanitized_body["task"])
        self.assertIn("Never order menu examples", diagnostic.sanitized_body["task"])
        self.assertNotIn("recipients", diagnostic.sanitized_body)
        self.assertIn(diagnostic.masked_phone, diagnostic.sanitized_body["task"])
        self.assertNotIn("result_schema", diagnostic.sanitized_body)
        self.assertNotIn("recipient_result_schema", diagnostic.sanitized_body)
        self.assertNotIn("+15550101001", str(diagnostic.sanitized_body))

    def test_can_show_schema_payload_when_legacy_flag_is_enabled(self):
        diagnostic = diagnose_payload(
            "rec-001",
            db_path=self.db_path,
            env={
                "CARECALL_CALLE_PROVIDER": "api",
                "CARECALL_CALLE_API_BASE_URL": "https://api.heycall-e.com",
                "CARECALL_CALLE_API_KEY": "sample-value",
                "CARECALL_CALLE_REGION": "GB",
                "CARECALL_CALLE_INCLUDE_SCHEMAS": "true",
            },
        )

        self.assertTrue(diagnostic.schemas_included)
        self.assertEqual(diagnostic.result_schema_keys, ("completed_count",))
        self.assertEqual(diagnostic.recipient_result_schema_keys, ("needs",))

    def test_can_show_explicit_recipient_payload_when_legacy_flag_is_enabled(self):
        diagnostic = diagnose_payload(
            "rec-001",
            db_path=self.db_path,
            env={
                "CARECALL_CALLE_PROVIDER": "api",
                "CARECALL_CALLE_API_BASE_URL": "https://api.heycall-e.com",
                "CARECALL_CALLE_API_KEY": "sample-value",
                "CARECALL_CALLE_REGION": "GB",
                "CARECALL_CALLE_INCLUDE_RECIPIENTS": "true",
            },
        )

        self.assertTrue(diagnostic.recipients_included)
        self.assertEqual(diagnostic.recipient_count, 1)
        self.assertEqual(diagnostic.recipient_region, "GB")
        self.assertEqual(diagnostic.recipient_locale, "en-GB")
        self.assertEqual(diagnostic.sanitized_body["recipients"][0]["phones"], [diagnostic.masked_phone])


if __name__ == "__main__":
    unittest.main()
