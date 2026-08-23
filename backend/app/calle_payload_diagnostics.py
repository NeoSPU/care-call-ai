"""Safe CALL-E payload diagnostics.

Builds the exact Developer API request body the backend would send for a
recipient, then prints a sanitized summary. It never calls CALL-E.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .call_planning import build_call_plan_preview
from .calle_developer_api import build_call_body, settings_from_env
from .calle_execution import live_plan_payload_for_preview
from .repository import Repository, connect


DEFAULT_DB_PATH = Path(os.environ.get("CARECALL_DB_PATH", "data/carecall.sqlite3"))


@dataclass(frozen=True)
class PayloadDiagnostic:
    recipient_id: str
    recipient_label: str
    ready: bool
    route: str
    blocked_reasons: tuple[str, ...]
    masked_phone: str
    language: str
    timezone: str
    provider_idempotency_key: str
    provider_idempotency_key_length: int
    preview_idempotency_key: str
    task_length: int
    task_preview: str
    recipients_included: bool
    recipient_count: int
    recipient_region: str
    recipient_locale: str
    result_schema_keys: tuple[str, ...]
    recipient_result_schema_keys: tuple[str, ...]
    schemas_included: bool
    metadata: dict[str, str]
    sanitized_body: dict[str, Any]


def diagnose_payload(
    recipient_id: str,
    *,
    db_path: str | Path = DEFAULT_DB_PATH,
    call_date: str = "2026-08-01",
    env: dict[str, str] | None = None,
) -> PayloadDiagnostic:
    env = os.environ if env is None else env
    conn = connect(db_path)
    try:
        repo = Repository(conn)
        recipient = repo.get_recipient(recipient_id)
        preview = build_call_plan_preview(recipient, call_date)
    finally:
        conn.close()

    args = live_plan_payload_for_preview(preview)
    provider_key = args["idempotency_key"]
    body = build_call_body(args, settings_from_env(env))
    sanitized = _sanitize_body(body, preview.masked_phone)
    recipients = body.get("recipients", [])
    first_recipient = recipients[0] if recipients and isinstance(recipients[0], dict) else {}
    return PayloadDiagnostic(
        recipient_id=preview.recipient_id,
        recipient_label=preview.recipient_label,
        ready=preview.ready,
        route=preview.route,
        blocked_reasons=preview.blocked_reasons,
        masked_phone=preview.masked_phone,
        language=preview.language,
        timezone=preview.timezone,
        provider_idempotency_key=provider_key,
        provider_idempotency_key_length=len(provider_key),
        preview_idempotency_key=preview.idempotency_key,
        task_length=len(str(body.get("task", ""))),
        task_preview=_mask_phone_in_text(str(body.get("task", ""))[:120], preview.target_phone_e164, preview.masked_phone),
        recipients_included="recipients" in body,
        recipient_count=len(recipients) if isinstance(recipients, list) else 0,
        recipient_region=str(first_recipient.get("region", "")),
        recipient_locale=str(first_recipient.get("locale", "")),
        result_schema_keys=tuple(_property_keys(body.get("result_schema"))),
        recipient_result_schema_keys=tuple(_property_keys(body.get("recipient_result_schema"))),
        schemas_included="result_schema" in body or "recipient_result_schema" in body,
        metadata={str(key): str(value) for key, value in dict(body.get("metadata", {})).items()},
        sanitized_body=sanitized,
    )


def _sanitize_body(body: dict[str, Any], masked_phone: str) -> dict[str, Any]:
    sanitized = json.loads(json.dumps(body))
    recipients = sanitized.get("recipients")
    if isinstance(recipients, list):
        for recipient in recipients:
            if isinstance(recipient, dict) and isinstance(recipient.get("phones"), list):
                recipient["phones"] = [masked_phone for _ in recipient["phones"]]
    task = sanitized.get("task")
    if isinstance(task, str):
        sanitized["task"] = _mask_phone_like_values(task, masked_phone)
    return sanitized


def _mask_phone_in_text(text: str, phone: str, masked_phone: str) -> str:
    return text.replace(phone, masked_phone)


def _mask_phone_like_values(text: str, masked_phone: str) -> str:
    import re

    return re.sub(r"\+[1-9]\d{6,14}", masked_phone, text)


def _property_keys(schema: Any) -> tuple[str, ...]:
    if not isinstance(schema, dict):
        return ()
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return ()
    return tuple(sorted(str(key) for key in properties))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Print a sanitized CALL-E payload preview without placing calls.")
    parser.add_argument("--recipient-id", default="rec-001")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH))
    parser.add_argument("--call-date", default="2026-08-01")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    diagnostic = diagnose_payload(args.recipient_id, db_path=args.db_path, call_date=args.call_date)
    payload = asdict(diagnostic)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        for key, value in payload.items():
            if key == "sanitized_body":
                print(f"{key}={json.dumps(value, ensure_ascii=False, sort_keys=True)}")
            else:
                print(f"{key}={value}")
    return 0 if diagnostic.ready else 2


if __name__ == "__main__":
    raise SystemExit(main())
