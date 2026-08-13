import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "./page";
import OperatorPanelPage from "./operator/page";
import { createBatch, getDashboardData, getOperationsDashboard } from "../../lib/carecall-api";

vi.mock("../../lib/carecall-api", () => ({
  createBatch: vi.fn(),
  getDashboardData: vi.fn(),
  getOperationsDashboard: vi.fn(),
}));

const dashboardDto = {
  service: "carecall-backend",
  summary: {
    recipients: 4,
    ready: 1,
    blocked: 2,
    service_requests: 3,
    stale_approvals: 1,
  },
  recipients: [
    {
      id: "rec-api-001",
      display_name: "Avery Backend",
      masked_phone: "+1******4401",
      safety_category: "non_critical",
      blocked: false,
      blocked_reasons: [],
      route: "recipient",
      delivery_area: "Wallingford",
      address: "14 Backend Close",
      condition: "general",
      severity: "mild",
      need_categories: ["groceries", "medication"],
      notes:
        "Long backend note confirming this screen uses fetched data rather than static demo arrays.",
      special_handling_reviewed: false,
      automation_eligible: true,
      automation_status: "auto_call",
    },
    {
      id: "rec-api-002",
      display_name: "Morgan Review",
      masked_phone: "+1******4402",
      safety_category: "special_handling",
      blocked: false,
      blocked_reasons: [
        "Special-handling recipient requires explicit card review and per-recipient approval.",
      ],
      route: "caregiver",
      delivery_area: "Oxford South",
      address: "8 Integration Street",
      condition: "alzheimer",
      severity: "moderate",
      need_categories: ["care"],
      notes: "Moderate Alzheimer's profile; card review required before automation.",
      special_handling_reviewed: false,
      automation_eligible: false,
      automation_status: "operator_review",
    },
    {
      id: "rec-api-003",
      display_name: "Sam Manual",
      masked_phone: "+1******4403",
      safety_category: "critical",
      blocked: false,
      blocked_reasons: ["Recipient requires manual/staff handling."],
      route: "staff",
      delivery_area: "Hackney East",
      address: "3 Manual Road",
      condition: "dementia",
      severity: "severe",
      need_categories: ["transport"],
      notes: "Staff call only.",
      special_handling_reviewed: false,
      automation_eligible: false,
      automation_status: "manual_only",
    },
  ],
  planned_calls: [
    {
      recipient_id: "rec-api-001",
      recipient_label: "Avery Backend",
      masked_phone: "+1******4401",
      ready: true,
      route: "recipient",
      idempotency_key: "backend-key-001",
      blocked_reasons: [],
    },
    {
      recipient_id: "rec-api-002",
      recipient_label: "Morgan Review",
      masked_phone: "+1******4402",
      ready: false,
      route: "caregiver",
      idempotency_key: "",
      blocked_reasons: [
        "Special-handling recipient requires explicit card review and per-recipient approval.",
      ],
    },
  ],
  call_status: {
    preflight_plans: [{ id: "plan-api-001", batch_id: "batch-api-001" }],
    approvals: [{ id: "approval-api-001", stale: true }],
    intake_results: [{ id: "intake-api-001", summary: "Backend call outcome." }],
  },
  service_requests: [
    {
      id: "srv-api-001",
      recipient_id: "rec-api-001",
      category: "groceries",
      queue: "delivery_volunteers",
      sla_hours: 4,
      priority: "normal",
      status: "ready_to_print",
      items: ["Tinned soup"],
      notes: "Backend generated order.",
      human_review_reason: "",
    },
    {
      id: "srv-api-002",
      recipient_id: "rec-api-002",
      category: "review",
      queue: "coordinator_review",
      sla_hours: 8,
      priority: "review",
      status: "review",
      items: [],
      notes: "Review before automation.",
      human_review_reason: "Special handling.",
    },
  ],
};

