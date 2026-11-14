import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "limited"; retryAfterSeconds: number }
  | { allowed: false; reason: "unavailable" };

/**
 * Flood limiter: counts every transform request (valid or not) before the
 * body is read, so nobody can hammer the server with uploads. The daily
 * image quota (src/lib/security/daily-quota.ts) is separate and only counts
 * real attempts at the provider.
 */
export interface RateLimiter {
  readonly kind: "upstash" | "memory" | "unavailable";
  check(clientId: string): Promise<RateLimitDecision>;
}

export const FLOOD_LIMIT = { tokens: 20, window: "10 m", windowMs: 10 * 60_000 } as const;

const REDIS_TIMEOUT_MS = 2_000;

type Limiter = Pick<Ratelimit, "limit">;

/** Exported for tests: fails closed whenever the backing store cannot answer. */
export function createUpstashRateLimiter(limiter: Limiter): RateLimiter {
  return {
    kind: "upstash",
    async check(clientId) {
      try {
        const result = await limiter.limit(`client:${clientId}`);
        // Upstash reports success with reason "timeout" when Redis is slow. That
        // is a fail-open default, so it is treated here as an unavailable limiter.
        if (result.reason === "timeout") return { allowed: false, reason: "unavailable" };
        if (result.success) return { allowed: true };
        return { allowed: false, reason: "limited", retryAfterSeconds: secondsUntil(result.reset) };
      } catch {
        return { allowed: false, reason: "unavailable" };
      }
    },
  };
}

/**
 * Process-local sliding window for local development only. Each server
 * instance has its own memory, so this offers no real protection when several
 * instances run, which is why production refuses to use it.
 */
export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    kind: "memory",
    async check(clientId) {
      const time = now();
      const recent = (hits.get(clientId) ?? []).filter((at) => time - at < FLOOD_LIMIT.windowMs);
      if (recent.length >= FLOOD_LIMIT.tokens) {
        hits.set(clientId, recent);
        return { allowed: false, reason: "limited", retryAfterSeconds: secondsUntil(recent[0] + FLOOD_LIMIT.windowMs, time) };
      }
      recent.push(time);
      hits.set(clientId, recent);
      return { allowed: true };
    },
  };
}

export const unavailableRateLimiter: RateLimiter = {
  kind: "unavailable",
  async check() {
    return { allowed: false, reason: "unavailable" };
  },
};

export function createRateLimiter(options: { isProduction: boolean; redis: Redis | null }): RateLimiter {
  if (options.redis) {
    return createUpstashRateLimiter(
      new Ratelimit({
        redis: options.redis,
        limiter: Ratelimit.slidingWindow(FLOOD_LIMIT.tokens, FLOOD_LIMIT.window),
        prefix: "chromafy:flood",
        timeout: REDIS_TIMEOUT_MS,
        analytics: false,
      }),
    );
  }
  // Production without the distributed store fails closed: no AI requests.
  if (options.isProduction) return unavailableRateLimiter;
  return createMemoryRateLimiter();
}

export function secondsUntil(resetAt: number, now: number = Date.now()): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}
