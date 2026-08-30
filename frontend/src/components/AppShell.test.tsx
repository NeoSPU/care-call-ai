import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";
import { getCallbackRequests } from "../lib/carecall-api";
import { URGENT_CALLBACK_COUNT_EVENT } from "../lib/urgent-callback-events";

vi.mock("../lib/carecall-api", () => ({
  createBatch: vi.fn(),
  getCallbackRequests: vi.fn(),
}));

describe("AppShell", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("links the brand back to the public landing page and exposes the top theme switch", () => {
    vi.mocked(getCallbackRequests).mockResolvedValue({
      summary: { new: 0, in_review: 0, callback_approved: 0, resolved: 0 },
      callback_requests: [],
    });

    render(
      <AppShell active="dashboard" operatorName="Max Neous">
        <div>Dashboard content</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: /Care Call AI.*Coordinator console/i }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: /Operator Panel/i }).getAttribute("href")).toBe("/dashboard/operator");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();
  });

  it("groups navigation by the CareCall slogan without the old service request shortcut", () => {
    vi.mocked(getCallbackRequests).mockResolvedValue({
      summary: { new: 0, in_review: 0, callback_approved: 0, resolved: 0 },
      callback_requests: [],
    });

    render(
      <AppShell active="orders" operatorName="Max Neous">
        <div>Orders content</div>
      </AppShell>,
    );

    expect(screen.getAllByText("Care seen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs heard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Help delivered").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Service requests/i })).toBeNull();
  });

  it("creates a selected backend batch when opening Round preflight from the sidebar", async () => {
    const { createBatch } = await import("../lib/carecall-api");
    vi.mocked(getCallbackRequests).mockResolvedValue({
      summary: { new: 0, in_review: 0, callback_approved: 0, resolved: 0 },
      callback_requests: [],
    });
    vi.mocked(createBatch).mockRejectedValue(new Error("stop before jsdom navigation"));
    window.localStorage.setItem("carecall:selected-recipient-ids", JSON.stringify(["rec-api-001", "rec-api-002"]));

    render(
      <AppShell active="operator" operatorName="Max Neous">
        <div>Operator content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("link", { name: /Round preflight/i }));

    await waitFor(() => {
      expect(createBatch).toHaveBeenCalledWith({
        selected_recipient_ids: ["rec-api-001", "rec-api-002"],
        label: "CareCall selected daily round",
        call_date: "2026-08-01",
      });
    });
  });

  it("does not show the removed circular Start calls shortcut on preflight", () => {
    vi.mocked(getCallbackRequests).mockResolvedValue({
      summary: { new: 0, in_review: 0, callback_approved: 0, resolved: 0 },
      callback_requests: [],
    });

    render(
      <AppShell active="preflight" operatorName="Max Neous">
        <div>Preflight content</div>
      </AppShell>,
    );

    expect(screen.queryByRole("link", { name: "Start calls" })).toBeNull();
  });

  it("refreshes the urgent callback badge while the operator keeps the page open", async () => {
    vi.mocked(getCallbackRequests).mockResolvedValue({
      summary: { new: 2, in_review: 1, callback_approved: 0, resolved: 0 },
      callback_requests: [
        { id: "cb-001", status: "new" },
        { id: "cb-002", status: "new" },
        { id: "cb-003", status: "operator_review" },
        { id: "cb-004", status: "resolved" },
      ],
    } as Awaited<ReturnType<typeof getCallbackRequests>>);

    render(
      <AppShell active="dashboard" operatorName="Max Neous" urgentCallbackCount={0}>
        <div>Dashboard content</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: /Urgent Callback.*0/i })).toBeTruthy();

    fireEvent.focus(window);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Urgent Callback.*3/i })).toBeTruthy();
    });
  });

  it("updates the urgent callback badge from queue change events", async () => {
    vi.mocked(getCallbackRequests).mockResolvedValue({
      summary: { new: 0, in_review: 0, callback_approved: 0, resolved: 0 },
      callback_requests: [],
    });

    render(
      <AppShell active="urgent" operatorName="Max Neous" urgentCallbackCount={2}>
        <div>Urgent callback content</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: /Urgent Callback.*2/i })).toBeTruthy();

    window.dispatchEvent(new CustomEvent(URGENT_CALLBACK_COUNT_EVENT, { detail: { count: 1 } }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Urgent Callback.*1/i })).toBeTruthy();
    });
  });
});
