import { describe, expect, it, vi } from "vitest";

import {
  createCallbackRequestPostHandler,
  parseCallbackTokens,
} from "./route-handler";
import type { RateLimiter } from "../assistant/rate-limit";

const allowAllLimiter: RateLimiter = {
  consume: async () => ({ allowed: true, retryAfterSeconds: 0 }),
};

const config = {
  backendBaseUrl: "https://api-origin.care.example.test",
  backendCredential: "backend-token",
  callbackTokens: { "rec-001": "siri-token-001" },
};

function request(token: string, body: Record<string, unknown>) {
  return new Request("https://care.example.test/api/callback-requests", {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("createCallbackRequestPostHandler", () => {
  it("accepts a Siri Shortcut callback request and forwards it through the server-side backend token", async () => {
    const fetchUpstream = vi.fn(async () => Response.json({
      auto_callback: {
        real_calls_placed: 1,
        status: "auto_callback_started",
        message: "Care Call has started your callback.",
      },
    }, { status: 201 }));
    const handler = createCallbackRequestPostHandler({
      config,
      fetchUpstream,
      rateLimiter: allowAllLimiter,
    });

    const response = await handler(request("siri-token-001", {
      device_label: "Max iPhone",
      locale: "en-GB",
      recipient_id: "rec-001",
      request_text: "Please call me back about groceries.",
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      auto_callback: {
        real_calls_placed: 1,
        status: "auto_callback_started",
      },
      message: "Care Call has started your callback.",
      status: "auto_callback_started",
    });
    expect(fetchUpstream).toHaveBeenCalledOnce();
    const [url, init] = fetchUpstream.mock.calls[0];
    expect(String(url)).toBe("https://api-origin.care.example.test/api/callback-requests");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer backend-token");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      priority: "urgent",
      recipient_id: "rec-001",
      request_text: "Please call me back about groceries.",
      source: "siri_shortcut",
    });
  });

  it("rejects unknown callback tokens before calling the backend", async () => {
    const fetchUpstream = vi.fn();
    const handler = createCallbackRequestPostHandler({
      config,
      fetchUpstream,
      rateLimiter: allowAllLimiter,
    });

    const response = await handler(request("wrong-token", { request_text: "Please call me back." }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it("rejects recipient id substitution from the Shortcut payload", async () => {
    const fetchUpstream = vi.fn();
    const handler = createCallbackRequestPostHandler({
      config,
      fetchUpstream,
      rateLimiter: allowAllLimiter,
    });

    const response = await handler(request("siri-token-001", {
      recipient_id: "rec-999",
      request_text: "Please call me back.",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "This callback token does not match the recipient." });
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it("rate-limits callback tokens without exposing backend details", async () => {
    const rateLimiter: RateLimiter = {
      consume: async () => ({ allowed: false, retryAfterSeconds: 120 }),
    };
    const handler = createCallbackRequestPostHandler({
      config,
      rateLimiter,
    });

    const response = await handler(request("siri-token-001", { request_text: "Please call me back." }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(await response.json()).toEqual({
      error: "The callback request could not be accepted. Please contact support if the problem continues.",
    });
  });
});

describe("parseCallbackTokens", () => {
  it("parses newline or comma separated recipient-token pairs", () => {
    expect(parseCallbackTokens("rec-001=token-one\nrec-002=token-two, rec-003=token-three")).toEqual({
      "rec-001": "token-one",
      "rec-002": "token-two",
      "rec-003": "token-three",
    });
  });

  it("preserves base64 token padding when parsing recipient-token pairs", () => {
    expect(parseCallbackTokens("rec-001=ALQrag/example+token==")).toEqual({
      "rec-001": "ALQrag/example+token==",
    });
  });

  it("parses JSON recipient-token maps", () => {
    expect(parseCallbackTokens('{"rec-001":"token-one","rec-002":"token-two"}')).toEqual({
      "rec-001": "token-one",
      "rec-002": "token-two",
    });
  });

  it("fails closed for malformed JSON token maps", () => {
    expect(parseCallbackTokens('{"rec-001":')).toEqual({});
  });
});
