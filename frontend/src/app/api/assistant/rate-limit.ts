import { createHmac } from "node:crypto";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export interface RateLimiter {
  consume(clientKey: string, now?: number): Promise<RateLimitResult>;
}

type RateLimiterOptions = {
  limit: number;
  windowMs: number;
};

type ClientWindow = {
  count: number;
  resetAt: number;
};

export function createMemoryRateLimiter({ limit, windowMs }: RateLimiterOptions): RateLimiter {
  const clientWindows = new Map<string, ClientWindow>();

  return {
    async consume(clientKey: string, now = Date.now()): Promise<RateLimitResult> {
      const currentWindow = clientWindows.get(clientKey);
      if (!currentWindow || currentWindow.resetAt <= now) {
        clientWindows.set(clientKey, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (currentWindow.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((currentWindow.resetAt - now) / 1_000)),
        };
      }
      currentWindow.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

type RedisRateLimiterOptions = RateLimiterOptions & {
  redisUrl: string;
  redisToken: string;
  fetchImplementation?: typeof fetch;
};

const FIXED_WINDOW_SCRIPT = [
  "local count=redis.call('INCR',KEYS[1])",
  "if count==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end",
  "local ttl=redis.call('PTTL',KEYS[1])",
  "return {count,ttl}",
].join("; ");

export function createRedisRateLimiter(options: RedisRateLimiterOptions): RateLimiter {
  const executeFetch = options.fetchImplementation ?? fetch;
  return {
    async consume(clientKey: string): Promise<RateLimitResult> {
      const response = await executeFetch(options.redisUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.redisToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([
          "EVAL",
          FIXED_WINDOW_SCRIPT,
          "1",
          `carecall:assistant:rate:${clientKey}`,
          String(options.windowMs),
        ]),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("rate_limit_store_unavailable");
      }
      const payload = await response.json() as { result?: unknown };
      if (!Array.isArray(payload.result) || payload.result.length !== 2) {
        throw new Error("rate_limit_store_invalid_response");
      }
      const count = Number(payload.result[0]);
      const ttlMs = Number(payload.result[1]);
      if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
        throw new Error("rate_limit_store_invalid_response");
      }
      return {
        allowed: count <= options.limit,
        retryAfterSeconds: count <= options.limit ? 0 : Math.max(1, Math.ceil(ttlMs / 1_000)),
      };
    },
  };
}

export function createPrivateClientKey(request: Request, keySecret: string): string {
  const proxyAddress = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "anonymous";
  return createHmac("sha256", keySecret).update(proxyAddress).digest("base64url");
}
