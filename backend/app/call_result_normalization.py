"""Normalize provider call results into CareCall intake payloads."""

from __future__ import annotations

from typing import Any

from .callback_workflow import FAILED_PROVIDER_STATUSES, NO_CONTACT_PROVIDER_STATUSES


def provider_status(payload: dict[str, Any]) -> str:
    return str(payload.get("status", payload.get("state", ""))).strip().lower()


def normalized_provider_result(payload: dict[str, Any], status: str) -> dict[str, Any]:
    normalized = _provider_structured_result(payload)
    if status in NO_CONTACT_PROVIDER_STATUSES:
        normalized["status"] = "no_contact"
        normalized.setdefault("summary", f"CALL-E ended with {status}; route for human review.")
        normalized["human_review"] = True
        normalized.setdefault("needs", [])
    elif status in FAILED_PROVIDER_STATUSES:
        normalized["status"] = "malformed"
        normalized.setdefault("summary", f"CALL-E ended with {status}; route for technical/human review.")
        normalized["human_review"] = True
        normalized.setdefault("needs", [])
    else:
        normalized["status"] = "completed"
        normalized.setdefault("needs", [])
    return normalized


def _provider_structured_result(payload: dict[str, Any]) -> dict[str, Any]:
    candidates: list[Any] = [
        payload.get("structured_result"),
        payload.get("result"),
        payload.get("recipient_result"),
    ]
    for key in ("recipient_results", "recipients"):
        raw_items = payload.get(key)
        if isinstance(raw_items, list):
            for item in raw_items:
                if isinstance(item, dict):
                    candidates.extend(
                        [
                            item.get("structured_result"),
                            item.get("result"),
                            item.get("recipient_result"),
                        ]
                    )
    for candidate in candidates:
        if isinstance(candidate, dict):
            normalized = dict(candidate)
            for field in ("summary", "needs", "human_review"):
                if field in payload and field not in normalized:
                    normalized[field] = payload[field]
            return normalized
    return dict(payload)
