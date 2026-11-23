import { describe, expect, it, vi } from "vitest";
import { createTurnstileVerifier, SITEVERIFY_URL } from "@/lib/security/turnstile";

// MOCKED: fetch is replaced; no request reaches Cloudflare.
const respond = (body: unknown) => vi.fn(async () => Response.json(body));

describe("createTurnstileVerifier", () => {
  it("posts the secret, token and client IP to siteverify and accepts success", async () => {
    const fetchMock = respond({ success: true, action: "transform", hostname: "chromafy.example" });
    await createTurnstileVerifier("secret", fetchMock as unknown as typeof fetch)("token-123", "203.0.113.9", "chromafy.example");
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
    ["a token for another action", "t", { success: true, action: "login", hostname: "chromafy.example" }],
  ])("rejects %s", async (_, token, verdict) => {
    await expect(createTurnstileVerifier("s", respond(verdict) as unknown as typeof fetch)(token, null, "chromafy.example")).rejects.toMatchObject({
      code: "bot_check_failed",
    });
  });

  // The site key is public and widgets often allow localhost for testing, so anyone could solve
  // the check on their own machine and replay the token against the live API.
  it("rejects a token solved on a different hostname from the one the request came to", async () => {
    const verify = createTurnstileVerifier("secret", respond({ success: true, action: "transform", hostname: "localhost" }) as unknown as typeof fetch);
    await expect(verify("t", null, "chromafy.example")).rejects.toMatchObject({ code: "bot_check_failed" });
  });

  it("rejects a verdict that does not say where the check was solved", async () => {
    const verify = createTurnstileVerifier("secret", respond({ success: true, action: "transform" }) as unknown as typeof fetch);
    await expect(verify("t", null, "chromafy.example")).rejects.toMatchObject({ code: "bot_check_failed" });
  });

  it("accepts a token solved on the same hostname", async () => {
    const verify = createTurnstileVerifier("secret", respond({ success: true, action: "transform", hostname: "chromafy.example" }) as unknown as typeof fetch);
    await expect(verify("t", null, "chromafy.example")).resolves.toBeUndefined();
  });

  it("skips the hostname for Cloudflare's test keys, which always report example.com (production refuses them)", async () => {
    const verify = createTurnstileVerifier("1x0000000000000000000000000000000AA", respond({ success: true, hostname: "example.com" }) as unknown as typeof fetch);
    await expect(verify("t", null, "localhost")).resolves.toBeUndefined();
  });

  it("fails closed when siteverify cannot be reached", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createTurnstileVerifier("s", fetchMock as unknown as typeof fetch)("t", null, "chromafy.example")).rejects.toMatchObject({
      code: "bot_check_unavailable",
    });
  });
});
