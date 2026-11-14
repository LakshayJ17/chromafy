import "server-only";
import { z } from "zod";
import { MOOD_IDS } from "@/lib/config/moods";
import { AppError } from "@/lib/errors";

/**
 * The entire client-controlled surface of a transform request: one enum.
 * Model, prompt, size, quality and format are all chosen on the server.
 */
export const transformQuerySchema = z.strictObject({
  mood: z.enum([...MOOD_IDS, "surprise"]),
});

export type TransformQuery = z.infer<typeof transformQuerySchema>;

export function parseTransformQuery(url: URL): TransformQuery {
  const entries = [...url.searchParams.entries()];
  const keys = new Set(entries.map(([key]) => key));
  if (keys.size !== entries.length) throw new AppError("invalid_request");
  const result = transformQuerySchema.safeParse(Object.fromEntries(entries));
  if (!result.success) {
    const moodIssue = result.error.issues.some((issue) => issue.path[0] === "mood");
    throw new AppError(moodIssue && keys.has("mood") ? "invalid_mood" : "invalid_request");
  }
  return result.data;
}

/**
 * This endpoint uses no cookies, so classic CSRF cannot act on a user's
 * session. The check still stops other sites from spending this app's
 * provider budget through visitors' browsers: browsers always send
 * Sec-Fetch-Site and Origin on cross-site POSTs.
 */
export function assertSameOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new AppError("forbidden_origin");

  const origin = request.headers.get("origin");
  if (origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError("forbidden_origin");
    }
    const host = request.headers.get("host") ?? new URL(request.url).host;
    if (originHost !== host) throw new AppError("forbidden_origin");
  }
}

const ACCEPTED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/octet-stream"]);

export function assertUploadHeaders(request: Request, maxBytes: number): void {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!contentType || !ACCEPTED_CONTENT_TYPES.has(contentType)) throw new AppError("unsupported_media");

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) throw new AppError("invalid_request");
    const length = Number(declared);
    if (length === 0) throw new AppError("missing_image");
    if (length > maxBytes) throw new AppError("image_too_large");
  }
}

/**
 * Reads the request body while counting bytes, and stops as soon as the limit
 * is passed. Content-Length is only a hint (it can be absent or wrong with
 * chunked encoding), so the stream itself is the real boundary and memory use
 * never exceeds `maxBytes`.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) throw new AppError("missing_image");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError("image_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(request.signal.aborted ? "cancelled" : "invalid_request", { cause: error });
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new AppError("missing_image");

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
