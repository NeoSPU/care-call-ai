"""Reset the local demo SQLite database to deterministic seed state."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from .repository import Repository, connect
from .server import DEFAULT_DB_PATH, initialize_database


def reset_demo_database(db_path: str | Path = DEFAULT_DB_PATH, env: dict[str, str] | None = None) -> dict[str, int]:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()

    initialize_database(path, env=env or os.environ)
    conn = connect(path)
    try:
        repo = Repository(conn)
        return {
            "recipients": len(repo.list_recipients()),
            "preflight_plans": len(repo.list_preflight_plans()),
            "approvals": len(repo.list_approvals()),
            "service_requests": len(repo.list_service_requests()),
        }
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset CareCall demo database to seed state.")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="SQLite database path to reset.")
    args = parser.parse_args()

    summary = reset_demo_database(args.db_path)
    print(
        "CareCall demo database reset: "
        f"{summary['recipients']} recipients, "
        f"{summary['preflight_plans']} preflight plan, "
        f"{summary['approvals']} approval, "
        f"{summary['service_requests']} service requests."
    )


if __name__ == "__main__":
    main()
