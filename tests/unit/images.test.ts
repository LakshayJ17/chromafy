import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { computeOutputSize, normalizeImage, NORMALIZED_MAX_EDGE } from "@/lib/images/normalize-image";
import { validateImage } from "@/lib/images/validate-image";
import { decodeBase64Image, validateOutputImage } from "@/lib/images/validate-output";
import {
  makeAnimatedWebp,
  makeGif,
  makeHugeDimensionPng,
  makeImage,
  makeJpegWithGps,
  SVG_BYTES,
  truncate,
} from "../helpers/images";

const limits = { maxBytes: 10 * 1024 * 1024, maxPixels: 20_000_000 };

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof AppError && error.code === code);
}

describe("validateImage", () => {
  it.each(["jpeg", "png", "webp"] as const)("accepts a static %s by its signature", async (format) => {
    const result = await validateImage(await makeImage(format), limits);
    expect(result.mime).toBe(`image/${format}`);
    expect(result).toMatchObject({ width: 640, height: 480 });
  });

  it("identifies files by content, not by any claimed name or type", async () => {
    // A PNG body is still a PNG, whatever the client called it.
    const png = await makeImage("png");
    expect((await validateImage(png, limits)).mime).toBe("image/png");
  });

  it("rejects an empty upload", async () => {
    await expectCode(validateImage(new Uint8Array(), limits), "missing_image");
  });

  it("rejects files over the byte limit before decoding", async () => {
    const jpeg = await makeImage("jpeg");
    await expectCode(validateImage(jpeg, { ...limits, maxBytes: 100 }), "image_too_large");
  });

  it.each([
    ["SVG with script", SVG_BYTES],
    ["plain text renamed as an image", Buffer.from("definitely not an image, just text that is long enough")],
  ])("rejects %s as unsupported", async (_, bytes) => {
    await expectCode(validateImage(bytes, limits), "unsupported_media");
  });

  it("rejects GIF, which is outside the allowlist", async () => {
    await expectCode(validateImage(await makeGif(), limits), "unsupported_media");
  });

  it("rejects animated WebP", async () => {
    await expectCode(validateImage(await makeAnimatedWebp(), limits), "animated_image");
  });

  it("rejects a header that claims more pixels than allowed (decompression bomb)", async () => {
    const result = validateImage(await makeHugeDimensionPng(), limits);
    await expect(result).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && ["image_dimensions", "invalid_image"].includes(error.code),
    );
  });

  it("enforces the configured pixel limit on genuine images", async () => {
    await expectCode(validateImage(await makeImage("png", 2000, 1500), { ...limits, maxPixels: 2_000_000 }), "image_dimensions");
  });

  it("rejects images that are too small to transform", async () => {
    await expectCode(validateImage(await makeImage("png", 100, 400), limits), "image_too_small");
  });

  it("rejects a truncated JPEG during the full decode in normalization", async () => {
    const big = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#333" } })
      .composite([{ input: Buffer.from('<svg width="900" height="700"><circle cx="400" cy="300" r="250" fill="#e3a"/></svg>') }])
      .jpeg()
      .toBuffer();
    const broken = truncate(big, 0.5);
    let error: unknown;
    try {
      const validated = await validateImage(broken, limits);
      await normalizeImage(validated, limits.maxPixels);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("invalid_image");
  });
});

describe("normalizeImage", () => {
  it("re-encodes as JPEG and strips EXIF including GPS", async () => {
    const input = await makeJpegWithGps();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();

    const validated = await validateImage(input, limits);
    const normalized = await normalizeImage(validated, limits.maxPixels);
    const after = await sharp(normalized.bytes).metadata();

    expect(normalized.mime).toBe("image/jpeg");
    expect(after.format).toBe("jpeg");
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(normalized.bytes.includes(Buffer.from("TestCamera"))).toBe(false);
  });

  it("bounds the longest edge and keeps the aspect ratio", async () => {
    const validated = await validateImage(await makeImage("png", 4000, 2000), limits);
    const normalized = await normalizeImage(validated, limits.maxPixels);
    expect(normalized.width).toBe(NORMALIZED_MAX_EDGE);
    expect(normalized.height).toBe(NORMALIZED_MAX_EDGE / 2);
  });

  it("flattens transparency onto an opaque background", async () => {
    const validated = await validateImage(await makeImage("png", 400, 400, { alpha: true }), limits);
    const normalized = await normalizeImage(validated, limits.maxPixels);
    expect((await sharp(normalized.bytes).metadata()).hasAlpha).toBe(false);
  });
});

describe("computeOutputSize", () => {
  it.each([
    [1600, 1067],
    [1067, 1600],
    [1000, 1000],
    [4000, 1000],
    [500, 3000],
  ])("produces a valid provider size for %ix%i", (width, height) => {
    const size = computeOutputSize(width, height);
    expect(size.width % 16).toBe(0);
    expect(size.height % 16).toBe(0);
    expect(size.width * size.height).toBeGreaterThanOrEqual(655_360);
    expect(size.width * size.height).toBeLessThanOrEqual(8_294_400);
    expect(Math.max(size.width, size.height) / Math.min(size.width, size.height)).toBeLessThanOrEqual(3);
  });

  it("follows the source aspect ratio closely", () => {
    const size = computeOutputSize(1600, 1067);
    expect(size.width / size.height).toBeCloseTo(1600 / 1067, 1);
  });
});

describe("provider output validation", () => {
  it("accepts a decodable JPEG of the requested type", async () => {
    const jpeg = await makeImage("jpeg", 512, 512);
    const result = await validateOutputImage(decodeBase64Image(jpeg.toString("base64")), "image/jpeg");
    expect(result).toMatchObject({ mime: "image/jpeg", width: 512, height: 512 });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["not base64", "%%%not-base64%%%"],
    ["a number", 42],
  ])("rejects %s base64 payloads", (_, value) => {
    expect(() => decodeBase64Image(value)).toThrow(AppError);
  });

  it("rejects output of an unexpected format", async () => {
    const png = await makeImage("png", 512, 512);
    await expectCode(validateOutputImage(png, "image/jpeg"), "invalid_output");
  });

  it("rejects corrupt output", async () => {
    const jpeg = await makeImage("jpeg", 900, 900);
    await expectCode(validateOutputImage(truncate(jpeg, 0.3), "image/jpeg"), "invalid_output");
  });

  it("rejects non-image bytes", async () => {
    await expectCode(validateOutputImage(Buffer.from("hello world, not an image at all"), "image/jpeg"), "invalid_output");
  });
});
