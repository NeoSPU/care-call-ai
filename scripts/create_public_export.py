#!/usr/bin/env python3
"""Create a sanitized public hackathon repository export."""

from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts import public_export_check

ALIASES = (
    ("docs/PUBLIC-README.md", "README.md"),
    ("public-export/Makefile", "Makefile"),
)


@dataclass(frozen=True)
class ExportResult:
    target: Path
    copied_files: int
    aliases: tuple[tuple[str, str], ...]


def ensure_safe_target(target: Path, force: bool, root: Path = ROOT) -> None:
    resolved = target.resolve()
    resolved_root = root.resolve()
    if resolved == resolved_root or resolved_root in resolved.parents:
        raise ValueError("Refusing to export inside the private working repository.")
    if resolved.exists():
        if not force:
            raise ValueError(f"Target already exists: {resolved}. Re-run with --force to replace it.")
        shutil.rmtree(resolved)
    resolved.mkdir(parents=True, exist_ok=True)


def copy_file(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def create_export(target: Path, force: bool = False, root: Path = ROOT) -> ExportResult:
    ensure_safe_target(target, force, root)

    manifest = public_export_check.load_manifest(root / "public-export-manifest.json")
    tracked = public_export_check.tracked_files(root)
    candidates = public_export_check.candidate_files(
        tracked,
        list(manifest["include"]),
        list(manifest["exclude"]),
    )

    checks = public_export_check.run_checks(root, root / "public-export-manifest.json", tracked)
    failed = [check for check in checks if not check.ok]
    if failed:
        messages = "\n".join(f"- {check.message}" for check in failed)
        raise ValueError(f"Public export policy failed:\n{messages}")

    resolved_target = target.resolve()

    copied = 0
    for relative_path in candidates:
        copy_file(root / relative_path, resolved_target / relative_path)
        copied += 1

    for source, alias in ALIASES:
        copy_file(root / source, resolved_target / alias)

    return ExportResult(resolved_target, copied, ALIASES)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "target",
        type=Path,
        nargs="?",
        default=Path("/tmp/care-call-ai-demo-public"),
        help="Directory to create. Defaults to /tmp/care-call-ai-demo-public.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace the target directory if it already exists.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        result = create_export(args.target, args.force)
    except ValueError as error:
        print(f"Care Call AI public export failed: {error}", file=sys.stderr)
        return 1

    print(f"Created public export: {result.target}")
    print(f"Copied candidate files: {result.copied_files}")
    for source, alias in result.aliases:
        print(f"Aliased {source} -> {alias}")
    print("Next: cd into the export, run checks, then initialize the public GitHub repository.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
