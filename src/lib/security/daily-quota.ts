import "server-only";
import type { Redis } from "@upstash/redis";

/**
 * The daily image allowance: N transformations per person per UTC day, plus
 * one global cap for everyone. A use is reserved only once a photo has passed
 * validation (so a bad upload never costs one) and is released again if the
 * provider fails for reasons that are not the person's fault.
 */
export type QuotaLimits = { perClient: number; global: number };

export type QuotaStatus = { limit: number; remaining: number; resetsAt: number };

export type Reservation = { clientKey: string; globalKey: string; status: QuotaStatus };

export type ReserveResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; reason: "client" | "global"; resetsAt: number }
  | { ok: false; reason: "unavailable" };

export interface DailyQuota {
  readonly kind: "redis" | "memory" | "unavailable";
  readonly limits: QuotaLimits;
  reserve(clientId: string): Promise<ReserveResult>;
  /** Gives a reserved use back. Never throws. */
  release(reservation: Reservation): Promise<void>;
  /** Read-only view for the UI; null when the store cannot answer. */
  peek(clientId: string): Promise<QuotaStatus | null>;
}

const STORE_TIMEOUT_MS = 2_000;
const KEY_TTL_SECONDS = 2 * 24 * 60 * 60;

/** The UTC calendar day, and the moment the next one starts. */
export function utcDay(now: number = Date.now()): { day: string; resetsAt: number } {
  const date = new Date(now);
  const day = date.toISOString().slice(0, 10);
  const resetsAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return { day, resetsAt };
}

function keys(clientId: string, now: number) {
  const { day, resetsAt } = utcDay(now);
  return { clientKey: `chromafy:daily:${day}:c:${clientId}`, globalKey: `chromafy:daily:${day}:global`, resetsAt };
}

/**
 * Atomic reserve: increment the person's counter, then the global one, and
 * undo both if either passes its limit. Returns {1, used} on success,
 * {0, used} when the person is out, {-1, used} when everyone is.
 */
const RESERVE_SCRIPT = `
local used = redis.call('INCR', KEYS[1])
if used == 1 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
if used > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return {0, used - 1}
end
local total = redis.call('INCR', KEYS[2])
if total == 1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
if total > tonumber(ARGV[2]) then
  redis.call('DECR', KEYS[2])
  redis.call('DECR', KEYS[1])
  return {-1, used - 1}
end
return {1, used}
`;

const RELEASE_SCRIPT = `
for i = 1, 2 do
  local value = tonumber(redis.call('GET', KEYS[i]) or '0')
  if value > 0 then redis.call('DECR', KEYS[i]) end
end
return 1
`;

/** The small part of the Upstash client this module needs; a fake implements it in tests. */
export type RedisLike = Pick<Redis, "eval" | "get">;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("quota store timeout")), STORE_TIMEOUT_MS)),
  ]);
}

export function createRedisDailyQuota(redis: RedisLike, limits: QuotaLimits, now: () => number = Date.now): DailyQuota {
  return {
    kind: "redis",
    limits,
    async reserve(clientId) {
      const { clientKey, globalKey, resetsAt } = keys(clientId, now());
      try {
        const [state, used] = (await withTimeout(
          redis.eval(RESERVE_SCRIPT, [clientKey, globalKey], [String(limits.perClient), String(limits.global), String(KEY_TTL_SECONDS)]),
        )) as [number, number];
        if (state === 0) return { ok: false, reason: "client", resetsAt };
        if (state === -1) return { ok: false, reason: "global", resetsAt };
        return {
          ok: true,
          reservation: { clientKey, globalKey, status: { limit: limits.perClient, remaining: Math.max(0, limits.perClient - used), resetsAt } },
        };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
    async release(reservation) {
      await withTimeout(redis.eval(RELEASE_SCRIPT, [reservation.clientKey, reservation.globalKey], [])).catch(() => undefined);
    },
    async peek(clientId) {
      const { clientKey, resetsAt } = keys(clientId, now());
      try {
        const used = Number((await withTimeout(redis.get<number | string>(clientKey))) ?? 0);
        return { limit: limits.perClient, remaining: Math.max(0, limits.perClient - used), resetsAt };
      } catch {
        return null;
      }
    },
  };
}

/** Development only: the same rules in process memory. */
export function createMemoryDailyQuota(limits: QuotaLimits, now: () => number = Date.now): DailyQuota {
  const counts = new Map<string, number>();
  const get = (key: string) => counts.get(key) ?? 0;
  return {
    kind: "memory",
    limits,
    async reserve(clientId) {
      const { clientKey, globalKey, resetsAt } = keys(clientId, now());
      if (get(clientKey) >= limits.perClient) return { ok: false, reason: "client", resetsAt };
      if (get(globalKey) >= limits.global) return { ok: false, reason: "global", resetsAt };
      counts.set(clientKey, get(clientKey) + 1);
      counts.set(globalKey, get(globalKey) + 1);
      return {
        ok: true,
        reservation: { clientKey, globalKey, status: { limit: limits.perClient, remaining: limits.perClient - get(clientKey), resetsAt } },
      };
    },
    async release(reservation) {
      for (const key of [reservation.clientKey, reservation.globalKey]) counts.set(key, Math.max(0, get(key) - 1));
    },
    async peek(clientId) {
      const { clientKey, resetsAt } = keys(clientId, now());
      return { limit: limits.perClient, remaining: Math.max(0, limits.perClient - get(clientKey)), resetsAt };
    },
  };
}

export function createUnavailableDailyQuota(limits: QuotaLimits): DailyQuota {
  return {
    kind: "unavailable",
    limits,
    async reserve() {
      return { ok: false, reason: "unavailable" };
    },
    async release() {},
    async peek() {
      return null;
    },
  };
}

export function createDailyQuota(options: { isProduction: boolean; redis: Redis | null; limits: QuotaLimits }): DailyQuota {
  if (options.redis) return createRedisDailyQuota(options.redis, options.limits);
  // Production without Redis fails closed, like the flood limiter.
  if (options.isProduction) return createUnavailableDailyQuota(options.limits);
  return createMemoryDailyQuota(options.limits);
}
