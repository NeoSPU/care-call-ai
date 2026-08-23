"""Screen-shaped JSON DTO builders for CareCall backend state."""

from __future__ import annotations

from .domain import DashboardState, RecipientDetail


def dashboard_payload(state: DashboardState) -> dict:
    ready = sum(1 for card in state.recipients if _automation_eligible(card))
    need_categories = _request_categories_by_recipient(state.service_requests)
    return {
        "service": "carecall-backend",
        "summary": {
            "recipients": len(state.recipients),
            "ready": ready,
            "blocked": len(state.preflight_previews) - ready,
            "service_requests": len(state.service_requests),
            "stale_approvals": sum(1 for approval in state.approvals if approval.stale),
        },
        "recipients": [
            {
                **_recipient_card(card),
                "need_categories": need_categories.get(card.id, []),
            }
            for card in state.recipients
        ],
        "planned_calls": [
            {
                "recipient_id": preview.recipient_id,
                "recipient_label": preview.recipient_label,
                "masked_phone": preview.masked_phone,
                "ready": preview.ready,
                "route": preview.route,
                "idempotency_key": preview.idempotency_key if preview.ready else "",
                "blocked_reasons": list(preview.blocked_reasons),
                "authorized_contacts": _authorized_contacts(preview.authorized_contacts),
                "same_day_call_count": preview.same_day_call_count,
                "operator_repeat_available": preview.operator_repeat_available,
                "operator_repeat_limit_reached": preview.operator_repeat_limit_reached,
                "same_day_repeat_warning": preview.same_day_repeat_warning,
            }
            for preview in state.preflight_previews
        ],
        "call_status": {
            "preflight_plans": [_preflight_plan(plan) for plan in state.preflight_plans],
            "approvals": [_approval(approval) for approval in state.approvals],
            "intake_results": [_intake_result(result) for result in state.intake_results],
        },
        "service_requests": [_service_request(request) for request in state.service_requests],
        "callback_requests": [_callback_request(request, state) for request in state.callback_requests],
    }


def operations_dashboard_payload(state: DashboardState, selected_recipient_ids: tuple[str, ...] = ()) -> dict:
    selected_ids = set(selected_recipient_ids)
    recipients = state.recipients
    auto_eligible = [card for card in recipients if _automation_eligible(card)]
    operator_control = [
        card
        for card in recipients
        if _automation_status(card) in {"operator_review", "operator_only", "manual_only"}
    ]
    not_allowed = [card for card in recipients if card.blocked or _automation_status(card) == "blocked"]
    callback_new = [request for request in state.callback_requests if request.status == "operator_review"]
    return {
        "service": "carecall-backend",
        "slogan": {
            "care_seen": "Dashboard",
            "needs_heard": "Operator Panel",
            "help_delivered": "Orders",
        },
        "summary": {
            "registered_recipients": len(recipients),
            "ready_for_auto_call": len(auto_eligible),
            "eligible_not_selected": sum(1 for card in auto_eligible if card.id not in selected_ids),
            "operator_control_required": len(operator_control),
            "not_allowed_for_auto_call": len(not_allowed),
            "service_requests": len(state.service_requests),
            "orders_ready": sum(1 for request in state.service_requests if request.status == "ready_to_print"),
            "urgent_callbacks": len(callback_new),
        },
        "by_safety_category": _count_values(card.safety_category.value for card in recipients),
        "by_condition": _count_values(card.condition.value for card in recipients),
        "by_need_category": _count_values(request.category for request in state.service_requests),
        "session": {
            "calls_planned": len(state.preflight_previews),
            "calls_completed": len(state.intake_results),
            "needs_captured": sum(len(result.needs) for result in state.intake_results),
            "orders_generated": len(state.service_requests),
            "human_reviews": sum(1 for result in state.intake_results if result.human_review),
            "stale_approvals": sum(1 for approval in state.approvals if approval.stale),
        },
        "alerts": {
            "urgent_callbacks": len(callback_new),
            "stale_approvals": sum(1 for approval in state.approvals if approval.stale),
            "eligible_not_selected": sum(1 for card in auto_eligible if card.id not in selected_ids),
        },
    }


