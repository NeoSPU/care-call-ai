import { describe, expect, it, vi } from "vitest";

import { createSupportPostHandler } from "./route-handler";
import type { RateLimiter } from "../assistant/rate-limit";

const allowAllLimiter: RateLimiter = {
  consume: async () => ({ allowed: true, retryAfterSeconds: 0 }),
};

describe("createSupportPostHandler", () => {
  it("forwards validated support requests to the configured endpoint with a server-side token", async () => {
    const fetchUpstream = vi.fn(async () => Response.json({ ok: true }, { status: 200 }));
    const handler = createSupportPostHandler({
      config: {
        deliveryCredential: "support-token",
        endpoint: "https://support.example.test/messages",
        rateLimitKeySecret: "private-rate-key",
      },
      fetchUpstream,
      rateLimiter: allowAllLimiter,
    });

    const response = await handler(new Request("https://care.alexraixon.com/api/support", {
      body: JSON.stringify({
        email: "max@example.com",
        message: "Please help with demo access.",
        name: "Max Neous",
      }),
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      method: "POST",
    }));

    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledOnce();
    const [url, init] = fetchUpstream.mock.calls[0];
    expect(url).toBe("https://support.example.test/messages");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer support-token");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      email: "max@example.com",
      message: "Please help with demo access.",
      name: "Max Neous",
      project: "CareCall AI",
      source: "carecall-support-form",
    });
  });

  it("rejects unsafe text before contacting the endpoint", async () => {
    const fetchUpstream = vi.fn();
    const handler = createSupportPostHandler({
      config: {
        deliveryCredential: "support-token",
        endpoint: "https://support.example.test/messages",
        rateLimitKeySecret: "private-rate-key",
      },
      fetchUpstream,
      rateLimiter: allowAllLimiter,
    });

    const response = await handler(new Request("https://care.alexraixon.com/api/support", {
      body: JSON.stringify({
        email: "max@example.com",
        message: "<script>alert(1)</script>",
        name: "Max Neous",
      }),
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      method: "POST",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Please remove angle brackets from the form." });
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it("rate-limits repeated support requests without exposing transport details", async () => {
    const rateLimiter: RateLimiter = {
      consume: async () => ({ allowed: false, retryAfterSeconds: 60 }),
    };
    const handler = createSupportPostHandler({
      config: {
        deliveryCredential: "support-token",
        endpoint: "https://support.example.test/messages",
        rateLimitKeySecret: "private-rate-key",
      },
      rateLimiter,
    });

    const response = await handler(new Request("https://care.alexraixon.com/api/support", {
      body: JSON.stringify({ email: "max@example.com", message: "Help", name: "Max" }),
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      method: "POST",
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({
      error: "The support request could not be sent. Please try again later.",
    });
  });
});
