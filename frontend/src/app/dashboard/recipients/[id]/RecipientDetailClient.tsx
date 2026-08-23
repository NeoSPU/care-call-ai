"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import {
  approveSpecialHandlingRecipient,
  updateRecipientCard,
} from "../../../../lib/carecall-api";
import { AppShell } from "../../../../components/AppShell";
import { logTechnicalError } from "../../../../lib/technical-log";
import type { AuthorizedContactDto, RecipientDetailPayload, SafetyCategory } from "../../../../lib/types";
import { SERVICE_SUPPORT_ERROR } from "../../../../lib/user-messages";

const safetyLabels: Record<SafetyCategory, string> = {
  critical: "Critical",
  special_handling: "Special handling",
  non_critical: "Non-critical",
};

const conditionOptions = ["general", "alzheimer", "dementia", "post_stroke", "hearing_impairment", "mobility_impairment"];
const severityOptions = ["mild", "moderate", "severe"];
const communicationRuleOptions = [
  {
    value: "short_simple_sentences",
    label: "Use short, simple sentences",
    hint: "Best for Alzheimer's, dementia, stroke recovery, or fatigue.",
  },
  {
    value: "one_question_at_a_time",
    label: "Ask one question at a time",
    hint: "Avoids long multi-part questions during intake.",
  },
  {
    value: "offer_simple_choices",
    label: "Offer simple choices",
    hint: "Use options like groceries, medication, transport, cleaning.",
  },
  {
    value: "do_not_test_memory",
    label: "Do not test memory",
    hint: "Avoid questions that feel like a memory quiz.",
  },
  {
    value: "ask_speaker_identity_first",
    label: "Confirm who answered",
    hint: "Needed when a trusted answerer may pick up the call.",
  },
  {
    value: "confirm_mobility_constraints",
    label: "Confirm mobility constraints",
    hint: "Useful before transport, delivery, or home-care requests.",
  },
  {
    value: "escalate_if_distressed",
    label: "Escalate if distressed",
    hint: "Route to staff if the person sounds upset, confused, or unsafe.",
  },
  {
    value: "staff_only",
    label: "Staff only",
    hint: "Agent should not perform direct intake; staff/caregiver route only.",
  },
];

type CardForm = {
  display_name: string;
  phone_e164: string;
  caregiver_phone_e164: string;
  delivery_area: string;
  address: string;
  notes: string;
  safety_category: SafetyCategory;
  condition: string;
  severity: string;
  language: string;
  timezone: string;
  communication_rules: string[];
  safety_change_reason: string;
  authorized_contacts: AuthorizedContactDto[];
};

