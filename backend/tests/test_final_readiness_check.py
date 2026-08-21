import tempfile
import unittest
from pathlib import Path

from scripts import final_readiness_check


class FinalReadinessCheckTests(unittest.TestCase):
    def make_root(self) -> Path:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        root = Path(temp_dir.name)
        for relative_path in final_readiness_check.REQUIRED_FILES:
            path = root / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("placeholder\n", encoding="utf-8")
        (root / "README.md").write_text("\n".join(final_readiness_check.REQUIRED_FORM_WARNINGS), encoding="utf-8")
        return root

    def test_readiness_passes_with_submission_warnings_for_manual_links(self):
        results = final_readiness_check.run_checks(
            self.make_root(),
            {"CARECALL_MAX_LIVE_BATCH_SIZE": "1"},
        )

        self.assertFalse([result for result in results if result.level == "fail"])
        self.assertEqual(3, len([result for result in results if result.level == "warn"]))

    def test_readiness_fails_when_live_batch_size_is_above_one(self):
        results = final_readiness_check.run_checks(
            self.make_root(),
            {"CARECALL_MAX_LIVE_BATCH_SIZE": "2"},
        )

        self.assertTrue(any("MAX_LIVE_BATCH_SIZE" in result.message for result in results if result.level == "fail"))

    def test_readiness_fails_when_required_file_is_missing(self):
        root = self.make_root()
        (root / ".github/workflows/ci.yml").unlink()

        results = final_readiness_check.run_checks(
            root,
            {"CARECALL_MAX_LIVE_BATCH_SIZE": "1"},
        )

        self.assertTrue(any(result.message == ".github/workflows/ci.yml exists" for result in results if result.level == "fail"))

    def test_readiness_does_not_require_private_planning_or_deployment_docs(self):
        results = final_readiness_check.run_checks(
            self.make_root(),
            {"CARECALL_MAX_LIVE_BATCH_SIZE": "1"},
        )

        failures = [result for result in results if result.level == "fail"]
        self.assertFalse(failures)


if __name__ == "__main__":
    unittest.main()
