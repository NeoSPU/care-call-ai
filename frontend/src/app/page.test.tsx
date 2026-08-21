import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders the branded public entry gateway", () => {
    render(<Home />);

    expect(screen.getByRole("img", { name: "Care Call AI logo" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Care seen. Needs heard. Help delivered." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Login" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: "Support" }).getAttribute("href")).toBe("/support");
    expect(screen.getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Terms and conditions" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByText("© 2026 Alex Raixon. All rights reserved.")).toBeTruthy();
  });
});
