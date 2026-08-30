import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { RecipientCallList } from "./RecipientCallList";
import type { RecipientCardDto } from "../lib/types";

const recipients: RecipientCardDto[] = [
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
    notes: "Fetched recipient card.",
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
    delivery_area: "Wallingford",
    address: "8 Integration Street",
    condition: "alzheimer",
    severity: "moderate",
    need_categories: ["care"],
    notes: "Moderate Alzheimer's profile.",
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
    delivery_area: "Oxford South",
    address: "3 Manual Road",
    condition: "dementia",
    severity: "severe",
    need_categories: ["transport"],
    notes: "Staff route.",
    special_handling_reviewed: false,
    automation_eligible: false,
    automation_status: "manual_only",
  },
  {
    id: "rec-api-004",
    display_name: "Taylor Blocked",
    masked_phone: "+1******4404",
    safety_category: "non_critical",
    blocked: true,
    blocked_reasons: ["Consent missing."],
    route: "blocked",
    delivery_area: "Hackney East",
    address: "2 Blocked Yard",
    condition: "mobility_impairment",
    severity: "mild",
    need_categories: ["documents"],
    notes: "Blocked by backend.",
    special_handling_reviewed: false,
    automation_eligible: false,
    automation_status: "blocked",
  },
];

describe("RecipientCallList", () => {
  it("shows backend categories, condition, district, phone, selectable state, and card action", () => {
    render(
      <RecipientCallList
        needCategoriesByRecipient={{ "rec-api-001": ["groceries"], "rec-api-003": ["transport"] }}
        recipients={recipients}
        selectedRecipientIds={["rec-api-001"]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Recipient call list" })).toBeTruthy();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.getByText("Special handling")).toBeTruthy();
    expect(screen.getAllByText("Non-critical").length).toBeGreaterThan(0);
    expect(screen.getByText("Special-handling recipient requires explicit card review and per-recipient approval.")).toBeTruthy();
    expect(screen.getByText("3 Manual Road")).toBeTruthy();
    expect(screen.getByText("+1******4401")).toBeTruthy();
    expect(screen.getByText("Alzheimer")).toBeTruthy();
    expect(screen.getByText("- Moderate")).toBeTruthy();
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Medicine")).toBeTruthy();
    expect(screen.getByText("Care")).toBeTruthy();
    expect(screen.getAllByText("Services").length).toBeGreaterThan(0);
    expect(screen.getByText("Auto-call")).toBeTruthy();
    expect(screen.getByText("Operator-only")).toBeTruthy();
    expect(screen.getByText("Manual only")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Open card" })[0].getAttribute("href")).toMatch(
      /^\/dashboard\/recipients\/rec-api-/,
    );
    expect(screen.queryByText("Eleanor Thompson")).toBeNull();
  });

  it("allows only backend-ready non-critical recipients to be selected", () => {
    function Harness() {
      const [selectedIds, setSelectedIds] = useState(["rec-api-001", "rec-api-002", "rec-api-003", "rec-api-004"]);
      return (
        <RecipientCallList
          onSelectedRecipientIdsChange={setSelectedIds}
          recipients={recipients}
          selectedRecipientIds={selectedIds}
        />
      );
    }

    render(<Harness />);

    const avery = screen.getByLabelText("Include Avery Backend in auto-call") as HTMLInputElement;
    const morgan = screen.getByLabelText("Include Morgan Review in auto-call") as HTMLInputElement;
    const sam = screen.getByLabelText("Include Sam Manual in auto-call") as HTMLInputElement;
    const taylor = screen.getByLabelText("Include Taylor Blocked in auto-call") as HTMLInputElement;

    expect(avery.checked).toBe(true);
    expect(avery.disabled).toBe(false);
    expect(morgan.checked).toBe(false);
    expect(morgan.disabled).toBe(true);
    expect(sam.checked).toBe(false);
    expect(sam.disabled).toBe(true);
    expect(taylor.checked).toBe(false);
    expect(taylor.disabled).toBe(true);

    fireEvent.click(avery);
    expect(avery.checked).toBe(false);
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("can group the call list by delivery area", () => {
    render(<RecipientCallList recipients={recipients} selectedRecipientIds={["rec-api-001"]} />);

    expect(screen.getByRole("heading", { name: "Wallingford 2" })).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Group by delivery area"));

    const wallingford = screen.getByRole("heading", { name: "All delivery areas 4" }).closest(".recipientGroup");
    expect(wallingford).toBeTruthy();
    expect(within(wallingford as HTMLElement).getByText("Avery Backend")).toBeTruthy();
    expect(within(wallingford as HTMLElement).getByText("Morgan Review")).toBeTruthy();
  });

  it("can switch between criticality sorting and name sorting", () => {
    render(<RecipientCallList recipients={recipients} selectedRecipientIds={["rec-api-001"]} />);

    const rowsBefore = screen.getAllByRole("row");
    expect(within(rowsBefore[1]).getByText("Sam Manual")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Sort beneficiary call list"), {
      target: { value: "name" },
    });

    const rowsAfter = screen.getAllByRole("row");
    expect(within(rowsAfter[1]).getByText("Avery Backend")).toBeTruthy();
  });

  it("filters recipients by visible safety chips", () => {
    render(<RecipientCallList recipients={recipients} selectedRecipientIds={["rec-api-001"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Special" }));

    expect(screen.getByText("Morgan Review")).toBeTruthy();
    expect(screen.queryByText("Avery Backend")).toBeNull();
    expect(screen.queryByText("Sam Manual")).toBeNull();
    expect(screen.getByRole("button", { name: "Special" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Non-critical" }));

    expect(screen.getByText("Avery Backend")).toBeTruthy();
    expect(screen.queryByText("Morgan Review")).toBeNull();
  });

  it("shows empty state copy for empty backend recipient results", () => {
    render(<RecipientCallList recipients={[]} selectedRecipientIds={[]} />);

    expect(screen.getByText("No recipients ready for this view")).toBeTruthy();
    expect(
      screen.getByText("Adjust filters, review excluded records, or try again when service data is available."),
    ).toBeTruthy();
  });
});
