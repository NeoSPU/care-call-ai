"""Daily call limit configuration."""

from __future__ import annotations

import os
from collections.abc import Mapping


DEFAULT_OPERATOR_REPEAT_CALL_LIMIT = 2
DEFAULT_CALLBACK_CALL_LIMIT = 3


def operator_repeat_call_limit(recipient_id: str, env: Mapping[str, str] | None = None) -> int:
    values = env if env is not None else os.environ
    return _recipient_limit(
        values,
        recipient_id,
        override_name="CARECALL_RECIPIENT_OPERATOR_CALL_LIMIT_OVERRIDES",
        fallback_name="CARECALL_OPERATOR_REPEAT_CALL_LIMIT",
        fallback=DEFAULT_OPERATOR_REPEAT_CALL_LIMIT,
    )


def callback_call_limit(recipient_id: str, env: Mapping[str, str] | None = None) -> int:
    values = env if env is not None else os.environ
    return _recipient_limit(
        values,
        recipient_id,
        override_name="CARECALL_RECIPIENT_CALLBACK_CALL_LIMIT_OVERRIDES",
        fallback_name="CARECALL_MAX_AUTO_CALLBACK_CALLS_PER_DAY",
        fallback=DEFAULT_CALLBACK_CALL_LIMIT,
    )


def callback_review_limit(recipient_id: str, env: Mapping[str, str] | None = None) -> int:
    values = env if env is not None else os.environ
    return _recipient_limit(
        values,
        recipient_id,
        override_name="CARECALL_RECIPIENT_CALLBACK_CALL_LIMIT_OVERRIDES",
        fallback_name="CARECALL_CALLBACK_REPEAT_REVIEW_LIMIT",
        fallback=DEFAULT_CALLBACK_CALL_LIMIT,
    )


def _recipient_limit(
    env: Mapping[str, str],
    recipient_id: str,
    *,
    override_name: str,
    fallback_name: str,
    fallback: int,
) -> int:
    overrides = _parse_limit_overrides(env.get(override_name, ""))
    if recipient_id in overrides:
        return overrides[recipient_id]
    return _positive_int(env.get(fallback_name, ""), fallback)


def _parse_limit_overrides(raw: str) -> dict[str, int]:
    values: dict[str, int] = {}
    for chunk in raw.replace(";", ",").split(","):
        if "=" not in chunk:
            continue
        recipient_id, raw_limit = (part.strip() for part in chunk.split("=", 1))
        if recipient_id:
            values[recipient_id] = _positive_int(raw_limit, fallback=0)
    return {recipient_id: limit for recipient_id, limit in values.items() if limit > 0}


def _positive_int(raw: str, fallback: int) -> int:
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return fallback
