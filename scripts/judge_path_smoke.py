#!/usr/bin/env python3
"""No-call smoke check for the deployed Care Call AI judge path."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http.cookiejar import CookieJar
from typing import Any


DEFAULT_FRONTEND_URL = "https://care.alexraixon.com"
REQUIRED_ENV = ("CARECALL_OPERATOR_USERNAME", "CARECALL_OPERATOR_PASSWORD")
ENV_FILES = (".env", ".env.local", "frontend/.env.local", "frontend/.env.production.local")


@dataclass(frozen=True)
class SmokeResult:
    ok: bool
    message: str


def normalize_base_url(value: str) -> str:
    return value.strip().rstrip("/")


def require_env(env: dict[str, str]) -> list[SmokeResult]:
    hint = f"set it in one of: {', '.join(ENV_FILES)}"
    return [
        SmokeResult(
            bool(env.get(name, "").strip()),
            f"{name} is set" if env.get(name, "").strip() else f"{name} is missing ({hint})",
        )
        for name in REQUIRED_ENV
    ]


def parse_dotenv_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = stripped.split("=", 1)
    key = key.strip()
    if key.startswith("export "):
        key = key.removeprefix("export ").strip()
    if not key:
        return None
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    return key, value


def load_env_files() -> dict[str, str]:
    env = dict(os.environ)
    for path in ENV_FILES:
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle:
                parsed = parse_dotenv_line(line)
                if parsed is None:
                    continue
                key, value = parsed
                env.setdefault(key, value)
    return env


def request(
    opener: urllib.request.OpenerDirector,
    base_url: str,
    path: str,
    *,
    data: bytes | None = None,
    content_type: str | None = None,
    timeout: int = 20,
) -> tuple[int, str, str]:
    headers = {"User-Agent": "carecall-judge-smoke/1.0"}
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(f"{base_url}{path}", data=data, headers=headers)
    with opener.open(req, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        return response.status, response.headers.get("Content-Type", ""), body


def json_request(opener: urllib.request.OpenerDirector, base_url: str, path: str, timeout: int) -> tuple[int, Any]:
    status, content_type, body = request(opener, base_url, path, timeout=timeout)
    if "application/json" not in content_type:
        raise ValueError(f"{path} returned non-JSON content type {content_type!r}")
    return status, json.loads(body)


def check_html_page(opener: urllib.request.OpenerDirector, base_url: str, path: str, timeout: int) -> SmokeResult:
    status, content_type, _body = request(opener, base_url, path, timeout=timeout)
    return SmokeResult(status == 200 and "text/html" in content_type, f"{path} returns HTML 200")


def login(opener: urllib.request.OpenerDirector, base_url: str, env: dict[str, str], timeout: int) -> SmokeResult:
    form = urllib.parse.urlencode(
        {
            "username": env["CARECALL_OPERATOR_USERNAME"],
            "password": env["CARECALL_OPERATOR_PASSWORD"],
            "next": "/dashboard",
        }
    ).encode("utf-8")
    status, _content_type, _body = request(
        opener,
        base_url,
        "/api/auth/login",
        data=form,
        content_type="application/x-www-form-urlencoded",
        timeout=timeout,
    )
    return SmokeResult(status == 200, "operator login reaches protected dashboard")


def check_dashboard_proxy(opener: urllib.request.OpenerDirector, base_url: str, timeout: int) -> list[SmokeResult]:
    results: list[SmokeResult] = []
    status, payload = json_request(opener, base_url, "/api/carecall/api/dashboard", timeout)
    summary = payload.get("summary") if isinstance(payload, dict) else None
    results.append(SmokeResult(status == 200, "frontend proxy returns dashboard JSON 200"))
    results.append(SmokeResult(isinstance(summary, dict) and "recipients" in summary, "dashboard JSON contains recipient summary"))
    status, payload = json_request(opener, base_url, "/api/carecall/api/orders/print", timeout)
    service_requests = payload.get("service_requests") if isinstance(payload, dict) else None
    results.append(SmokeResult(status == 200, "frontend proxy returns print-orders JSON 200"))
    results.append(SmokeResult(isinstance(service_requests, list), "print-orders JSON contains service_requests list"))
    return results


def run_smoke(base_url: str, env: dict[str, str], timeout: int = 20) -> list[SmokeResult]:
    results = require_env(env)
    if any(not result.ok for result in results):
        return results

    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    try:
        results.append(check_html_page(opener, base_url, "/login", timeout))
        results.append(login(opener, base_url, env, timeout))
        results.append(check_html_page(opener, base_url, "/dashboard", timeout))
        results.extend(check_dashboard_proxy(opener, base_url, timeout))
    except (TimeoutError, urllib.error.URLError, urllib.error.HTTPError, ValueError, json.JSONDecodeError) as error:
        results.append(SmokeResult(False, f"deployed judge path request failed: {type(error).__name__}"))
    return results


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default=os.environ.get("CARECALL_FRONTEND_URL", DEFAULT_FRONTEND_URL),
        help=f"Frontend URL to check. Defaults to CARECALL_FRONTEND_URL or {DEFAULT_FRONTEND_URL}.",
    )
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout per request in seconds.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    results = run_smoke(normalize_base_url(args.url), load_env_files(), args.timeout)
    for result in results:
        print(f"[{'ok' if result.ok else 'fail'}] {result.message}")
    failures = [result for result in results if not result.ok]
    if failures:
        print(f"CareCall judge-path smoke failed with {len(failures)} issue(s).", file=sys.stderr)
        return 1
    print("CareCall judge-path smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
