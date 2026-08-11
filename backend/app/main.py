"""Minimal backend entrypoint for early CareCall development."""

from .storage import load_seed_recipients
from .call_planning import build_call_plan_previews


def main() -> None:
    recipients = load_seed_recipients()
    previews = build_call_plan_previews(recipients, "2026-08-01")
    for preview in previews:
        status = "ready" if preview.ready else "blocked"
        print(
            f"{preview.recipient_id}: {status} - {preview.route} - "
            f"{preview.masked_phone} - {preview.idempotency_key}"
        )


if __name__ == "__main__":
    main()
