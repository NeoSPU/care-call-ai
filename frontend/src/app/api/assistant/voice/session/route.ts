import { loadAssistantServerConfig } from "../../server-config";

export const runtime = "nodejs";

const allowedProfiles = new Set(["calm", "bright", "warm"]);
const localePattern = /^[a-z]{2}(?:-[A-Z]{2})?$/;

export async function POST(request: Request): Promise<Response> {
  const config = loadAssistantServerConfig();
  if (!config.isEnabled || !config.apiUrl || !config.serviceToken) {
    return safeError(503);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return safeError(400);
  }
  const body: unknown = await request.json().catch(() => null);
  if (!isVoiceRequest(body)) {
    return safeError(400);
  }

  const timeoutSignal = AbortSignal.timeout(Math.min(config.requestTimeoutMs, 10_000));
  try {
    const response = await fetch(new URL("/v1/voice/session", config.apiUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.serviceToken}`,
        "content-type": "application/json",
        ...(request.headers.get("origin") ? { origin: request.headers.get("origin")! } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.any([request.signal, timeoutSignal]),
    });
    if (!response.ok) {
      return safeError(response.status === 429 ? 429 : 503);
    }
    const bootstrap: unknown = await response.json();
    if (!isSafeBootstrap(bootstrap)) {
      return safeError(503);
    }
    return Response.json(bootstrap, { status: 201, headers: safeHeaders() });
  } catch {
    return safeError(503);
  }
}

function isVoiceRequest(value: unknown): value is { locale: string; voiceProfileId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const voiceRequest = value as Record<string, unknown>;
  return Object.keys(voiceRequest).every((key) => key === "locale" || key === "voiceProfileId")
    && typeof voiceRequest.locale === "string"
    && localePattern.test(voiceRequest.locale)
    && typeof voiceRequest.voiceProfileId === "string"
    && allowedProfiles.has(voiceRequest.voiceProfileId);
}

function isSafeBootstrap(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const bootstrap = value as Record<string, unknown>;
  return typeof bootstrap.ephemeralToken === "string"
    && typeof bootstrap.model === "string"
    && typeof bootstrap.voiceName === "string"
    && typeof bootstrap.maxDurationSeconds === "number"
    && typeof bootstrap.idleTimeoutSeconds === "number";
}

function safeHeaders(): HeadersInit {
  return { "cache-control": "no-store", "x-content-type-options": "nosniff" };
}

function safeError(status: number): Response {
  return Response.json(
    { error: status === 429 ? "rate_limited" : "voice_unavailable" },
    { status, headers: safeHeaders() },
  );
}
