import {
  MAX_ASSISTANT_REQUEST_BYTES,
  parseAssistantRequest,
  type AssistantErrorCode,
} from "../../../../features/assistant/contracts";
import type { AssistantServerConfig } from "../server-config";
import { createPrivateClientKey, type RateLimiter } from "../rate-limit";
import { createSanitizedAssistantStream } from "../sanitize-stream";

type HandlerDependencies = {
  config: AssistantServerConfig;
  rateLimiter: RateLimiter;
  fetchUpstream: typeof fetch;
};

export function createAssistantPostHandler(dependencies: HandlerDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const { config } = dependencies;
    if (!config.isEnabled || !config.apiUrl) {
      return errorResponse("assistant_disabled", 503);
    }
    if (!isAllowedRequestContext(request) || !isJsonRequest(request)) {
      return errorResponse("invalid_request", 400);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_ASSISTANT_REQUEST_BYTES) {
      return errorResponse("invalid_request", 413);
    }

    let rateLimit;
    try {
      const clientKey = createPrivateClientKey(request, config.rateLimitKeySecret);
      rateLimit = await dependencies.rateLimiter.consume(clientKey);
    } catch {
      return errorResponse("upstream_unavailable", 503);
    }
    if (!rateLimit.allowed) {
      return errorResponse("rate_limited", 429, rateLimit.retryAfterSeconds);
    }

    const requestText = await request.text().catch(() => "");
    if (!requestText || new TextEncoder().encode(requestText).byteLength > MAX_ASSISTANT_REQUEST_BYTES) {
      return errorResponse("invalid_request", 400);
    }

    const parsedRequest = parseAssistantRequest(parseJson(requestText));
    if (!parsedRequest.ok) {
      return errorResponse(parsedRequest.code, 400);
    }

    const timeoutSignal = AbortSignal.timeout(config.requestTimeoutMs);
    const upstreamSignal = AbortSignal.any([request.signal, timeoutSignal]);
    try {
      const upstreamResponse = await dependencies.fetchUpstream(new URL("/v1/chat/stream", config.apiUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          "x-request-timestamp": String(Date.now()),
          ...(config.serviceToken ? { authorization: `Bearer ${config.serviceToken}` } : {}),
        },
        body: JSON.stringify(parsedRequest.value),
        cache: "no-store",
        signal: upstreamSignal,
      });
      if (!upstreamResponse.ok || !upstreamResponse.body) {
        return errorResponse("upstream_unavailable", 503);
      }
      return new Response(createSanitizedAssistantStream(upstreamResponse.body), {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store, no-transform",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      const isTimeout = timeoutSignal.aborted && !request.signal.aborted;
      return errorResponse(isTimeout ? "request_timeout" : "upstream_unavailable", 503);
    }
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isJsonRequest(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim() === "application/json";
}

function isAllowedRequestContext(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin" || fetchSite === "same-site";
}

function errorResponse(code: AssistantErrorCode, status: number, retryAfterSeconds?: number): Response {
  return Response.json(
    { error: code },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...(retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : {}),
      },
    },
  );
}
