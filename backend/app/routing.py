"""Rule-based conversion from extracted needs to service requests."""

from __future__ import annotations

from dataclasses import dataclass

from .domain import ServiceRequestStatus
from .extraction import (
    ExtractedNeed,
    IntakeResult,
    IntakeStatus,
    NeedCategory,
    ReviewState,
    ReviewReasonCode,
    Urgency,
)


ROUTING_RULES = {
    NeedCategory.GROCERIES: ("delivery_volunteers", 4),
    NeedCategory.MEDICATION: ("pharmacy_delivery", 2),
    NeedCategory.CLEANING: ("household_helpers", 24),
    NeedCategory.TRANSPORT: ("social_taxi", 1),
    NeedCategory.MEDICAL_VISIT: ("medical_escort", 2),
    NeedCategory.COMPANIONSHIP: ("volunteer_visitors", 48),
    NeedCategory.REPAIR: ("maintenance_team", 72),
    NeedCategory.DOCUMENTS: ("social_worker", 24),
    NeedCategory.OTHER: ("coordinator_review", 8),
}


@dataclass(frozen=True)
class ServiceRequest:
    recipient_id: str
    category: NeedCategory
    queue: str
    sla_hours: int
    priority: str
    status: ServiceRequestStatus
    items: tuple[str, ...]
    notes: str = ""
    human_review_reason: str = ""


def route_intake_result(result: IntakeResult) -> tuple[ServiceRequest, ...]:
    if result.status in {IntakeStatus.NO_CONTACT, IntakeStatus.EMERGENCY, IntakeStatus.DISTRESS, IntakeStatus.MALFORMED}:
        return (_review_request(result),)

    requests = [route_need(result.recipient_id, need) for need in result.needs]
    if result.human_review and not requests and _only_prohibited_requests(result):
        return ()
    if result.human_review and not requests:
        return (_review_request(result),)
    return tuple(requests)


def route_need(recipient_id: str, need: ExtractedNeed) -> ServiceRequest:
    queue, sla_hours = ROUTING_RULES[need.category]
    priority = "urgent" if need.urgency in {Urgency.TODAY, Urgency.TOMORROW} else "normal"
    status = ServiceRequestStatus.REVIEW if need.review_state == ReviewState.HUMAN_REVIEW else ServiceRequestStatus.READY_TO_PRINT
    reason = ""
    if status == ServiceRequestStatus.REVIEW:
        reason = "Need category or urgency requires coordinator review."

    return ServiceRequest(
        recipient_id=recipient_id,
        category=need.category,
        queue=queue,
        sla_hours=sla_hours,
        priority=priority,
        status=status,
        items=need.items,
        notes=need.notes,
        human_review_reason=reason,
    )


def _review_request(result: IntakeResult) -> ServiceRequest:
    reason = "; ".join(result.review_reasons) or f"Call status requires review: {result.status.value}."
    return ServiceRequest(
        recipient_id=result.recipient_id,
        category=NeedCategory.OTHER,
        queue="coordinator_review",
        sla_hours=1 if result.status in {IntakeStatus.EMERGENCY, IntakeStatus.DISTRESS} else 8,
        priority="urgent" if result.status in {IntakeStatus.EMERGENCY, IntakeStatus.DISTRESS} else "review",
        status=ServiceRequestStatus.REVIEW,
        items=(),
        notes=result.summary,
        human_review_reason=reason,
    )


def _only_prohibited_requests(result: IntakeResult) -> bool:
    if not result.review_reason_codes:
        return False
    return set(result.review_reason_codes) == {ReviewReasonCode.PROHIBITED_REQUEST_EXCLUDED}
