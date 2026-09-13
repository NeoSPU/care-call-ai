import type { AssistantCitation, AssistantStreamEvent, AssistantUsage } from "./contracts";

const allowedEventTypes = new Set(["meta", "delta", "citation", "usage", "done", "error"]);

export function createAssistantEventParser(onEvent: (event: AssistantStreamEvent) => void) {
  let buffer = "";

  function parseAvailableEvents() {
    const eventBlocks = buffer.split("\n\n");
    buffer = eventBlocks.pop() ?? "";

    for (const eventBlock of eventBlocks) {
      const parsedEvent = parseEventBlock(eventBlock);
      if (parsedEvent) {
        onEvent(parsedEvent);
      }
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk.replaceAll("\r\n", "\n");
      parseAvailableEvents();
    },
    finish() {
      if (buffer.trim()) {
        buffer += "\n\n";
      }
      parseAvailableEvents();
    },
  };
}

function parseEventBlock(eventBlock: string): AssistantStreamEvent | null {
  const dataLines = eventBlock
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (!dataLines.length) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(dataLines.join("\n"));
    return parsePublicEvent(value);
  } catch {
    return null;
  }
}

function parsePublicEvent(value: unknown): AssistantStreamEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }
  if (!allowedEventTypes.has(value.type)) {
    return null;
  }

  switch (value.type) {
    case "meta":
      return typeof value.conversationId === "string" && typeof value.correlationId === "string"
        ? {
            type: "meta",
            conversationId: value.conversationId,
            correlationId: value.correlationId,
            ...(typeof value.route === "string" ? { route: value.route } : {}),
          }
        : null;
    case "delta":
      return typeof value.text === "string" ? { type: "delta", text: value.text } : null;
    case "citation": {
      const citation = parseCitation(value.citation);
      return citation ? { type: "citation", citation } : null;
    }
    case "usage": {
      const usage = parseUsage(value.usage);
      return usage ? { type: "usage", usage } : null;
    }
    case "done":
      return typeof value.abstained === "boolean" ? { type: "done", abstained: value.abstained } : null;
    case "error":
      return typeof value.code === "string" && typeof value.message === "string"
        ? { type: "error", code: value.code, message: value.message }
        : null;
    default:
      return null;
  }
}

function parseCitation(value: unknown): AssistantCitation | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.url !== "string") {
    return null;
  }

  try {
    const citationUrl = new URL(value.url);
    if (citationUrl.protocol !== "https:" && citationUrl.protocol !== "http:") {
      return null;
    }
  } catch {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    url: value.url,
    ...(typeof value.sourceRevision === "string" ? { sourceRevision: value.sourceRevision } : {}),
  };
}

function parseUsage(value: unknown): AssistantUsage | null {
  if (!isRecord(value)) {
    return null;
  }
  const { inputTokens, outputTokens, latencyMs } = value;
  if (![inputTokens, outputTokens, latencyMs].every(isNonNegativeInteger)) {
    return null;
  }
  return {
    inputTokens: inputTokens as number,
    outputTokens: outputTokens as number,
    latencyMs: latencyMs as number,
  };
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
