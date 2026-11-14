import "server-only";
import sharp from "sharp";
import { AppError } from "@/lib/errors";
import type { ValidatedImage } from "./validate-image";

/** The longest edge sent to the provider. Larger inputs only add upload time and cost. */
export const NORMALIZED_MAX_EDGE = 2048;

export type NormalizedImage = {
  bytes: Buffer;
  mime: "image/jpeg";
  width: number;
  height: number;
};

/**
 * Fully decodes the validated image (under the same pixel limit), applies the
 * EXIF orientation, bounds its size, flattens transparency, converts to sRGB
 * and re-encodes it as a fresh JPEG. Because no metadata is copied across,
 * EXIF data including GPS location is dropped. Everything stays in memory.
 */
export async function normalizeImage(image: ValidatedImage, maxPixels: number): Promise<NormalizedImage> {
  try {
    const { data, info } = await sharp(image.bytes, { failOn: "error", limitInputPixels: maxPixels })
      .rotate()
      .resize({
        width: NORMALIZED_MAX_EDGE,
        height: NORMALIZED_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return { bytes: data, mime: "image/jpeg", width: info.width, height: info.height };
  } catch (cause) {
    throw new AppError("invalid_image", { cause });
  }
}

/** Documented limits for custom sizes on GPT Image 2 / 2.5 edit models. */
const SIZE_RULES = {
  multiple: 16,
  maxEdge: 3840,
  minPixels: 655_360,
  maxPixels: 8_294_400,
  maxAspect: 3,
  targetPixels: 1536 * 1024,
};

/**
 * Picks an output size that keeps the photo's aspect ratio (so the comparison
 * lines up) while satisfying the provider's custom-size rules.
 */
export function computeOutputSize(width: number, height: number): { width: number; height: number } {
  const { multiple, maxEdge, minPixels, maxPixels, maxAspect, targetPixels } = SIZE_RULES;
  const ratio = Math.min(maxAspect, Math.max(1 / maxAspect, width / height));
  const round = (value: number) => Math.max(multiple, Math.round(value / multiple) * multiple);

  let outWidth = round(Math.sqrt(targetPixels * ratio));
  let outHeight = round(outWidth / ratio);

  // Rounding can push the area slightly outside the band; nudge back in steps of 16.
  while (outWidth * outHeight < minPixels) {
    outWidth += multiple;
    outHeight = round(outWidth / ratio);
  }
  while (outWidth * outHeight > maxPixels || outWidth > maxEdge || outHeight > maxEdge) {
    outWidth -= multiple;
    outHeight = round(outWidth / ratio);
  }
  // Rounding can also nudge an extreme aspect ratio just past 3:1; pull it back.
  while (outWidth > outHeight * maxAspect) outHeight += multiple;
  while (outHeight > outWidth * maxAspect) outWidth += multiple;
  return { width: outWidth, height: outHeight };
}
