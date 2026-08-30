import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UrgentCallbackClient } from "./UrgentCallbackClient";
import { createBatch, getCallbackRequests, importRunResult, updateCallbackRequest } from "../../../lib/carecall-api";
import { URGENT_CALLBACK_COUNT_EVENT } from "../../../lib/urgent-callback-events";

vi.mock("../../../lib/carecall-api", () => ({
  createBatch: vi.fn(),
  getCallbackRequests: vi.fn(),
  importRunResult: vi.fn(),
  updateCallbackRequest: vi.fn(),
}));

const urgentPayload = {
  summary: {
    new: 1,
    in_review: 1,
    callback_approved: 0,
    resolved: 0,
  },
  callback_requests: [
    {
      id: "cb-001",
      recipient_id: "rec-001",
      recipient_name: "Alex River",
      source: "siri_shortcut",
      request_text: "Please call me back about medicine delivery.",
      status: "new",
      priority: "urgent",
      operator: "",
      created_at: "2026-08-10T10:00:00Z",
      updated_at: "2026-08-10T10:00:00Z",
      resolution_note: "",
      safety_category: "non_critical",
      condition: "general",
      masked_phone: "+44******1263",
      delivery_area: "Wallingford",
      blocked: false,
      same_day_callback_count: 3,
      callback_repeat_review_required: true,
      callback_repeat_warning: "Alex River has requested 3 same-day callbacks. Automatic callback dialing is limited to three recipient-triggered calls per day.",
    },
    {
      id: "cb-002",
      recipient_id: "rec-002",
      recipient_name: "Maria Vale",
      source: "operator_created",
      request_text: "Daughter asked for an operator review.",
      status: "operator_review",
      priority: "urgent",
      operator: "carecall-coordinator",
      created_at: "2026-08-10T10:05:00Z",
      updated_at: "2026-08-10T10:05:00Z",
      resolution_note: "",
      safety_category: "special_handling",
      condition: "alzheimer",
      masked_phone: "+44******7777",
      delivery_area: "Oxford South",
      blocked: false,
      same_day_callback_count: 0,
      callback_repeat_review_required: false,
      callback_repeat_warning: "",
    },
  ],
};

