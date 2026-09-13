import { createHash, timingSafeEqual } from "node:crypto";

import { createMemoryRateLimiter, type RateLimiter } from "../assistant/rate-limit";

const CALLBACK_ERROR = "The callback request could not be accepted. Please contact support if the problem continues.";
const MAX_REQUEST_TEXT_LENGTH = 280;
const MAX_DEVICE_LABEL_LENGTH = 120;

export type CallbackRequestConfig = {
  backendBaseUrl: string;
  backendCredential: string;
  callbackTokens: Record<string, string>;
};

export type CallbackRequestHandlerOptions = {
  config: CallbackRequestConfig;
  fetchUpstream?: typeof fetch;
  rateLimiter?: RateLimiter;
};

type CallbackPayload = {
  device_label: string;
  locale: string;
  recipient_id: string;
  request_text: string;
};

export function loadCallbackRequestConfig(env: NodeJS.ProcessEnv = process.env): CallbackRequestConfig {
  return {
    backendBaseUrl: env.CARECALL_API_BASE_URL?.trim() || "http://127.0.0.1:8001",
    backendCredential: env.CARECALL_BACKEND_API_TOKEN?.trim()
      || (env.NODE_ENV === "production" ? "" : "carecall-local-backend-token"),
    callbackTokens: parseCallbackTokens(env.CARECALL_SIRI_CALLBACK_TOKENS ?? ""),
  };
}

export function createCallbackRequestPostHandler(options: CallbackRequestHandlerOptions) {
  const fetchUpstream = options.fetchUpstream ?? fetch;
  const rateLimiter = options.rateLimiter ?? createMemoryRateLimiter({ limit: 3, windowMs: 30 * 60 * 1_000 });

  return async function POST(request: Request): Promise<Response> {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return json({ error: "invalid_request" }, 400);
    }

    const token = bearerToken(request);
    const recipientId = token ? recipientForToken(token, options.config.callbackTokens) : "";
    if (!recipientId) {
      return json({ error: "unauthorized" }, 401);
    }

    const rate = await rateLimiter.consume(`siri-callback:${hashToken(token)}`);
    if (!rate.allowed) {
      return json({ error: CALLBACK_ERROR }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    const validation = validateCallbackPayload(payload, recipientId);
    if (!validation.ok) {
      return json({ error: validation.error }, 400);
    }
    if (!options.config.backendCredential) {
      return json({ error: CALLBACK_ERROR }, 503);
    }

    try {
      const response = await fetchUpstream(new URL("/api/callback-requests", options.config.backendBaseUrl), {
        body: JSON.stringify({
          operator: "",
          priority: "urgent",
          recipient_id: validation.payload.recipient_id,
          request_text: validation.payload.request_text,
          source: "siri_shortcut",
        }),
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${options.config.backendCredential}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        console.error("carecall_siri_callback_backend_failed", { status: response.status });
        return json({ error: CALLBACK_ERROR }, 502);
      }

      const upstreamPayload = await response.json().catch(() => ({})) as {
        auto_callback?: { status?: string; message?: string; real_calls_placed?: number };
      };
      const autoCallback = upstreamPayload.auto_callback ?? {};
      const message = autoCallback.message || "Care Call has received your request and started callback handling.";
      return json({
        auto_callback: {
          real_calls_placed: autoCallback.real_calls_placed ?? 0,
          status: autoCallback.status || "accepted",
        },
        message,
        status: autoCallback.status || "accepted",
      }, 202);
    } catch (error) {
      console.error("carecall_siri_callback_backend_error", error instanceof Error ? error.name : "unknown");
      return json({ error: CALLBACK_ERROR }, 502);
    }
  };
}

export function parseCallbackTokens(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          .map(([recipientId, token]) => [recipientId.trim(), token.trim()])
          .filter(([recipientId, token]) => recipientId && token),
      );
    } catch {
      return {};
    }
  }
  return Object.fromEntries(
    trimmed
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf("=");
        return separatorIndex === -1
          ? ["", ""]
          : [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)];
      })
      .map(([recipientId, token]) => [recipientId.trim(), token.trim()])
      .filter(([recipientId, token]) => recipientId && token),
  );
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : "";
}

function recipientForToken(token: string, tokens: Record<string, string>) {
  for (const [recipientId, expectedToken] of Object.entries(tokens)) {
    if (safeEqual(token, expectedToken)) {
      return recipientId;
    }
  }
  return "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validateCallbackPayload(
  payload: unknown,
  tokenRecipientId: string,
): { ok: true; payload: CallbackPayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Please use a valid callback request." };
  }
  const record = payload as Record<string, unknown>;
  const explicitRecipientId = cleanField(record.recipient_id, 80);
  if (explicitRecipientId && explicitRecipientId !== tokenRecipientId) {
    return { ok: false, error: "This callback token does not match the recipient." };
  }
  const requestText = cleanField(record.request_text, MAX_REQUEST_TEXT_LENGTH) || "Please call me back.";
  const locale = cleanField(record.locale, 20);
  const deviceLabel = cleanField(record.device_label, MAX_DEVICE_LABEL_LENGTH);
  if ([requestText, locale, deviceLabel].some((value) => /[<>]/.test(value))) {
    return { ok: false, error: "Please remove unsafe characters from the request." };
  }
  return {
    ok: true,
    payload: {
      device_label: deviceLabel,
      locale,
      recipient_id: tokenRecipientId,
      request_text: requestText,
    },
  };
}

function cleanField(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function json(payload: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return Response.json(payload, { headers, status });
}
