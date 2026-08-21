#!/usr/bin/env python3
"""No-call final demo readiness checks for Care Call AI."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = (
    "README.md",
    ".env.example",
    "Makefile",
    ".github/workflows/ci.yml",
    "backend/app/server.py",
    "backend/app/calle_execution.py",
    "frontend/src/app/page.tsx",
    "frontend/src/app/privacy/page.tsx",
    "frontend/src/app/terms/page.tsx",
    "frontend/src/app/support/page.tsx",
    "frontend/src/app/api/support/route.ts",
    "frontend/src/app/dashboard/page.tsx",
    "frontend/src/app/dashboard/operator/page.tsx",
    "frontend/src/app/dashboard/preflight/page.tsx",
    "frontend/src/app/dashboard/orders/print/page.tsx",
    "frontend/src/app/dashboard/urgent-callback/page.tsx",
    "contribution/awesome-phone-call-agents/APP-README.md",
    "contribution/awesome-phone-call-agents/PR-DESCRIPTION.md",
    "contribution/awesome-phone-call-agents/README-entry.md",
    "contribution/awesome-phone-call-agents/SAFETY-CHECKLIST.md",
)

REQUIRED_FORM_WARNINGS = (
    "<add https://care.alexraixon.com after deployment verification>",
    "<add YouTube or Vimeo URL>",
    "<add CALLE-AI/awesome-phone-call-agents PR URL>",
)


@dataclass(frozen=True)
class ReadinessResult:
    level: str
    message: str


def read_text(root: Path, relative_path: str) -> str:
    return (root / relative_path).read_text(encoding="utf-8")


def file_checks(root: Path, required_files: tuple[str, ...]) -> list[ReadinessResult]:
    return [
        ReadinessResult("ok" if (root / path).is_file() else "fail", f"{path} exists")
        for path in required_files
    ]


def safety_env_checks(env: dict[str, str]) -> list[ReadinessResult]:
    max_batch = env.get("CARECALL_MAX_LIVE_BATCH_SIZE", "1")
    return [
        ReadinessResult("ok" if max_batch == "1" else "fail", "CARECALL_MAX_LIVE_BATCH_SIZE is 1"),
    ]


def submission_warning_checks(root: Path) -> list[ReadinessResult]:
    form = read_text(root, "README.md")
    return [
        ReadinessResult("warn" if marker in form else "ok", f"submission placeholder still present: {marker}")
        for marker in REQUIRED_FORM_WARNINGS
    ]


def run_checks(root: Path = ROOT, env: dict[str, str] | None = None) -> list[ReadinessResult]:
    check_env = dict(os.environ) if env is None else env
    return [
        *file_checks(root, REQUIRED_FILES),
        *safety_env_checks(check_env),
        *submission_warning_checks(root),
    ]


def main() -> int:
    results = run_checks()
    for result in results:
        print(f"[{result.level}] {result.message}")

    failures = [result for result in results if result.level == "fail"]
    warnings = [result for result in results if result.level == "warn"]
    if failures:
        print(f"CareCall final readiness failed with {len(failures)} issue(s).", file=sys.stderr)
        return 1
    print(f"CareCall final readiness passed with {len(warnings)} warning(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
