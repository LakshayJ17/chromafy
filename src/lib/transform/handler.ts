import "server-only";
import { buildTransformPrompt } from "@/lib/ai/prompt-builder";
import type { ImageEditProvider } from "@/lib/ai/image-provider";
import type { ServerConfig } from "@/lib/config/env";
import { pickSurpriseMood, type MoodId } from "@/lib/config/moods";
import { AppError, errorBody, type ErrorCode } from "@/lib/errors";
import { normalizeImage } from "@/lib/images/normalize-image";
import { validateImage } from "@/lib/images/validate-image";
import { getClientAddress, getClientId } from "@/lib/security/client-identity";
import type { ConcurrencyGate } from "@/lib/security/concurrency";
import type { DailyQuota, QuotaStatus, Reservation } from "@/lib/security/daily-quota";
import { secondsUntil, type RateLimiter } from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  assertUploadHeaders,
  parseTransformQuery,
  readBodyWithLimit,
} from "@/lib/security/request-validation";
import type { TurnstileVerifier } from "@/lib/security/turnstile";

/** Overall budget for one request, covering one provider attempt plus a short retry. */
export const REQUEST_DEADLINE_MS = 170_000;

export const TURNSTILE_HEADER = "x-turnstile-token";

/**
 * Failures that are not the person's fault give their daily use back.
 * Safety refusals and cancellations do not, so the quota cannot be used to
 * probe the provider for free.
 */
const REFUNDED_CODES = new Set<ErrorCode>([
  "busy",
  "timeout",
  "provider_unavailable",
  "provider_rate_limited",
  "provider_quota",
  "provider_auth",
  "invalid_output",
  "internal",
]);

export type TransformDependencies = {
  config: ServerConfig;
  rateLimiter: RateLimiter;
  quota: DailyQuota;
  gate: ConcurrencyGate;
  /** Null when no provider credential is configured. */
  provider: ImageEditProvider | null;
  /** Null when Turnstile is not configured. */
  verifyTurnstile: TurnstileVerifier | null;
  random?: () => number;
  log?: (event: Record<string, unknown>) => void;
};

/**
 * POST /api/transform
 *
 * Order matters: cheap checks run first, and nothing reaches the paid
 * provider until the request, the bot check, the image and the caller's
 * daily allowance have all been checked.
 */
export function createTransformHandler(deps: TransformDependencies) {
  const log = deps.log ?? defaultLog;

  return async function handleTransform(request: Request): Promise<Response> {
    const startedAt = Date.now();
    let release: (() => void) | null = null;
    let reservation: Reservation | null = null;
    let mood: MoodId | undefined;

    try {
      // 1. Request structure: origin, query, declared size and type.
      assertSameOrigin(request);
      const query = parseTransformQuery(new URL(request.url));
      assertUploadHeaders(request, deps.config.maxImageBytes);
      if (!deps.provider) throw new AppError("not_configured");

      // 2. Flood limit on every request, before the body is read (fails closed in production).
      const clientId = getClientId(request.headers, deps.config.clientIpHeader);
      const decision = await deps.rateLimiter.check(clientId);
      if (!decision.allowed) {
        throw decision.reason === "limited"
          ? new AppError("rate_limited", { retryAfterSeconds: decision.retryAfterSeconds })
          : new AppError("rate_limiter_unavailable");
      }

      // 3. Bot check (Cloudflare Turnstile), when configured. Tokens are single use.
      if (deps.verifyTurnstile) {
        await deps.verifyTurnstile(
          request.headers.get(TURNSTILE_HEADER),
          getClientAddress(request.headers, deps.config.clientIpHeader),
          requestHostname(request),
        );
      }

      // 4. Bounded body read, then signature, dimension and decode checks.
      const body = await readBodyWithLimit(request, deps.config.maxImageBytes);
      const validated = await validateImage(body, {
        maxBytes: deps.config.maxImageBytes,
        maxPixels: deps.config.maxImagePixels,
      });

      // 5. Re-encode: orientation applied, metadata (including GPS) dropped.
      const normalized = await normalizeImage(validated, deps.config.maxImagePixels);

      // 6. Trusted mood resolution.
      mood = query.mood === "surprise" ? pickSurpriseMood(undefined, deps.random) : query.mood;
      const prompt = buildTransformPrompt(mood);

      // 7. Daily allowance: reserved only now, so invalid uploads never cost a use.
      const reserved = await deps.quota.reserve(clientId);
      if (!reserved.ok) {
        if (reserved.reason === "unavailable") throw new AppError("rate_limiter_unavailable");
        throw new AppError(reserved.reason === "client" ? "daily_limit_reached" : "service_daily_limit", {
          retryAfterSeconds: secondsUntil(reserved.resetsAt),
        });
      }
      reservation = reserved.reservation;

      // 8. Provider call, bounded by concurrency and an overall deadline.
      release = deps.gate.tryAcquire();
      if (!release) throw new AppError("busy");
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(REQUEST_DEADLINE_MS)]);
      const output = await deps.provider
        .edit({
          image: normalized.bytes,
          mime: normalized.mime,
          width: normalized.width,
          height: normalized.height,
          prompt,
          signal,
        })
        .catch((error: unknown) => {
          if (signal.aborted && !request.signal.aborted) throw new AppError("timeout", { cause: error });
          throw error;
        });

      log({ event: "transform.success", mood, ms: Date.now() - startedAt, bytes: output.bytes.byteLength });

      // 9. Validated bytes go straight back. Nothing is stored.
      return new Response(new Uint8Array(output.bytes), {
        status: 200,
        headers: {
          "Content-Type": output.mime,
          "Content-Length": String(output.bytes.byteLength),
          "Cache-Control": "no-store",
          "X-Chromafy-Mood": mood,
          "X-Content-Type-Options": "nosniff",
          ...quotaHeaders(reservation.status),
        },
      });
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError("internal", { cause: error });
      let refunded = false;
      if (reservation && REFUNDED_CODES.has(appError.code)) {
        await deps.quota.release(reservation);
        refunded = true;
      }
      log({
        event: "transform.error",
        code: appError.code,
        mood,
        refunded,
        ms: Date.now() - startedAt,
        // Internal failures keep the error class name only; never payloads or messages that may echo data.
        cause: appError.code === "internal" ? describeCause(appError.cause) : undefined,
      });
      return errorResponse(appError.code, appError.retryAfterSeconds);
    } finally {
      release?.();
    }
  };
}

/** The host this request was sent to, as the same-origin check sees it, without the port. */
function requestHostname(request: Request): string | null {
  try {
    return new URL(`http://${request.headers.get("host") ?? new URL(request.url).host}`).hostname;
  } catch {
    return null;
  }
}

function quotaHeaders(status: QuotaStatus): Record<string, string> {
  return {
    "X-Chromafy-Daily-Limit": String(status.limit),
    "X-Chromafy-Daily-Remaining": String(status.remaining),
    "X-Chromafy-Daily-Reset": new Date(status.resetsAt).toISOString(),
  };
}

export function errorResponse(code: ErrorCode, retryAfterSeconds?: number): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfterSeconds) headers["Retry-After"] = String(retryAfterSeconds);
  return Response.json(errorBody(code), { status: new AppError(code).status, headers });
}

function describeCause(cause: unknown): string | undefined {
  return cause instanceof Error ? cause.name : typeof cause;
}

function defaultLog(event: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") return;
  console.info(JSON.stringify(event));
}
