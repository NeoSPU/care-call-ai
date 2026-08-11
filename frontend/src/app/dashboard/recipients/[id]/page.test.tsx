import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RecipientDetailPage from "./page";
import {
  approveSpecialHandlingRecipient,
  getRecipientDetail,
  updateRecipientCard,
} from "../../../../lib/carecall-api";

vi.mock("../../../../lib/carecall-api", () => ({
  approveSpecialHandlingRecipient: vi.fn(),
  getRecipientDetail: vi.fn(),
  updateRecipientCard: vi.fn(),
}));

const mildSpecialHandlingDetail = {
  recipient: {
    id: "rec-api-002",
    display_name: "Morgan Review",
    masked_phone: "+1******4402",
    safety_category: "special_handling",
    blocked: false,
    blocked_reasons: [],
    route: "caregiver",
    delivery_area: "Oxford South",
    address: "8 Integration Street",
    notes: "Moderate Alzheimer's profile; short structured intake.",
    special_handling_reviewed: false,
    automation_eligible: false,
    automation_status: "operator_review",
  },
  care_profile: {
    condition: "alzheimer",
    severity: "moderate",
    language: "en",
    timezone: "Europe/London",
    communication_rules: ["one_question_at_a_time", "do_not_test_memory"],
    consent_status: "explicit_consent",
    consent_evidence: "Coordinator logged consent.",
    authorized_contacts: [
      {
        name: "Marija Chen",
        relationship: "spouse",
        can_answer_intake: true,
        preferred_goodbye: "All the best, Ms Marija.",
      },
    ],
  },
  contact_channels: {
    phone_e164: "+15550104402",
    caregiver_phone_e164: "+15550109902",
  },
  call_outcome: {
    id: "intake-api-002",
    recipient_id: "rec-api-002",
    status: "completed",
    summary: "Caregiver confirmed urgent medication pickup.",
    human_review: true,
    needs: [{ category: "medication", urgency: "urgent", items: ["Prescription pickup"] }],
  },
  extracted_needs: [
    { category: "medication", urgency: "urgent", items: ["Prescription pickup"] },
  ],
  service_requests: [
    {
      id: "srv-api-002",
      recipient_id: "rec-api-002",
      category: "medication",
      queue: "pharmacy_delivery",
      sla_hours: 2,
      priority: "urgent",
      status: "ready_to_print",
      items: ["Prescription pickup"],
      notes: "Backend generated from CALL-E result.",
      human_review_reason: "",
    },
  ],
  risk_audit: [
    {
      id: 1,
      recipient_id: "rec-api-002",
      old_value: "critical",
      new_value: "special_handling",
      operator: "carecall-coordinator",
      changed_at: "2026-08-01T10:00:00Z",
      note: "Reviewed by coordinator.",
    },
  ],
  card_audit: [],
  approvals: [],
};

const severeManualDetail = {
  ...mildSpecialHandlingDetail,
  recipient: {
    ...mildSpecialHandlingDetail.recipient,
    id: "rec-api-003",
    display_name: "Sam Manual",
    safety_category: "critical",
    route: "staff",
    blocked: true,
    blocked_reasons: ["Severe or unsuitable cases route to caregiver/staff/manual handling."],
    automation_eligible: false,
    automation_status: "blocked",
  },
  care_profile: {
    ...mildSpecialHandlingDetail.care_profile,
    condition: "dementia",
    severity: "severe",
  },
};

