import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import create_public_export


class CreatePublicExportTests(unittest.TestCase):
    def make_root(self) -> tuple[Path, Path]:
        root_dir = tempfile.TemporaryDirectory()
        target_dir = tempfile.TemporaryDirectory()
        self.addCleanup(root_dir.cleanup)
        self.addCleanup(target_dir.cleanup)
        root = Path(root_dir.name)
        target = Path(target_dir.name) / "export"
        manifest = {
            "required_files": ["docs/PUBLIC-README.md", "public-export/Makefile", "backend/app/server.py"],
            "include": ["docs/PUBLIC-README.md", "public-export/Makefile", "backend/**"],
            "exclude": ["backend/private/**"],
            "forbidden_public_fragments": [],
            "forbidden_public_readme_references": [],
            "forbidden_public_doc_references": [],
            "forbidden_contribution_fragments": [],
            "required_contribution_fragments": {},
        }
        (root / "public-export-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        (root / "docs").mkdir()
        (root / "docs/PUBLIC-README.md").write_text("# Public README\n", encoding="utf-8")
        (root / "public-export").mkdir()
        (root / "public-export/Makefile").write_text("test:\n\ttrue\n", encoding="utf-8")
        (root / "backend/app").mkdir(parents=True)
        (root / "backend/app/server.py").write_text("print('safe')\n", encoding="utf-8")
        return root, target

    def test_create_export_copies_candidates_and_root_aliases(self):
        root, target = self.make_root()

        with mock.patch("scripts.public_export_check.tracked_files") as tracked_files:
            tracked_files.return_value = [
                "docs/PUBLIC-README.md",
                "public-export/Makefile",
                "backend/app/server.py",
            ]
            result = create_public_export.create_export(target, root=root)

        self.assertEqual(target.resolve(), result.target)
        self.assertTrue((target / "docs/PUBLIC-README.md").is_file())
        self.assertTrue((target / "public-export/Makefile").is_file())
        self.assertEqual("# Public README\n", (target / "README.md").read_text(encoding="utf-8"))
        self.assertEqual("test:\n\ttrue\n", (target / "Makefile").read_text(encoding="utf-8"))
        self.assertTrue((target / "backend/app/server.py").is_file())

    def test_create_export_refuses_target_inside_private_repo(self):
        root, _target = self.make_root()

        with self.assertRaises(ValueError):
            create_public_export.create_export(root / "public-copy", root=root)


if __name__ == "__main__":
    unittest.main()
