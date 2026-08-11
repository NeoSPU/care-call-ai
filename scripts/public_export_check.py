#!/usr/bin/env python3
"""Validate the sanitized public hackathon export policy."""

from __future__ import annotations

import fnmatch
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public-export-manifest.json"


@dataclass(frozen=True)
class CheckResult:
    ok: bool
    message: str


def load_manifest(path: Path = MANIFEST) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def tracked_files(root: Path = ROOT) -> list[str]:
    result = subprocess.run(
        ("git", "ls-files", "--cached", "--others", "--exclude-standard"),
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return [line for line in result.stdout.splitlines() if line.strip()]


def matches(pattern: str, path: str) -> bool:
    if pattern.endswith("/**"):
        prefix = pattern[:-3]
        return path == prefix or path.startswith(f"{prefix}/")
    return fnmatch.fnmatch(path, pattern)


def is_included(path: str, include_patterns: list[str]) -> bool:
    return any(matches(pattern, path) for pattern in include_patterns)


def is_excluded(path: str, exclude_patterns: list[str]) -> bool:
    return any(matches(pattern, path) for pattern in exclude_patterns)


def candidate_files(files: list[str], include_patterns: list[str], exclude_patterns: list[str]) -> list[str]:
    return sorted(path for path in files if is_included(path, include_patterns) and not is_excluded(path, exclude_patterns))


def required_file_checks(root: Path, manifest: dict[str, Any]) -> list[CheckResult]:
    results: list[CheckResult] = []
    includes = list(manifest["include"])
    excludes = list(manifest["exclude"])
    for path in manifest["required_files"]:
      exists = (root / path).is_file()
      included = is_included(path, includes)
      excluded = is_excluded(path, excludes)
      results.append(CheckResult(exists, f"{path} exists"))
      results.append(CheckResult(included and not excluded, f"{path} is public-export eligible"))
    return results


def excluded_path_checks(files: list[str], manifest: dict[str, Any]) -> list[CheckResult]:
    includes = list(manifest["include"])
    excludes = list(manifest["exclude"])
    included_private = [
        path
        for path in files
        if is_included(path, includes) and is_excluded(path, excludes)
    ]
    return [
        CheckResult(not included_private, "include policy does not capture excluded private paths")
    ]


def forbidden_fragment_checks(root: Path, candidates: list[str], manifest: dict[str, Any]) -> list[CheckResult]:
    fragments = list(manifest["forbidden_public_fragments"])
    issues: list[str] = []
    for relative_path in candidates:
        if relative_path == "public-export-manifest.json":
            continue
        path = root / relative_path
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for fragment in fragments:
            if fragment in text:
                issues.append(f"{relative_path}: contains forbidden public fragment {fragment!r}")
    if issues:
        preview = "; ".join(issues[:5])
        suffix = "" if len(issues) <= 5 else f"; +{len(issues) - 5} more"
        return [CheckResult(False, f"candidate public files avoid private deployment fragments: {preview}{suffix}")]
    return [CheckResult(True, "candidate public files avoid private deployment fragments")]


def public_readme_reference_checks(root: Path, manifest: dict[str, Any]) -> list[CheckResult]:
    readme_path = root / "docs/PUBLIC-README.md"
    if not readme_path.is_file():
        return [CheckResult(False, "docs/PUBLIC-README.md exists for public README reference checks")]
    text = readme_path.read_text(encoding="utf-8")
    forbidden = [fragment for fragment in manifest.get("forbidden_public_readme_references", []) if fragment in text]
    if forbidden:
        return [CheckResult(False, f"public README avoids private-only references: {', '.join(forbidden)}")]
    return [CheckResult(True, "public README avoids private-only references")]


def public_doc_reference_checks(root: Path, candidates: list[str], manifest: dict[str, Any]) -> list[CheckResult]:
    references = list(manifest.get("forbidden_public_doc_references", []))
    issues: list[str] = []
    for relative_path in candidates:
        if relative_path == "public-export-manifest.json":
            continue
        public_text_surface = (
            relative_path.startswith("docs/")
            or relative_path.startswith("contribution/")
            or relative_path.startswith("public-export/")
            or relative_path == ".env.example"
            or relative_path.startswith(".github/")
        )
        if not public_text_surface:
            continue
        path = root / relative_path
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for reference in references:
            if reference in text:
                issues.append(f"{relative_path}: references private-only path {reference!r}")
    if issues:
        preview = "; ".join(issues[:5])
        suffix = "" if len(issues) <= 5 else f"; +{len(issues) - 5} more"
        return [CheckResult(False, f"candidate public files avoid private-only document references: {preview}{suffix}")]
    return [CheckResult(True, "candidate public files avoid private-only document references")]


def contribution_material_checks(root: Path, manifest: dict[str, Any]) -> list[CheckResult]:
    results: list[CheckResult] = []
    required_by_path = manifest.get("required_contribution_fragments", {})
    forbidden = list(manifest.get("forbidden_contribution_fragments", []))
    for relative_path, required_fragments in required_by_path.items():
        path = root / relative_path
        if not path.is_file():
            results.append(CheckResult(False, f"{relative_path} exists for contribution material checks"))
            continue
        text = path.read_text(encoding="utf-8")
        missing = [fragment for fragment in required_fragments if fragment not in text]
        stale = [fragment for fragment in forbidden if fragment in text]
        results.append(
            CheckResult(
                not missing,
                f"{relative_path} includes required CALL-E contribution guidance"
                if not missing
                else f"{relative_path} is missing required fragments: {', '.join(missing)}",
            )
        )
        results.append(
            CheckResult(
                not stale,
                f"{relative_path} avoids stale contribution references"
                if not stale
                else f"{relative_path} contains stale contribution references: {', '.join(stale)}",
            )
        )
    return results


def run_checks(root: Path = ROOT, manifest_path: Path = MANIFEST, files: list[str] | None = None) -> list[CheckResult]:
    manifest = load_manifest(manifest_path)
    tracked = tracked_files(root) if files is None else files
    includes = list(manifest["include"])
    excludes = list(manifest["exclude"])
    candidates = candidate_files(tracked, includes, excludes)
    return [
        CheckResult(bool(candidates), f"{len(candidates)} files selected by public export policy"),
        *required_file_checks(root, manifest),
        *excluded_path_checks(tracked, manifest),
        *forbidden_fragment_checks(root, candidates, manifest),
        *public_readme_reference_checks(root, manifest),
        *public_doc_reference_checks(root, candidates, manifest),
        *contribution_material_checks(root, manifest),
    ]


def main() -> int:
    results = run_checks()
    for result in results:
        print(f"[{'ok' if result.ok else 'fail'}] {result.message}")
    failed = [result for result in results if not result.ok]
    if failed:
        print(f"Care Call AI public export check failed with {len(failed)} issue(s).", file=sys.stderr)
        return 1
    print("Care Call AI public export check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
