import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PreflightPage from "./page";
import {
  approvePreflight,
  cancelRun,
  createBatch,
  getPreflight,
  importRunResult,
  requestLiveExecution,
} from "../../../lib/carecall-api";

vi.mock("../../../lib/carecall-api", () => ({
  approvePreflight: vi.fn(),
  cancelRun: vi.fn(),
  createBatch: vi.fn(),
  getPreflight: vi.fn(),
  importRunResult: vi.fn(),
  requestLiveExecution: vi.fn(),
}));

const readyPreview = {
  recipient_id: "rec-api-001",
  recipient_label: "Avery Backend",
  masked_phone: "+1******4401",
  ready: true,
  route: "recipient",
  idempotency_key: "backend-key-001",
  blocked_reasons: [],
  same_day_call_count: 0,
  operator_repeat_available: false,
  operator_repeat_limit_reached: false,
  same_day_repeat_warning: "",
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
  same_day_call_count: 0,
  operator_repeat_available: false,
  operator_repeat_limit_reached: false,
  same_day_repeat_warning: "",
};

const secondReadyPreview = {
  recipient_id: "rec-api-004",
  recipient_label: "Jamie Ready",
  masked_phone: "+1******4404",
  ready: true,
  route: "recipient",
  idempotency_key: "backend-key-004",
  blocked_reasons: [],
  same_day_call_count: 0,
  operator_repeat_available: false,
  operator_repeat_limit_reached: false,
  same_day_repeat_warning: "",
};

