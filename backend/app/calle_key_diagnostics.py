"""Safe CALL-E Developer API key diagnostics.

This module is intended for console use inside the backend container. It never
places calls and never prints the API key value.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass

from .calle_developer_api import CALLE_API_KEY_ENV, CALLE_PROVIDER_ENV, settings_from_env


NON_DIAL_PROBE_CALL_ID = "carecall-key-diagnostic-nonexistent"


@dataclass(frozen=True)
class KeyDiagnostic:
    provider: str
    base_url: str
    region: str
    timeout_seconds: int
    key_present: bool
    key_length: int
    key_sha256_12: str
    probe_ran: bool
    probe_authenticated: bool | None = None
    probe_http_status: int | None = None
    probe_result: str = ""
    probe_error: str = ""


def diagnose_key(env: dict[str, str] | None = None, probe: bool = False) -> KeyDiagnostic:
    import os

    env = os.environ if env is None else env
    settings = settings_from_env(env)
    credential = settings.api_key
    diagnostic = KeyDiagnostic(
        provider=env.get(CALLE_PROVIDER_ENV, ""),
        base_url=settings.base_url,
        region=settings.region,
        timeout_seconds=settings.timeout_seconds,
        key_present=bool(credential),
        key_length=len(credential),
        key_sha256_12=hashlib.sha256(credential.encode("utf-8")).hexdigest()[:12] if credential else "",
        probe_ran=False,
    )
    if not probe:
        return diagnostic
    return _with_probe(diagnostic, settings.base_url, credential, settings.timeout_seconds)


def _with_probe(diagnostic: KeyDiagnostic, base_url: str, credential: str, timeout_seconds: int) -> KeyDiagnostic:
    if not credential:
        return _replace(
            diagnostic,
            probe_ran=True,
            probe_authenticated=False,
            probe_result="missing_api_key",
            probe_error=f"{CALLE_API_KEY_ENV} is not set.",
        )

    request = urllib.request.Request(
        base_url.rstrip("/") + f"/v1/calls/{NON_DIAL_PROBE_CALL_ID}",
        method="GET",
        headers={
            "Authorization": f"Bearer {credential}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            response.read()
        return _replace(
            diagnostic,
            probe_ran=True,
            probe_authenticated=True,
            probe_http_status=200,
            probe_result="authenticated",
        )
    except urllib.error.HTTPError as exc:
        body = _read_http_error_body(exc)
        if exc.code in {401, 403}:
            return _replace(
                diagnostic,
                probe_ran=True,
                probe_authenticated=False,
                probe_http_status=exc.code,
                probe_result="auth_failed",
                probe_error=body or exc.reason,
            )
        if exc.code == 404:
            return _replace(
                diagnostic,
                probe_ran=True,
                probe_authenticated=True,
                probe_http_status=exc.code,
                probe_result="authenticated_not_found_expected",
                probe_error=body,
            )
        return _replace(
            diagnostic,
            probe_ran=True,
            probe_authenticated=None,
            probe_http_status=exc.code,
            probe_result="provider_or_request_error",
            probe_error=body or exc.reason,
        )
    except urllib.error.URLError as exc:
        return _replace(
            diagnostic,
            probe_ran=True,
            probe_authenticated=None,
            probe_result="network_error",
            probe_error=str(exc),
        )
    except TimeoutError as exc:
        return _replace(
            diagnostic,
            probe_ran=True,
            probe_authenticated=None,
            probe_result="timeout",
            probe_error=str(exc),
        )


def _read_http_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        return exc.read().decode("utf-8", errors="replace").strip()
    except Exception:
        return ""


def _replace(diagnostic: KeyDiagnostic, **changes) -> KeyDiagnostic:
    values = asdict(diagnostic)
    values.update(changes)
    return KeyDiagnostic(**values)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Safely inspect CALL-E Developer API key configuration.")
    parser.add_argument("--probe", action="store_true", help="Run a no-call authentication probe against CALL-E.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args(argv)

    diagnostic = diagnose_key(probe=args.probe)
    payload = asdict(diagnostic)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        for key, value in payload.items():
            print(f"{key}={value}")

    if args.probe and diagnostic.probe_authenticated is False:
        return 2
    if args.probe and diagnostic.probe_authenticated is None:
        return 3
    if not diagnostic.key_present:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
