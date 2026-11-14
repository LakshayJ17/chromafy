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

export type TurnstileVerifier = (token: string | null, remoteIp: string | null) => Promise<void>;

export function createTurnstileVerifier(secret: string, fetchImpl: typeof fetch = fetch): TurnstileVerifier {
  return async (token, remoteIp) => {
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

    const verdict = result as { success?: unknown; action?: unknown };
    if (verdict?.success !== true) throw new AppError("bot_check_failed");
    // A token minted for a different widget action must not unlock this endpoint.
    if (typeof verdict.action === "string" && verdict.action !== "" && verdict.action !== TURNSTILE_ACTION) {
      throw new AppError("bot_check_failed");
    }
  };
}
