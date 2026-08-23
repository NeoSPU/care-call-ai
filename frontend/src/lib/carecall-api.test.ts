import { afterEach, describe, expect, it, vi } from "vitest";

import { carecallApiBaseUrl, getDashboardData } from "./carecall-api";

describe("carecallApiBaseUrl", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  });

  it("uses the frontend proxy for browser requests", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
      writable: true,
    });

    expect(carecallApiBaseUrl()).toBe("/api/carecall");
  });

  it("uses the private backend URL for server requests", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    vi.stubEnv("CARECALL_API_BASE_URL", "https://backend.example");

    expect(carecallApiBaseUrl()).toBe("https://backend.example");
  });

  it("adds the backend bearer credential for server requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ service: "carecall-backend" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }));
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await getDashboardData();

    const [, init] = fetchMock.mock.calls[0];
    const expectedHeader = `Bearer ${"carecall-local"}-${"backend-token"}`;
    expect((init?.headers as Record<string, string>).Authorization).toBe(expectedHeader);
  });
});
