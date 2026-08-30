import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  it("defaults to the light theme before the operator explicitly changes it", () => {
    render(<ThemeToggle />);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();
  });

  it("persists and applies the selected dark theme", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(window.localStorage.getItem("carecall:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeTruthy();
  });

  it("restores a saved dark theme on mount", () => {
    window.localStorage.setItem("carecall:theme", "dark");

    render(<ThemeToggle compact />);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByText("Dark")).toBeTruthy();
  });
});