describe("RecipientDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders backend detail state for profile, consent, needs, requests, notes, outcome, and audit", async () => {
    vi.mocked(getRecipientDetail).mockResolvedValue(mildSpecialHandlingDetail);

    render(await RecipientDetailPage({ params: { id: "rec-api-002" } }));

    expect(screen.getByRole("heading", { name: "Morgan Review" })).toBeTruthy();
    expect(screen.getByText("+1******4402")).toBeTruthy();
    expect(screen.getByText("explicit_consent")).toBeTruthy();
    expect(screen.getByText("Ask one question at a time")).toBeTruthy();
    expect(screen.getByText("Authorized answerers")).toBeTruthy();
    expect(screen.getByText("Marija Chen")).toBeTruthy();
    expect(screen.getByText("Spouse")).toBeTruthy();
    expect(screen.getByText(/May answer intake questions/)).toBeTruthy();
    expect(screen.getByText(/All the best, Ms Marija/)).toBeTruthy();
    expect(screen.getByText("Caregiver confirmed urgent medication pickup.")).toBeTruthy();
    expect(screen.getByText("Prescription pickup")).toBeTruthy();
    expect(screen.getByText("Backend generated from CALL-E result.")).toBeTruthy();
    expect(screen.getByText("Reviewed by coordinator.")).toBeTruthy();
  });

  it("lets an operator edit the client card, phone, condition, and trusted answerers", async () => {
    const updatedDetail = {
      ...mildSpecialHandlingDetail,
      recipient: {
        ...mildSpecialHandlingDetail.recipient,
        display_name: "Morgan Updated",
        masked_phone: "+1******5555",
        safety_category: "non_critical",
        delivery_area: "Wallingford East",
        address: "12 Updated Street",
        automation_eligible: true,
        automation_status: "auto_call",
      },
      care_profile: {
        ...mildSpecialHandlingDetail.care_profile,
        condition: "hearing_impairment",
        severity: "mild",
        language: "ru",
        communication_rules: ["short_simple_sentences", "ask_speaker_identity_first"],
        authorized_contacts: [
          {
            name: "Maria Updated",
            relationship: "daughter",
            can_answer_intake: true,
            preferred_goodbye: "All the best, Ms Maria.",
          },
        ],
      },
      contact_channels: {
        phone_e164: "+15550105555",
        caregiver_phone_e164: "",
      },
      card_audit: [
        {
          id: 3,
          recipient_id: "rec-api-002",
          operator: "carecall-coordinator",
          changed_at: "2026-08-02T12:00:00Z",
          summary: "Updated client card for Morgan Review; safety category set to non_critical.",
        },
      ],
      approval_invalidated: true,
    };
    vi.mocked(getRecipientDetail).mockResolvedValue(mildSpecialHandlingDetail);
    vi.mocked(updateRecipientCard).mockResolvedValue(updatedDetail);

    render(await RecipientDetailPage({ params: { id: "rec-api-002" } }));

    fireEvent.click(screen.getByRole("button", { name: "Edit client card" }));
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Morgan Updated" } });
    fireEvent.change(screen.getByLabelText("Phone E.164"), { target: { value: "+15550105555" } });
    fireEvent.change(screen.getByLabelText("Caregiver/staff phone"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Delivery area"), { target: { value: "Wallingford East" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "12 Updated Street" } });
    fireEvent.change(screen.getByLabelText("Client card safety category"), { target: { value: "non_critical" } });
    fireEvent.change(screen.getByLabelText("Reason for safety category change"), {
      target: { value: "Coordinator reviewed card and consent." },
    });
    fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "hearing_impairment" } });
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "mild" } });
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "ru" } });
    fireEvent.click(screen.getByLabelText(/Ask one question at a time/));
    fireEvent.click(screen.getByLabelText(/Do not test memory/));
    fireEvent.click(screen.getByLabelText(/Use short, simple sentences/));
    fireEvent.click(screen.getByLabelText(/Confirm who answered/));
    fireEvent.change(screen.getByLabelText("Trusted answerer 1 name"), { target: { value: "Maria Updated" } });
    fireEvent.change(screen.getByLabelText("Trusted answerer 1 relationship"), { target: { value: "daughter" } });
    fireEvent.change(screen.getByLabelText("Trusted answerer 1 goodbye"), {
      target: { value: "All the best, Ms Maria." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save client card" }));

    expect(updateRecipientCard).toHaveBeenCalledWith("rec-api-002", {
      display_name: "Morgan Updated",
      phone_e164: "+15550105555",
      caregiver_phone_e164: "",
      delivery_area: "Wallingford East",
      address: "12 Updated Street",
      notes: "Moderate Alzheimer's profile; short structured intake.",
      safety_category: "non_critical",
      condition: "hearing_impairment",
      severity: "mild",
      language: "ru",
      timezone: "Europe/London",
      communication_rules: ["short_simple_sentences", "ask_speaker_identity_first"],
      authorized_contacts: [
        {
          name: "Maria Updated",
          relationship: "daughter",
          can_answer_intake: true,
          preferred_goodbye: "All the best, Ms Maria.",
        },
      ],
      safety_change_reason: "Coordinator reviewed card and consent.",
      operator: "carecall-coordinator",
    });
    expect(await screen.findByRole("heading", { name: "Morgan Updated" })).toBeTruthy();
    expect(screen.getByText("Maria Updated")).toBeTruthy();
    expect(screen.getByText(/Client card updated/)).toBeTruthy();
    expect(screen.getByText("Card update")).toBeTruthy();
  });

  it("keeps safety editing inside the client card and requires a reason there", async () => {
    vi.mocked(getRecipientDetail).mockResolvedValue(mildSpecialHandlingDetail);

    render(await RecipientDetailPage({ params: { id: "rec-api-002" } }));

    expect(screen.queryByLabelText("Safety category")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit client card" }));
    expect(screen.getAllByLabelText("Client card safety category")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Client card safety category"), {
      target: { value: "non_critical" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save client card" }));

    expect(updateRecipientCard).not.toHaveBeenCalled();
    expect(screen.getByText("Reason for safety category change is required.")).toBeTruthy();
  });

  it("requires explicit review plus per-recipient approval for mild or moderate special handling", async () => {
    vi.mocked(getRecipientDetail).mockResolvedValue(mildSpecialHandlingDetail);
    vi.mocked(approveSpecialHandlingRecipient).mockResolvedValue({
      approved_for_automated_round: true,
      card_reviewed: true,
    });

    render(await RecipientDetailPage({ params: { id: "rec-api-002" } }));

    expect(screen.getByText("Special-handling review required")).toBeTruthy();
    expect(screen.getByLabelText("I reviewed this recipient card")).toBeTruthy();
    expect(screen.getByLabelText("Approve this recipient for automated round")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("I reviewed this recipient card"));
    fireEvent.click(screen.getByLabelText("Approve this recipient for automated round"));
    fireEvent.click(screen.getByRole("button", { name: "Approve recipient for automation" }));

    expect(approveSpecialHandlingRecipient).toHaveBeenCalledWith("rec-api-002", {
      card_reviewed: true,
      approved_for_automated_round: true,
      note: "Reviewed in recipient detail.",
      operator: "carecall-coordinator",
    });
  });

  it("keeps blocked or critical recipients on manual handling", async () => {
    vi.mocked(getRecipientDetail).mockResolvedValue(severeManualDetail);

    render(await RecipientDetailPage({ params: { id: "rec-api-003" } }));

    expect(screen.getByText("Manual handling required")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve recipient for automation" })).toBeNull();
    expect(screen.queryByLabelText("Approve this recipient for automated round")).toBeNull();
  });
});
