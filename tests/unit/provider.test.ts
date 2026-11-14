import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";
import { describe, expect, it, vi } from "vitest";
import { createOpenAIImageProvider, mapProviderError } from "@/lib/ai/image-provider";
import { makeImage } from "../helpers/images";

// Mocked provider tests: the SDK call is replaced, no network request or credits are used.
const headers = new Headers();
const apiError = (Kind: typeof BadRequestError | typeof RateLimitError | typeof AuthenticationError | typeof PermissionDeniedError, status: number, code?: string) =>
  new Kind(status as never, { code, message: "provider detail that must not leak" }, "provider detail", headers);

describe("mapProviderError", () => {
  it.each([
    ["authentication", apiError(AuthenticationError, 401), "provider_auth"],
    ["permission", apiError(PermissionDeniedError, 403), "provider_auth"],
    ["rate limit", apiError(RateLimitError, 429, "rate_limit_exceeded"), "provider_rate_limited"],
    ["quota", apiError(RateLimitError, 429, "insufficient_quota"), "provider_quota"],
    ["moderation", apiError(BadRequestError, 400, "moderation_blocked"), "provider_safety"],
    ["other 400", apiError(BadRequestError, 400, "invalid_value"), "provider_rejected"],
    ["5xx", new InternalServerError(500, {}, "boom", headers), "provider_unavailable"],
    ["network", new APIConnectionError({ message: "socket hang up" }), "provider_unavailable"],
    ["timeout", new APIConnectionTimeoutError(), "timeout"],
    ["abort", new APIUserAbortError(), "cancelled"],
    ["unknown", new TypeError("x"), "internal"],
  ])("maps %s", (_, error, expected) => {
    expect(mapProviderError(error).code).toBe(expected);
  });
});

describe("createOpenAIImageProvider", () => {
  const config = { apiKey: "test-key-not-real", model: "gpt-image-2.5-sunburst" };
  const request = async () => ({
    image: await makeImage("jpeg", 600, 400),
    mime: "image/jpeg" as const,
    prompt: "server prompt",
    width: 1500,
    height: 1000,
    keepOriginalDetail: true,
    signal: new AbortController().signal,
  });

  it("sends only server-chosen parameters and returns validated bytes", async () => {
    const output = await makeImage("jpeg", 1504, 1008);
    const call = vi.fn(async () => ({ created: 1, data: [{ b64_json: output.toString("base64") }] }));
    const provider = createOpenAIImageProvider(config, call);

    const result = await provider.edit(await request());

    expect(result).toMatchObject({ mime: "image/jpeg", width: 1504, height: 1008 });
    const [params] = call.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params).toMatchObject({
      model: "gpt-image-2.5-sunburst",
      prompt: "server prompt",
      n: 1,
      size: "1536x1024",
      output_format: "jpeg",
    });
    expect(params).not.toHaveProperty("moderation");
  });

  it("rejects a response with no image", async () => {
    const provider = createOpenAIImageProvider(config, vi.fn(async () => ({ created: 1, data: [] })));
    await expect(provider.edit(await request())).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("rejects a response whose image is not the requested format", async () => {
    const png = await makeImage("png", 512, 512);
    const provider = createOpenAIImageProvider(config, vi.fn(async () => ({ created: 1, data: [{ b64_json: png.toString("base64") }] })));
    await expect(provider.edit(await request())).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("retries a transient failure exactly once", async () => {
    const output = await makeImage("jpeg", 512, 512);
    const call = vi
      .fn()
      .mockRejectedValueOnce(new InternalServerError(502, {}, "bad gateway", headers))
      .mockResolvedValueOnce({ created: 1, data: [{ b64_json: output.toString("base64") }] });
    const provider = createOpenAIImageProvider(config, call);
    await expect(provider.edit(await request())).resolves.toMatchObject({ mime: "image/jpeg" });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not retry safety rejections or quota errors", async () => {
    for (const error of [apiError(BadRequestError, 400, "moderation_blocked"), apiError(RateLimitError, 429, "insufficient_quota")]) {
      const call = vi.fn().mockRejectedValue(error);
      const provider = createOpenAIImageProvider(config, call);
      await expect(provider.edit(await request())).rejects.toBeDefined();
      expect(call).toHaveBeenCalledTimes(1);
    }
  });

  it("gives up after one retry", async () => {
    const call = vi.fn().mockRejectedValue(new InternalServerError(500, {}, "down", headers));
    const provider = createOpenAIImageProvider(config, call);
    await expect(provider.edit(await request())).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(call).toHaveBeenCalledTimes(2);
  });
});
