import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TermsPage from "./page";

describe("TermsPage", () => {
  it("renders public terms information", () => {
    render(<TermsPage />);

    expect(screen.getByRole("heading", { name: "Terms and conditions" })).toBeTruthy();
    expect(screen.getByText(/These terms describe the Care Call AI hackathon demo/)).toBeTruthy();
    expect(screen.getByText(/not final production terms/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Human oversight" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Care Call AI" }).getAttribute("href")).toBe("/");
  });
});
