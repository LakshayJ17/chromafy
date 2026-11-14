/**
 * MOCKED Cloudflare tests: fetch is replaced, so no request reaches Cloudflare.
 * They prove the request shape we send and how responses are handled, matched
 * to Cloudflare's published FLUX.2 [klein] documentation, not to a live call.
 */
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  CLOUDFLARE_INPUT_MAX_EDGE,
  computeCloudflareOutputSize,
  createCloudflareImageProvider,
  mapCloudflareError,
} from "@/lib/ai/cloudflare-provider";
import { makeImage } from "../helpers/images";

const config = { accountId: "0123456789abcdef0123456789abcdef", apiToken: "test-token-not-real", model: "@cf/black-forest-labs/flux-2-klein-4b" };

async function request(width = 1600, height = 1067) {
  return {
    image: await makeImage("jpeg", width, height),
    mime: "image/jpeg" as const,
    width,
    height,
    prompt: "server prompt",
    signal: new AbortController().signal,
  };
}

const ok = async (format: "jpeg" | "png" = "jpeg") =>
  Response.json({ success: true, errors: [], result: { image: (await makeImage(format, 1024, 688)).toString("base64") } });

describe("createCloudflareImageProvider", () => {
  it("sends the documented multipart request with a sub-512px reference image", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => ok());
    const provider = createCloudflareImageProvider(config, fetchMock as unknown as typeof fetch);

    const result = await provider.edit(await request());

    expect(result).toMatchObject({ mime: "image/jpeg", width: 1024, height: 688 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token-not-real");
    expect(init.redirect).toBe("error");

    const form = init.body as FormData;
    expect(form.get("prompt")).toBe("Edit image 0, the input photograph. server prompt");
    expect(form.get("width")).toBe("1024");
    expect(form.get("height")).toBe("688");
    const reference = Buffer.from(await (form.get("input_image_0") as Blob).arrayBuffer());
    const meta = await sharp(reference).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(CLOUDFLARE_INPUT_MAX_EDGE);
    expect(Math.max(meta.width!, meta.height!)).toBeLessThan(512);
    expect([...form.keys()].sort()).toEqual(["height", "input_image_0", "prompt", "width"]);
  });

  it("accepts PNG output by signature", async () => {
    const provider = createCloudflareImageProvider(config, vi.fn(async () => ok("png")) as unknown as typeof fetch);
    expect((await provider.edit(await request())).mime).toBe("image/png");
  });

  it.each([
    ["an error envelope with HTTP 200", { success: false, errors: [{ message: "x" }], result: null }],
    ["a missing image", { success: true, result: {} }],
    ["non-base64 image data", { success: true, result: { image: "%%%" } }],
    ["base64 that is not an image", { success: true, result: { image: Buffer.from("not an image at all, sorry").toString("base64") } }],
  ])("rejects %s as invalid output", async (_, body) => {
    const provider = createCloudflareImageProvider(config, vi.fn(async () => Response.json(body)) as unknown as typeof fetch);
    await expect(provider.edit(await request())).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("rejects a non-JSON body", async () => {
    const provider = createCloudflareImageProvider(config, vi.fn(async () => new Response("<html>gateway</html>")) as unknown as typeof fetch);
    await expect(provider.edit(await request())).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("refuses an oversized response without buffering it all", async () => {
    const huge = new Response("x", { headers: { "content-length": String(500 * 1024 * 1024) } });
    const provider = createCloudflareImageProvider(config, vi.fn(async () => huge) as unknown as typeof fetch);
    await expect(provider.edit(await request())).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("retries a 5xx once, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: false, errors: [{ message: "Internal error" }] }, { status: 502 }))
      .mockImplementationOnce(async () => ok());
    const provider = createCloudflareImageProvider(config, fetchMock as unknown as typeof fetch);
    await expect(provider.edit(await request())).resolves.toMatchObject({ mime: "image/jpeg" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry auth, quota or safety failures", async () => {
    for (const [status, message] of [
      [401, "Authentication error"],
      [429, "You have used up your daily free allocation of 10,000 neurons"],
      [400, "Input was flagged as NSFW"],
    ] as const) {
      const fetchMock = vi.fn(async () => Response.json({ success: false, errors: [{ message }] }, { status }));
      const provider = createCloudflareImageProvider(config, fetchMock as unknown as typeof fetch);
      await expect(provider.edit(await request())).rejects.toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("maps network failures and cancellation", async () => {
    const network = createCloudflareImageProvider(config, vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch);
    await expect(network.edit(await request())).rejects.toMatchObject({ code: "provider_unavailable" });

    const controller = new AbortController();
    controller.abort();
    const aborted = createCloudflareImageProvider(config, vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")) as unknown as typeof fetch);
    await expect(aborted.edit({ ...(await request()), signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("mapCloudflareError", () => {
  it.each([
    [401, "", "provider_auth"],
    [403, "", "provider_auth"],
    [429, "Rate limited, slow down", "provider_rate_limited"],
    [429, "daily free allocation of 10,000 neurons used", "provider_quota"],
    [400, "Input flagged as NSFW", "provider_safety"],
    [400, "Bad input: width out of range", "provider_rejected"],
    [504, "", "timeout"],
    [500, "", "provider_unavailable"],
  ])("maps %i %s", (status, message, code) => {
    expect(mapCloudflareError(status, message).code).toBe(code);
  });
});

describe("computeCloudflareOutputSize", () => {
  it.each([
    [1600, 1067],
    [1067, 1600],
    [2048, 512],
    [300, 3000],
  ])("keeps %ix%i within the documented 256 to 1920 range at a 1024px long edge", (width, height) => {
    const size = computeCloudflareOutputSize(width, height);
    for (const edge of [size.width, size.height]) {
      expect(edge).toBeGreaterThanOrEqual(256);
      expect(edge).toBeLessThanOrEqual(1920);
      expect(edge % 16).toBe(0);
    }
    expect(Math.max(size.width, size.height)).toBe(1024);
  });
});
