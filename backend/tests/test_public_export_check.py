import json
import tempfile
import unittest
from pathlib import Path

from scripts import public_export_check


class PublicExportCheckTests(unittest.TestCase):
    def make_root(self, manifest: dict) -> tuple[Path, Path]:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        root = Path(temp_dir.name)
        manifest_path = root / "public-export-manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        for path in manifest["required_files"]:
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("safe public text\n", encoding="utf-8")
        return root, manifest_path

    def test_public_export_policy_passes_for_required_safe_files(self):
        manifest = {
            "required_files": ["README.md", "docs/PUBLIC-README.md", "backend/app/server.py"],
            "include": ["README.md", "docs/PUBLIC-README.md", "backend/**"],
            "exclude": ["docs/DEPLOYMENT.md"],
            "forbidden_public_fragments": ["secret-host"],
            "forbidden_public_readme_references": ["docs/DEPLOYMENT.md"],
            "forbidden_public_doc_references": [],
            "forbidden_contribution_fragments": [],
            "required_contribution_fragments": {},
        }
        root, manifest_path = self.make_root(manifest)

        results = public_export_check.run_checks(
            root,
            manifest_path,
            ["README.md", "backend/app/server.py", "docs/DEPLOYMENT.md"],
        )

        self.assertFalse([result for result in results if not result.ok])

    def test_public_export_policy_fails_when_required_file_is_missing(self):
        manifest = {
            "required_files": ["README.md", "docs/PUBLIC-README.md", "backend/app/server.py"],
            "include": ["README.md", "docs/PUBLIC-README.md", "backend/**"],
            "exclude": [],
            "forbidden_public_fragments": [],
            "forbidden_public_readme_references": [],
            "forbidden_public_doc_references": [],
            "forbidden_contribution_fragments": [],
            "required_contribution_fragments": {},
        }
        root, manifest_path = self.make_root(manifest)
        (root / "backend/app/server.py").unlink()

        results = public_export_check.run_checks(root, manifest_path, ["README.md"])

        self.assertTrue(any(result.message == "backend/app/server.py exists" for result in results if not result.ok))

    def test_public_export_policy_fails_when_forbidden_fragment_is_in_candidate(self):
        manifest = {
            "required_files": ["README.md", "docs/PUBLIC-README.md"],
            "include": ["README.md", "docs/PUBLIC-README.md"],
            "exclude": [],
            "forbidden_public_fragments": ["secret-host"],
            "forbidden_public_readme_references": [],
            "forbidden_public_doc_references": [],
            "forbidden_contribution_fragments": [],
            "required_contribution_fragments": {},
        }
        root, manifest_path = self.make_root(manifest)
        (root / "README.md").write_text("points at secret-host\n", encoding="utf-8")

        results = public_export_check.run_checks(root, manifest_path, ["README.md"])

        self.assertTrue(any("secret-host" in result.message for result in results if not result.ok))

    def test_public_export_policy_fails_when_public_readme_links_private_docs(self):
        manifest = {
            "required_files": ["README.md", "docs/PUBLIC-README.md"],
            "include": ["README.md", "docs/PUBLIC-README.md"],
            "exclude": [],
            "forbidden_public_fragments": [],
            "forbidden_public_readme_references": ["docs/DEPLOYMENT.md"],
            "forbidden_public_doc_references": [],
            "forbidden_contribution_fragments": [],
            "required_contribution_fragments": {},
        }
        root, manifest_path = self.make_root(manifest)
        (root / "docs/PUBLIC-README.md").write_text("See docs/DEPLOYMENT.md\n", encoding="utf-8")

        results = public_export_check.run_checks(root, manifest_path, ["README.md", "docs/PUBLIC-README.md"])

        self.assertTrue(any("DEPLOYMENT" in result.message for result in results if not result.ok))

    def test_public_export_policy_fails_when_contribution_material_is_stale(self):
        manifest = {
            "required_files": ["README.md", "docs/PUBLIC-README.md", "contribution/APP-README.md"],
            "include": ["README.md", "docs/PUBLIC-README.md", "contribution/**"],
            "exclude": [],
            "forbidden_public_fragments": [],
            "forbidden_public_readme_references": [],
            "forbidden_public_doc_references": [],
            "forbidden_contribution_fragments": ["apps/typescript/carecall"],
            "required_contribution_fragments": {
                "contribution/APP-README.md": [
                    "apps/typescript/care-call-ai/",
                    "Side Effects",
                ]
            },
        }
        root, manifest_path = self.make_root(manifest)
        (root / "contribution/APP-README.md").write_text(
            "See apps/typescript/carecall\n",
            encoding="utf-8",
        )

        results = public_export_check.run_checks(
            root,
            manifest_path,
            ["README.md", "docs/PUBLIC-README.md", "contribution/APP-README.md"],
        )

        failures = [result.message for result in results if not result.ok]
        self.assertTrue(any("missing required fragments" in failure for failure in failures))
        self.assertTrue(any("stale contribution references" in failure for failure in failures))

    def test_public_export_policy_fails_when_candidate_references_private_docs(self):
        manifest = {
            "required_files": ["README.md", "docs/PUBLIC-README.md", "docs/DEMO-SCRIPT.md"],
            "include": ["README.md", "docs/**"],
            "exclude": [],
            "forbidden_public_fragments": [],
            "forbidden_public_readme_references": [],
            "forbidden_public_doc_references": ["docs/VOICE-ASSISTANT-CALLBACK.md"],
            "forbidden_contribution_fragments": [],
            "required_contribution_fragments": {},
        }
        root, manifest_path = self.make_root(manifest)
        (root / "docs/DEMO-SCRIPT.md").write_text(
            "See docs/VOICE-ASSISTANT-CALLBACK.md later.\n",
            encoding="utf-8",
        )

        results = public_export_check.run_checks(
            root,
            manifest_path,
            ["README.md", "docs/PUBLIC-README.md", "docs/DEMO-SCRIPT.md"],
        )

        self.assertTrue(any("private-only document references" in result.message for result in results if not result.ok))


if __name__ == "__main__":
    unittest.main()
