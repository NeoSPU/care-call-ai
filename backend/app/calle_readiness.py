"""Safe CALL-E CLI readiness checks.

This module never places outbound calls. It only runs setup/readiness commands
listed in CALL-E-installation-guide.md.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass, field
from typing import Callable

from .calle_mcp_http import mcp_http_enabled, mcp_http_runner_from_env, settings_from_env


SAFE_CALLE_ENV = {
    "CALLE_SOURCE": "skills_sh",
    "CALLE_INTEGRATION": "skills_sh_skill",
    "CALLE_INTEGRATION_VERSION": "0.1.0",
}
REQUIRED_TOOLS = ("plan_call", "run_call", "get_call_run")

CommandRunner = Callable[[tuple[str, ...], dict[str, str]], subprocess.CompletedProcess]


@dataclass(frozen=True)
class CommandCheck:
    name: str
    command: tuple[str, ...]
    success: bool
    output: str = ""
    error: str = ""


@dataclass(frozen=True)
class CalleReadiness:
    cli_available: bool
    authenticated: bool
    tools_available: bool
    required_tools: tuple[str, ...] = REQUIRED_TOOLS
    missing_tools: tuple[str, ...] = field(default_factory=tuple)
    checks: tuple[CommandCheck, ...] = field(default_factory=tuple)

    @property
    def ready(self) -> bool:
        return self.cli_available and self.authenticated and self.tools_available


def default_runner(command: tuple[str, ...], env: dict[str, str]) -> subprocess.CompletedProcess:
    merged_env = {**os.environ, **env}
    return subprocess.run(
        command,
        capture_output=True,
        env=merged_env,
        text=True,
        timeout=20,
        check=False,
    )


def check_calle_readiness(runner: CommandRunner = default_runner) -> CalleReadiness:
    if runner is default_runner and mcp_http_enabled():
        return check_configured_provider_readiness()

    checks = (
        _run_check("cli", ("calle", "--help"), runner),
        _run_check("auth", ("calle", "auth", "status"), runner),
        _run_check("tools", ("calle", "mcp", "tools"), runner),
    )

    cli_check, auth_check, tools_check = checks
    missing_tools = _missing_tools(tools_check.output if tools_check.success else "")

    return CalleReadiness(
        cli_available=cli_check.success,
        authenticated=auth_check.success,
        tools_available=tools_check.success and not missing_tools,
        missing_tools=missing_tools,
        checks=checks,
    )


def check_configured_provider_readiness(
    env: dict[str, str] | None = None,
    runner: CommandRunner | None = None,
) -> CalleReadiness:
    settings = settings_from_env(env)
    missing = []
    if not settings.server_url:
        missing.append("CARECALL_CALLE_MCP_SERVER_URL")
    if not settings.auth_token:
        missing.append("CARECALL_CALLE_AUTH_TOKEN")
    if missing:
        return CalleReadiness(
            cli_available=True,
            authenticated=bool(settings.auth_token),
            tools_available=False,
            missing_tools=tuple(missing),
            checks=(
                CommandCheck(
                    name="mcp_http_config",
                    command=("carecall", "calle", "mcp_http_config"),
                    success=False,
                    error=", ".join(missing),
                ),
            ),
        )

    runner = mcp_http_runner_from_env(env) if runner is None else runner
    tools_check = _run_check("mcp_http_tools", ("calle", "mcp", "tools"), runner)
    missing_tools = _missing_tools(tools_check.output if tools_check.success else "")
    return CalleReadiness(
        cli_available=True,
        authenticated=tools_check.success,
        tools_available=tools_check.success and not missing_tools,
        missing_tools=missing_tools,
        checks=(tools_check,),
    )


def _run_check(name: str, command: tuple[str, ...], runner: CommandRunner) -> CommandCheck:
    try:
        result = runner(command, SAFE_CALLE_ENV)
    except FileNotFoundError as exc:
        return CommandCheck(name=name, command=command, success=False, error=str(exc))
    except subprocess.TimeoutExpired as exc:
        return CommandCheck(name=name, command=command, success=False, error=str(exc))

    output = "\n".join(part for part in (result.stdout, result.stderr) if part)
    return CommandCheck(
        name=name,
        command=command,
        success=result.returncode == 0,
        output=output,
        error="" if result.returncode == 0 else output,
    )


def _missing_tools(output: str) -> tuple[str, ...]:
    return tuple(tool for tool in REQUIRED_TOOLS if tool not in output)
