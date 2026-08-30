export const MAX_ASSISTANT_MESSAGE_LENGTH = 4_000;
export const MAX_ASSISTANT_REQUEST_BYTES = 16_384;

const localePattern = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const requestKeys = new Set(["message", "locale", "conversationId"]);

export type AssistantRequest = {
  message: string;
  locale: string;
  conversationId?: string;
};

export type AssistantErrorCode =
  | "assistant_disabled"
  | "invalid_request"
  | "rate_limited"
  | "request_timeout"
  | "upstream_unavailable";

export type AssistantCitation = {
  id: string;
  title: string;
  url: string;
  sourceRevision?: string;
};

export type AssistantUsage = {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

export type AssistantStreamEvent =
  | { type: "meta"; conversationId: string; correlationId: string; route?: string }
  | { type: "delta"; text: string }
  | { type: "citation"; citation: AssistantCitation }
  | { type: "usage"; usage: AssistantUsage }
  | { type: "done"; abstained: boolean }
  | { type: "error"; code: string; message: string };

type ParseResult =
  | { ok: true; value: AssistantRequest }
  | { ok: false; code: "invalid_request" };

export function parseAssistantRequest(input: unknown): ParseResult {
  if (!isRecord(input)) {
    return invalidRequest();
  }
  if (Object.keys(input).some((key) => !requestKeys.has(key))) {
    return invalidRequest();
  }
  if (typeof input.message !== "string" || typeof input.locale !== "string") {
    return invalidRequest();
  }

  const message = input.message.trim();
  if (!message || message.length > MAX_ASSISTANT_MESSAGE_LENGTH) {
    return invalidRequest();
  }
  if (!localePattern.test(input.locale)) {
    return invalidRequest();
  }
  if (input.conversationId !== undefined && !isUuid(input.conversationId)) {
    return invalidRequest();
  }

  return {
    ok: true,
    value: {
      message,
      locale: input.locale,
      ...(typeof input.conversationId === "string" ? { conversationId: input.conversationId } : {}),
    },
  };
}

function invalidRequest(): ParseResult {
  return { ok: false, code: "invalid_request" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
