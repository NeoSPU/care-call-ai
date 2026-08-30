"""Condition-aware CALL-E goal compilation.

This module prepares call instructions only. It never places a call.
"""

from __future__ import annotations

from dataclasses import dataclass

from .agent_skills.practical_support import PRACTICAL_SUPPORT_SKILL
from .domain import CallSuitability, Condition, Recipient, Severity
from .safety import call_route


PROHIBITED_TOPICS = (
    "Do not provide medical diagnosis, treatment advice, dosage advice, legal advice, financial advice, or emergency triage.",
    "Do not ask for passwords, banking details, PINs, government ID numbers, or payment card details.",
    "Do not accept requests for illegal, exploitative, violent, sexual, biohazardous, or age-restricted goods or services; politely tell the caller that CareCall cannot process that item or service.",
    "Do not include prohibited or unsupported items in the final practical support request; keep collecting and summarising only allowed groceries, medicines, care help, transport, repairs, documents help, or other lawful support.",
    "Do not accept alcohol, tobacco, weapons, ammunition, illegal drugs, or controlled substances unless the request is clearly a lawful medical support request in the call region.",
    "Do not argue with, shame, patronise, or test the recipient's memory.",
    "If the recipient appears distressed, unsafe, confused in a concerning way, or in immediate danger, stop intake and mark human review.",
)


@dataclass(frozen=True)
class CallGoal:
    recipient_id: str
    recipient_label: str
    route: str
    purpose: str
    opening: str
    communication_style: tuple[str, ...]
    allowed_questions: tuple[str, ...]
    prohibited_topics: tuple[str, ...]
    completion_criteria: tuple[str, ...]
    escalation_triggers: tuple[str, ...]

    def to_prompt(self) -> str:
        sections = [
            f"Purpose: {self.purpose}",
            f"Opening: {self.opening}",
            "Communication style:\n" + "\n".join(f"- {item}" for item in self.communication_style),
            "Allowed questions:\n" + "\n".join(f"- {item}" for item in self.allowed_questions),
            "Prohibited topics:\n" + "\n".join(f"- {item}" for item in self.prohibited_topics),
            "Completion criteria:\n" + "\n".join(f"- {item}" for item in self.completion_criteria),
            "Escalation triggers:\n" + "\n".join(f"- {item}" for item in self.escalation_triggers),
        ]
        return "\n\n".join(sections)


def compile_call_goal(recipient: Recipient) -> CallGoal:
    route = call_route(recipient)
    profile = recipient.care_profile

    if route == "blocked" or profile.call_suitability == CallSuitability.DO_NOT_CALL:
        return _blocked_goal(recipient)

    if route in {"caregiver", "staff"}:
        return _caregiver_or_staff_goal(recipient, route)

    if profile.condition in {Condition.ALZHEIMER, Condition.DEMENTIA}:
        return _dementia_direct_goal(recipient)

    return _general_direct_goal(recipient)


def _identity_and_courtesy_style(recipient: Recipient) -> tuple[str, ...]:
    contacts = tuple(contact for contact in recipient.authorized_contacts if contact.can_answer_intake)
    authorized = recipient.display_name
    if contacts:
        authorized += "; authorized contacts: " + ", ".join(
            f"{contact.name} ({contact.relationship})" for contact in contacts
        )
    goodbye_preferences = tuple(
        f"{contact.name}: {contact.preferred_goodbye}"
        for contact in contacts
        if contact.preferred_goodbye.strip()
    )
    goodbye_rule = (
        "Use a personalized courteous goodbye with the actual speaker's name when known, for example 'Have a good day, Mr Alex' or 'All the best, Ms Marija'."
    )
    if goodbye_preferences:
        goodbye_rule += " Configured goodbye preferences: " + "; ".join(goodbye_preferences) + "."
    return (
        "Ask who is speaking if the answerer does not clearly identify themselves.",
        f"Treat answers as confirmed only when speaking with {authorized}.",
        "If someone else answers, stay polite, do not collect private needs, and mark coordinator follow-up.",
        goodbye_rule,
    )


def _base_escalation_triggers() -> tuple[str, ...]:
    return (
        "Recipient reports immediate danger, fall, severe pain, no food, no medication access, or unsafe living conditions.",
        "Recipient sounds distressed, highly confused, unable to continue, or asks to stop.",
        "Recipient asks for medical, legal, financial, or emergency advice.",
    )


def _base_completion_criteria() -> tuple[str, ...]:
    return (
        "Summarise practical needs without making promises.",
        "Capture urgency for each practical need.",
        "End politely and explain that a coordinator will review the request.",
    )


def _blocked_goal(recipient: Recipient) -> CallGoal:
    return CallGoal(
        recipient_id=recipient.id,
        recipient_label=recipient.display_name,
        route="blocked",
        purpose="Do not call. Recipient is not suitable for outbound CALL-E planning.",
        opening="No call should be placed.",
        communication_style=("No outbound conversation is allowed for this recipient.",),
        allowed_questions=(),
        prohibited_topics=PROHIBITED_TOPICS,
        completion_criteria=("Return blocked status for coordinator review.",),
        escalation_triggers=("Coordinator must review call suitability before any outreach.",),
    )


