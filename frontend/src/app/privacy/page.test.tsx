import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("renders public privacy information", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { name: "Privacy policy" })).toBeTruthy();
    expect(screen.getByText(/This policy describes the Care Call AI hackathon demo/)).toBeTruthy();
    expect(screen.getByText(/not final production legal documentation/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Phone calls and CALL-E" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Care Call AI" }).getAttribute("href")).toBe("/");
  });
});
