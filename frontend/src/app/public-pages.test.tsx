import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrivacyPage from "./privacy/page";
import SupportPage from "./support/page";
import TermsPage from "./terms/page";

describe("public legal and support pages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders privacy and terms pages with top navigation back to the start page", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: "CareCall AI Privacy Policy" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to start" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();

    render(<TermsPage />);
    expect(screen.getByRole("heading", { name: "CareCall AI Terms and Conditions" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Back to start" })[1].getAttribute("href")).toBe("/");
  });

  it("validates support form input without exposing transport details", () => {
    render(<SupportPage />);

    expect(screen.getByRole("link", { name: "Back to start" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "Max Neous" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please help with demo access." } });
    fireEvent.click(screen.getByRole("button", { name: "Send support request" }));

    expect(screen.getByRole("status").textContent).toBe("Please enter a valid email address.");
  });

  it("submits a validated support request through the same-origin API", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
      status: 202,
    }));
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });
    render(<SupportPage />);

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "Max Neous" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "max@example.com" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please help with demo access." } });
    fireEvent.click(screen.getByRole("button", { name: "Send support request" }));

    expect(await screen.findByText("Support request sent. Thank you.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/support", {
      body: JSON.stringify({
        email: "max@example.com",
        message: "Please help with demo access.",
        name: "Max Neous",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  });
});
