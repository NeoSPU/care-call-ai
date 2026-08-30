"""Core CareCall domain types.

These are intentionally dependency-free for Phase 1 so validation can run before
the web framework and CALL-E integration are introduced.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class StrEnum(str, Enum):
    """Small Python 3.9-compatible subset of enum.StrEnum."""


class Condition(StrEnum):
    GENERAL = "general"
    ALZHEIMER = "alzheimer"
    DEMENTIA = "dementia"
    POST_STROKE = "post_stroke"
    HEARING_IMPAIRMENT = "hearing_impairment"
    MOBILITY_IMPAIRMENT = "mobility_impairment"


class Severity(StrEnum):
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


class CallSuitability(StrEnum):
    DIRECT_CALL_OK = "direct_call_ok"
    CAREGIVER_FIRST = "caregiver_first"
    STAFF_ONLY = "staff_only"
    DO_NOT_CALL = "do_not_call"


class ConsentStatus(StrEnum):
    EXPLICIT_CONSENT = "explicit_consent"
    APPROVED_OUTREACH = "approved_outreach"
    MISSING = "missing"
    REVOKED = "revoked"


class SafetyCategory(StrEnum):
    CRITICAL = "critical"
    SPECIAL_HANDLING = "special_handling"
    NON_CRITICAL = "non_critical"


class ServiceRequestStatus(StrEnum):
    READY_TO_PRINT = "ready_to_print"
    REVIEW = "review"
    PENDING = "pending"
    VOID = "void"


class CallbackRequestStatus(StrEnum):
    AUTO_CALLBACK_REQUESTED = "auto_callback_requested"
    AUTO_CALLBACK_STARTED = "auto_callback_started"
    AUTO_CALLBACK_COMPLETED = "auto_callback_completed"
    AUTO_CALLBACK_NO_CONTACT = "auto_callback_no_contact"
    AUTO_CALLBACK_FAILED = "auto_callback_failed"
    CALLBACK_LIMIT_REACHED = "callback_limit_reached"
    OPERATOR_REVIEW = "operator_review"
    APPROVED_CALLBACK = "approved_callback"
    OPERATOR_CALL = "operator_call"
    DISMISSED_DUPLICATE = "dismissed_duplicate"
    RESOLVED = "resolved"


OPERATOR_CREATED_CALLBACK_SOURCE = "operator_created"


@dataclass(frozen=True)
class Consent:
    status: ConsentStatus
    evidence: str


@dataclass(frozen=True)
class CareProfile:
    condition: Condition
    severity: Severity
    language: str
    timezone: str
    call_suitability: CallSuitability
    communication_rules: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class AuthorizedContact:
    name: str
    relationship: str
    can_answer_intake: bool = True
    preferred_goodbye: str = ""


@dataclass(frozen=True)
class Recipient:
    id: str
    display_name: str
    phone_e164: str
    consent: Consent
    care_profile: CareProfile
    caregiver_phone_e164: str | None = None
    notes: str = ""
    authorized_contacts: tuple[AuthorizedContact, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ValidationIssue:
    field: str
    message: str
    blocks_call: bool = True


@dataclass(frozen=True)
class PreflightRow:
    recipient_id: str
    recipient_label: str
    masked_phone: str
    ready: bool
    route: str
    summary: str
    issues: tuple[ValidationIssue, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class RecipientCard:
    id: str
    display_name: str
    masked_phone: str
    safety_category: SafetyCategory
    blocked: bool
    blocked_reasons: tuple[str, ...]
    route: str
    delivery_area: str = ""
    address: str = ""
    notes: str = ""
    condition: Condition = Condition.GENERAL
    severity: Severity = Severity.MILD
    special_handling_reviewed: bool = False
    recipient: Recipient | None = None


@dataclass(frozen=True)
class RiskAuditEntry:
    id: int
    recipient_id: str
    old_value: SafetyCategory
    new_value: SafetyCategory
    operator: str
    changed_at: str
    note: str


@dataclass(frozen=True)
class RecipientCardAuditEntry:
    id: int
    recipient_id: str
    operator: str
    changed_at: str
    summary: str


@dataclass(frozen=True)
class RoundBatch:
    id: str
    label: str
    call_date: str
    selected_recipient_ids: tuple[str, ...]


@dataclass(frozen=True)
class PreflightPlanRecord:
    id: str
    batch_id: str
    call_date: str
    ready_keys: tuple[str, ...]
    created_at: str


@dataclass(frozen=True)
class ApprovalRecord:
    id: str
    plan_id: str
    batch_id: str
    recipient_ids: tuple[str, ...]
    approved_keys: tuple[str, ...]
    operator: str
    approved_at: str
    note: str = ""
    confirmations: dict = field(default_factory=dict)
    authorization_phrase: str = ""
    stale: bool = False


@dataclass(frozen=True)
class StoredCallRun:
    id: str
    plan_id: str
    approval_id: str
    recipient_id: str
    idempotency_key: str
    status: str
    mode: str
    provider_plan_id: str = ""
    provider_run_id: str = ""
    started_at: str = ""
    completed_at: str = ""
    error: str = ""
    masked_phone: str = ""


@dataclass(frozen=True)
class StoredIntakeResult:
    id: str
    recipient_id: str
    status: str
    summary: str
    human_review: bool
    needs: tuple[dict, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class StoredServiceRequest:
    id: str
    recipient_id: str
    category: str
    queue: str
    sla_hours: int
    priority: str
    status: str
    items: tuple[str, ...]
    notes: str = ""
    human_review_reason: str = ""
    created_at: str = ""
    updated_at: str = ""
    update_count: int = 0
    update_history: tuple[dict, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class CallbackRequest:
    id: str
    recipient_id: str
    source: str
    request_text: str
    status: str
    priority: str
    operator: str
    created_at: str
    updated_at: str
    resolution_note: str = ""
    auto_run_id: str = ""
    auto_call_status: str = ""
    auto_call_error: str = ""


@dataclass(frozen=True)
class DashboardState:
    recipients: tuple[RecipientCard, ...]
    preflight_previews: tuple
    preflight_plans: tuple[PreflightPlanRecord, ...]
    approvals: tuple[ApprovalRecord, ...]
    intake_results: tuple[StoredIntakeResult, ...]
    service_requests: tuple[StoredServiceRequest, ...]
    callback_requests: tuple[CallbackRequest, ...] = field(default_factory=tuple)
    call_runs: tuple[StoredCallRun, ...] = field(default_factory=tuple)


def initial_callback_request_status(source: str, card: RecipientCard) -> CallbackRequestStatus:
    if source.strip() == OPERATOR_CREATED_CALLBACK_SOURCE:
        return CallbackRequestStatus.OPERATOR_REVIEW
    if card.blocked or card.safety_category == SafetyCategory.CRITICAL or card.route != "recipient":
        return CallbackRequestStatus.OPERATOR_REVIEW
    return CallbackRequestStatus.AUTO_CALLBACK_REQUESTED


@dataclass(frozen=True)
class RecipientDetail:
    card: RecipientCard
    risk_audit: tuple[RiskAuditEntry, ...]
    card_audit: tuple[RecipientCardAuditEntry, ...]
    intake_results: tuple[StoredIntakeResult, ...]
    service_requests: tuple[StoredServiceRequest, ...]
    approvals: tuple[ApprovalRecord, ...]
