import { describe, expect, it, vi } from "vitest";
import {
  createDailyQuota,
  createMemoryDailyQuota,
  createRedisDailyQuota,
  utcDay,
  type RedisLike,
} from "@/lib/security/daily-quota";

const limits = { perClient: 5, global: 8 };
const NOON = Date.UTC(2026, 9, 17, 12, 0, 0);

describe("utcDay", () => {
  it("resets at the next UTC midnight", () => {
    expect(utcDay(NOON)).toEqual({ day: "2026-10-17", resetsAt: Date.UTC(2026, 9, 18) });
  });
});

describe("memory daily quota", () => {
  it("allows 5 per person per day, counting down", async () => {
    const quota = createMemoryDailyQuota(limits, () => NOON);
    const remaining: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const result = await quota.reserve("alice");
      if (!result.ok) throw new Error("unexpected");
      remaining.push(result.reservation.status.remaining);
    }
    expect(remaining).toEqual([4, 3, 2, 1, 0]);
    expect(await quota.reserve("alice")).toEqual({ ok: false, reason: "client", resetsAt: Date.UTC(2026, 9, 18) });
    expect((await quota.peek("alice"))?.remaining).toBe(0);
  });

  it("gives a use back when released", async () => {
    const quota = createMemoryDailyQuota(limits, () => NOON);
    const first = await quota.reserve("alice");
    if (!first.ok) throw new Error("unexpected");
    await quota.release(first.reservation);
    expect((await quota.peek("alice"))?.remaining).toBe(5);
  });

  it("enforces the global cap across people without charging the refused person", async () => {
    const quota = createMemoryDailyQuota(limits, () => NOON);
    for (const person of ["a", "a", "a", "a", "a", "b", "b", "b"]) expect((await quota.reserve(person)).ok).toBe(true);
    expect(await quota.reserve("c")).toMatchObject({ ok: false, reason: "global" });
    expect((await quota.peek("c"))?.remaining).toBe(5);
  });

  it("starts fresh the next UTC day", async () => {
    let now = NOON;
    const quota = createMemoryDailyQuota(limits, () => now);
    for (let i = 0; i < 5; i += 1) await quota.reserve("alice");
    expect((await quota.reserve("alice")).ok).toBe(false);
    now = Date.UTC(2026, 9, 18, 0, 0, 1);
    expect((await quota.reserve("alice")).ok).toBe(true);
  });
});

describe("Redis daily quota (fake Redis; the Lua scripts themselves need a real Redis)", () => {
  function fakeRedis(responses: { eval?: unknown; get?: unknown; fail?: boolean }) {
    return {
      eval: vi.fn(async () => {
        if (responses.fail) throw new Error("down");
        return responses.eval;
      }),
      get: vi.fn(async () => {
        if (responses.fail) throw new Error("down");
        return responses.get;
      }),
    } as unknown as RedisLike & { eval: ReturnType<typeof vi.fn> };
  }

  it("passes per-client and global limits to the atomic script with date-scoped keys", async () => {
    const redis = fakeRedis({ eval: [1, 2] });
    const result = await createRedisDailyQuota(redis, limits, () => NOON).reserve("abc");
    expect(result).toMatchObject({ ok: true, reservation: { status: { limit: 5, remaining: 3 } } });
    const [, keys, args] = redis.eval.mock.calls[0];
    expect(keys).toEqual(["chromafy:daily:2026-10-17:c:abc", "chromafy:daily:2026-10-17:global"]);
    expect(args).toEqual(["5", "8", String(2 * 24 * 60 * 60)]);
  });

  it("maps script results to client and global refusals", async () => {
    expect(await createRedisDailyQuota(fakeRedis({ eval: [0, 5] }), limits, () => NOON).reserve("x")).toMatchObject({ ok: false, reason: "client" });
    expect(await createRedisDailyQuota(fakeRedis({ eval: [-1, 2] }), limits, () => NOON).reserve("x")).toMatchObject({ ok: false, reason: "global" });
  });

  it("fails closed when Redis errors", async () => {
    expect(await createRedisDailyQuota(fakeRedis({ fail: true }), limits).reserve("x")).toEqual({ ok: false, reason: "unavailable" });
    expect(await createRedisDailyQuota(fakeRedis({ fail: true }), limits).peek("x")).toBeNull();
  });

  it("peeks without spending", async () => {
    const redis = fakeRedis({ get: "3" });
    expect(await createRedisDailyQuota(redis, limits, () => NOON).peek("x")).toEqual({ limit: 5, remaining: 2, resetsAt: Date.UTC(2026, 9, 18) });
    expect(redis.eval).not.toHaveBeenCalled();
  });
});

describe("createDailyQuota", () => {
  it("fails closed in production without Redis", async () => {
    const quota = createDailyQuota({ isProduction: true, redis: null, limits });
    expect(quota.kind).toBe("unavailable");
    expect(await quota.reserve("x")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("uses memory only in development", () => {
    expect(createDailyQuota({ isProduction: false, redis: null, limits }).kind).toBe("memory");
  });
});