const operationsDashboardDto = {
  service: "carecall-backend",
  slogan: {
    care_seen: "Dashboard",
    needs_heard: "Operator Panel",
    help_delivered: "Orders",
  },
  summary: {
    registered_recipients: 4,
    ready_for_auto_call: 1,
    eligible_not_selected: 1,
    operator_control_required: 2,
    not_allowed_for_auto_call: 1,
    service_requests: 3,
    orders_ready: 2,
    urgent_callbacks: 3,
  },
  by_safety_category: {
    non_critical: 1,
    special_handling: 1,
    critical: 1,
  },
  by_condition: {
    general: 1,
    alzheimer: 1,
    dementia: 1,
  },
  by_need_category: {
    groceries: 1,
    medication: 1,
  },
  session: {
    calls_planned: 3,
    calls_completed: 1,
    needs_captured: 2,
    orders_generated: 3,
    human_reviews: 1,
    stale_approvals: 1,
  },
  alerts: {
    urgent_callbacks: 3,
    stale_approvals: 1,
    eligible_not_selected: 1,
  },
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("renders Care seen dashboard statistics without operator call controls", async () => {
    vi.mocked(getOperationsDashboard).mockResolvedValue(operationsDashboardDto);

    render(await DashboardPage());

    expect(screen.getByRole("heading", { name: "Care seen - Dashboard" })).toBeTruthy();
    expect(screen.getByText("Registered")).toBeTruthy();
    expect(screen.getByText("Ready auto-call")).toBeTruthy();
    expect(screen.getAllByText("Urgent callbacks").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Safety Categories" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Condition Mix" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Recipient call list" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review selected round" })).toBeNull();
    expect(screen.getByRole("link", { name: /Operator Panel/ }).getAttribute("href")).toBe("/dashboard/operator");
    expect(screen.getByRole("link", { name: /Urgent Callback/ })).toBeTruthy();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("renders backend DTO round metrics, queue, recipient list, and actions", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);

    render(await OperatorPanelPage());

    expect(screen.getByRole("heading", { name: "Needs heard - Operator Panel" })).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "North morning check-in - Round RN-0801",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Automation Queue" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Needs Human Attention" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recipient call list" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Demo health" })).toBeNull();
    expect(screen.queryByText("CI-NextJS-Python")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Service Request Board" })).toBeNull();
    expect(screen.getByText("Alzheimer")).toBeTruthy();
    expect(screen.getByText("- Moderate")).toBeTruthy();
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Medicine")).toBeTruthy();
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
    expect(screen.getByText("backend-key-001")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Review selected round" })[0]).toBeTruthy();
  });

  it("uses backend recipient names and excludes static demo recipients from live state", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);

    render(await OperatorPanelPage());

    expect(screen.getAllByText("Avery Backend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Morgan Review").length).toBeGreaterThan(0);
    expect(screen.queryByText("Eleanor Thompson")).toBeNull();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
    expect(screen.getByText("Special handling")).toBeTruthy();
    expect(
      screen.getAllByText(
        "Special-handling recipient requires explicit card review and per-recipient approval.",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("restores the operator selection edited on preflight", async () => {
    window.localStorage.setItem("carecall:selected-recipient-ids", JSON.stringify([]));
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);

    render(await OperatorPanelPage());

    await waitFor(() => {
      expect((screen.getByLabelText("Include Avery Backend in auto-call") as HTMLInputElement).checked).toBe(false);
    });
    expect(screen.getByText("No recipients selected for this round")).toBeTruthy();
  });

  it("persists dashboard checkbox edits for preflight and later Daily round returns", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);

    render(await OperatorPanelPage());

    const includeAvery = screen.getByLabelText("Include Avery Backend in auto-call") as HTMLInputElement;
    expect(includeAvery.checked).toBe(true);

    fireEvent.click(includeAvery);

    await waitFor(() => {
      expect(window.localStorage.getItem("carecall:selected-recipient-ids")).toBe(JSON.stringify([]));
    });
    expect(includeAvery.checked).toBe(false);
    expect(screen.getByText("No recipients selected for this round")).toBeTruthy();
  });

  it("enables a corrected non-critical recipient after safety route normalization", async () => {
    vi.mocked(getDashboardData).mockResolvedValue({
      ...dashboardDto,
      recipients: dashboardDto.recipients.map((recipient) =>
        recipient.id === "rec-api-003"
          ? {
              ...recipient,
              safety_category: "non_critical",
              blocked: false,
              blocked_reasons: [],
              route: "recipient",
              automation_eligible: true,
              automation_status: "auto_call",
            }
          : recipient,
      ),
      planned_calls: [
        ...dashboardDto.planned_calls,
        {
          recipient_id: "rec-api-003",
          recipient_label: "Sam Manual",
          masked_phone: "+1******4403",
          ready: true,
          route: "recipient",
          idempotency_key: "backend-key-003",
          blocked_reasons: [],
        },
      ],
    });

    render(await OperatorPanelPage());

    const includeSam = screen.getByLabelText("Include Sam Manual in auto-call") as HTMLInputElement;
    expect(includeSam.disabled).toBe(false);
    expect(includeSam.checked).toBe(true);
    expect(screen.getAllByText("Auto-call").length).toBeGreaterThan(1);
    expect(screen.getByText("backend-key-003")).toBeTruthy();
  });

  it("sends only the persisted operator selection when opening preflight", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);
    vi.mocked(createBatch).mockRejectedValue(new Error("stop before jsdom navigation"));

    render(await OperatorPanelPage());

    fireEvent.click(screen.getAllByRole("button", { name: "Run preflight" })[0]);

    await waitFor(() => {
      expect(createBatch).toHaveBeenCalledWith({
        selected_recipient_ids: ["rec-api-001"],
        label: "CareCall selected daily round",
        call_date: "2026-08-01",
      });
    });
  });

  it("filters stale stored recipients before creating the selected backend batch", async () => {
    window.localStorage.setItem(
      "carecall:selected-recipient-ids",
      JSON.stringify(["rec-api-001", "rec-api-missing"]),
    );
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);
    vi.mocked(createBatch).mockRejectedValue(new Error("stop before jsdom navigation"));

    render(await OperatorPanelPage());

    fireEvent.click(screen.getAllByRole("button", { name: "Review selected round" })[0]);

    await waitFor(() => {
      expect(createBatch).toHaveBeenCalledWith({
        selected_recipient_ids: ["rec-api-001"],
        label: "CareCall selected daily round",
        call_date: "2026-08-01",
      });
    });
  });

  it("renders the documented backend loading, error, and empty states", async () => {
    vi.mocked(getDashboardData).mockRejectedValueOnce(new Error("backend offline"));
    render(await OperatorPanelPage());
    expect(screen.getByText("The service could not load this information. Please contact support if the problem continues.")).toBeTruthy();

    vi.mocked(getDashboardData).mockResolvedValueOnce({
      ...dashboardDto,
      recipients: [],
      planned_calls: [],
      service_requests: [],
    });
    render(await OperatorPanelPage());
    expect(screen.getAllByText("No recipients ready for this view").length).toBeGreaterThan(0);
  });
});