const severeManualPreview = {
  recipient_id: "rec-api-003",
  recipient_label: "Sam Manual",
  masked_phone: "+1******4403",
  ready: false,
  route: "staff",
  idempotency_key: "",
  blocked_reasons: ["Severe or unsuitable cases route to caregiver/staff/manual handling."],
  same_day_call_count: 0,
  operator_repeat_available: false,
  operator_repeat_limit_reached: false,
  same_day_repeat_warning: "",
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
  vi.mocked(requestLiveExecution).mockResolvedValue({
    accepted: false,
    mode: "live",
    real_calls_placed: 0,
    blocked_reasons: ["CALL-E readiness check failed."],
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
  vi.mocked(cancelRun).mockResolvedValue({
    canceled: true,
    run: {
      id: "run-api-live-001",
      plan_id: "plan-api-001",
      approval_id: "approval-api-001",
      recipient_id: "rec-api-001",
      idempotency_key: "backend-key-001",
      status: "canceled",
      mode: "live",
      provider_plan_id: "provider-plan-001",
      provider_run_id: "provider-run-001",
      started_at: "",
      completed_at: "",
      error: "Operator stopped the active session.",
      masked_phone: "+1******4401",
    },
  });
}

async function renderPreflight() {
  mockPreflightLoad();
  render(await PreflightPage({ searchParams: { batch_id: "batch-api-001" } }));
}

function completeLiveGate() {
  fireEvent.click(screen.getByRole("button", { name: "Start calls" }));
  [
    "I verified consent is active for every selected recipient.",
    "Routes and care profiles match every selected recipient.",
    "I reviewed the planned call list shown on this screen.",
    "I understand Care Call AI will place real outbound calls.",
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
    vi.useRealTimers();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("loads backend preflight state through the typed API client", async () => {
    await renderPreflight();

    expect(getPreflight).toHaveBeenCalledWith("batch-api-001");
    expect(screen.getByRole("link", { name: "Back to Operator panel" }).getAttribute("href")).toBe("/dashboard/operator");
    expect(screen.queryByText("APPROVE CARE CALL AI AUTO ROUND")).toBeNull();
    expect(screen.getByRole("heading", { name: "Round preflight" })).toBeTruthy();
    expect(screen.getByText("May answer: Marija Chen (spouse)")).toBeTruthy();
    expect(screen.queryByText("Backend ready key set")).toBeNull();
    expect(screen.queryByText("Run batch dry run (no dials)")).toBeNull();
    expect(screen.queryByText("Live auto-round")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start calls" }));
    const readiness = screen.getByLabelText("Final demo readiness");
    expect(within(readiness).getByText("Selected recipient")).toBeTruthy();
    expect(within(readiness).getByText("Exactly one")).toBeTruthy();
    expect(within(readiness).getByText("Answerer rule")).toBeTruthy();
    expect(within(readiness).getByText("Visible")).toBeTruthy();
    expect(within(readiness).getByText("Planned calls")).toBeTruthy();
    expect(within(readiness).getByText("Ready")).toBeTruthy();
    expect(within(readiness).getByText("Start gate")).toBeTruthy();
    expect(within(readiness).getByText("Locked")).toBeTruthy();
  });

  it("uses URL batch_id when dashboard creates a selected batch", async () => {
    mockPreflightLoad();

    render(await PreflightPage({ searchParams: { batch_id: "batch-selected-123" } }));

    expect(getPreflight).toHaveBeenCalledWith("batch-selected-123");
  });

  it("does not fall back to a stale preflight batch when no selection is supplied", async () => {
    render(await PreflightPage());

    expect(getPreflight).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Round preflight" })).toBeTruthy();
    expect(screen.getByText("No planned calls selected")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Operator Panel" }).getAttribute("href")).toBe(
      "/dashboard/operator#call-list",
    );
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
    vi.mocked(getPreflight).mockResolvedValueOnce(twoReadyPreflight).mockResolvedValueOnce(adjustedPreflight);
    vi.mocked(createBatch).mockResolvedValue({
      batch: {
        id: "batch-adjusted-001",
        label: "CareCall preflight adjusted round",
        call_date: "2026-08-01",
        selected_recipient_ids: ["rec-api-004"],
      },
    });

    render(await PreflightPage({ searchParams: { batch_id: "batch-api-001" } }));

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
    vi.mocked(getPreflight).mockResolvedValue(twoReadyPreflight);
    vi.mocked(createBatch).mockRejectedValue(new Error("database connection refused"));

    render(await PreflightPage({ searchParams: { batch_id: "batch-api-001" } }));

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

  it("does not expose dry-run controls to the operator", async () => {
    await renderPreflight();

    expect(screen.queryByRole("button", { name: "Run batch dry run (no dials)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dry run" })).toBeNull();
    expect(screen.queryByText(/Dry run never dials/)).toBeNull();
  });

  it("keeps live execution disabled until confirmations and exact phrase are ready", async () => {
    await renderPreflight();

    fireEvent.click(screen.getByRole("button", { name: "Start calls" }));
    expect(screen.getByRole("button", { name: "Start calls now" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Authorization phrase"), {
      target: { value: "EXECUTE LIVE CALL" },
    });
    expect(screen.getByRole("button", { name: "Start calls now" }).hasAttribute("disabled")).toBe(true);

    cleanup();
    await renderPreflight();
    completeLiveGate();
    expect(approvePreflight).not.toHaveBeenCalled();
    expect((await screen.findByRole("button", { name: "Start calls now" })).hasAttribute("disabled")).toBe(false);
    expect(within(screen.getByLabelText("Final demo readiness")).getAllByText("Ready").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Start calls now" }));

    expect(approvePreflight).toHaveBeenCalledWith({
      plan_id: "plan-api-001",
      approved_keys: ["backend-key-001"],
      operator: "carecall-coordinator",
      note: "Approved from Start calls action.",
      confirmations: {
        active_consent: true,
        care_route_match: true,
        exact_keyset: true,
        real_side_effects: true,
      },
      authorization_phrase: "EXECUTE LIVE CALLS",
    });
    await waitFor(() => {
      expect(requestLiveExecution).toHaveBeenCalledWith({
        plan_id: "plan-api-001",
        approval_id: "approval-api-001",
        approved_keys: ["backend-key-001"],
        confirmations: {
          active_consent: true,
          care_route_match: true,
          exact_keyset: true,
          real_side_effects: true,
        },
        authorization_phrase: "EXECUTE LIVE CALLS",
      });
    });
  });

  it("keeps the approval gate closed when backend reports a keyset or live gate rejection", async () => {
    vi.mocked(getPreflight).mockResolvedValue(preflightDto);
    vi.mocked(approvePreflight).mockResolvedValue({
      approved: false,
      status: "rejected",
      blocked_reasons: ["Approved key set does not match the current backend preflight plan."],
      approval: null,
    });

    render(await PreflightPage({ searchParams: { batch_id: "batch-api-001" } }));

    completeLiveGate();
    fireEvent.click(screen.getByRole("button", { name: "Start calls now" }));

    expect((await screen.findAllByText("The service could not complete this action. Please contact support if the problem continues.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Approved key set does not match the current backend preflight plan.")).toBeNull();
    expect(requestLiveExecution).not.toHaveBeenCalled();

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
      blocked_reasons: ["CALL-E readiness check failed."],
      records: [],
    });
    vi.mocked(getPreflight).mockResolvedValue(preflightDto);

    render(await PreflightPage({ searchParams: { batch_id: "batch-api-001" } }));

    completeLiveGate();
    fireEvent.click(await screen.findByRole("button", { name: "Start calls now" }));

    expect((await screen.findAllByText("The service could not complete this action. Please contact support if the problem continues.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("CALL-E readiness check failed.")).toBeNull();
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
    fireEvent.click(await screen.findByRole("button", { name: "Start calls now" }));

    await waitFor(() => {
      expect(importRunResult).toHaveBeenCalledWith("run-api-live-001");
    });
    expect(screen.getByText("Run run-api-live-001")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText("CALL-E result imported: 1 service request created.").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByRole("link", { name: "Open orders" })[0].getAttribute("href")).toBe(
      "/dashboard/orders/print",
    );
  });

  it("continues checking and importing a live result after the progress modal is closed", async () => {
    await renderPreflight();
    vi.mocked(requestLiveExecution).mockResolvedValue({
      accepted: true,
      mode: "live",
      real_calls_placed: 1,
      blocked_reasons: [],
      records: [
        {
          id: "run-api-live-closed-001",
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
    vi.mocked(importRunResult)
      .mockResolvedValueOnce({
        imported: false,
        provider_status: "in_progress",
        run: {
          id: "run-api-live-closed-001",
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
      })
      .mockResolvedValueOnce({
        imported: true,
        provider_status: "completed",
        run: {
          id: "run-api-live-closed-001",
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
          id: "intake-run-api-live-closed-001",
          recipient_id: "rec-api-001",
          status: "completed",
          summary: "Avery asked for milk.",
          human_review: false,
          needs: [],
        },
        service_requests: [
          {
            id: "svc-run-api-live-closed-001-1",
            recipient_id: "rec-api-001",
            recipient_name: "Avery Backend",
            category: "groceries",
            queue: "groceries",
            sla_hours: 24,
            priority: "normal",
            status: "ready_to_print",
            items: ["milk"],
            notes: "Deliver tomorrow.",
            human_review_reason: "",
          },
        ],
      });

    completeLiveGate();
    fireEvent.click(await screen.findByRole("button", { name: "Start calls now" }));

    expect(await screen.findByText(/You can safely close this window and keep working/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close call progress" }));
    expect(screen.queryByRole("dialog", { name: "Call round progress" })).toBeNull();
    expect(screen.getByText("Active call tracking")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View progress" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View progress" }));
    expect(screen.getByRole("dialog", { name: "Call round progress" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close call progress" }));

    await waitFor(() => {
      expect(importRunResult).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(importRunResult).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("CALL-E result imported: 1 printable order created.")).toBeTruthy();
    expect(window.localStorage.getItem("carecall.activeLiveCallSession")).toBeNull();
  });

  it("shows deferred follow-up counters when CALL-E finishes without an answer", async () => {
    await renderPreflight();
    vi.mocked(requestLiveExecution).mockResolvedValue({
      accepted: true,
      mode: "live",
      real_calls_placed: 1,
      blocked_reasons: [],
      records: [
        {
          id: "run-api-live-no-answer-001",
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
    vi.mocked(importRunResult).mockReset();
    vi.mocked(importRunResult).mockResolvedValue({
      imported: true,
      provider_status: "no_answer",
      run: {
        id: "run-api-live-no-answer-001",
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
        id: "intake-run-api-live-no-answer-001",
        recipient_id: "rec-api-001",
        status: "no_contact",
        summary: "CALL-E ended with no_answer; route for human review.",
        human_review: true,
        needs: [],
      },
      service_requests: [
        {
          id: "svc-run-api-live-no-answer-001-1",
          recipient_id: "rec-api-001",
          recipient_name: "Avery Backend",
          category: "other",
          queue: "coordinator_review",
          sla_hours: 8,
          priority: "review",
          status: "review",
          items: [],
          notes: "No answer.",
          human_review_reason: "Call status requires human review: no_contact.",
        },
      ],
    });

    completeLiveGate();
    fireEvent.click(await screen.findByRole("button", { name: "Start calls now" }));

    await waitFor(() => {
      expect(importRunResult).toHaveBeenCalledWith("run-api-live-no-answer-001");
    });
    expect((await screen.findAllByText(/CALL-E finished with no_answer/)).length).toBeGreaterThan(0);
    const progressSummary = screen.getByLabelText("Call progress summary");
    expect(within(progressSummary).getByText("Needs heard").nextSibling?.textContent).toBe("0");
    expect(within(progressSummary).getByText("Follow-up").nextSibling?.textContent).toBe("1");
    expect(within(progressSummary).getByText("Orders").nextSibling?.textContent).toBe("0");
  });

  it("lets the operator stop an active tracking session before importing orders", async () => {
    await renderPreflight();
    vi.mocked(requestLiveExecution).mockResolvedValue({
      accepted: true,
      mode: "live",
      real_calls_placed: 1,
      blocked_reasons: [],
      records: [
        {
          id: "run-api-live-cancel-001",
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
    vi.mocked(importRunResult).mockResolvedValue({
      imported: false,
      provider_status: "in_progress",
      run: {
        id: "run-api-live-cancel-001",
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
    });
    vi.mocked(cancelRun).mockResolvedValue({
      canceled: true,
      run: {
        id: "run-api-live-cancel-001",
        plan_id: "plan-api-001",
        approval_id: "approval-api-001",
        recipient_id: "rec-api-001",
        idempotency_key: "backend-key-001",
        status: "canceled",
        mode: "live",
        provider_plan_id: "provider-plan-001",
        provider_run_id: "provider-run-001",
        started_at: "",
        completed_at: "",
        error: "Operator stopped the active session.",
        masked_phone: "+1******4401",
      },
    });

    completeLiveGate();
    fireEvent.click(await screen.findByRole("button", { name: "Start calls now" }));
    expect(await screen.findByRole("button", { name: "Stop tracking" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stop tracking" }));

    await waitFor(() => {
      expect(cancelRun).toHaveBeenCalledWith(
        "run-api-live-cancel-001",
        "Operator stopped local CareCall tracking from the preflight progress window.",
      );
    });
    expect(await screen.findByText("Session stopped")).toBeTruthy();
    expect(screen.getAllByText(/will not import it or create orders/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/provider-side call may still continue/).length).toBeGreaterThan(0);
    expect(window.localStorage.getItem("carecall.activeLiveCallSession")).toBeNull();
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

    expect(screen.queryByText("not issued")).toBeNull();
    expect(screen.queryByText("backend-key-001")).toBeNull();
    expect(screen.getAllByLabelText("Locked out of automated calling").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("rec-api-002:backend-key")).toBeNull();
  });

  it("shows same-day repeat call warnings from backend preflight metadata", async () => {
    vi.mocked(getPreflight).mockResolvedValue({
      ...preflightDto,
      ready_previews: [
        {
          ...readyPreview,
          same_day_call_count: 1,
          operator_repeat_available: true,
          same_day_repeat_warning:
            "Avery Backend has already received one live call today. A second operator-initiated call requires explicit repeat-call awareness.",
        },
      ],
    });

    render(await PreflightPage({ searchParams: { batch_id: "batch-api-001" } }));

    expect(screen.getByText(/already received one live call today/)).toBeTruthy();
  });

  it("requires repeat acknowledgement before starting a same-day repeat call", async () => {
    vi.mocked(getPreflight).mockResolvedValue({
      ...preflightDto,
      ready_previews: [
        {
          ...readyPreview,
          same_day_call_count: 1,
          operator_repeat_available: true,
          same_day_repeat_warning:
            "Avery Backend has already received one live call today. A second operator-initiated call requires explicit repeat-call awareness.",
        },
      ],
    });

    render(await PreflightPage({ searchParams: { batch_id: "batch-api-001" } }));

    completeLiveGate();
    expect(screen.getByRole("button", { name: "Start calls now" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(
      screen.getByLabelText(
        "I understand this is a same-day repeat call and the agent will ask whether to update the previous request or add changes.",
      ),
    );
    expect(screen.getByRole("button", { name: "Start calls now" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Start calls now" }));

    await waitFor(() => {
      expect(approvePreflight).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmations: expect.objectContaining({
            same_day_repeat_acknowledged: true,
          }),
        }),
      );
    });
  });
});
