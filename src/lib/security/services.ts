import "server-only";
import { Redis } from "@upstash/redis";
import { createImageProvider } from "@/lib/ai/create-provider";
import type { ImageEditProvider } from "@/lib/ai/image-provider";
import { getServerConfig, type ServerConfig } from "@/lib/config/env";
import { createConcurrencyGate, type ConcurrencyGate } from "./concurrency";
import { createDailyQuota, type DailyQuota } from "./daily-quota";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { createTurnstileVerifier, type TurnstileVerifier } from "./turnstile";

export type Services = {
  config: ServerConfig;
  rateLimiter: RateLimiter;
  quota: DailyQuota;
  gate: ConcurrencyGate;
  provider: ImageEditProvider | null;
  verifyTurnstile: TurnstileVerifier | null;
};

let services: Services | undefined;

/** One shared set per server instance, used by the API route and the studio page. */
export function getServices(): Services {
  if (services) return services;
  const config = getServerConfig();
  const redis = config.upstash ? new Redis({ url: config.upstash.url, token: config.upstash.token }) : null;
  services = {
    config,
    rateLimiter: createRateLimiter({ isProduction: config.isProduction, redis }),
    quota: createDailyQuota({ isProduction: config.isProduction, redis, limits: config.quota }),
    gate: createConcurrencyGate(4),
    provider: createImageProvider(config.provider),
    verifyTurnstile: config.turnstile ? createTurnstileVerifier(config.turnstile.secretKey) : null,
  };
  return services;
}
