import { describe, expect, it, vi } from "vitest";
import { createTurnstileVerifier, SITEVERIFY_URL } from "@/lib/security/turnstile";

// MOCKED: fetch is replaced; no request reaches Cloudflare.
const respond = (body: unknown) => vi.fn(async () => Response.json(body));

describe("createTurnstileVerifier", () => {
  it("posts the secret, token and client IP to siteverify and accepts success", async () => {
    const fetchMock = respond({ success: true, action: "transform" });
    await createTurnstileVerifier("secret", fetchMock as unknown as typeof fetch)("token-123", "203.0.113.9");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SITEVERIFY_URL);
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("token-123");
    expect(body.get("remoteip")).toBe("203.0.113.9");
    expect(body.get("idempotency_key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ["a missing token", null, { success: true }],
    ["an over-long token", "x".repeat(2049), { success: true }],
    ["a failed verdict", "t", { success: false, "error-codes": ["invalid-input-response"] }],
    ["a token for another action", "t", { success: true, action: "login" }],
  ])("rejects %s", async (_, token, verdict) => {
    await expect(createTurnstileVerifier("s", respond(verdict) as unknown as typeof fetch)(token, null)).rejects.toMatchObject({
      code: "bot_check_failed",
    });
  });

  it("fails closed when siteverify cannot be reached", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createTurnstileVerifier("s", fetchMock as unknown as typeof fetch)("t", null)).rejects.toMatchObject({
      code: "bot_check_unavailable",
    });
  });
});
