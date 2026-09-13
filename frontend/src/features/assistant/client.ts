import type { AssistantErrorCode, AssistantRequest, AssistantStreamEvent } from "./contracts";
import { createAssistantEventParser } from "./sse";
import type { ChatMessage } from "./types";

const ASSISTANT_ENDPOINT = "/api/assistant/v1";

export class AssistantTransportError extends Error {
  constructor(public readonly code: AssistantErrorCode) {
    super(code);
    this.name = "AssistantTransportError";
  }
}

export const DEFAULT_SUGGESTIONS = [
  { label: "What can CareCall help with?", query: "What can CareCall AI help a coordinator do?" },
  { label: "Explain safety boundaries", query: "What safety boundaries does CareCall AI follow?" },
  { label: "How does call preflight work?", query: "How does CareCall AI prepare a safe call round?" },
  { label: "What happens after a call?", query: "How does CareCall turn a call into practical service requests?" },
];

export async function streamAssistantResponse({
  messages,
  signal,
  onChunk,
}: {
  messages: ChatMessage[];
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
}): Promise<void> {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";

  await streamAssistant({
    request: {
      message: lastUserMessage,
      locale: inferAssistantLocale(lastUserMessage),
    },
    signal,
    onEvent: (event) => {
      if (event.type === "delta") {
        onChunk(event.text);
      }
      if (event.type === "error") {
        throw new AssistantTransportError("upstream_unavailable");
      }
    },
  });
}

type StreamAssistantOptions = {
  request: AssistantRequest;
  signal?: AbortSignal;
  onEvent: (event: AssistantStreamEvent) => void;
};

export async function streamAssistant({ request, signal, onEvent }: StreamAssistantOptions): Promise<void> {
  let response: Response;
  try {
    response = await fetch(ASSISTANT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (requestError) {
    if (signal?.aborted) {
      throw requestError;
    }
    throw new AssistantTransportError("upstream_unavailable");
  }

  if (!response.ok || !response.body) {
    const responseBody: unknown = await response.json().catch(() => null);
    throw new AssistantTransportError(readErrorCode(responseBody));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createAssistantEventParser(onEvent);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
  } finally {
    reader.releaseLock();
  }
}

export function inferAssistantLocale(message: string): string {
  if (/[\u0400-\u04FF]/.test(message)) {
    return "ru-RU";
  }
  if (typeof navigator === "undefined") {
    return "en-GB";
  }
  const browserLocale = navigator.language.replace("_", "-");
  const localeMatch = /^([a-z]{2})(?:-([a-z]{2}))?/i.exec(browserLocale);
  if (!localeMatch?.[1]) {
    return "en-GB";
  }
  return localeMatch[2]
    ? `${localeMatch[1].toLowerCase()}-${localeMatch[2].toUpperCase()}`
    : localeMatch[1].toLowerCase();
}

function readErrorCode(value: unknown): AssistantErrorCode {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return "upstream_unavailable";
  }
  const errorCode = value.error;
  return errorCode === "assistant_disabled"
    || errorCode === "invalid_request"
    || errorCode === "rate_limited"
    || errorCode === "request_timeout"
    || errorCode === "upstream_unavailable"
    ? errorCode
    : "upstream_unavailable";
}