describe("UrgentCallbackClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCallbackRequests).mockResolvedValue(urgentPayload);
    vi.mocked(importRunResult).mockResolvedValue({
      imported: false,
      provider_status: "running",
      run: {
        id: "run-pending",
        plan_id: "plan-pending",
        approval_id: "approval-pending",
        recipient_id: "rec-001",
        idempotency_key: "pending-key",
        status: "running",
        mode: "live",
        provider_plan_id: "provider-plan-pending",
        provider_run_id: "provider-run-pending",
        started_at: "2026-08-10 10:00:00",
        completed_at: "",
        error: "",
        masked_phone: "+44******1263",
      },
    });
  });

  const completedImport = {
    imported: true,
    provider_status: "completed",
    run: {
      id: "run-callback-123",
      plan_id: "plan-callback",
      approval_id: "approval-callback",
      recipient_id: "rec-001",
      idempotency_key: "callback-key",
      status: "completed",
      mode: "live",
      provider_plan_id: "provider-plan-callback",
      provider_run_id: "call-456",
      started_at: "2026-08-10 10:01:00",
      completed_at: "2026-08-10 10:03:00",
      error: "",
      masked_phone: "+44******1263",
    },
    intake_result: {
      id: "intake-run-callback-123",
      recipient_id: "rec-001",
      status: "completed",
      summary: "Alex asked for milk.",
      human_review: false,
      needs: [{ category: "groceries", urgency: "tomorrow", items: ["milk"], notes: "" }],
    },
    service_requests: [
      {
        id: "svc-run-callback-123-1",
        recipient_id: "rec-001",
        category: "groceries",
        queue: "delivery_volunteers",
        sla_hours: 4,
        priority: "normal",
        status: "ready_to_print",
        items: ["milk"],
        notes: "",
        human_review_reason: "",
      },
    ],
  };

  it("filters urgent callback requests and approves a real queue item through the API", async () => {
    vi.mocked(updateCallbackRequest).mockResolvedValue({
      summary: { new: 0, in_review: 0, callback_approved: 1, resolved: 0 },
      callback_requests: [{ ...urgentPayload.callback_requests[0], status: "callback_approved", operator: "Max Neous" }],
    });

    render(<UrgentCallbackClient data={urgentPayload} operatorName="Max Neous" />);

    expect(screen.getByText("Alex River")).toBeTruthy();
    expect(screen.getByText("Maria Vale")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByText("Alex River")).toBeTruthy();
    expect(screen.queryByText("Maria Vale")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(updateCallbackRequest).toHaveBeenCalledWith("cb-001", {
        status: "callback_approved",
        operator: "Max Neous",
        resolution_note: "",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    expect(await screen.findByText("Callback Approved")).toBeTruthy();
  });

  it("shows same-day callback repeat review guidance", () => {
    render(<UrgentCallbackClient data={urgentPayload} operatorName="Max Neous" />);

    expect(screen.getByText("3 callbacks today")).toBeTruthy();
    expect(screen.getByText(/limited to three recipient-triggered calls per day/)).toBeTruthy();
  });

  it("creates a one-recipient preflight batch for approved callbacks", async () => {
    vi.mocked(createBatch).mockRejectedValue(new Error("stop before jsdom navigation"));

    render(
      <UrgentCallbackClient
        data={{
          ...urgentPayload,
          callback_requests: [{ ...urgentPayload.callback_requests[0], status: "callback_approved" }],
        }}
        operatorName="Max Neous"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Prepare call" }));

    await waitFor(() => {
      expect(createBatch).toHaveBeenCalledWith({
        selected_recipient_ids: ["rec-001"],
        label: "Urgent callback for Alex River",
        call_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });
  });

  it("refreshes the callback queue when a Siri request arrives after the page is open", async () => {
    vi.mocked(getCallbackRequests).mockResolvedValue({
      summary: {
        new: 2,
        in_review: 1,
        callback_approved: 0,
        resolved: 0,
      },
      callback_requests: [
        ...urgentPayload.callback_requests,
        {
          id: "cb-003",
          recipient_id: "rec-003",
          recipient_name: "Sofia Lane",
          source: "siri_shortcut",
          request_text: "Please call me back.",
          status: "new",
          priority: "urgent",
          operator: "",
          created_at: "2026-08-10T10:10:00Z",
          updated_at: "2026-08-10T10:10:00Z",
          resolution_note: "",
          safety_category: "non_critical",
          condition: "general",
          masked_phone: "+44******9900",
          delivery_area: "Wallingford",
          blocked: false,
          same_day_callback_count: 1,
          callback_repeat_review_required: false,
          callback_repeat_warning: "",
        },
      ],
    });

    render(<UrgentCallbackClient data={urgentPayload} operatorName="Max Neous" />);

    expect(screen.queryByText("Sofia Lane")).toBeNull();

    fireEvent.focus(window);

    await waitFor(() => {
      expect(screen.getByText("Sofia Lane")).toBeTruthy();
    });
    expect(screen.getByText("3 open")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("imports started automatic callback results and keeps completed callbacks visible in the queue", async () => {
    const startedPayload = {
      summary: { new: 0, in_review: 0, callback_approved: 1, resolved: 0 },
      callback_requests: [
        {
          ...urgentPayload.callback_requests[0],
          status: "auto_callback_started",
          auto_run_id: "run-callback-123",
          auto_call_status: "auto_callback_started",
          requested_at: "2026-08-10T10:00:00Z",
        },
      ],
    };
    const completedPayload = {
      summary: { new: 0, in_review: 0, callback_approved: 0, resolved: 1 },
      callback_requests: [
        {
          ...startedPayload.callback_requests[0],
          status: "auto_callback_completed",
          auto_call_status: "auto_callback_completed",
          call_started_at: "2026-08-10 10:01:00",
          call_completed_at: "2026-08-10 10:03:00",
          provider_run_id: "call-456",
        },
      ],
    };
    vi.mocked(getCallbackRequests)
      .mockResolvedValueOnce(startedPayload)
      .mockResolvedValueOnce(completedPayload);
    vi.mocked(importRunResult).mockResolvedValue(completedImport);

    render(<UrgentCallbackClient data={urgentPayload} operatorName="Max Neous" />);

    fireEvent.focus(window);

    await waitFor(() => {
      expect(importRunResult).toHaveBeenCalledWith("run-callback-123");
    });
    expect(await screen.findByText("Auto Callback Completed")).toBeTruthy();
    expect(screen.getAllByText(/Requested/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Call started/)).toBeTruthy();
    expect(screen.getByText(/Call completed/)).toBeTruthy();
    expect(screen.getByText("0 open")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear from queue" })).toBeTruthy();
  });

  it("lets the operator clear a completed automatic callback from the working queue", async () => {
    const completedPayload = {
      summary: { new: 0, in_review: 0, callback_approved: 0, resolved: 1 },
      callback_requests: [
        {
          ...urgentPayload.callback_requests[0],
          status: "auto_callback_completed",
          auto_call_status: "auto_callback_completed",
          auto_run_id: "run-callback-123",
          call_started_at: "2026-08-10 10:01:00",
          call_completed_at: "2026-08-10 10:03:00",
          provider_run_id: "call-456",
        },
      ],
    };
    vi.mocked(updateCallbackRequest).mockResolvedValue({
      summary: { new: 0, in_review: 0, callback_approved: 0, resolved: 1 },
      callback_requests: [{ ...completedPayload.callback_requests[0], status: "resolved", operator: "Max Neous" }],
    });

    render(<UrgentCallbackClient data={completedPayload} operatorName="Max Neous" />);

    fireEvent.click(screen.getByRole("button", { name: "Clear from queue" }));

    await waitFor(() => {
      expect(updateCallbackRequest).toHaveBeenCalledWith("cb-001", {
        status: "resolved",
        operator: "Max Neous",
        resolution_note: "Cleared from callback queue after terminal automatic callback.",
      });
    });
  });

  it("notifies the shell badge immediately when a callback request is dismissed", async () => {
    const countListener = vi.fn();
    window.addEventListener(URGENT_CALLBACK_COUNT_EVENT, countListener);
    vi.mocked(updateCallbackRequest).mockResolvedValue({
      summary: { new: 0, in_review: 1, callback_approved: 0, resolved: 1 },
      callback_requests: [{ ...urgentPayload.callback_requests[0], status: "resolved", operator: "Max Neous" }],
    });

    try {
      render(<UrgentCallbackClient data={urgentPayload} operatorName="Max Neous" />);

      fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0]);

      await waitFor(() => {
        expect(updateCallbackRequest).toHaveBeenCalledWith("cb-001", {
          status: "resolved",
          operator: "Max Neous",
          resolution_note: "Dismissed as duplicate.",
        });
      });
      expect(screen.getByText("1 open")).toBeTruthy();
      expect(countListener).toHaveBeenCalledWith(
        expect.objectContaining({ detail: { count: 1 } }),
      );
    } finally {
      window.removeEventListener(URGENT_CALLBACK_COUNT_EVENT, countListener);
    }
  });
});
