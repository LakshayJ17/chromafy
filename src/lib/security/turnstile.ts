import "server-only";
import { AppError } from "@/lib/errors";

/**
 * Cloudflare Turnstile server-side validation
 * (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
 * Tokens are single use, valid for 300 seconds and at most 2048 characters.
 */
export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_ACTION = "transform";
const MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 10_000;

/** Cloudflare's documented dummy keys (1x/2x/3x then zeros). They pass any token and report example.com. */
export const TURNSTILE_TEST_KEY = /^[123]x0{20}/;

/** `hostname` is the host the request was sent to; the check must have been solved on that same host. */
export type TurnstileVerifier = (token: string | null, remoteIp: string | null, hostname: string | null) => Promise<void>;

export function createTurnstileVerifier(secret: string, fetchImpl: typeof fetch = fetch): TurnstileVerifier {
  const isTestKey = TURNSTILE_TEST_KEY.test(secret);
  return async (token, remoteIp, hostname) => {
    if (!token || token.length > MAX_TOKEN_LENGTH) throw new AppError("bot_check_failed");

    const body = new URLSearchParams({ secret, response: token, idempotency_key: crypto.randomUUID() });
    if (remoteIp) body.set("remoteip", remoteIp);

    let result: unknown;
    try {
      const response = await fetchImpl(SITEVERIFY_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        redirect: "error",
        cache: "no-store",
      });
      result = await response.json();
    } catch (cause) {
      // Fail closed: if the check cannot run, the expensive work does not run either.
      throw new AppError("bot_check_unavailable", { cause });
    }

    const verdict = result as { success?: unknown; action?: unknown; hostname?: unknown };
    if (verdict?.success !== true) throw new AppError("bot_check_failed");
    // The site key is public, and a widget may also allow localhost for testing. Without this,
    // a token solved on someone else's page or machine would unlock this server.
    if (!isTestKey && (typeof verdict.hostname !== "string" || !hostname || verdict.hostname.toLowerCase() !== hostname.toLowerCase())) {
      throw new AppError("bot_check_failed");
    }
    // A token minted for a different widget action must not unlock this endpoint.
    if (typeof verdict.action === "string" && verdict.action !== "" && verdict.action !== TURNSTILE_ACTION) {
      throw new AppError("bot_check_failed");
    }
  };
}
