import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ServiceRequestBoard } from "./ServiceRequestBoard";
import type { ServiceRequestDto } from "../lib/types";

const serviceRequests: ServiceRequestDto[] = [
  {
    id: "srv-api-001",
    recipient_id: "rec-api-001",
    recipient_name: "Avery Backend",
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
    recipient_name: "Morgan Review",
    category: "review",
    queue: "coordinator_review",
    sla_hours: 8,
    priority: "review",
    status: "review",
    items: [],
    notes: "Review before automation.",
    human_review_reason: "Special-handling recipient requires review.",
  },
];

describe("ServiceRequestBoard", () => {
  it("groups call-derived service requests by coordinator lane", () => {
    render(<ServiceRequestBoard serviceRequests={serviceRequests} />);

    expect(screen.getByRole("heading", { name: "Human Review" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pending Dispatch" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ready To Print" })).toBeTruthy();

    const reviewLane = screen
      .getByRole("heading", { name: "Human Review" })
      .closest(".lane");
    expect(reviewLane).toBeTruthy();
    expect(within(reviewLane as HTMLElement).getByText("Morgan Review")).toBeTruthy();
    expect(
      within(reviewLane as HTMLElement).getByText(
        "Review before automation.",
      ),
    ).toBeTruthy();
    expect(within(reviewLane as HTMLElement).getByText("Special-handling recipient requires review.")).toBeTruthy();
  });

  it("surfaces urgent printable medication work and the print action", () => {
    render(<ServiceRequestBoard serviceRequests={serviceRequests} />);

    expect(screen.getByRole("link", { name: "Print Orders" }).getAttribute("href")).toBe(
      "/dashboard/orders/print",
    );
    expect(screen.getByText("Avery Backend")).toBeTruthy();
    expect(screen.getByText("Tinned soup")).toBeTruthy();
    expect(screen.getByText("groceries · delivery_volunteers · SLA 4h")).toBeTruthy();
    expect(screen.queryByText("Robert Chen")).toBeNull();
  });

  it("renders one empty lane and all-empty board states from backend DTOs", () => {
    render(<ServiceRequestBoard serviceRequests={serviceRequests.slice(0, 1)} />);
    const pendingLane = screen
      .getByRole("heading", { name: "Pending Dispatch" })
      .closest(".lane");
    expect(within(pendingLane as HTMLElement).getByText("No service requests in this lane")).toBeTruthy();

    render(<ServiceRequestBoard serviceRequests={[]} />);
    expect(screen.getByText("No recipients ready for this view")).toBeTruthy();
  });
});
