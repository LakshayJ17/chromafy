import { describe, expect, it, vi } from "vitest";
import { createMemoryRateLimiter, createRateLimiter, createUpstashRateLimiter, FLOOD_LIMIT } from "@/lib/security/rate-limit";

type LimitResult = { success: boolean; reset: number; reason?: "timeout" | "cacheBlock" | "denyList" };
const fakeLimiter = (result: LimitResult | Error) => ({
  limit: vi.fn(async () => {
    if (result instanceof Error) throw result;
    return { ...result, limit: 1, remaining: 0, pending: Promise.resolve() };
  }),
});

describe("flood limiter", () => {
  it("fails closed in production when no distributed store is configured", async () => {
    const limiter = createRateLimiter({ isProduction: true, redis: null });
    expect(limiter.kind).toBe("unavailable");
    expect(await limiter.check("id")).toEqual({ allowed: false, reason: "unavailable" });
  });

  it("uses the documented in-memory fallback only outside production", () => {
    expect(createRateLimiter({ isProduction: false, redis: null }).kind).toBe("memory");
  });

  it("allows, then reports limited with a retry time", async () => {
    expect(await createUpstashRateLimiter(fakeLimiter({ success: true, reset: 0 })).check("id")).toEqual({ allowed: true });
    const decision = await createUpstashRateLimiter(fakeLimiter({ success: false, reset: Date.now() + 30_000 })).check("id");
    expect(decision).toMatchObject({ allowed: false, reason: "limited" });
    expect(decision.allowed === false && decision.reason === "limited" && decision.retryAfterSeconds).toBeGreaterThan(25);
  });

  it("treats Upstash's fail-open timeout as unavailable", async () => {
    const limiter = createUpstashRateLimiter(fakeLimiter({ success: true, reset: 0, reason: "timeout" }));
    expect(await limiter.check("id")).toEqual({ allowed: false, reason: "unavailable" });
  });

  it("fails closed when Redis throws", async () => {
    expect(await createUpstashRateLimiter(fakeLimiter(new Error("ECONNREFUSED"))).check("id")).toEqual({ allowed: false, reason: "unavailable" });
  });

  it("memory limiter blocks after the flood allowance and recovers after the window", async () => {
    let now = 1_000_000;
    const limiter = createMemoryRateLimiter(() => now);
    for (let i = 0; i < FLOOD_LIMIT.tokens; i += 1) expect((await limiter.check("a")).allowed).toBe(true);
    expect(await limiter.check("a")).toMatchObject({ allowed: false, reason: "limited" });
    expect((await limiter.check("b")).allowed).toBe(true);
    now += FLOOD_LIMIT.windowMs + 1;
    expect((await limiter.check("a")).allowed).toBe(true);
  });
});
