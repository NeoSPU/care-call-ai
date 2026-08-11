#!/usr/bin/env python3
"""No-call final demo readiness checks for Care Call AI."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

PRIVATE_REQUIRED_FILES = (
    ".planning/STATE.md",
    ".planning/ROADMAP.md",
    ".planning/phases/08-product-ia-split-and-demo-readiness/08-CONTEXT.md",
    ".planning/phases/08-product-ia-split-and-demo-readiness/08-03-SUMMARY.md",
    ".planning/phases/08-product-ia-split-and-demo-readiness/08-05-PLAN.md",
    "docs/FINAL-DEMO-CHECKLIST.md",
    "docs/DEMO-SCRIPT.md",
    "docs/FINAL-DEMO-READINESS.md",
    "docs/DEPLOYMENT.md",
    "docs/HETZNER-K3S-RUNBOOK.md",
    "docs/HACKATHON-PROJECT-FORM-DRAFT.md",
    "frontend/src/app/dashboard/DashboardClient.tsx",
    "frontend/src/app/dashboard/OperatorPanelClient.tsx",
    "frontend/src/app/dashboard/orders/print/page.tsx",
    "frontend/src/app/dashboard/urgent-callback/UrgentCallbackClient.tsx",
)

PUBLIC_REQUIRED_FILES = (
    "docs/FINAL-DEMO-CHECKLIST.md",
    "docs/DEMO-SCRIPT.md",
    "docs/FINAL-DEMO-READINESS.md",
    "docs/HACKATHON-PROJECT-FORM-DRAFT.md",
    "docs/PUBLIC-README.md",
    "docs/REAL-CALL-SAFETY.md",
    "CALL-E-installation-guide.md",
    "backend/app/server.py",
    "backend/app/calle_execution.py",
    "frontend/src/app/dashboard/page.tsx",
    "frontend/src/app/dashboard/operator/page.tsx",
    "frontend/src/app/dashboard/orders/print/page.tsx",
    "frontend/src/app/dashboard/urgent-callback/page.tsx",
    "contribution/awesome-phone-call-agents/APP-README.md",
)

REQUIRED_FILES = PRIVATE_REQUIRED_FILES

REQUIRED_ROADMAP_MARKERS = (
    "Phase 8: Product IA Split And Demo Readiness",
    "08-03 — Help delivered session summary",
    "08-05 — Final UAT",
)

REQUIRED_STATE_MARKERS = (
    "Product IA Split And Demo Readiness",
)

REQUIRED_FORM_WARNINGS = (
    "<add sanitized public repository URL>",
    "<add PR URL after opening the pull request>",
    "<YouTube or Vimeo demo video URL>",
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


def marker_checks(root: Path) -> list[ReadinessResult]:
    results: list[ReadinessResult] = []
    roadmap = read_text(root, ".planning/ROADMAP.md")
    state = read_text(root, ".planning/STATE.md")
    for marker in REQUIRED_ROADMAP_MARKERS:
        results.append(ReadinessResult("ok" if marker in roadmap else "fail", f"ROADMAP contains {marker!r}"))
    for marker in REQUIRED_STATE_MARKERS:
        results.append(ReadinessResult("ok" if marker in state else "fail", f"STATE contains {marker!r}"))
    return results


def safety_env_checks(env: dict[str, str]) -> list[ReadinessResult]:
    live_enabled = env.get("CARECALL_LIVE_CALLS_ENABLED", "false").lower() == "true"
    max_batch = env.get("CARECALL_MAX_LIVE_BATCH_SIZE", "1")
    return [
        ReadinessResult("fail" if live_enabled else "ok", "CARECALL_LIVE_CALLS_ENABLED is not true for readiness checks"),
        ReadinessResult("ok" if max_batch == "1" else "fail", "CARECALL_MAX_LIVE_BATCH_SIZE is 1"),
    ]


def submission_warning_checks(root: Path) -> list[ReadinessResult]:
    form = read_text(root, "docs/HACKATHON-PROJECT-FORM-DRAFT.md")
    return [
        ReadinessResult("warn" if marker in form else "ok", f"submission placeholder still present: {marker}")
        for marker in REQUIRED_FORM_WARNINGS
    ]


def run_checks(root: Path = ROOT, env: dict[str, str] | None = None, profile: str = "private") -> list[ReadinessResult]:
    check_env = dict(os.environ) if env is None else env
    normalized_profile = profile.strip().lower()
    if normalized_profile == "public":
        required_files = PUBLIC_REQUIRED_FILES
        planning_checks: list[ReadinessResult] = []
    elif normalized_profile == "private":
        required_files = PRIVATE_REQUIRED_FILES
        planning_checks = marker_checks(root)
    else:
        return [ReadinessResult("fail", f"unknown CARECALL_READINESS_PROFILE={profile!r}; use private or public")]
    return [
        *file_checks(root, required_files),
        *planning_checks,
        *safety_env_checks(check_env),
        *submission_warning_checks(root),
    ]


def main() -> int:
    profile = os.environ.get("CARECALL_READINESS_PROFILE", "private")
    results = run_checks(profile=profile)
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
