import { createMemoryRateLimiter, createPrivateClientKey, type RateLimiter } from "../assistant/rate-limit";

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 1200;
const SUPPORT_ERROR = "The support request could not be sent. Please try again later.";

export type SupportConfig = {
  deliveryCredential: string | null;
  endpoint: string | null;
  rateLimitKeySecret: string;
};

export type SupportHandlerOptions = {
  config: SupportConfig;
  fetchUpstream?: typeof fetch;
  rateLimiter?: RateLimiter;
};

type SupportPayload = {
  name: string;
  email: string;
  message: string;
};

export function loadSupportConfig(env: NodeJS.ProcessEnv = process.env): SupportConfig {
  return {
    deliveryCredential: env.CARECALL_SUPPORT_EMAIL_TOKEN?.trim() || null,
    endpoint: env.CARECALL_SUPPORT_EMAIL_ENDPOINT?.trim() || null,
    rateLimitKeySecret: env.CARECALL_SUPPORT_RATE_LIMIT_KEY_SECRET?.trim()
      || env.CARECALL_AUTH_SECRET?.trim()
      || "carecall-local-support-rate-limit",
  };
}

export function createSupportPostHandler(options: SupportHandlerOptions) {
  const fetchUpstream = options.fetchUpstream ?? fetch;
  const rateLimiter = options.rateLimiter ?? createMemoryRateLimiter({ limit: 5, windowMs: 10 * 60 * 1_000 });

  return async function POST(request: Request): Promise<Response> {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      return json({ error: "invalid_request" }, 400);
    }
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return json({ error: "invalid_request" }, 400);
    }

    const rate = await rateLimiter.consume(createPrivateClientKey(request, options.config.rateLimitKeySecret));
    if (!rate.allowed) {
      return json({ error: SUPPORT_ERROR }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    const validation = validateSupportPayload(payload);
    if (!validation.ok) {
      return json({ error: validation.error }, 400);
    }
    if (!options.config.endpoint) {
      return json({ error: SUPPORT_ERROR }, 503);
    }

    try {
      const response = await fetchUpstream(options.config.endpoint, {
        body: JSON.stringify({
          email: validation.payload.email,
          message: validation.payload.message,
          name: validation.payload.name,
          project: "CareCall AI",
          source: "carecall-support-form",
          submitted_at: new Date().toISOString(),
        }),
        cache: "no-store",
        headers: {
          ...(options.config.deliveryCredential ? { Authorization: `Bearer ${options.config.deliveryCredential}` } : {}),
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      if (!response.ok) {
        console.error("carecall_support_delivery_failed", { status: response.status });
        return json({ error: SUPPORT_ERROR }, 502);
      }
      return json({ ok: true }, 202);
    } catch (error) {
      console.error("carecall_support_delivery_error", error instanceof Error ? error.name : "unknown");
      return json({ error: SUPPORT_ERROR }, 502);
    }
  };
}

function validateSupportPayload(payload: unknown): { ok: true; payload: SupportPayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Please complete all fields." };
  }
  const record = payload as Record<string, unknown>;
  const name = cleanField(record.name, MAX_NAME_LENGTH);
  const email = cleanField(record.email, MAX_EMAIL_LENGTH);
  const message = cleanField(record.message, MAX_MESSAGE_LENGTH);
  if (!name || !email || !message) {
    return { ok: false, error: "Please complete all fields." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (String(record.message ?? "").length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "Please shorten the message before sending." };
  }
  if ([name, email, message].some((value) => /[<>]/.test(value))) {
    return { ok: false, error: "Please remove angle brackets from the form." };
  }
  return { ok: true, payload: { name, email, message } };
}

function cleanField(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function json(payload: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return Response.json(payload, { headers, status });
}
