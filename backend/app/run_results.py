"""CALL-E run result processing and JSON persistence helpers."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from .calle_execution import CallRunRecord, CallRunStatus
from .extraction import IntakeResult, extract_intake_result
from .routing import ServiceRequest, route_intake_result


@dataclass(frozen=True)
class RunResultBundle:
    call_record: CallRunRecord
    intake_result: IntakeResult
    service_requests: tuple[ServiceRequest, ...]


def process_call_result(record: CallRunRecord, payload: dict) -> RunResultBundle:
    if record.status == CallRunStatus.FAILED:
        payload = {
            "status": "malformed",
            "summary": record.error,
            "human_review": True,
            "needs": [],
        }
    intake = extract_intake_result(record.recipient_id, payload)
    requests = route_intake_result(intake)
    return RunResultBundle(record, intake, requests)


def save_run_bundle(bundle: RunResultBundle, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_bundle_to_json(bundle), indent=2), encoding="utf-8")


def load_run_bundle(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _bundle_to_json(bundle: RunResultBundle) -> dict:
    return {
        "call_record": asdict(bundle.call_record),
        "intake_result": asdict(bundle.intake_result),
        "service_requests": [asdict(request) for request in bundle.service_requests],
    }
