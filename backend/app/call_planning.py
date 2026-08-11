"""No-call CALL-E plan previews and idempotency keys."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .call_goals import CallGoal, compile_call_goal
from .domain import AuthorizedContact, PreflightRow, Recipient
from .safety import build_preflight_row


@dataclass(frozen=True)
class CallPlanPreview:
    recipient_id: str
    recipient_label: str
    masked_phone: str
    route: str
    ready: bool
    idempotency_key: str
    call_goal: CallGoal
    prompt_preview: str
    blocked_reasons: tuple[str, ...] = ()
    authorized_contacts: tuple[AuthorizedContact, ...] = ()


def build_call_plan_preview(recipient: Recipient, call_date: str) -> CallPlanPreview:
    preflight = build_preflight_row(recipient)
    goal = compile_call_goal(recipient)
    key = idempotency_key(recipient, preflight, goal, call_date)
    blocked_reasons = tuple(issue.message for issue in preflight.issues)

    return CallPlanPreview(
        recipient_id=recipient.id,
        recipient_label=recipient.display_name,
        masked_phone=preflight.masked_phone,
        route=preflight.route,
        ready=preflight.ready and goal.route != "blocked",
        idempotency_key=key,
        call_goal=goal,
        prompt_preview=goal.to_prompt(),
        blocked_reasons=blocked_reasons,
        authorized_contacts=recipient.authorized_contacts,
    )


def build_call_plan_previews(recipients: list[Recipient], call_date: str) -> tuple[CallPlanPreview, ...]:
    return tuple(build_call_plan_preview(recipient, call_date) for recipient in recipients)


def idempotency_key(
    recipient: Recipient,
    preflight: PreflightRow,
    goal: CallGoal,
    call_date: str,
) -> str:
    raw = "|".join(
        [
            call_date,
            recipient.id,
            preflight.route,
            recipient.phone_e164,
            recipient.caregiver_phone_e164 or "",
            goal.purpose,
        ]
    )
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return f"carecall-{call_date}-{recipient.id}-{digest}"


def ready_previews(previews: tuple[CallPlanPreview, ...]) -> tuple[CallPlanPreview, ...]:
    return tuple(preview for preview in previews if preview.ready)
