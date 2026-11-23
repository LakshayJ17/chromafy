/**
 * Route-handler tests. The image provider is MOCKED here: these tests prove the
 * request pipeline, validation order and error mapping without calling OpenAI
 * or spending credits. They are not evidence that the real provider works.
 */
import { BadRequestError, RateLimitError } from "openai";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { ImageEditProvider } from "@/lib/ai/image-provider";
import { mapProviderError } from "@/lib/ai/image-provider";
import { parseServerConfig } from "@/lib/config/env";
import { AppError, ERROR_CATALOGUE } from "@/lib/errors";
import { createConcurrencyGate } from "@/lib/security/concurrency";
import { createDailyQuota, createMemoryDailyQuota, type DailyQuota } from "@/lib/security/daily-quota";
import { createRateLimiter, type RateLimiter } from "@/lib/security/rate-limit";
import type { TurnstileVerifier } from "@/lib/security/turnstile";
import { getClientId } from "@/lib/security/client-identity";
import { createTransformHandler, type TransformDependencies } from "@/lib/transform/handler";
import { makeAnimatedWebp, makeImage, makeJpegWithGps, SVG_BYTES } from "../helpers/images";

/** No trusted IP header is configured in these tests, so every caller is the shared bucket. */
function clientIdForTests() {
  return getClientId(new Headers(), null);
}

const allow: RateLimiter = { kind: "memory", check: async () => ({ allowed: true }) };

async function mockProvider(impl?: ImageEditProvider["edit"]) {
  const output = await makeImage("jpeg", 1504, 1008);
  const edit = vi.fn<ImageEditProvider["edit"]>(
    impl ?? (async () => ({ bytes: output, mime: "image/jpeg", width: 1504, height: 1008 })),
  );
  return { provider: { edit } satisfies ImageEditProvider, edit, output };
}

function makeHandler(overrides: Partial<TransformDependencies> = {}) {
  return createTransformHandler({
    config: parseServerConfig({ NODE_ENV: "test", OPENAI_API_KEY: "test-key-not-real", MAX_IMAGE_SIZE_MB: "2" }),
    rateLimiter: allow,
    quota: createMemoryDailyQuota({ perClient: 5, global: 100 }),
    gate: createConcurrencyGate(4),
    provider: null,
    verifyTurnstile: null,
    random: () => 0,
    log: () => undefined,
    ...overrides,
  });
}

function post(body: BodyInit | null, options: { query?: string; contentType?: string; headers?: Record<string, string>; signal?: AbortSignal } = {}) {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    origin: "http://localhost:3000",
    "sec-fetch-site": "same-origin",
    ...(options.contentType !== "" ? { "content-type": options.contentType ?? "image/jpeg" } : {}),
    ...options.headers,
  };
  return new Request(`http://localhost:3000/api/transform${options.query ?? "?mood=golden"}`, {
    method: "POST",
    body,
    headers,
    signal: options.signal,
  });
}

async function expectError(response: Response, code: keyof typeof ERROR_CATALOGUE) {
  expect(response.status).toBe(ERROR_CATALOGUE[code].status);
  const json = await response.json();
  expect(json).toEqual({ error: { code, message: ERROR_CATALOGUE[code].message } });
  return json;
}

