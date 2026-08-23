import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrintableOrderSheet } from "./PrintableOrderSheet";
import type { PrintOrdersPayload } from "../lib/types";

const printPayload: PrintOrdersPayload = {
  service_requests: [
    {
      id: "srv-api-001",
      recipient_id: "rec-api-001",
      recipient_name: "Avery Backend",
      recipient_masked_phone: "+1******4401",
      recipient_delivery_area: "Wallingford",
      recipient_address: "14 Backend Close",
      care_summary: "general · mild",
      care_notes: "Mobility support. Long backend note wraps inside the printed sheet.",
      category: "groceries",
      queue: "delivery_volunteers",
      sla_hours: 4,
      priority: "normal",
      status: "ready_to_print",
      items: ["Tinned soup"],
      notes: "Backend generated order.",
      human_review_reason: "",
      created_at: "2026-08-23 10:15:00",
      updated_at: "2026-08-23 10:15:00",
      update_count: 0,
      update_history: [{ event: "created", run_id: "run-test-001" }],
    },
    {
      id: "srv-api-002",
      recipient_id: "rec-api-002",
      recipient_name: "Morgan Review",
      recipient_masked_phone: "+1******4402",
      recipient_delivery_area: "Oxford South",
      recipient_address: "8 Integration Street",
      care_summary: "alzheimer · moderate",
      care_notes: "Use one question at a time.",
      category: "medication",
      queue: "pharmacy_delivery",
      sla_hours: 2,
      priority: "urgent",
      status: "ready_to_print",
      items: ["Prescription pickup"],
      notes: "Caregiver confirmed medication is needed today.",
      human_review_reason: "",
      created_at: "2026-08-23 10:20:00",
      updated_at: "2026-08-23 11:05:00",
      update_count: 1,
      update_history: [{ event: "created", run_id: "run-test-002" }],
    },
    {
      id: "srv-api-003",
      recipient_id: "rec-api-003",
      recipient_name: "Sam Manual",
      recipient_masked_phone: "+1******4403",
      recipient_delivery_area: "Hackney East",
      recipient_address: "3 Manual Road",
      care_summary: "dementia · severe",
      care_notes: "Staff route.",
      category: "review",
      queue: "coordinator_review",
      sla_hours: 8,
      priority: "review",
      status: "review",
      items: [],
      notes: "Not printable yet.",
      human_review_reason: "Manual handling.",
      created_at: "2026-08-23 09:30:00",
      updated_at: "2026-08-23 09:30:00",
      update_count: 0,
      update_history: [],
    },
  ],
};

describe("PrintableOrderSheet", () => {
  it("renders Help delivered summary before printable handoff sheets", () => {
    render(<PrintableOrderSheet orders={printPayload} />);

    expect(screen.getByRole("heading", { name: "Help delivered - Orders" })).toBeTruthy();
    expect(screen.getByText("Ready orders")).toBeTruthy();
    expect(screen.getByText("Review queue")).toBeTruthy();
    expect(screen.getByText("Urgent orders")).toBeTruthy();
    expect(screen.getByText("Delivery areas")).toBeTruthy();
    expect(screen.getByText(/Only ready-to-print requests become field handoff sheets/)).toBeTruthy();
  });

  it("renders only backend ready-to-print service orders in the operations table", () => {
    render(<PrintableOrderSheet orders={printPayload} />);

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Client" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Order date" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Urgency" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Order number" })).toBeTruthy();
    expect(screen.getByText("srv-api-001")).toBeTruthy();
    expect(screen.getByText("srv-api-002")).toBeTruthy();
    expect(screen.getByText("+1******4401")).toBeTruthy();
    expect(screen.queryByText("Sam Manual")).toBeNull();
    expect(screen.getByText("Prescription pickup")).toBeTruthy();
    expect(screen.queryByText("+15550104401")).toBeNull();
  });

  it("shows created and updated timestamps from backend order history", () => {
    render(<PrintableOrderSheet orders={printPayload} />);

    expect(screen.getAllByText(/Aug 23/).length).toBeGreaterThan(0);
    expect(screen.getByText(/0 updates/)).toBeTruthy();
    expect(screen.getByText(/1 update/)).toBeTruthy();
  });

  it("invokes the browser print flow from the print button", () => {
    const printSpy = vi.fn();
    vi.stubGlobal("print", printSpy);

    render(<PrintableOrderSheet orders={printPayload} />);
    fireEvent.click(screen.getByRole("button", { name: "Print filtered orders" }));

    expect(printSpy).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("invokes scoped print from a single order row", () => {
    const printSpy = vi.fn();
    vi.stubGlobal("print", printSpy);

    render(<PrintableOrderSheet orders={printPayload} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Print order" })[0]);

    expect(printSpy).toHaveBeenCalledOnce();
    expect(screen.getByText("Preparing print view for srv-api-001.")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("renders print empty state when backend has no ready order DTOs", () => {
    render(<PrintableOrderSheet orders={{ service_requests: [] }} />);

    expect(screen.getByText("No recipients ready for this view")).toBeTruthy();
  });
});
