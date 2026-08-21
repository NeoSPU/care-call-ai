import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function request(payload: Record<string, unknown>, ip = "203.0.113.10") {
  return new NextRequest("http://localhost/api/support", {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    method: "POST",
  });
}

describe("support API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("accepts a valid support message without exposing mail credentials", async () => {
    const response = await POST(request({
      name: "Max Neous",
      email: "max@example.com",
      message: "Please help me access the demo.",
      company: "",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects invalid email and suspicious content", async () => {
    const invalidEmail = await POST(request({ name: "Max", email: "nope", message: "Hello support team" }, "203.0.113.11"));
    expect(invalidEmail.status).toBe(400);

    const suspicious = await POST(request({
      name: "Max",
      email: "max@example.com",
      message: "<script>alert(1)</script>",
    }, "203.0.113.12"));
    expect(suspicious.status).toBe(400);
  });

  it("uses a honeypot and rate limits repeated requests", async () => {
    const bot = await POST(request({
      name: "Bot",
      email: "bot@example.com",
      message: "This should be silently accepted.",
      company: "Filled by bot",
    }, "203.0.113.13"));
    expect(bot.status).toBe(200);

    for (let index = 0; index < 5; index += 1) {
      const response = await POST(request({
        name: "Max",
        email: "max@example.com",
        message: `Support message number ${index}`,
      }, "203.0.113.14"));
      expect(response.status).toBe(200);
    }

    const limited = await POST(request({
      name: "Max",
      email: "max@example.com",
      message: "Support message over limit",
    }, "203.0.113.14"));
    expect(limited.status).toBe(429);
  });

  it("dispatches server-side to the configured support endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CARECALL_SUPPORT_EMAIL_ENDPOINT", "https://mail.example/support");
    vi.stubEnv("CARECALL_SUPPORT_EMAIL_TOKEN", "support-test-token");

    const response = await POST(request({
      name: "Max Neous",
      email: "max@example.com",
      message: "Please help me access the demo.",
    }, "203.0.113.15"));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://mail.example/support", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer support-test-token" }),
      method: "POST",
    }));
  });
});
