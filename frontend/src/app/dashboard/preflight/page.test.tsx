import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PreflightPage from "./page";
import {
  approvePreflight,
  createBatch,
  getDashboardData,
  getPreflight,
  getRunResults,
  getRunStatus,
  importRunResult,
  requestLiveExecution,
  runDryRunBatch,
} from "../../../lib/carecall-api";

vi.mock("../../../lib/carecall-api", () => ({
  approvePreflight: vi.fn(),
  createBatch: vi.fn(),
  getDashboardData: vi.fn(),
  getPreflight: vi.fn(),
  getRunResults: vi.fn(),
  getRunStatus: vi.fn(),
  importRunResult: vi.fn(),
  requestLiveExecution: vi.fn(),
  runDryRunBatch: vi.fn(),
}));

const readyPreview = {
  recipient_id: "rec-api-001",
  recipient_label: "Avery Backend",
  masked_phone: "+1******4401",
  ready: true,
  route: "recipient",
  idempotency_key: "backend-key-001",
  blocked_reasons: [],
  authorized_contacts: [
    {
      name: "Marija Chen",
      relationship: "spouse",
      can_answer_intake: true,
      preferred_goodbye: "All the best, Ms Marija.",
    },
  ],
};

const unapprovedSpecialHandlingPreview = {
  recipient_id: "rec-api-002",
  recipient_label: "Morgan Review",
  masked_phone: "+1******4402",
  ready: false,
  route: "caregiver",
  idempotency_key: "",
  blocked_reasons: [
    "Special-handling recipient requires explicit card review and per-recipient approval.",
  ],
};

const secondReadyPreview = {
  recipient_id: "rec-api-004",
  recipient_label: "Jamie Ready",
  masked_phone: "+1******4404",
  ready: true,
  route: "recipient",
  idempotency_key: "backend-key-004",
  blocked_reasons: [],
};

const severeManualPreview = {
  recipient_id: "rec-api-003",
  recipient_label: "Sam Manual",
  masked_phone: "+1******4403",
  ready: false,
  route: "staff",
  idempotency_key: "",
  blocked_reasons: ["Severe or unsuitable cases route to caregiver/staff/manual handling."],
};

const dashboardDto = {
  service: "carecall-backend",
  summary: {
    recipients: 3,
    ready: 1,
    blocked: 2,
    service_requests: 0,
    stale_approvals: 0,
  },
  recipients: [],
  planned_calls: [readyPreview, unapprovedSpecialHandlingPreview, severeManualPreview],
  call_status: {
    preflight_plans: [{ id: "plan-api-001", batch_id: "batch-api-001" }],
    approvals: [],
    intake_results: [],
  },
  service_requests: [],
};

const preflightDto = {
  plan_id: "plan-api-001",
  batch_id: "batch-api-001",
  call_date: "2026-08-01",
  ready_keys: ["backend-key-001"],
  ready_previews: [readyPreview],
  manual_previews: [unapprovedSpecialHandlingPreview],
  blocked_previews: [severeManualPreview],
};