def recipient_detail_payload(detail: RecipientDetail) -> dict:
    recipient = detail.card.recipient
    recipient_card = _recipient_card(detail.card)
    recipient_card["need_categories"] = sorted({request.category for request in detail.service_requests})
    return {
        "recipient": recipient_card,
        "care_profile": {
            "condition": recipient.care_profile.condition.value if recipient else "",
            "severity": recipient.care_profile.severity.value if recipient else "",
            "language": recipient.care_profile.language if recipient else "",
            "timezone": recipient.care_profile.timezone if recipient else "",
            "communication_rules": list(recipient.care_profile.communication_rules) if recipient else [],
            "consent_status": recipient.consent.status.value if recipient else "",
            "consent_evidence": recipient.consent.evidence if recipient else "",
            "authorized_contacts": _authorized_contacts(recipient.authorized_contacts)
            if recipient
            else [],
        },
        "contact_channels": {
            "phone_e164": recipient.phone_e164 if recipient else "",
            "caregiver_phone_e164": recipient.caregiver_phone_e164 if recipient and recipient.caregiver_phone_e164 else "",
        },
        "call_outcome": _intake_result(detail.intake_results[0]) if detail.intake_results else None,
        "extracted_needs": [
            need
            for result in detail.intake_results
            for need in result.needs
        ],
        "service_requests": [_service_request(request) for request in detail.service_requests],
        "risk_audit": [_risk_audit(entry) for entry in detail.risk_audit],
        "card_audit": [_card_audit(entry) for entry in detail.card_audit],
        "approvals": [_approval(approval) for approval in detail.approvals],
    }


def preflight_payload_from_plan(state: DashboardState) -> dict:
    return dashboard_payload(state)["planned_calls"]


def approval_payload(detail: RecipientDetail) -> dict:
    return {"approvals": [_approval(approval) for approval in detail.approvals]}


def preflight_plan_payload(plan, ready_previews, manual_previews, blocked_previews) -> dict:
    return {
        "plan_id": plan.id,
        "batch_id": plan.batch_id,
        "call_date": plan.call_date,
        "ready_keys": list(plan.ready_keys),
        "current": True,
        "ready_previews": [_preview(preview) for preview in ready_previews],
        "manual_previews": [_preview(preview) for preview in manual_previews],
        "blocked_previews": [_preview(preview) for preview in blocked_previews],
    }


def approval_record_payload(record, approved: bool, status: str = "accepted", reasons: tuple[str, ...] = ()) -> dict:
    return {
        "approved": approved,
        "status": status,
        "blocked_reasons": list(reasons),
        "approval": _approval(record) if record is not None else None,
    }


def execution_payload(
    records,
    accepted: bool,
    mode: str,
    blocked_reasons: tuple[str, ...] = (),
    runner_commands: tuple = (),
) -> dict:
    return {
        "accepted": accepted,
        "mode": mode,
        "real_calls_placed": len(records) if mode == "live" and accepted else 0,
        "blocked_reasons": list(blocked_reasons),
        "runner_commands": list(runner_commands),
        "records": [_run_record(record) for record in records],
    }


def print_orders_payload(state: DashboardState, include_demo_ready: bool = False) -> dict:
    return {
        "service_requests": [
            {
                **item,
                "status": "ready_to_print" if include_demo_ready else item["status"],
            }
            for request in state.service_requests
            for item in (_service_request(request),)
        ]
    }


def callback_requests_payload(requests, state: DashboardState) -> dict:
    return {
        "summary": {
            "new": sum(1 for request in requests if request.status == "operator_review"),
            "in_review": sum(1 for request in requests if request.status == "operator_review"),
            "callback_approved": sum(1 for request in requests if request.status == "approved_callback"),
            "resolved": sum(1 for request in requests if request.status == "resolved"),
        },
        "callback_requests": [_callback_request(request, state) for request in requests],
    }


def service_requests_payload(requests) -> dict:
    return {"service_requests": [_service_request(request) for request in requests]}


def run_status_payload(run) -> dict:
    return {"run": _run_record(run)}


def result_bundle_payload(bundle: dict) -> dict:
    return {
        "run": _run_record(bundle["run"]),
        "intake_result": _intake_result(bundle["intake_result"]),
        "service_requests": [_service_request(request) for request in bundle["service_requests"]],
    }


def _recipient_card(card) -> dict:
    automation_status = _automation_status(card)
    return {
        "id": card.id,
        "display_name": card.display_name,
        "masked_phone": card.masked_phone,
        "safety_category": card.safety_category.value,
        "blocked": card.blocked,
        "blocked_reasons": list(card.blocked_reasons),
        "route": card.route,
        "delivery_area": card.delivery_area,
        "address": card.address,
        "notes": card.notes,
        "condition": card.condition.value,
        "severity": card.severity.value,
        "special_handling_reviewed": card.special_handling_reviewed,
        "automation_eligible": automation_status == "auto_call",
        "automation_status": automation_status,
    }


def _automation_eligible(card) -> bool:
    return _automation_status(card) == "auto_call"


def _automation_status(card) -> str:
    if card.blocked:
        return "blocked"
    if card.safety_category.value == "critical":
        return "manual_only"
    if card.safety_category.value == "special_handling":
        return "operator_review"
    if card.route != "recipient":
        return "operator_only"
    return "auto_call"


