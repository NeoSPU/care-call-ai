import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionToken } from "../../../lib/auth-session";
import { GET } from "./route";

describe("deployment diagnostics route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires an authenticated operator session", async () => {
    const response = await GET(new NextRequest("https://care.example/api/deployment-diagnostics"));

    expect(response.status).toBe(401);
  });

  it("returns sanitized runtime backend configuration and health", async () => {
    vi.stubEnv("CARECALL_API_BASE_URL", "https://api-origin.care.alexraixon.com");
    vi.stubEnv("CARECALL_BACKEND_API_TOKEN", "secret-token-value");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const token = await createSessionToken("carecall-coordinator");
    const request = new NextRequest("https://care.example/api/deployment-diagnostics", {
      headers: { Cookie: `carecall_session=${token}` },
    });

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.api_base).toEqual({ present: true, value: "https://api-origin.care.alexraixon.com" });
    expect(payload.backend_token).toEqual({ present: true, length: "secret-token-value".length });
    expect(payload.backend_health).toEqual({ ok: true, status: 200 });
  });
});