function mockPreflightLoad() {
  vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);
  vi.mocked(getPreflight).mockResolvedValue(preflightDto);
  vi.mocked(createBatch).mockResolvedValue({
    batch: {
      id: "batch-adjusted-001",
      label: "CareCall preflight adjusted round",
      call_date: "2026-08-01",
      selected_recipient_ids: ["rec-api-001"],
    },
  });

  vi.mocked(approvePreflight).mockResolvedValue({
    approved: true,
    status: "approved",
    blocked_reasons: [],
    approval: {
      id: "approval-api-001",
      plan_id: "plan-api-001",
      batch_id: "batch-api-001",
      approved_keys: ["backend-key-001"],
      confirmations: {
        active_consent: true,
        care_route_match: true,
        exact_keyset: true,
        real_side_effects: true,
      },
      authorization_phrase: "EXECUTE LIVE CALLS",
      stale: false,
    },
  });
  vi.mocked(runDryRunBatch).mockResolvedValue({
    accepted: true,
    mode: "dry_run",
    real_calls_placed: 0,
    blocked_reasons: [],
    records: [],
  });
  vi.mocked(requestLiveExecution).mockResolvedValue({
    accepted: false,
    mode: "live",
    real_calls_placed: 0,
    blocked_reasons: ["CARECALL_LIVE_CALLS_ENABLED is not enabled."],
    records: [],
  });
  vi.mocked(importRunResult).mockResolvedValue({
    imported: true,
    provider_status: "completed",
    run: {
      id: "run-api-live-001",
      plan_id: "plan-api-001",
      approval_id: "approval-api-001",
      recipient_id: "rec-api-001",
      idempotency_key: "backend-key-001",
      status: "completed",
      mode: "live",
      provider_plan_id: "provider-plan-001",
      provider_run_id: "provider-run-001",
      started_at: "",
      completed_at: "",
      error: "",
      masked_phone: "+1******4401",
    },
    intake_result: {
      id: "intake-run-api-live-001",
      recipient_id: "rec-api-001",
      status: "completed",
      summary: "Alex asked for milk and bread.",
      human_review: false,
      needs: [],
    },
    service_requests: [
      {
        id: "svc-run-api-live-001-1",
        recipient_id: "rec-api-001",
        recipient_name: "Avery Backend",
        category: "groceries",
        queue: "groceries",
        sla_hours: 24,
        priority: "normal",
        status: "pending",
        items: ["milk", "bread"],
        notes: "Deliver tomorrow.",
        human_review_reason: "",
      },
    ],
  });
  vi.mocked(getRunStatus).mockResolvedValue({
    run: {
      id: "run-api-001",
      plan_id: "plan-api-001",
      approval_id: "approval-api-001",
      recipient_id: "rec-api-001",
      idempotency_key: "backend-key-001",
      status: "dry_run",
      mode: "dry_run",
      provider_plan_id: "",
      provider_run_id: "",
      started_at: "",
      completed_at: "",
      error: "",
      masked_phone: "+1******4401",
    },
  });
  vi.mocked(getRunResults).mockResolvedValue({
    run: {
      id: "run-api-001",
      plan_id: "plan-api-001",
      approval_id: "approval-api-001",
      recipient_id: "rec-api-001",
      idempotency_key: "backend-key-001",
      status: "dry_run",
      mode: "dry_run",
      provider_plan_id: "",
      provider_run_id: "",
      started_at: "",
      completed_at: "",
      error: "",
      masked_phone: "+1******4401",
    },
    intake_result: { id: "intake-api-001", summary: "Dry run only.", needs: [] },
    service_requests: [],
  });
}

async function renderPreflight() {
  mockPreflightLoad();
  render(await PreflightPage());
}

function completeLiveGate() {
  fireEvent.click(screen.getByRole("button", { name: "Live auto-round" }));
  [
    "I verified consent is active for every selected recipient.",
    "Routes and care profiles match every selected recipient.",
    "Approved keys exactly match the backend ready key set.",
    "I understand live CALL-E places real outbound calls and may spend credits.",
  ].forEach((label) => {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    if (!input.checked) {
      fireEvent.click(input);
    }
  });
  fireEvent.change(screen.getByLabelText("Authorization phrase"), {
    target: { value: "EXECUTE LIVE CALLS" },
  });
}

