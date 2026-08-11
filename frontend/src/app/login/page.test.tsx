import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LoginPage from "./page";

describe("LoginPage", () => {
  it("renders the operator sign-in form", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Operator sign in" })).toBeTruthy();
    expect(screen.getByLabelText("Operator ID")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("shows a user-safe error when credentials fail", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "invalid" }) }));

    expect(screen.getByRole("alert").textContent).toBe("The sign-in details were not accepted.");
  });
});
