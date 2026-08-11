import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UrgentCallbackClient } from "./UrgentCallbackClient";
import { updateCallbackRequest } from "../../../lib/carecall-api";

vi.mock("../../../lib/carecall-api", () => ({
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
    },
  ],
};

describe("UrgentCallbackClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
});
