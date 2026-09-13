import { describe, expect, it, vi } from "vitest";

import { createAssistantPostHandler } from "./route-handler";
import type { RateLimiter } from "../rate-limit";

const enabledConfig = {
  apiUrl: "https://assistant.care.alexraixon.com",
  isEnabled: true,
  rateLimitKeySecret: "private-rate-key",
  redisToken: null,
  redisUrl: null,
  requestTimeoutMs: 10_000,
  serviceToken: "service-token",
};

const allowAllLimiter: RateLimiter = {
  consume: async () => ({ allowed: true }),
};

describe("createAssistantPostHandler", () => {
  it("forwards a sanitized request to the assistant runtime with a server-side bearer token", async () => {
    const fetchUpstream = vi.fn(async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"CareCall"}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ));
    const handler = createAssistantPostHandler({
      config: enabledConfig,
      fetchUpstream,
      rateLimiter: allowAllLimiter,
    });

    const response = await handler(new Request("https://care.alexraixon.com/api/assistant/v1", {
      body: JSON.stringify({ locale: "en-GB", message: "What is CareCall AI?" }),
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    const [, init] = fetchUpstream.mock.calls[0];
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer service-token");
    expect(await response.text()).toContain("CareCall");
  });

  it("rejects cross-site browser requests before calling the assistant runtime", async () => {
    const fetchUpstream = vi.fn();
    const handler = createAssistantPostHandler({
      config: enabledConfig,
      fetchUpstream,
      rateLimiter: allowAllLimiter,
    });

    const response = await handler(new Request("https://care.alexraixon.com/api/assistant/v1", {
      body: JSON.stringify({ locale: "en-GB", message: "hello" }),
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      method: "POST",
    }));

    expect(response.status).toBe(400);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it("rejects non-json requests", async () => {
    const fetchUpstream = vi.fn();
    const handler = createAssistantPostHandler({
      config: enabledConfig,
      fetchUpstream,
      rateLimiter: allowAllLimiter,
    });

    const response = await handler(new Request("https://care.alexraixon.com/api/assistant/v1", {
      body: "hello",
      headers: { "content-type": "text/plain" },
      method: "POST",
    }));

    expect(response.status).toBe(400);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
});
