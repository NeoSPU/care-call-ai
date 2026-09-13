import { createHash } from "node:crypto";

const DEFAULT_LOCAL_API_URL = "http://127.0.0.1:8787";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export type AssistantServerConfig = {
  isEnabled: boolean;
  apiUrl: string | null;
  serviceToken: string | null;
  requestTimeoutMs: number;
  rateLimitKeySecret: string;
  redisUrl: string | null;
  redisToken: string | null;
};

export function loadAssistantServerConfig(env: NodeJS.ProcessEnv = process.env): AssistantServerConfig {
  const isProduction = env.NODE_ENV === "production";
  const configuredApiUrl = env.CH_RAIXON_API_URL?.trim();
  const serviceToken = env.CH_RAIXON_SERVICE_TOKEN?.trim() || null;
  const isExplicitlyDisabled = env.CH_RAIXON_ENABLED === "false";
  const apiUrl = configuredApiUrl || (isProduction ? null : DEFAULT_LOCAL_API_URL);
  const hasProductionCredentials = !isProduction || Boolean(serviceToken);
  const rateLimitKeySecret = env.CH_RAIXON_RATE_LIMIT_KEY_SECRET?.trim()
    || deriveRateLimitKey(serviceToken)
    || (isProduction ? "" : "local-development-only");
  const redisUrl = env.UPSTASH_REDIS_REST_URL?.trim() || null;
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN?.trim() || null;

  return {
    isEnabled: !isExplicitlyDisabled && Boolean(apiUrl) && hasProductionCredentials,
    apiUrl,
    serviceToken,
    requestTimeoutMs: parseBoundedInteger(
      env.CH_RAIXON_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      5_000,
      60_000,
    ),
    rateLimitKeySecret,
    redisUrl,
    redisToken,
  };
}

function deriveRateLimitKey(serviceToken: string | null): string {
  if (!serviceToken) {
    return "";
  }
  return createHash("sha256").update(`ch-raixon-carecall-rate-limit:${serviceToken}`).digest("base64url");
}

function parseBoundedInteger(
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsedValue = Number(rawValue);
  return Number.isInteger(parsedValue) && parsedValue >= minimum && parsedValue <= maximum
    ? parsedValue
    : fallback;
}