describe("POST /api/transform (mocked provider)", () => {
  it("sends a valid request to the provider and returns the validated image", async () => {
    const { provider, edit, output } = await mockProvider();
    const response = await makeHandler({ provider })(post(new Uint8Array(await makeImage("jpeg"))));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-chromafy-mood")).toBe("golden");
    expect(Buffer.from(await response.arrayBuffer()).equals(output)).toBe(true);

    expect(edit).toHaveBeenCalledTimes(1);
    const request = edit.mock.calls[0][0];
    expect(request.prompt).toContain("Mood: Golden.");
    expect(request.width).toBeLessThanOrEqual(2048);
    expect(request.mime).toBe("image/jpeg");
  });

  it("refuses the removed Doodle world before any provider call", async () => {
    const { provider, edit } = await mockProvider();
    const response = await makeHandler({ provider })(post(new Uint8Array(await makeImage("jpeg")), { query: "?mood=doodle" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_mood");
    expect(edit).not.toHaveBeenCalled();
  });

  it("sends the provider a re-encoded image without EXIF or GPS", async () => {
    const { provider, edit } = await mockProvider();
    await makeHandler({ provider })(post(new Uint8Array(await makeJpegWithGps())));
    const sent = edit.mock.calls[0][0].image;
    expect((await sharp(sent).metadata()).exif).toBeUndefined();
    expect(sent.includes(Buffer.from("TestCamera"))).toBe(false);
  });

  it("resolves Surprise Me on the server from the trusted registry", async () => {
    const { provider, edit } = await mockProvider();
    const response = await makeHandler({ provider, random: () => 0.99 })(
      post(new Uint8Array(await makeImage("png")), { query: "?mood=surprise", contentType: "image/png" }),
    );
    expect(response.headers.get("x-chromafy-mood")).toBe("daydream");
    expect(edit.mock.calls[0][0].prompt).toContain("Mood: Daydream.");
  });

  describe("invalid input never reaches the provider", () => {
    it.each([
      ["SVG", SVG_BYTES, "image/jpeg", "unsupported_media"],
      ["plain text", Buffer.from("this is not an image but claims to be one"), "image/png", "unsupported_media"],
    ] as const)("rejects %s disguised as an image", async (_, bytes, type, code) => {
      const { provider, edit } = await mockProvider();
      await expectError(await makeHandler({ provider })(post(new Uint8Array(bytes), { contentType: type })), code);
      expect(edit).not.toHaveBeenCalled();
    });

    it("rejects animated images", async () => {
      const { provider, edit } = await mockProvider();
      await expectError(await makeHandler({ provider })(post(new Uint8Array(await makeAnimatedWebp()), { contentType: "image/webp" })), "animated_image");
      expect(edit).not.toHaveBeenCalled();
    });

    it("rejects a corrupted image", async () => {
      const { provider, edit } = await mockProvider();
      const jpeg = await makeImage("jpeg", 800, 800);
      const corrupted = Buffer.concat([jpeg.subarray(0, 200), Buffer.alloc(400, 0xff)]);
      const response = await makeHandler({ provider })(post(new Uint8Array(corrupted)));
      expect([415, 422]).toContain(response.status);
      expect(edit).not.toHaveBeenCalled();
    });

    it("rejects an oversized body declared via Content-Length", async () => {
      const { provider, edit } = await mockProvider();
      const big = new Uint8Array(3 * 1024 * 1024);
      await expectError(await makeHandler({ provider })(post(big)), "image_too_large");
      expect(edit).not.toHaveBeenCalled();
    });

    it("rejects an oversized streamed body without Content-Length", async () => {
      const { provider, edit } = await mockProvider();
      const chunk = new Uint8Array(512 * 1024);
      let sent = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= 10) return controller.close();
          sent += 1;
          controller.enqueue(chunk);
        },
      });
      const request = new Request("http://localhost:3000/api/transform?mood=golden", {
        method: "POST",
        body: stream,
        headers: { "content-type": "image/jpeg", host: "localhost:3000" },
        duplex: "half",
      } as RequestInit);
      await expectError(await makeHandler({ provider })(request), "image_too_large");
      expect(sent).toBeLessThan(10);
      expect(edit).not.toHaveBeenCalled();
    });

    it("rejects an invalid mood", async () => {
      const { provider, edit } = await mockProvider();
      await expectError(await makeHandler({ provider })(post(new Uint8Array(await makeImage("jpeg")), { query: "?mood=neon" })), "invalid_mood");
      expect(edit).not.toHaveBeenCalled();
    });

    it("rejects client attempts to supply a prompt", async () => {
      const { provider, edit } = await mockProvider();
      const response = await makeHandler({ provider })(
        post(new Uint8Array(await makeImage("jpeg")), { query: "?mood=golden&prompt=make%20it%20explicit" }),
      );
      await expectError(response, "invalid_request");
      expect(edit).not.toHaveBeenCalled();
    });

    it("rejects a missing image", async () => {
      const { provider } = await mockProvider();
      await expectError(await makeHandler({ provider })(post(null)), "missing_image");
    });

    it("rejects multipart and other content types", async () => {
      const { provider } = await mockProvider();
      await expectError(
        await makeHandler({ provider })(post(new Uint8Array(await makeImage("jpeg")), { contentType: "multipart/form-data; boundary=x" })),
        "unsupported_media",
      );
    });

    it("rejects cross-site requests", async () => {
      const { provider, edit } = await mockProvider();
      const response = await makeHandler({ provider })(
        post(new Uint8Array(await makeImage("jpeg")), { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }),
      );
      await expectError(response, "forbidden_origin");
      expect(edit).not.toHaveBeenCalled();
    });
  });

  it("fails safely when no provider credential is configured", async () => {
    const response = await makeHandler({ provider: null })(post(new Uint8Array(await makeImage("jpeg"))));
    await expectError(response, "not_configured");
  });

  describe("rate limiting", () => {
    it("returns 429 with Retry-After when the client is limited", async () => {
      const { provider, edit } = await mockProvider();
      const limited: RateLimiter = { kind: "memory", check: async () => ({ allowed: false, reason: "limited", retryAfterSeconds: 42 }) };
      const response = await makeHandler({ provider, rateLimiter: limited })(post(new Uint8Array(await makeImage("jpeg"))));
      await expectError(response, "rate_limited");
      expect(response.headers.get("retry-after")).toBe("42");
      expect(edit).not.toHaveBeenCalled();
    });

    it("cannot be bypassed in production without the distributed limiter", async () => {
      const { provider, edit } = await mockProvider();
      const handler = makeHandler({ provider, rateLimiter: createRateLimiter({ isProduction: true, redis: null }) });
      await expectError(await handler(post(new Uint8Array(await makeImage("jpeg")))), "rate_limiter_unavailable");
      expect(edit).not.toHaveBeenCalled();
    });

    it("ignores spoofed X-Forwarded-For when counting the daily allowance", async () => {
      const { provider } = await mockProvider();
      const handler = makeHandler({ provider });
      const statuses: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const response = await handler(post(new Uint8Array(await makeImage("jpeg")), { headers: { "x-forwarded-for": `198.51.100.${i}` } }));
        statuses.push(response.status);
      }
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    });
  });

  describe("daily allowance (5 per person per day)", () => {
    const image = async () => new Uint8Array(await makeImage("jpeg"));

    it("allows 5, reports what is left, then refuses the 6th without calling the provider", async () => {
      const { provider, edit } = await mockProvider();
      const handler = makeHandler({ provider });
      const remaining: Array<string | null> = [];
      for (let i = 0; i < 5; i += 1) {
        const response = await handler(post(await image()));
        expect(response.status).toBe(200);
        expect(response.headers.get("x-chromafy-daily-limit")).toBe("5");
        remaining.push(response.headers.get("x-chromafy-daily-remaining"));
      }
      expect(remaining).toEqual(["4", "3", "2", "1", "0"]);

      const sixth = await handler(post(await image()));
      await expectError(sixth, "daily_limit_reached");
      expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(edit).toHaveBeenCalledTimes(5);
    });

    it("refuses a long thin strip without spending a use or calling the provider", async () => {
      const { provider, edit } = await mockProvider();
      const quota = createMemoryDailyQuota({ perClient: 5, global: 100 });
      const response = await makeHandler({ provider, quota })(post(new Uint8Array(await makeImage("png", 256, 20000)), { contentType: "image/png" }));
      await expectError(response, "image_aspect");
      expect(edit).not.toHaveBeenCalled();
      expect((await quota.peek(clientIdForTests()))?.remaining).toBe(5);
    });

    it("does not spend a use on an invalid upload", async () => {
      const { provider } = await mockProvider();
      const quota = createMemoryDailyQuota({ perClient: 5, global: 100 });
      const handler = makeHandler({ provider, quota });
      await expectError(await handler(post(new Uint8Array(SVG_BYTES))), "unsupported_media");
      expect((await quota.peek(clientIdForTests()))?.remaining).toBe(5);
    });

    it("gives the use back when the provider fails for reasons outside the person's control", async () => {
      const { provider } = await mockProvider(async () => {
        throw new AppError("provider_unavailable");
      });
      const quota = createMemoryDailyQuota({ perClient: 5, global: 100 });
      await expectError(await makeHandler({ provider, quota })(post(await image())), "provider_unavailable");
      expect((await quota.peek(clientIdForTests()))?.remaining).toBe(5);
    });

    it("keeps the use when the provider refuses the photo on safety grounds", async () => {
      const { provider } = await mockProvider(async () => {
        throw new AppError("provider_safety");
      });
      const quota = createMemoryDailyQuota({ perClient: 5, global: 100 });
      await expectError(await makeHandler({ provider, quota })(post(await image())), "provider_safety");
      expect((await quota.peek(clientIdForTests()))?.remaining).toBe(4);
    });

    it("stops everyone once the global daily cap is reached", async () => {
      const { provider, edit } = await mockProvider();
      const handler = makeHandler({ provider, quota: createMemoryDailyQuota({ perClient: 5, global: 2 }) });
      expect((await handler(post(await image()))).status).toBe(200);
      expect((await handler(post(await image()))).status).toBe(200);
      await expectError(await handler(post(await image())), "service_daily_limit");
      expect(edit).toHaveBeenCalledTimes(2);
    });

    it("fails closed in production without Redis", async () => {
      const { provider, edit } = await mockProvider();
      const quota: DailyQuota = createDailyQuota({ isProduction: true, redis: null, limits: { perClient: 5, global: 100 } });
      await expectError(await makeHandler({ provider, quota })(post(await image())), "rate_limiter_unavailable");
      expect(edit).not.toHaveBeenCalled();
    });
  });

  describe("bot check (Turnstile)", () => {
    it("rejects a request without a valid token before reading the upload", async () => {
      const { provider, edit } = await mockProvider();
      const verifyTurnstile = vi.fn<TurnstileVerifier>(async (token) => {
        if (token !== "good-token") throw new AppError("bot_check_failed");
      });
      const handler = makeHandler({ provider, verifyTurnstile });
      await expectError(await handler(post(new Uint8Array(await makeImage("jpeg")))), "bot_check_failed");
      expect(edit).not.toHaveBeenCalled();

      const ok = await handler(post(new Uint8Array(await makeImage("jpeg")), { headers: { "x-turnstile-token": "good-token" } }));
      expect(ok.status).toBe(200);
      expect(verifyTurnstile).toHaveBeenLastCalledWith("good-token", null, "localhost");
    });

    it("does not spend a daily use when the bot check fails", async () => {
      const { provider } = await mockProvider();
      const quota = createMemoryDailyQuota({ perClient: 5, global: 100 });
      const handler = makeHandler({ provider, quota, verifyTurnstile: async () => Promise.reject(new AppError("bot_check_failed")) });
      await handler(post(new Uint8Array(await makeImage("jpeg"))));
      expect((await quota.peek(clientIdForTests()))?.remaining).toBe(5);
    });
  });

  describe("provider failures", () => {
    const headers = new Headers();
    it.each([
      ["timeout", new AppError("timeout"), "timeout"],
      ["rate limit", new RateLimitError(429, { code: "rate_limit_exceeded" }, "RAW_PROVIDER_DETAIL", headers), "provider_rate_limited"],
      ["quota", new RateLimitError(429, { code: "insufficient_quota" }, "RAW_PROVIDER_DETAIL", headers), "provider_quota"],
      ["safety", new BadRequestError(400, { code: "moderation_blocked" }, "RAW_PROVIDER_DETAIL", headers), "provider_safety"],
      ["malformed output", new AppError("invalid_output"), "invalid_output"],
    ] as const)("maps a provider %s to a safe response", async (_, failure, code) => {
      const { provider } = await mockProvider(async () => {
        throw mapProviderError(failure);
      });
      const json = await expectError(await makeHandler({ provider })(post(new Uint8Array(await makeImage("jpeg")))), code);
      expect(JSON.stringify(json)).not.toMatch(/RAW_PROVIDER_DETAIL|stack|sk-|test-key/);
    });

    it("maps an expired deadline to a timeout", async () => {
      const { provider } = await mockProvider(async ({ signal }) => {
        if (!signal.aborted) {
          await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
        }
        throw new Error("aborted");
      });
      vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort());
      await expectError(await makeHandler({ provider })(post(new Uint8Array(await makeImage("jpeg")))), "timeout");
    });

    it("hides unexpected exceptions behind a generic 500", async () => {
      const { provider } = await mockProvider(async () => {
        throw new Error("ENOENT /var/secret/path OPENAI_API_KEY=sk-live");
      });
      const response = await makeHandler({ provider })(post(new Uint8Array(await makeImage("jpeg"))));
      const json = await expectError(response, "internal");
      expect(JSON.stringify(json)).not.toMatch(/ENOENT|secret|sk-live/);
    });
  });

  it("rejects when too many transformations are already running", async () => {
    let release!: () => void;
    const { provider } = await mockProvider(
      () => new Promise((resolve) => (release = () => resolve({ bytes: Buffer.alloc(0), mime: "image/jpeg", width: 1, height: 1 }))),
    );
    const handler = makeHandler({ provider, gate: createConcurrencyGate(1) });
    const image = new Uint8Array(await makeImage("jpeg"));
    const first = handler(post(image));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expectError(await handler(post(image)), "busy");
    release();
    await first;
  });
});