describe("PreflightPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads backend preflight state through the typed API client", async () => {
    await renderPreflight();

    expect(getDashboardData).toHaveBeenCalled();
    expect(getPreflight).toHaveBeenCalledWith("batch-api-001");
    expect(screen.getByRole("link", { name: "Back to Daily round" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByText("APPROVE CARE CALL AI AUTO ROUND")).toBeNull();
    expect(screen.getByRole("heading", { name: "Round preflight / dry run" })).toBeTruthy();
    expect(screen.getByText("May answer: Marija Chen (spouse)")).toBeTruthy();
    const readiness = screen.getByLabelText("Final demo readiness");
    expect(within(readiness).getByText("Selected recipient")).toBeTruthy();
    expect(within(readiness).getByText("Exactly one")).toBeTruthy();
    expect(within(readiness).getByText("Answerer rule")).toBeTruthy();
    expect(within(readiness).getByText("Visible")).toBeTruthy();
    expect(within(readiness).getByText("Backend keyset")).toBeTruthy();
    expect(within(readiness).getByText("Issued")).toBeTruthy();
    expect(within(readiness).getByText("Live approval")).toBeTruthy();
    expect(within(readiness).getByText("Locked")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dry run" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("uses URL batch_id when dashboard creates a selected batch", async () => {
    mockPreflightLoad();

    render(await PreflightPage({ searchParams: { batch_id: "batch-selected-123" } }));

    expect(getPreflight).toHaveBeenCalledWith("batch-selected-123");
  });

  it("lets the operator remove a ready recipient and rebuilds backend preflight", async () => {
    const twoReadyPreflight = {
      ...preflightDto,
      ready_keys: ["backend-key-001", "backend-key-004"],
      ready_previews: [readyPreview, secondReadyPreview],
    };
    const adjustedPreflight = {
      ...preflightDto,
      batch_id: "batch-adjusted-001",
      ready_keys: ["backend-key-004"],
      ready_previews: [secondReadyPreview],
      manual_previews: [],
      blocked_previews: [],
    };
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);
    vi.mocked(getPreflight).mockResolvedValueOnce(twoReadyPreflight).mockResolvedValueOnce(adjustedPreflight);
    vi.mocked(createBatch).mockResolvedValue({
      batch: {
        id: "batch-adjusted-001",
        label: "CareCall preflight adjusted round",
        call_date: "2026-08-01",
        selected_recipient_ids: ["rec-api-004"],
      },
    });

    render(await PreflightPage());

    fireEvent.click(screen.getByLabelText("Include Avery Backend in preflight"));

    expect(createBatch).toHaveBeenCalledWith({
      selected_recipient_ids: ["rec-api-004"],
      label: "CareCall preflight adjusted round",
      call_date: "2026-08-01",
    });
    await waitFor(() => {
      expect(getPreflight).toHaveBeenLastCalledWith("batch-adjusted-001");
    });
    expect(await screen.findByText("Jamie Ready")).toBeTruthy();
    expect(window.localStorage.getItem("carecall:selected-recipient-ids")).toBe(JSON.stringify(["rec-api-004"]));
    expect(window.location.search).toBe("?batch_id=batch-adjusted-001");
    expect(screen.queryByText("Avery Backend")).toBeNull();
  });

  it("shows only support-safe copy when preflight selection rebuild fails", async () => {
    const twoReadyPreflight = {
      ...preflightDto,
      ready_keys: ["backend-key-001", "backend-key-004"],
      ready_previews: [readyPreview, secondReadyPreview],
    };
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);
    vi.mocked(getPreflight).mockResolvedValue(twoReadyPreflight);
    vi.mocked(createBatch).mockRejectedValue(new Error("database connection refused"));

    render(await PreflightPage());

    fireEvent.click(screen.getByLabelText("Include Avery Backend in preflight"));

    expect(
      await screen.findByText(
        "The service could not complete this action. Please contact support if the problem continues.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("database connection refused")).toBeNull();
    expect(screen.getByText("Avery Backend")).toBeTruthy();
    expect(screen.getByText("Jamie Ready")).toBeTruthy();
  });

  it("runs dry run with no dials and shows the zero real-call result", async () => {
    await renderPreflight();

    fireEvent.click(screen.getByRole("button", { name: "Run batch dry run (no dials)" }));

    expect(runDryRunBatch).toHaveBeenCalledWith({
      plan_id: "plan-api-001",
      approval_id: "dry-run",
      approved_keys: ["backend-key-001"],
    });
    expect(await screen.findByText(/Dry run complete: 0 real calls placed/)).toBeTruthy();
  });

  it("keeps live execution disabled until confirmations, exact phrase, exact keyset, and backend approval pass", async () => {
    await renderPreflight();

    fireEvent.click(screen.getByRole("button", { name: "Live auto-round" }));
    expect(screen.getByRole("button", { name: "Start approved round" }).hasAttribute("disabled")).toBe(
      true,
    );

    fireEvent.change(screen.getByLabelText("Authorization phrase"), {
      target: { value: "EXECUTE LIVE CALL" },
    });
    expect(screen.getByRole("button", { name: "Start approved round" }).hasAttribute("disabled")).toBe(
      true,
    );

    completeLiveGate();
    expect(approvePreflight).toHaveBeenCalledWith({
      plan_id: "plan-api-001",
      approved_keys: ["backend-key-001"],
      operator: "carecall-coordinator",
      note: "Approved from preflight UI.",
      confirmations: {
        active_consent: true,
        care_route_match: true,
        exact_keyset: true,
        real_side_effects: true,
      },
      authorization_phrase: "EXECUTE LIVE CALLS",
    });
    expect(
      (await screen.findByRole("button", { name: "Start approved round" })).hasAttribute("disabled"),
    ).toBe(false);
    expect(within(screen.getByLabelText("Final demo readiness")).getByText("Ready")).toBeTruthy();
  });

  it("keeps the approval gate closed when backend reports a keyset or live gate rejection", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);
    vi.mocked(getPreflight).mockResolvedValue(preflightDto);
    vi.mocked(approvePreflight).mockResolvedValue({
      approved: false,
      status: "rejected",
      blocked_reasons: ["Approved key set does not match the current backend preflight plan."],
      approval: null,
    });

    render(await PreflightPage());

    completeLiveGate();

    expect(await screen.findByText("The service could not complete this action. Please contact support if the problem continues.")).toBeTruthy();
    expect(screen.queryByText("Approved key set does not match the current backend preflight plan.")).toBeNull();
    expect(screen.getByRole("button", { name: "Start approved round" }).hasAttribute("disabled")).toBe(
      true,
    );

    cleanup();
    vi.mocked(approvePreflight).mockResolvedValue({
      approved: true,
      status: "approved",
      blocked_reasons: [],
      approval: { id: "approval-api-001", stale: false },
    });
    vi.mocked(requestLiveExecution).mockResolvedValue({
      accepted: false,
      mode: "live",
      real_calls_placed: 0,
      blocked_reasons: ["CARECALL_LIVE_CALLS_ENABLED is not enabled."],
      records: [],
    });
    vi.mocked(getDashboardData).mockResolvedValue(dashboardDto);
    vi.mocked(getPreflight).mockResolvedValue(preflightDto);

    render(await PreflightPage());

    completeLiveGate();
    fireEvent.click(await screen.findByRole("button", { name: "Start approved round" }));

    expect((await screen.findAllByText("The service could not complete this action. Please contact support if the problem continues.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("CARECALL_LIVE_CALLS_ENABLED is not enabled.")).toBeNull();
  });

  it("lets the operator import a terminal live CALL-E result into generated service requests", async () => {
    await renderPreflight();
    vi.mocked(requestLiveExecution).mockResolvedValue({
      accepted: true,
      mode: "live",
      real_calls_placed: 1,
      blocked_reasons: [],
      records: [
        {
          id: "run-api-live-001",
          plan_id: "plan-api-001",
          approval_id: "approval-api-001",
          recipient_id: "rec-api-001",
          idempotency_key: "backend-key-001",
          status: "running",
          mode: "live",
          provider_plan_id: "provider-plan-001",
          provider_run_id: "provider-run-001",
          started_at: "",
          completed_at: "",
          error: "",
          masked_phone: "+1******4401",
        },
      ],
    });

    completeLiveGate();
    fireEvent.click(await screen.findByRole("button", { name: "Start approved round" }));

    expect(await screen.findByText(/Live execution accepted: 1 real calls placed/)).toBeTruthy();
    expect(screen.getByText("Run run-api-live-001")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Import latest CALL-E result" }));

    await waitFor(() => {
      expect(importRunResult).toHaveBeenCalledWith("run-api-live-001");
    });
    expect(await screen.findByText("CALL-E result imported: 1 service request created.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open print orders" }).getAttribute("href")).toBe(
      "/dashboard/orders/print",
    );
  });

  it("excludes unapproved special handling and locks severe manual rows without ready keys", async () => {
    await renderPreflight();

    expect(screen.getByText("Morgan Review")).toBeTruthy();
    expect(
      screen.getByText(
        "Special-handling recipient requires explicit card review and per-recipient approval.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Sam Manual")).toBeTruthy();
    expect(screen.getByText("Severe or unsuitable cases route to caregiver/staff/manual handling.")).toBeTruthy();

    const manualRows = screen.getAllByRole("row").filter((row) => within(row).queryByText("not issued"));
    expect(manualRows.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByLabelText("Locked out of automated calling").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("rec-api-002:backend-key")).toBeNull();
  });
});
