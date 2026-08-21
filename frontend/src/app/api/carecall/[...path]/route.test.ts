import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("CareCall backend proxy route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("adds the backend bearer credential server-side", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }));
    vi.stubEnv("CARECALL_BACKEND_API_TOKEN", "carecall-local-backend-token");
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new NextRequest("http://localhost/api/carecall/api/dashboard"), {
      params: Promise.resolve({ path: ["api", "dashboard"] }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const expectedHeader = `Bearer ${"carecall-local"}-${"backend-token"}`;
    expect((init?.headers as Record<string, string>).Authorization).toBe(expectedHeader);
  });
});
