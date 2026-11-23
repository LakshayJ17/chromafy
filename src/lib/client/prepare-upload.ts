/**
 * Browser-side checks and preparation. These give fast, friendly feedback and
 * shrink uploads; they are NOT a security boundary. The server repeats every
 * check on the bytes it actually receives.
 */
export const CLIENT_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const UPLOAD_MAX_EDGE = 2048;
export const MIN_SIDE = 256;
/** Mirrors the server's MAX_ASPECT_RATIO, for an instant message instead of a failed upload. */
export const MAX_ASPECT_RATIO = 4;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");

export class ClientImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientImageError";
  }
}

type Sniffed = (typeof ACCEPTED_TYPES)[number] | null;

/** Reads the first bytes so a renamed file cannot pass on its extension alone. */
export function sniffImageType(header: Uint8Array): Sniffed {
  const startsWith = (bytes: number[], offset = 0) => bytes.every((byte, index) => header[offset + index] === byte);
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export async function checkFile(file: File): Promise<void> {
  if (file.size === 0) throw new ClientImageError("That file is empty. Choose a photo.");
  if (file.size > CLIENT_MAX_FILE_BYTES) {
    throw new ClientImageError("That photo is larger than 20 MB. Choose a smaller file.");
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffImageType(header)) {
    throw new ClientImageError("That file type is not supported. Use a JPEG, PNG or WebP photo.");
  }
}

export type PreparedUpload = { blob: Blob; width: number; height: number };

/**
 * Decodes once, applies EXIF orientation, scales to at most 2048px and
 * re-encodes as JPEG. Smaller uploads fit hosting body limits and keep
 * camera metadata on the device.
 */
export async function prepareUpload(file: Blob): Promise<PreparedUpload> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ClientImageError("That image could not be read. It may be damaged or in an unsupported format.");
  }
  try {
    if (bitmap.width < MIN_SIDE || bitmap.height < MIN_SIDE) {
      throw new ClientImageError("That image is too small. Use a photo at least 256 pixels on each side.");
    }
    if (Math.max(bitmap.width, bitmap.height) / Math.min(bitmap.width, bitmap.height) > MAX_ASPECT_RATIO) {
      throw new ClientImageError("That photo is too long and narrow. Crop it to no more than 4:1 and try again.");
    }
    const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ClientImageError("Your browser could not prepare this image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new ClientImageError("Your browser could not prepare this image.");
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
