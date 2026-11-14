import "server-only";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { AppError } from "@/lib/errors";

export const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 8_294_400;
const MIN_OUTPUT_SIDE = 64;

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export type OutputImage = { bytes: Buffer; mime: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number };

/** Decodes a provider's base64 payload without trusting its length, alphabet or content. */
export function decodeBase64Image(value: unknown): Buffer {
  if (typeof value !== "string" || value.length === 0) throw new AppError("invalid_output");
  // 4 base64 characters encode 3 bytes; refuse before allocating an oversized buffer.
  if ((value.length / 4) * 3 > MAX_OUTPUT_BYTES + 3) throw new AppError("invalid_output");
  if (value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) throw new AppError("invalid_output");
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_OUTPUT_BYTES) throw new AppError("invalid_output");
  return bytes;
}

/**
 * Confirms the returned bytes are a real, decodable still image of the format
 * that was requested and within sane bounds before anything reaches the browser.
 */
export async function validateOutputImage(bytes: Buffer, expected: OutputImage["mime"]): Promise<OutputImage> {
  const detected = await fileTypeFromBuffer(bytes);
  if (detected?.mime !== expected) throw new AppError("invalid_output");

  let width: number | undefined;
  let height: number | undefined;
  try {
    // A full decode (stats) proves the data is intact, not just the header.
    const image = sharp(bytes, { failOn: "error", limitInputPixels: MAX_OUTPUT_PIXELS });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) throw new Error("multi-page output");
    await image.stats();
    width = metadata.width;
    height = metadata.height;
  } catch (cause) {
    throw new AppError("invalid_output", { cause });
  }
  if (!width || !height || width < MIN_OUTPUT_SIDE || height < MIN_OUTPUT_SIDE) {
    throw new AppError("invalid_output");
  }
  return { bytes, mime: expected, width, height };
}

const OUTPUT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * For providers that do not document a fixed output format: identify the
 * bytes by signature, then apply the same checks as validateOutputImage.
 */
export async function validateOutputImageOfAnyAllowedType(bytes: Buffer): Promise<OutputImage> {
  const detected = await fileTypeFromBuffer(bytes);
  const mime = OUTPUT_TYPES.find((type) => type === detected?.mime);
  if (!mime) throw new AppError("invalid_output");
  return validateOutputImage(bytes, mime);
}
