#!/usr/bin/env python3
"""Lightweight repository secret and real-phone scanner.

The check intentionally scans tracked files only. Local runtime values such as
CALL-E auth state, backend bearer tokens, and real phone numbers should stay
outside git.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

ALLOW_PHONE_PREFIXES = ("+1555",)
ALLOW_PHONES = {
    "+447700900123",  # UK-style reserved example used by tests.
}

SECRET_PATTERNS = (
    ("OpenAI API key", re.compile(r"sk-[A-Za-z0-9_-]{20,}")),
    ("GitHub token", re.compile(r"(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}")),
    ("GitHub fine-grained token", re.compile(r"github_pat_[A-Za-z0-9_]{20,}")),
    ("Bearer token", re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]{20,}", re.IGNORECASE)),
    (
        "Secret assignment",
        re.compile(
            r"\b(?:TOKEN|SECRET|API_KEY|AUTH_TOKEN|ACCESS_TOKEN)\b\s*[:=]\s*['\"]?[A-Za-z0-9._~+/=-]{16,}",
            re.IGNORECASE,
        ),
    ),
)
PHONE_PATTERN = re.compile(r"\+[1-9]\d{9,14}")


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ("git", "ls-files"),
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return [ROOT / line for line in result.stdout.splitlines() if line.strip()]


def is_allowed_phone(value: str) -> bool:
    return value in ALLOW_PHONES or any(value.startswith(prefix) for prefix in ALLOW_PHONE_PREFIXES)


def scan_file(path: Path) -> list[str]:
    if not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []

    issues: list[str] = []
    rel = path.relative_to(ROOT)
    for line_no, line in enumerate(text.splitlines(), start=1):
        for label, pattern in SECRET_PATTERNS:
            if pattern.search(line):
                issues.append(f"{rel}:{line_no}: possible {label}")
        for phone in PHONE_PATTERN.findall(line):
            if not is_allowed_phone(phone):
                issues.append(f"{rel}:{line_no}: possible real E.164 phone number")
    return issues


def main() -> int:
    issues = [issue for path in tracked_files() for issue in scan_file(path)]
    if issues:
        print("CareCall secrets check failed:", file=sys.stderr)
        for issue in issues:
            print(f"- {issue}", file=sys.stderr)
        return 1
    print("CareCall secrets check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
