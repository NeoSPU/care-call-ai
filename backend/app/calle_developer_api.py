"""Server-side CALL-E Developer API runner.

This is the public demo integration path. Operators provide the official
dashboard API key in backend `.env`; browser code never sees it.
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


CALLE_PROVIDER_ENV = "CARECALL_CALLE_PROVIDER"
CALLE_API_KEY_ENV = "CARECALL_CALLE_API_KEY"
CALLE_API_BASE_URL_ENV = "CARECALL_CALLE_API_BASE_URL"
CALLE_REGION_ENV = "CARECALL_CALLE_REGION"
DEFAULT_API_BASE_URL = "https://api.heycall-e.com"


@dataclass(frozen=True)
class DeveloperApiSettings:
    api_key: str
    base_url: str = DEFAULT_API_BASE_URL
    region: str = "GB"
    timeout_seconds: int = 45

    @property
    def configured(self) -> bool:
        return bool(self.api_key.strip() and self.base_url.strip())


def developer_api_enabled(env: dict[str, str] | None = None) -> bool:
    env = os.environ if env is None else env
    return env.get(CALLE_PROVIDER_ENV, "").strip().lower() in {"api", "developer_api", "developer-api"}


def settings_from_env(env: dict[str, str] | None = None) -> DeveloperApiSettings:
    env = os.environ if env is None else env
    try:
        timeout = int(env.get("CARECALL_CALLE_TIMEOUT_SECONDS", "45"))
    except ValueError:
        timeout = 45
    return DeveloperApiSettings(
        api_key=env.get(CALLE_API_KEY_ENV, "").strip(),
        base_url=env.get(CALLE_API_BASE_URL_ENV, DEFAULT_API_BASE_URL).strip() or DEFAULT_API_BASE_URL,
        region=env.get(CALLE_REGION_ENV, "GB").strip() or "GB",
        timeout_seconds=timeout,
    )


def developer_api_runner_from_env(env: dict[str, str] | None = None):
    return DeveloperApiRunner(settings_from_env(env))


class DeveloperApiRunner:
    def __init__(self, settings: DeveloperApiSettings):
        self.settings = settings
        self.commands: list[tuple[str, ...]] = []
        self.plans: dict[str, dict[str, Any]] = {}

    def __call__(self, command: tuple[str, ...], env: dict[str, str]) -> subprocess.CompletedProcess:
        self.commands.append(command)
        if not self.settings.configured:
            return subprocess.CompletedProcess(command, 2, "", "CALL-E Developer API settings are not configured.")

        try:
            if command[0:2] == ("calle", "plan_call"):
                args = json.loads(command[2]) if len(command) > 2 else {}
                plan_id = str(args.get("idempotency_key", "") or f"carecall-plan-{len(self.plans) + 1}")
                self.plans[plan_id] = args
                return subprocess.CompletedProcess(command, 0, json.dumps({"plan_id": plan_id}), "")
            if command[0:2] == ("calle", "run_call"):
                plan_id = command[2] if len(command) > 2 else ""
                args = self.plans.get(plan_id, {})
                if not args:
                    return subprocess.CompletedProcess(command, 2, "", f"Unknown CALL-E API plan id: {plan_id}")
                payload = self._create_call(args)
                run_id = str(payload.get("id", payload.get("call_id", "")))
                if not run_id:
                    return subprocess.CompletedProcess(command, 1, json.dumps(payload), "CALL-E API returned no call id.")
                return subprocess.CompletedProcess(command, 0, json.dumps({"run_id": run_id, **payload}), "")
            if command[0:2] == ("calle", "get_call_run"):
                payload = self._get_call(command[2] if len(command) > 2 else "")
                return subprocess.CompletedProcess(command, 0, json.dumps(payload), "")
        except (ValueError, urllib.error.URLError, TimeoutError) as exc:
            return subprocess.CompletedProcess(command, 1, "", str(exc))

        return subprocess.CompletedProcess(command, 2, "", f"Unsupported CALL-E API command: {command}")

    def _create_call(self, args: dict[str, Any]) -> dict[str, Any]:
        phone = str(args.get("to_phone", "")).strip()
        task = str(args.get("goal", args.get("prompt", ""))).strip()
        language = str(args.get("language", "en")).strip() or "en"
        locale = _locale_for(language, self.settings.region)
        body = {
            "task": task,
            "recipients": [
                {
                    "phones": [phone],
                    "region": self.settings.region,
                    "locale": locale,
                }
            ],
            "result_schema": _task_result_schema(),
            "recipient_result_schema": _recipient_result_schema(),
            "metadata": {
                "source": "care-call-ai",
                "recipient_id": str(args.get("recipient_id", "")),
                "idempotency_key": str(args.get("idempotency_key", "")),
                "route": str(args.get("route", "")),
            },
        }
        return self._request("POST", "/v1/calls", body, idempotency_key=str(args.get("idempotency_key", "")))

    def _get_call(self, call_id: str) -> dict[str, Any]:
        return self._request("GET", f"/v1/calls/{call_id}", None)

    def _request(self, method: str, path: str, body: dict[str, Any] | None, idempotency_key: str = "") -> dict[str, Any]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Accept": "application/json",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        request = urllib.request.Request(
            self.settings.base_url.rstrip("/") + path,
            data=data,
            method=method,
            headers=headers,
        )
        with urllib.request.urlopen(request, timeout=self.settings.timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        if not raw.strip():
            return {}
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
        return {"value": parsed}


def _locale_for(language: str, region: str) -> str:
    normalized = language.strip().lower()
    if "-" in normalized:
        return normalized
    if normalized == "ru":
        return "ru-RU"
    if normalized == "en":
        return "en-GB" if region.upper() == "GB" else "en-US"
    return normalized


def _task_result_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "required": ["completed_count"],
        "properties": {
            "completed_count": {"type": "integer"},
        },
    }


def _recipient_result_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "required": ["summary", "needs"],
        "properties": {
            "summary": {"type": "string"},
            "needs": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["category", "items"],
                    "properties": {
                        "category": {"type": "string"},
                        "items": {"type": "array", "items": {"type": "string"}},
                        "urgency": {"type": "string"},
                        "notes": {"type": "string"},
                    },
                },
            },
        },
    }
