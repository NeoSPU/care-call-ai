"""Server-side CALL-E MCP HTTP runner.

This adapter keeps CALL-E credentials on the backend. It exposes a small
subprocess-like callable so the guarded execution path can switch between the
local ``calle`` CLI and an MCP HTTP token provider without changing approval
logic.
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any


CALLE_PROVIDER_ENV = "CARECALL_CALLE_PROVIDER"
CALLE_MCP_SERVER_URL_ENV = "CARECALL_CALLE_MCP_SERVER_URL"
CALLE_AUTH_TOKEN_ENV = "CARECALL_CALLE_AUTH_TOKEN"
CALLE_REGION_ENV = "CARECALL_CALLE_REGION"


@dataclass(frozen=True)
class McpHttpSettings:
    server_url: str
    auth_token: str
    region: str = "GB"
    timeout_seconds: int = 30

    @property
    def configured(self) -> bool:
        return bool(self.server_url.strip() and self.auth_token.strip())


def mcp_http_enabled(env: dict[str, str] | None = None) -> bool:
    env = os.environ if env is None else env
    return env.get(CALLE_PROVIDER_ENV, "").strip().lower() in {"mcp_http", "mcp-http"}


def settings_from_env(env: dict[str, str] | None = None) -> McpHttpSettings:
    env = os.environ if env is None else env
    timeout = 30
    try:
        timeout = int(env.get("CARECALL_CALLE_TIMEOUT_SECONDS", "30"))
    except ValueError:
        timeout = 30
    return McpHttpSettings(
        server_url=env.get(CALLE_MCP_SERVER_URL_ENV, "").strip(),
        auth_token=env.get(CALLE_AUTH_TOKEN_ENV, "").strip(),
        region=env.get(CALLE_REGION_ENV, "GB").strip() or "GB",
        timeout_seconds=timeout,
    )


def mcp_http_runner_from_env(env: dict[str, str] | None = None):
    return McpHttpRunner(settings_from_env(env))


class McpHttpRunner:
    def __init__(self, settings: McpHttpSettings):
        self.settings = settings
        self.commands: list[tuple[str, ...]] = []
        self.session_id = ""
        self.initialized = False

    def __call__(self, command: tuple[str, ...], env: dict[str, str]) -> subprocess.CompletedProcess:
        self.commands.append(command)
        if not self.settings.configured:
            return subprocess.CompletedProcess(command, 2, "", "CALL-E MCP HTTP settings are not configured.")

        try:
            if command == ("calle", "mcp", "tools"):
                payload = self._rpc("tools/list", {})
                return subprocess.CompletedProcess(command, 0, json.dumps(payload), "")
            if command[0:2] == ("calle", "plan_call"):
                args = json.loads(command[2]) if len(command) > 2 else {}
                payload = self._call_tool("plan_call", _plan_call_arguments(args, self.settings.region))
                return subprocess.CompletedProcess(command, 0, json.dumps(payload), "")
            if command[0:2] == ("calle", "run_call"):
                arguments = {"plan_id": command[2] if len(command) > 2 else ""}
                if len(command) > 3 and command[3]:
                    arguments["confirm_token"] = command[3]
                payload = self._call_tool("run_call", arguments)
                return subprocess.CompletedProcess(command, 0, json.dumps(payload), "")
            if command[0:2] == ("calle", "get_call_run"):
                payload = self._call_tool("get_call_run", {"run_id": command[2] if len(command) > 2 else ""})
                return subprocess.CompletedProcess(command, 0, json.dumps(payload), "")
        except (ValueError, urllib.error.URLError, TimeoutError) as exc:
            return subprocess.CompletedProcess(command, 1, "", str(exc))

        return subprocess.CompletedProcess(command, 2, "", f"Unsupported CALL-E command for MCP HTTP runner: {command}")

    def _call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self._ensure_initialized()
        return _normalize_tool_result(
            self._rpc(
                "tools/call",
                {
                    "name": name,
                    "arguments": arguments,
                },
            )
        )

    def _ensure_initialized(self) -> None:
        if self.initialized:
            return
        self._rpc(
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {
                    "name": "care-call-ai-backend",
                    "version": "0.1.0",
                },
            },
            initialize=False,
        )
        self.initialized = True
        try:
            self._notification("notifications/initialized", {})
        except (urllib.error.URLError, TimeoutError, ValueError):
            # Some MCP HTTP implementations accept initialized notifications
            # only on persistent transports. Tool calls remain the real check.
            pass

    def _notification(self, method: str, params: dict[str, Any]) -> None:
        body = json.dumps(
            {
                "jsonrpc": "2.0",
                "method": method,
                "params": params,
            }
        ).encode("utf-8")
        self._send(body)

    def _rpc(self, method: str, params: dict[str, Any], initialize: bool = True) -> dict[str, Any]:
        if initialize and method != "initialize":
            self._ensure_initialized()
        body = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": uuid.uuid4().hex,
                "method": method,
                "params": params,
            }
        ).encode("utf-8")
        raw = self._send(body)
        payload = _decode_mcp_response(raw)
        if "error" in payload:
            raise ValueError(json.dumps(payload["error"]))
        result = payload.get("result")
        if isinstance(result, dict):
            return result
        return {"result": result}

    def _send(self, body: bytes) -> str:
        headers = {
            "Authorization": f"Bearer {self.settings.auth_token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        request = urllib.request.Request(
            self.settings.server_url,
            data=body,
            method="POST",
            headers=headers,
        )
        with urllib.request.urlopen(request, timeout=self.settings.timeout_seconds) as response:
            self.session_id = self.session_id or response.headers.get("Mcp-Session-Id", "")
            raw = response.read().decode("utf-8")
        return raw


def _plan_call_arguments(args: dict[str, Any], region: str) -> dict[str, Any]:
    goal = args.get("goal", args.get("prompt", ""))
    phone = args.get("to_phone", "")
    return {
        "to_phones": [phone],
        "goal": goal,
        "language": args.get("language", "en"),
        "region": args.get("region", region),
        "user_input": f"Call {phone}. {goal}",
    }


def _decode_mcp_response(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if not text:
        return {}
    if text.startswith("event:") or text.startswith("data:"):
        for line in text.splitlines():
            if line.startswith("data:"):
                return json.loads(line.removeprefix("data:").strip())
        return {}
    parsed = json.loads(text)
    if isinstance(parsed, dict):
        return parsed
    return {"result": parsed}


def _normalize_tool_result(result: dict[str, Any]) -> dict[str, Any]:
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        return structured

    content = result.get("content")
    if isinstance(content, list):
        text_parts = [item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text"]
        text = "\n".join(part for part in text_parts if part).strip()
        if text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                return {"text": text}
            if isinstance(parsed, dict):
                return parsed
            return {"result": parsed}

    return result
