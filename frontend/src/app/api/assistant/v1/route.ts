import { createMemoryRateLimiter, createRedisRateLimiter } from "../rate-limit";
import { loadAssistantServerConfig } from "../server-config";
import { createAssistantPostHandler } from "./route-handler";

export const runtime = "nodejs";

const config = loadAssistantServerConfig();
const rateLimiter = config.redisUrl && config.redisToken
  ? createRedisRateLimiter({
      limit: 10,
      windowMs: 10 * 60 * 1_000,
      redisUrl: config.redisUrl,
      redisToken: config.redisToken,
    })
  : createMemoryRateLimiter({ limit: 10, windowMs: 10 * 60 * 1_000 });

export const POST = createAssistantPostHandler({
  config,
  rateLimiter,
  fetchUpstream: fetch,
});