def _request_categories_by_recipient(requests) -> dict[str, list[str]]:
    categories: dict[str, set[str]] = {}
    for request in requests:
        categories.setdefault(request.recipient_id, set()).add(request.category)
    return {recipient_id: sorted(values) for recipient_id, values in categories.items()}


def _count_values(values) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        key = str(value or "unknown")
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def _preflight_plan(plan) -> dict:
    return {
        "id": plan.id,
        "batch_id": plan.batch_id,
        "call_date": plan.call_date,
        "ready_keys": list(plan.ready_keys),
        "created_at": plan.created_at,
    }


def _preview(preview) -> dict:
    return {
        "recipient_id": preview.recipient_id,
        "recipient_label": preview.recipient_label,
        "masked_phone": preview.masked_phone,
        "route": preview.route,
        "ready": preview.ready,
        "idempotency_key": preview.idempotency_key if preview.ready else "",
        "blocked_reasons": list(preview.blocked_reasons),
        "authorized_contacts": _authorized_contacts(preview.authorized_contacts),
        "same_day_call_count": preview.same_day_call_count,
        "operator_repeat_available": preview.operator_repeat_available,
        "operator_repeat_limit_reached": preview.operator_repeat_limit_reached,
        "same_day_repeat_warning": preview.same_day_repeat_warning,
    }


def _authorized_contacts(contacts) -> list[dict]:
    return [
        {
            "name": contact.name,
            "relationship": contact.relationship,
            "can_answer_intake": contact.can_answer_intake,
            "preferred_goodbye": contact.preferred_goodbye,
        }
        for contact in contacts
    ]


def _approval(approval) -> dict:
    return {
        "id": approval.id,
        "plan_id": approval.plan_id,
        "batch_id": approval.batch_id,
        "recipient_ids": list(approval.recipient_ids),
        "approved_keys": list(approval.approved_keys),
        "operator": approval.operator,
        "approved_at": approval.approved_at,
        "note": approval.note,
        "confirmations": approval.confirmations,
        "authorization_phrase": approval.authorization_phrase,
        "stale": approval.stale,
    }


def _intake_result(result) -> dict:
    return {
        "id": result.id,
        "recipient_id": result.recipient_id,
        "status": result.status,
        "summary": result.summary,
        "human_review": result.human_review,
        "needs": list(result.needs),
    }


def _service_request(request) -> dict:
    return {
        "id": request.id,
        "recipient_id": request.recipient_id,
        "category": request.category,
        "queue": request.queue,
        "sla_hours": request.sla_hours,
        "priority": request.priority,
        "status": request.status,
        "items": list(request.items),
        "notes": request.notes,
        "human_review_reason": request.human_review_reason,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
        "update_count": request.update_count,
        "update_history": list(request.update_history),
    }


def _callback_request(request, state: DashboardState) -> dict:
    cards = {card.id: card for card in state.recipients}
    card = cards.get(request.recipient_id)
    return {
        "id": request.id,
        "recipient_id": request.recipient_id,
        "recipient_name": card.display_name if card else request.recipient_id,
        "source": request.source,
        "request_text": request.request_text,
        "status": request.status,
        "priority": request.priority,
        "operator": request.operator,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
        "resolution_note": request.resolution_note,
        "safety_category": card.safety_category.value if card else "",
        "condition": card.condition.value if card else "",
        "masked_phone": card.masked_phone if card else "",
        "delivery_area": card.delivery_area if card else "",
        "blocked": card.blocked if card else True,
    }


def _risk_audit(entry) -> dict:
    return {
        "id": entry.id,
        "recipient_id": entry.recipient_id,
        "old_value": entry.old_value.value,
        "new_value": entry.new_value.value,
        "operator": entry.operator,
        "changed_at": entry.changed_at,
        "note": entry.note,
    }


def _card_audit(entry) -> dict:
    return {
        "id": entry.id,
        "recipient_id": entry.recipient_id,
        "operator": entry.operator,
        "changed_at": entry.changed_at,
        "summary": entry.summary,
    }


def _run_record(record) -> dict:
    return {
        "id": record.id,
        "plan_id": record.plan_id,
        "approval_id": record.approval_id,
        "recipient_id": record.recipient_id,
        "idempotency_key": record.idempotency_key,
        "status": record.status,
        "mode": record.mode,
        "provider_plan_id": record.provider_plan_id,
        "provider_run_id": record.provider_run_id,
        "started_at": record.started_at,
        "completed_at": record.completed_at,
        "error": record.error,
        "masked_phone": record.masked_phone,
    }
