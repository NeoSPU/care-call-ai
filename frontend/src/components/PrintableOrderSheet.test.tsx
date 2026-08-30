import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrintableOrderSheet } from "./PrintableOrderSheet";
import { removeServiceRequest, updateServiceRequest } from "../lib/carecall-api";
import type { PrintOrdersPayload } from "../lib/types";

vi.mock("../lib/carecall-api", () => ({
  removeServiceRequest: vi.fn(),
  updateServiceRequest: vi.fn(),
}));

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
      update_history: [
        { event: "created", run_id: "run-test-002" },
        { event: "updated", run_id: "run-test-004", added_items: ["Prescription pickup"] },
      ],
    },
    {
      id: "srv-api-004",
      recipient_id: "rec-api-001",
      recipient_name: "Avery Backend",
      recipient_masked_phone: "+1******4401",
      recipient_delivery_area: "Wallingford",
      recipient_address: "14 Backend Close",
      care_summary: "general · mild",
      care_notes: "Mobility support.",
      category: "cleaning",
      queue: "service_partners",
      sla_hours: 24,
      priority: "normal",
      status: "ready_to_print",
      items: ["Kitchen cleaning"],
      notes: "Requested for tomorrow morning.",
      human_review_reason: "",
      created_at: "2026-08-24 08:00:00",
      updated_at: "2026-08-24 08:00:00",
      update_count: 0,
      update_history: [{ event: "created", run_id: "run-test-005" }],
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
    {
      id: "srv-api-005",
      recipient_id: "rec-api-004",
      recipient_name: "Taylor Review",
      recipient_masked_phone: "+1******4404",
      recipient_delivery_area: "Oxford North",
      recipient_address: "21 Review Lane",
      care_summary: "general · mild",
      care_notes: "Restricted request review.",
      category: "other",
      queue: "coordinator_review",
      sla_hours: 8,
      priority: "review",
      status: "review",
      items: [],
      notes: "The caller requested an age-restricted product.",
      human_review_reason:
        "The caller requested goods or services that require coordinator review under the prohibited or region-restricted request policy.",
      created_at: "2026-08-24 09:15:00",
      updated_at: "2026-08-24 09:15:00",
      update_count: 0,
      update_history: [{ event: "call_outcome", run_id: "run-test-006" }],
    },
  ],
};

