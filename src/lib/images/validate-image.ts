import "server-only";
import { fileTypeFromBuffer } from "file-type";
import sharp, { type Metadata } from "sharp";
import { AppError } from "@/lib/errors";

/** Static raster formats verified to decode in sharp and accepted by the image edit API. */
export const ALLOWED_INPUT_TYPES = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedInputMime = keyof typeof ALLOWED_INPUT_TYPES;

export const MIN_IMAGE_SIDE = 256;

/**
 * Longest side over shortest. The image models get a copy under 512px and return at most 4:1, so a
 * thinner strip reaches them a few pixels wide and comes back as an unusable sliver.
 */
export const MAX_ASPECT_RATIO = 4;

// libvips keeps a decoded-image cache; disable it so memory is released after each request.
sharp.cache(false);

export type ImageLimits = { maxBytes: number; maxPixels: number };

export type ValidatedImage = {
  bytes: Buffer;
  mime: AllowedInputMime;
  width: number;
  height: number;
};

/**
 * Identifies an upload by its bytes, never by a user-supplied name, extension
 * or MIME type, and rejects anything that is not a single static raster
 * within the configured limits. Only image headers are read here; the full
 * decode happens during normalization under the same pixel limit.
 */
export async function validateImage(input: Uint8Array, limits: ImageLimits): Promise<ValidatedImage> {
  if (input.byteLength === 0) throw new AppError("missing_image");
  if (input.byteLength > limits.maxBytes) throw new AppError("image_too_large");

  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const detected = await fileTypeFromBuffer(bytes);

  if (detected?.mime === "image/apng") throw new AppError("animated_image");
  if (!detected || !Object.hasOwn(ALLOWED_INPUT_TYPES, detected.mime)) {
    throw new AppError("unsupported_media");
  }
  const mime = detected.mime as AllowedInputMime;

  let metadata: Metadata;
  try {
    // Header read only. The configured pixel limit is compared explicitly below so
    // that an oversized photo gets a clear error; the full decode in normalization
    // enforces the same limit inside libvips.
    metadata = await sharp(bytes, { animated: true, failOn: "error" }).metadata();
  } catch (cause) {
    throw new AppError("invalid_image", { cause });
  }

  if (metadata.format !== ALLOWED_INPUT_TYPES[mime]) throw new AppError("invalid_image");
  if ((metadata.pages ?? 1) > 1) throw new AppError("animated_image");

  // With animated: true, height spans all frames; for a single page it is the image height.
  const { width, height } = metadata;
  if (!width || !height) throw new AppError("invalid_image");
  if (width * height > limits.maxPixels) throw new AppError("image_dimensions");
  if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE) throw new AppError("image_too_small");
  if (Math.max(width, height) / Math.min(width, height) > MAX_ASPECT_RATIO) throw new AppError("image_aspect");

  return { bytes, mime, width, height };
}
