import { afterEach, describe, expect, it, vi } from "vitest";

import { inferAssistantLocale } from "./client";

describe("inferAssistantLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses Russian for Cyrillic utterances", () => {
    expect(inferAssistantLocale("Привет, что умеет CareCall?")).toBe("ru-RU");
  });

  it("falls back to the browser locale for non-Cyrillic utterances", () => {
    vi.stubGlobal("navigator", { language: "en-US" });

    expect(inferAssistantLocale("What can you do?")).toBe("en-US");
  });
});
