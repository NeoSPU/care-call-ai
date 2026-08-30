import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createSessionToken } from "../lib/auth-session";
import Home from "./page";

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => (cookieState.value ? { value: cookieState.value } : undefined),
  })),
}));

describe("Home", () => {
  it("renders the public start page for signed-out visitors", async () => {
    cookieState.value = undefined;

    render(await Home());

    expect(screen.getByRole("heading", { name: "Care Call AI" })).toBeTruthy();
    expect(screen.getByText("Care seen. Needs heard. Help delivered.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Login" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Terms and conditions" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Support" }).getAttribute("href")).toBe("/support");
  });

  it("changes the primary action to dashboard for signed-in operators", async () => {
    cookieState.value = await createSessionToken("carecall-coordinator");

    render(await Home());

    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByRole("link", { name: "Login" })).toBeNull();
  });
});