def _caregiver_or_staff_goal(recipient: Recipient, route: str) -> CallGoal:
    return CallGoal(
        recipient_id=recipient.id,
        recipient_label=recipient.display_name,
        route=route,
        purpose=(
            f"Call the {route} contact to collect practical support needs for "
            f"{recipient.display_name} and confirm whether direct future calling is suitable."
        ),
        opening=(
            f"Hello, this is CareCall calling about practical support needs for "
            f"{recipient.display_name}."
        ),
        communication_style=(
            "Be concise, respectful, and clear that this is a practical support intake call.",
            *_identity_and_courtesy_style(recipient),
            "Ask about the recipient's current practical needs rather than clinical details.",
            "Ask whether direct future calls to the recipient are suitable and comfortable.",
        ),
        allowed_questions=(
            f"Does the person need {PRACTICAL_SUPPORT_SKILL.service_options_text()}?",
            "Is anything needed today, tomorrow, this week, or not urgent?",
            "Is direct future calling suitable, or should CareCall continue through a caregiver or staff member?",
        ),
        prohibited_topics=PROHIBITED_TOPICS,
        completion_criteria=_base_completion_criteria()
        + ("Record the recommended future call route.",),
        escalation_triggers=_base_escalation_triggers(),
    )


def _dementia_direct_goal(recipient: Recipient) -> CallGoal:
    profile = recipient.care_profile
    if profile.severity == Severity.SEVERE:
        return _blocked_goal(recipient)

    if profile.severity == Severity.MODERATE:
        purpose = (
            "Short structured practical-needs intake for a person living with "
            "dementia or Alzheimer's."
        )
        style = (
            "Use one short question at a time.",
            *_identity_and_courtesy_style(recipient),
            "Use calm, plain language and allow long pauses.",
            "Prefer yes/no or two-choice questions.",
            "Do not test memory or ask the person to recall dates.",
            "If confused, rephrase once in simpler words instead of repeating pressurefully.",
            "Do not correct harmless mistaken beliefs unless safety requires it.",
        )
        questions = (
            "Are you comfortable speaking for a minute?",
            "Do you need food or groceries?",
            "Do you need help with medication pickup or supplies?",
            "Do you need help at home, such as cleaning, transport, or a visit?",
            "Is anything needed today?",
        )
    else:
        purpose = (
            "Gentle check-in plus practical-needs intake for a person living with "
            "mild dementia or Alzheimer's."
        )
        style = (
            "Start warmly, then keep the conversation short.",
            *_identity_and_courtesy_style(recipient),
            "Use one idea at a time and leave time for response.",
            "Use simple choices if open questions are difficult.",
            "Do not test memory or challenge repeated statements.",
            "Acknowledge feelings before returning to practical needs.",
        )
        questions = (
            "How are you feeling today?",
            "Would it be okay if I ask a few simple questions about practical help?",
            f"Do you need {PRACTICAL_SUPPORT_SKILL.service_options_text()}?",
            "Is anything urgent for today?",
        )

    return CallGoal(
        recipient_id=recipient.id,
        recipient_label=recipient.display_name,
        route="recipient",
        purpose=purpose,
        opening=f"Hello {recipient.display_name}, this is CareCall checking in about practical support.",
        communication_style=style,
        allowed_questions=questions,
        prohibited_topics=PROHIBITED_TOPICS,
        completion_criteria=_base_completion_criteria(),
        escalation_triggers=_base_escalation_triggers(),
    )


def _general_direct_goal(recipient: Recipient) -> CallGoal:
    profile = recipient.care_profile
    style = [
        "Be warm, concise, and practical.",
        *_identity_and_courtesy_style(recipient),
        "Ask one question at a time.",
        "Do not provide medical, legal, or financial advice.",
    ]
    if profile.condition == Condition.HEARING_IMPAIRMENT:
        style.extend(
            [
                "Speak clearly and slightly slower than usual.",
                "Confirm important details once.",
            ]
        )
    elif profile.condition == Condition.POST_STROKE:
        style.extend(
            [
                "Allow extra time for responses.",
                "Do not interrupt or finish sentences unless asked.",
            ]
        )
    elif profile.condition == Condition.MOBILITY_IMPAIRMENT:
        style.append("Pay special attention to transport, cleaning, repair, and home access needs.")

    return CallGoal(
        recipient_id=recipient.id,
        recipient_label=recipient.display_name,
        route="recipient",
        purpose="Collect practical support needs for coordinator review.",
        opening=f"Hello {recipient.display_name}, this is CareCall calling about practical support.",
        communication_style=tuple(style),
        allowed_questions=(
            f"Do you need {PRACTICAL_SUPPORT_SKILL.service_options_text()}?",
            "Is anything needed today, tomorrow, this week, or not urgent?",
            "Is there anything a coordinator should know before arranging help?",
        ),
        prohibited_topics=PROHIBITED_TOPICS,
        completion_criteria=_base_completion_criteria(),
        escalation_triggers=_base_escalation_triggers(),
    )