describe("PrintableOrderSheet", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders Help delivered summary before printable handoff sheets", () => {
    render(<PrintableOrderSheet orders={printPayload} />);

    expect(screen.getByRole("heading", { name: "Help delivered - Orders" })).toBeTruthy();
    expect(screen.getByText("Ready orders")).toBeTruthy();
    expect(screen.getByText("Other results")).toBeTruthy();
    expect(screen.getByText("Urgent orders")).toBeTruthy();
    expect(screen.getByText("Delivery areas")).toBeTruthy();
    expect(screen.getByText(/Every processed call remains visible in the table/)).toBeTruthy();
    expect(screen.getByText("Manual handling.")).toBeTruthy();
  });

  it("renders backend call results and ready-to-print service orders in one operations table", () => {
    render(<PrintableOrderSheet orders={printPayload} />);

    const printableTable = screen.getByRole("table");
    expect(printableTable).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Client" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Order date" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Urgency" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Order number" })).toBeTruthy();
    expect(within(printableTable).getByText("srv-api-001")).toBeTruthy();
    expect(within(printableTable).getByText("srv-api-002")).toBeTruthy();
    expect(within(printableTable).getByText("srv-api-004")).toBeTruthy();
    expect(screen.getAllByText("+1******4401").length).toBeGreaterThan(0);
    expect(within(printableTable).getByText("Sam Manual")).toBeTruthy();
    expect(within(printableTable).getAllByText("Held for coordinator review").length).toBeGreaterThan(0);
    expect(within(printableTable).getAllByText("Mark print-ready").length).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "Coordinator review queue" })).toBeNull();
    expect(within(printableTable).getByText("Prescription pickup")).toBeTruthy();
    expect(screen.queryByText("+15550104401")).toBeNull();
  });

  it("renders clean printable handoff sheets with logo metadata and fulfilment checkboxes", () => {
    render(<PrintableOrderSheet orders={printPayload} />);

    const printSheets = screen.getByLabelText("Printable fulfilment handoff sheets");
    expect(within(printSheets).getAllByRole("heading", { name: "Fulfilment Order" }).length).toBeGreaterThan(0);
    expect(within(printSheets).getAllByAltText("Care Call AI").length).toBeGreaterThan(0);
    expect(within(printSheets).getByText("srv-api-001")).toBeTruthy();
    expect(within(printSheets).getAllByText("Avery Backend").length).toBeGreaterThan(0);
    expect(within(printSheets).getByText("Food / products")).toBeTruthy();
    expect(within(printSheets).getByText("Tinned soup")).toBeTruthy();
    expect(printSheets.querySelectorAll(".printCheckbox").length).toBeGreaterThan(0);
    expect(within(printSheets).getAllByText("Printed").length).toBeGreaterThan(0);
  });

  it("shows created and updated timestamps from backend order history", () => {
    render(<PrintableOrderSheet orders={printPayload} />);

    expect(screen.getAllByText(/Aug 23/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0 updates/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 update/)).toBeTruthy();
    expect(screen.getByText(/History: created, updated: Prescription pickup/)).toBeTruthy();
  });

  it("filters printable orders by order date", () => {
    render(<PrintableOrderSheet orders={printPayload} />);

    fireEvent.change(screen.getByLabelText("Order date"), { target: { value: "2026-08-24" } });

    const filteredTable = screen.getByRole("table");
    expect(within(filteredTable).queryByText("srv-api-001")).toBeNull();
    expect(within(filteredTable).queryByText("srv-api-002")).toBeNull();
    expect(within(filteredTable).getByText("srv-api-004")).toBeTruthy();
    expect(within(filteredTable).getByText("Kitchen cleaning")).toBeTruthy();
  });

  it("invokes the browser print flow from the print button after yielding UI updates", async () => {
    const printSpy = vi.fn();
    vi.spyOn(window, "print").mockImplementation(printSpy);

    render(<PrintableOrderSheet orders={printPayload} />);
    fireEvent.click(screen.getByRole("button", { name: "Print filtered orders" }));

    await waitFor(() => expect(printSpy).toHaveBeenCalledOnce());
    vi.restoreAllMocks();
  });

  it("invokes scoped print from a single order row after yielding UI updates", async () => {
    const printSpy = vi.fn();
    vi.spyOn(window, "print").mockImplementation(printSpy);

    render(<PrintableOrderSheet orders={printPayload} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Print order" })[0]);

    expect(screen.getByText("Preparing print view for srv-api-001.")).toBeTruthy();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].className).toContain("printIncluded");
    expect(rows[1].className).toContain("printExcluded");
    expect(rows[2].className).toContain("printExcluded");
    await waitFor(() => expect(printSpy).toHaveBeenCalledOnce());
    vi.restoreAllMocks();
  });

  it("restores filtered print scope after a single-order print", async () => {
    const printSpy = vi.fn();
    vi.spyOn(window, "print").mockImplementation(printSpy);

    render(<PrintableOrderSheet orders={printPayload} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Print order" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Print filtered orders" }));

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.slice(0, 3).every((row) => row.className.includes("printIncluded"))).toBe(true);
    expect(rows[3].className).toContain("printExcluded");
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(2));
    vi.restoreAllMocks();
  });

  it("shows imported review-only call results directly in the orders table", () => {
    render(<PrintableOrderSheet orders={{ service_requests: [printPayload.service_requests[3]] }} />);

    const table = screen.getByRole("table");
    expect(table).toBeTruthy();
    expect(within(table).getByText("Sam Manual")).toBeTruthy();
    expect(screen.getByText("Held for coordinator review")).toBeTruthy();
    expect(screen.getByText("Review needed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark print-ready" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Print filtered orders" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets an operator correct a held review result into a printable grocery order", async () => {
    vi.mocked(updateServiceRequest).mockResolvedValueOnce({
      service_requests: [
        {
          ...printPayload.service_requests[3],
          category: "groceries",
          human_review_reason: "",
          items: ["1 package of bread"],
          notes: "Corrected from callback transcript.",
          priority: "urgent",
          status: "ready_to_print",
          update_count: 1,
        },
      ],
    });

    render(<PrintableOrderSheet orders={{ service_requests: [printPayload.service_requests[3]] }} operatorName="Max Neous" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(`Items for ${printPayload.service_requests[3].id}`), {
      target: { value: "1 package of bread" },
    });
    fireEvent.change(screen.getByLabelText(`Notes for ${printPayload.service_requests[3].id}`), {
      target: { value: "Corrected from callback transcript." },
    });
    fireEvent.change(screen.getByLabelText(`Reason for ${printPayload.service_requests[3].id}`), {
      target: { value: "Callback result corrected." },
    });
    fireEvent.change(screen.getByDisplayValue("Keep for review"), { target: { value: "ready_to_print" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("1 package of bread")).toBeTruthy());
    expect(screen.getByText("Ready order")).toBeTruthy();
    expect(updateServiceRequest).toHaveBeenCalledWith(
      "srv-api-003",
      expect.objectContaining({
        items: ["1 package of bread"],
        operator: "Max Neous",
        status: "ready_to_print",
      }),
    );
  });

  it("releases a held result when a safe requested item is recognized in the call notes", async () => {
    const heldCallback = {
      ...printPayload.service_requests[3],
      notes: "The recipient confirmed an added practical support request: 1 package of broth needed for tomorrow.",
      suggested_category: "groceries",
      suggested_items: ["1 package of broth"],
    };
    vi.mocked(updateServiceRequest).mockResolvedValueOnce({
      service_requests: [
        {
          ...heldCallback,
          category: "groceries",
          human_review_reason: "",
          items: ["1 package of broth"],
          notes: "",
          priority: "review",
          status: "ready_to_print",
          update_count: 1,
        },
      ],
    });

    render(<PrintableOrderSheet orders={{ service_requests: [heldCallback] }} operatorName="Max Neous" />);
    fireEvent.click(screen.getByRole("button", { name: "Mark print-ready" }));

    await waitFor(() => expect(screen.getAllByText("1 package of broth").length).toBeGreaterThan(0));
    expect(updateServiceRequest).toHaveBeenCalledWith(
      "srv-api-003",
      expect.objectContaining({
        category: "groceries",
        items: ["1 package of broth"],
        notes: "",
        operator: "Max Neous",
        status: "ready_to_print",
      }),
    );
  });

  it("opens correction editing when marking a held result print-ready without recognized items", () => {
    const heldCallback = {
      ...printPayload.service_requests[3],
      notes: "The recipient discussed practical support but no concrete item was recognized.",
    };

    render(<PrintableOrderSheet orders={{ service_requests: [heldCallback] }} operatorName="Max Neous" />);
    fireEvent.click(screen.getByRole("button", { name: "Mark print-ready" }));

    expect(updateServiceRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Add or confirm at least one requested item");
    expect(screen.getByDisplayValue("Ready to print")).toBeTruthy();
  });

  it("lets an operator remove a held result from the fulfilment table", async () => {
    vi.mocked(removeServiceRequest).mockResolvedValueOnce({
      service_requests: [{ ...printPayload.service_requests[3], status: "void" }],
    });

    render(<PrintableOrderSheet orders={{ service_requests: [printPayload.service_requests[3]] }} operatorName="Max Neous" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.getByText(/Removed Sam Manual/)).toBeTruthy());
    expect(screen.queryByText("srv-api-003")).toBeNull();
    expect(removeServiceRequest).toHaveBeenCalledWith(
      "srv-api-003",
      expect.objectContaining({ operator: "Max Neous" }),
    );
  });

  it("distinguishes no-order outcomes from restricted review outcomes", () => {
    const noOrder = {
      ...printPayload.service_requests[3],
      id: "srv-api-no-order",
      items: [],
      human_review_reason: "No practical support items were requested during the call.",
    };
    const restricted = printPayload.service_requests[4];

    render(<PrintableOrderSheet orders={{ service_requests: [noOrder, restricted] }} />);

    expect(screen.getByText("No order")).toBeTruthy();
    expect(screen.getByText("No requested items")).toBeTruthy();
    expect(screen.getByText("Review needed")).toBeTruthy();
    expect(screen.getByText("Held for coordinator review")).toBeTruthy();
  });

  it("renders print empty state when backend has no service request DTOs", () => {
    render(<PrintableOrderSheet orders={{ service_requests: [] }} />);

    expect(screen.getByText("No call results yet")).toBeTruthy();
    expect(screen.getByText(/Adjust filters, review excluded records/)).toBeTruthy();
  });
});
