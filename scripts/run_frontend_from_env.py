#!/usr/bin/env python3
"""Run the local frontend with environment loaded from the root .env file."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def main() -> int:
    if not ENV_PATH.is_file():
        print("Missing .env. Run: cp .env.example .env, then fill it in your editor.", file=sys.stderr)
        return 2

    env = {**os.environ, **load_env_file(ENV_PATH), "NEXT_TELEMETRY_DISABLED": "1"}
    return subprocess.call(("npm", "run", "dev:carecall"), cwd=ROOT / "frontend", env=env)


if __name__ == "__main__":
    raise SystemExit(main())