function formatToken(value?: string) {
  if (!value) {
    return "Not set";
  }
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function communicationRuleLabel(value: string) {
  return communicationRuleOptions.find((option) => option.value === value)?.label ?? formatToken(value);
}

function recommendedCommunicationRules(condition: string, severity: string, safetyCategory: SafetyCategory) {
  const rules = new Set<string>();
  if (["alzheimer", "dementia", "post_stroke"].includes(condition) || ["moderate", "severe"].includes(severity)) {
    rules.add("short_simple_sentences");
    rules.add("one_question_at_a_time");
    rules.add("do_not_test_memory");
  }
  if (["alzheimer", "dementia", "mobility_impairment"].includes(condition)) {
    rules.add("offer_simple_choices");
  }
  if (condition === "mobility_impairment") {
    rules.add("confirm_mobility_constraints");
  }
  if (safetyCategory === "special_handling") {
    rules.add("ask_speaker_identity_first");
  }
  if (severity === "severe" || safetyCategory === "critical") {
    rules.add("escalate_if_distressed");
  }
  if (safetyCategory === "critical") {
    rules.add("staff_only");
  }
  return Array.from(rules);
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function safetyBadgeClass(category: SafetyCategory, blocked: boolean) {
  if (blocked) {
    return "badgeStatus stBlocked";
  }
  if (category === "critical") {
    return "badgeStatus stUrgent";
  }
  if (category === "special_handling") {
    return "badgeStatus stReview";
  }
  return "badgeStatus stReady";
}

function severityClass(severity: string) {
  if (severity === "severe") {
    return "tag sevSev";
  }
  if (severity === "moderate") {
    return "tag sevMod";
  }
  return "tag sevMild";
}

function StatusBadge({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span className={className}>
      <span className="dot" />
      {children}
    </span>
  );
}

function DetailField({
  label,
  value,
  className = "",
  valueClassName = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`field ${className}`.trim()}>
      <span className="fieldLabel">{label}</span>
      <span className={`fieldValue ${valueClassName}`.trim()}>{value}</span>
    </div>
  );
}

function canReviewForAutomation(detail: RecipientDetailPayload) {
  return (
    detail.recipient.safety_category === "special_handling" &&
    !detail.recipient.blocked
  );
}

function mustRemainManual(detail: RecipientDetailPayload) {
  return (
    detail.recipient.blocked ||
    detail.recipient.safety_category === "critical"
  );
}

function cardFormFromDetail(detail: RecipientDetailPayload): CardForm {
  return {
    display_name: detail.recipient.display_name,
    phone_e164: detail.contact_channels.phone_e164,
    caregiver_phone_e164: detail.contact_channels.caregiver_phone_e164,
    delivery_area: detail.recipient.delivery_area,
    address: detail.recipient.address,
    notes: detail.recipient.notes,
    safety_category: detail.recipient.safety_category,
    condition: detail.care_profile.condition,
    severity: detail.care_profile.severity,
    language: detail.care_profile.language,
    timezone: detail.care_profile.timezone,
    communication_rules: detail.care_profile.communication_rules,
    safety_change_reason: "",
    authorized_contacts:
      detail.care_profile.authorized_contacts.length > 0
        ? detail.care_profile.authorized_contacts
        : [{ name: "", relationship: "", can_answer_intake: true, preferred_goodbye: "" }],
  };
}

export function RecipientDetailClient({
  detail,
  operatorName = "carecall-coordinator",
}: {
  detail: RecipientDetailPayload;
  operatorName?: string;
}) {
  const [currentDetail, setCurrentDetail] = useState(detail);
  const [cardReviewed, setCardReviewed] = useState(detail.recipient.special_handling_reviewed);
  const [approvedForAutomation, setApprovedForAutomation] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState("");
  const [editingCard, setEditingCard] = useState(false);
  const [cardForm, setCardForm] = useState<CardForm>(() => cardFormFromDetail(detail));
  const [cardSaveError, setCardSaveError] = useState("");
  const [cardReasonError, setCardReasonError] = useState("");
  const [cardSaveStatus, setCardSaveStatus] = useState("");

  async function approveAutomation() {
    const response = await approveSpecialHandlingRecipient(currentDetail.recipient.id, {
      card_reviewed: cardReviewed,
      approved_for_automated_round: approvedForAutomation,
      note: "Reviewed in recipient detail.",
      operator: operatorName,
    });
    setApprovalStatus(
      response.card_reviewed && response.approved_for_automated_round
        ? "Recipient approved for automated round after card review."
        : "Special-handling review is still incomplete.",
    );
  }

  function setCardField<K extends keyof CardForm>(field: K, value: CardForm[K]) {
    setCardForm((previous) => ({ ...previous, [field]: value }));
  }

  function setCommunicationRule(rule: string, enabled: boolean) {
    setCardForm((previous) => ({
      ...previous,
      communication_rules: enabled
        ? Array.from(new Set([...previous.communication_rules, rule]))
        : previous.communication_rules.filter((item) => item !== rule),
    }));
  }

  function applyRecommendedRules() {
    setCardForm((previous) => ({
      ...previous,
      communication_rules: recommendedCommunicationRules(
        previous.condition,
        previous.severity,
        previous.safety_category,
      ),
    }));
  }

  function setContactField<K extends keyof AuthorizedContactDto>(
    index: number,
    field: K,
    value: AuthorizedContactDto[K],
  ) {
    setCardForm((previous) => ({
      ...previous,
      authorized_contacts: previous.authorized_contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, [field]: value } : contact,
      ),
    }));
  }

  function addAuthorizedContact() {
    setCardForm((previous) => ({
      ...previous,
      authorized_contacts: [
        ...previous.authorized_contacts,
        { name: "", relationship: "", can_answer_intake: true, preferred_goodbye: "" },
      ],
    }));
  }

  function removeAuthorizedContact(index: number) {
    setCardForm((previous) => ({
      ...previous,
      authorized_contacts:
        previous.authorized_contacts.length === 1
          ? [{ name: "", relationship: "", can_answer_intake: true, preferred_goodbye: "" }]
          : previous.authorized_contacts.filter((_, contactIndex) => contactIndex !== index),
    }));
  }

  async function saveClientCard() {
    setCardSaveError("");
    setCardReasonError("");
    setCardSaveStatus("");
    if (
      cardForm.safety_category !== currentDetail.recipient.safety_category &&
      cardForm.safety_change_reason.trim().length === 0
    ) {
      setCardReasonError("Reason for safety category change is required.");
      return;
    }
    try {
      const updated = await updateRecipientCard(currentDetail.recipient.id, {
        display_name: cardForm.display_name,
        phone_e164: cardForm.phone_e164,
        caregiver_phone_e164: cardForm.caregiver_phone_e164,
        delivery_area: cardForm.delivery_area,
        address: cardForm.address,
        notes: cardForm.notes,
        safety_category: cardForm.safety_category,
        condition: cardForm.condition,
        severity: cardForm.severity,
        language: cardForm.language,
        timezone: cardForm.timezone,
        communication_rules: cardForm.communication_rules,
        authorized_contacts: cardForm.authorized_contacts
          .map((contact) => ({
            name: contact.name.trim(),
            relationship: contact.relationship.trim(),
            can_answer_intake: contact.can_answer_intake,
            preferred_goodbye: contact.preferred_goodbye.trim(),
          }))
          .filter((contact) => contact.name.length > 0),
        safety_change_reason: cardForm.safety_change_reason,
        operator: operatorName,
      });
      setCurrentDetail(updated);
      setCardReviewed(updated.recipient.special_handling_reviewed);
      setCardForm(cardFormFromDetail(updated));
      setEditingCard(false);
      setCardSaveStatus("Client card updated. Existing preflight approvals were invalidated.");
    } catch (error) {
      logTechnicalError("Failed to save recipient client card.", error);
      setCardSaveError(SERVICE_SUPPORT_ERROR);
    }
  }

  const detailForRouting = currentDetail;
  const careProfileText = `${formatToken(currentDetail.care_profile.condition)} · ${formatToken(
    currentDetail.care_profile.severity,
  )}`;

  return (
    <AppShell active="recipients" operatorName={operatorName}>
      <div className="content">
        <header className="topbar">
          <div>
            <a className="textAction" href="/dashboard">Back to dashboard</a>
            <h1>{currentDetail.recipient.display_name}</h1>
            <p>
              Recipient detail · {currentDetail.recipient.delivery_area} · {formatToken(currentDetail.recipient.route)}
            </p>
          </div>
          <div className="topActions">
            <a className="button secondary" href="/dashboard#call-list">
              Call list
            </a>
            <a className="button" href="/dashboard/orders/print">
              Print orders
            </a>
          </div>
        </header>

        <section className="profileHero">
          <div className="heroAvatar" aria-hidden="true">
            {initials(currentDetail.recipient.display_name)}
          </div>
          <div className="heroMeta">
            <div className="heroName">{currentDetail.recipient.display_name}</div>
            <div className="heroIds">
              <span>
                <strong>ID</strong> {currentDetail.recipient.id}
              </span>
              <span>
                <strong>Phone</strong> <span className="num">{currentDetail.recipient.masked_phone}</span>
              </span>
              <span>
                <strong>Area</strong> {currentDetail.recipient.delivery_area}
              </span>
              <span>
                <strong>Route</strong> {formatToken(currentDetail.recipient.route)}
              </span>
            </div>
            <p className="heroAddress">{currentDetail.recipient.address}</p>
          </div>
          <div className="heroFlags">
            <StatusBadge className={safetyBadgeClass(currentDetail.recipient.safety_category, currentDetail.recipient.blocked)}>
              {safetyLabels[currentDetail.recipient.safety_category]}
            </StatusBadge>
            <StatusBadge className={currentDetail.recipient.automation_eligible ? "badgeStatus stReady" : "badgeStatus stReview"}>
              {currentDetail.recipient.automation_eligible ? "Auto-call eligible" : formatToken(currentDetail.recipient.automation_status)}
            </StatusBadge>
          </div>
        </section>

        <section className="detailGrid">
          <article className="card">
            <div className="cardHead">
              <h3>Client Card</h3>
              <div className="cardHeadActions">
                <span className={severityClass(currentDetail.care_profile.severity)}>{formatToken(currentDetail.care_profile.severity)}</span>
                <button
                  className="button secondary compact"
                  onClick={() => {
                    setEditingCard((value) => !value);
                    setCardSaveError("");
                    setCardReasonError("");
                    setCardSaveStatus("");
                    setCardForm(cardFormFromDetail(currentDetail));
                  }}
                  type="button"
                >
                  {editingCard ? "Cancel edit" : "Edit client card"}
                </button>
              </div>
            </div>
            <div className="cardBody">
              {editingCard ? (
                <div className="formGrid">
                  <label>
                    Display name
                    <input
                      aria-label="Display name"
                      onChange={(event) => setCardField("display_name", event.target.value)}
                      value={cardForm.display_name}
                    />
                  </label>
                  <label>
                    Phone E.164
                    <input
                      aria-label="Phone E.164"
                      onChange={(event) => setCardField("phone_e164", event.target.value)}
                      value={cardForm.phone_e164}
                    />
                  </label>
                  <label>
                    Caregiver/staff phone
                    <input
                      aria-label="Caregiver/staff phone"
                      onChange={(event) => setCardField("caregiver_phone_e164", event.target.value)}
                      value={cardForm.caregiver_phone_e164}
                    />
                  </label>
                  <label>
                    Delivery area
                    <input
                      aria-label="Delivery area"
                      onChange={(event) => setCardField("delivery_area", event.target.value)}
                      value={cardForm.delivery_area}
                    />
                  </label>
                  <label className="full">
                    Address
                    <input
                      aria-label="Address"
                      onChange={(event) => setCardField("address", event.target.value)}
                      value={cardForm.address}
                    />
                  </label>
                  <label>
                    Safety category
                    <select
                      aria-label="Client card safety category"
                      onChange={(event) => setCardField("safety_category", event.target.value as SafetyCategory)}
                      value={cardForm.safety_category}
                    >
                      <option value="critical">Critical</option>
                      <option value="special_handling">Special handling</option>
                      <option value="non_critical">Non-critical</option>
                    </select>
                  </label>
                  {cardForm.safety_category !== currentDetail.recipient.safety_category && (
                    <label>
                      Reason for safety category change
                      <textarea
                        aria-label="Reason for safety category change"
                        onChange={(event) => setCardField("safety_change_reason", event.target.value)}
                        value={cardForm.safety_change_reason}
                      />
                    </label>
                  )}
                  <label>
                    Condition
                    <select
                      aria-label="Condition"
                      onChange={(event) => setCardField("condition", event.target.value)}
                      value={cardForm.condition}
                    >
                      {conditionOptions.map((option) => (
                        <option key={option} value={option}>{formatToken(option)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Severity
                    <select
                      aria-label="Severity"
                      onChange={(event) => setCardField("severity", event.target.value)}
                      value={cardForm.severity}
                    >
                      {severityOptions.map((option) => (
                        <option key={option} value={option}>{formatToken(option)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Language
                    <input
                      aria-label="Language"
                      onChange={(event) => setCardField("language", event.target.value)}
                      value={cardForm.language}
                    />
                  </label>
                  <label>
                    Timezone
                    <input
                      aria-label="Timezone"
                      onChange={(event) => setCardField("timezone", event.target.value)}
                      value={cardForm.timezone}
                    />
                  </label>
                  <div className="full rulesEditor">
                    <div className="sectionRow">
                      <h3 className="subhead">Communication rules</h3>
                      <button className="button secondary compact" onClick={applyRecommendedRules} type="button">
                        Apply recommended rules
                      </button>
                    </div>
                    <div className="ruleOptionGrid">
                      {communicationRuleOptions.map((rule) => (
                        <label className="ruleOption" key={rule.value}>
                          <input
                            checked={cardForm.communication_rules.includes(rule.value)}
                            onChange={(event) => setCommunicationRule(rule.value, event.target.checked)}
                            type="checkbox"
                          />
                          <span>
                            <strong>{rule.label}</strong>
                            <small>{rule.hint}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="full">
                    Coordinator notes
                    <textarea
                      aria-label="Coordinator notes"
                      onChange={(event) => setCardField("notes", event.target.value)}
                      value={cardForm.notes}
                    />
                  </label>
                  <div className="full contactEditor">
                    <div className="sectionRow">
                      <h3 className="subhead">Trusted answerers</h3>
                      <button className="button secondary compact" onClick={addAuthorizedContact} type="button">
                        Add person
                      </button>
                    </div>
                    {cardForm.authorized_contacts.map((contact, index) => (
                      <div className="contactEditRow" key={index}>
                        <label>
                          Name
                          <input
                            aria-label={`Trusted answerer ${index + 1} name`}
                            onChange={(event) => setContactField(index, "name", event.target.value)}
                            value={contact.name}
                          />
                        </label>
                        <label>
                          Relationship
                          <input
                            aria-label={`Trusted answerer ${index + 1} relationship`}
                            onChange={(event) => setContactField(index, "relationship", event.target.value)}
                            value={contact.relationship}
                          />
                        </label>
                        <label>
                          Personalized goodbye
                          <input
                            aria-label={`Trusted answerer ${index + 1} goodbye`}
                            onChange={(event) => setContactField(index, "preferred_goodbye", event.target.value)}
                            value={contact.preferred_goodbye}
                          />
                        </label>
                        <label className="toggleControl compactToggle">
                          <input
                            checked={contact.can_answer_intake}
                            onChange={(event) => setContactField(index, "can_answer_intake", event.target.checked)}
                            type="checkbox"
                          />
                          May answer intake
                        </label>
                        <button
                          className="button secondary compact"
                          onClick={() => removeAuthorizedContact(index)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  {cardReasonError && <p className="errorText full" role="alert">{cardReasonError}</p>}
                  {cardSaveError && <p className="errorText full" role="alert">{cardSaveError}</p>}
                  <div className="editActions full">
                    <button className="button" onClick={saveClientCard} type="button">
                      Save client card
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="fieldGrid">
                    <DetailField label="Condition" value={formatToken(currentDetail.care_profile.condition)} />
                    <DetailField label="Care profile" value={careProfileText} />
                    <DetailField label="Phone" value={currentDetail.contact_channels.phone_e164} valueClassName="num" />
                    <DetailField
                      label="Caregiver/staff phone"
                      value={currentDetail.contact_channels.caregiver_phone_e164 || "Not set"}
                      valueClassName="num"
                    />
                    <DetailField label="Language" value={currentDetail.care_profile.language} />
                    <DetailField label="Timezone" value={currentDetail.care_profile.timezone} />
                    <DetailField className="full" label="Automation status" value={formatToken(currentDetail.recipient.automation_status)} />
                    <DetailField className="full" label="Coordinator notes" value={currentDetail.recipient.notes} />
                  </div>
                  {cardSaveStatus && <p className="resultBox" role="status">{cardSaveStatus}</p>}
                </>
              )}
            </div>
          </article>

          <article className="card">
            <div className="cardHead">
              <h3>Consent And Communication</h3>
            </div>
            <div className="cardBody">
              <div className={currentDetail.care_profile.consent_status.includes("consent") ? "consentPanel" : "consentPanel warn"}>
                <div className="consentIcon" aria-hidden="true">✓</div>
                <div>
                  <div className="consentTitle">{currentDetail.care_profile.consent_status}</div>
                  <p className="consentDetail">{currentDetail.care_profile.consent_evidence}</p>
                </div>
              </div>
              <div className="ruleList">
                {currentDetail.care_profile.communication_rules.map((rule) => (
                  <span className="ruleChip" key={rule}>
                    {communicationRuleLabel(rule)}
                  </span>
                ))}
              </div>
              <div className="contactList">
                <h3 className="subhead">Authorized answerers</h3>
                {currentDetail.care_profile.authorized_contacts.length > 0 ? (
                  currentDetail.care_profile.authorized_contacts.map((contact) => (
                    <div className="contactRow" key={`${contact.name}-${contact.relationship}`}>
                      <strong>{contact.name}</strong>
                      <span>{formatToken(contact.relationship)}</span>
                      <small>
                        {contact.can_answer_intake ? "May answer intake questions" : "Contact only"}
                        {contact.preferred_goodbye ? ` · ${contact.preferred_goodbye}` : ""}
                      </small>
                    </div>
                  ))
                ) : (
                  <p className="mutedText">Only the named recipient is authorized for intake answers.</p>
                )}
              </div>
            </div>
          </article>
        </section>

        <section className="detailGrid">
          <article className="card">
            <div className="cardHead">
              <h3>D-08 Special Handling</h3>
              <StatusBadge className={safetyBadgeClass(currentDetail.recipient.safety_category, currentDetail.recipient.blocked)}>
                {safetyLabels[currentDetail.recipient.safety_category]}
              </StatusBadge>
            </div>
            <div className="cardBody">
              {currentDetail.recipient.blocked_reasons.length > 0 && (
                <div className="warningBand">
                  <strong>Manual route reason</strong>
                  <span>{currentDetail.recipient.blocked_reasons.join(" ")}</span>
                </div>
              )}
              <p className="mutedText">Safety category is edited in the Client Card form. Changing it records an audit entry and invalidates existing preflight approval for this recipient or batch.</p>
              {currentDetail.approval_invalidated && <p className="resultBox" role="status">Existing approval was invalidated.</p>}
              {canReviewForAutomation(detailForRouting) && (
                <div className="approvalBox">
                  <h3>Special-handling review required</h3>
                  <label className="toggleControl">
                    <input
                      checked={cardReviewed}
                      onChange={(event) => setCardReviewed(event.target.checked)}
                      type="checkbox"
                    />
                    I reviewed this recipient card
                  </label>
                  <label className="toggleControl">
                    <input
                      checked={approvedForAutomation}
                      onChange={(event) => setApprovedForAutomation(event.target.checked)}
                      type="checkbox"
                    />
                    Approve this recipient for automated round
                  </label>
                  <button
                    className="button"
                    disabled={!cardReviewed || !approvedForAutomation}
                    onClick={approveAutomation}
                    type="button"
                  >
                    Approve recipient for automation
                  </button>
                  {approvalStatus && <p role="status">{approvalStatus}</p>}
                </div>
              )}
              {mustRemainManual(detailForRouting) && (
                <div className="warningBand">
                  <strong>Manual handling required</strong>
                  <span>This recipient is not eligible for automated CALL-E calls.</span>
                </div>
              )}
              {!canReviewForAutomation(detailForRouting) && !mustRemainManual(detailForRouting) && (
                <div className="consentPanel">
                  <div className="consentIcon" aria-hidden="true">✓</div>
                  <div>
                    <div className="consentTitle">No manual exception required</div>
                    <p className="consentDetail">This recipient can stay in the ordinary automated preflight route.</p>
                  </div>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="detailGrid">
          <article className="card">
            <div className="cardHead">
              <h3>Call Outcome</h3>
            </div>
            <div className="cardBody">
              <p>{currentDetail.call_outcome?.summary ?? "No completed call outcome yet."}</p>
              <div>
                <h3 className="subhead">Extracted Needs</h3>
                {currentDetail.extracted_needs.length === 0 && <p>No extracted needs yet.</p>}
                <ul className="cleanList">
                  {currentDetail.extracted_needs.map((need, index) => (
                    <li key={`${need.category ?? "need"}-${index}`}>
                      <span className="tag">{formatToken(need.category)}</span>
                      <strong>{formatToken(need.urgency)}</strong>
                      <span>Items: {(need.items ?? []).join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>

          <article className="card">
            <div className="cardHead">
              <h3>Generated Requests</h3>
              <span className="badgeStatus stReady">
                <span className="dot" />
                {currentDetail.service_requests.length} ready
              </span>
            </div>
            <div className="cardBody">
              {currentDetail.service_requests.length === 0 && <p>No generated requests yet.</p>}
              {currentDetail.service_requests.map((request) => (
                <article className="requestCard" key={request.id}>
                  <div className="requestCardHead">
                    <strong>{formatToken(request.category)}</strong>
                    <span className={request.priority === "urgent" ? "tag sevSev" : "tag sevMild"}>{formatToken(request.priority)}</span>
                  </div>
                  <p>{request.notes}</p>
                  <ul className="cleanList">
                    {request.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </article>
        </section>

        <section className="section">
          <div className="sectionHeader">
            <div>
              <h2>Review Notes And Audit</h2>
              <p>Safety changes and coordinator decisions for this recipient.</p>
            </div>
          </div>
          <div className="auditList">
            {currentDetail.card_audit.map((entry) => (
              <article className="attentionItem" key={`card-${entry.id}`}>
                <div>
                  <strong>Card update</strong>
                  <p>{entry.summary}</p>
                </div>
                <span className="mono">{entry.operator}</span>
              </article>
            ))}
            {currentDetail.risk_audit.map((entry) => (
              <article className="attentionItem" key={entry.id}>
                <div>
                  <strong>{entry.old_value} to {entry.new_value}</strong>
                  <p>{entry.note}</p>
                </div>
                <span className="mono">{entry.operator}</span>
              </article>
            ))}
            {currentDetail.risk_audit.length === 0 && currentDetail.card_audit.length === 0 && <p>No audit entries yet.</p>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
