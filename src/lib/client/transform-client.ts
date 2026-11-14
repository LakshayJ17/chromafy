import { z } from "zod";
import { isErrorCode, type ErrorCode } from "@/lib/errors";
import { isMoodId, type MoodId } from "@/lib/config/moods";

/** Slightly longer than the server's own deadline, so the server's answer usually arrives first. */
export const CLIENT_TIMEOUT_MS = 190_000;

export type ClientErrorCode = ErrorCode | "network" | "client_timeout";

export class TransformClientError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TransformClientError";
  }
}

export type QuotaInfo = { limit: number; remaining: number; resetsAt: number };

export type TransformResult = { blob: Blob; mood: MoodId; quota: QuotaInfo | null };

/** Reads the daily-allowance headers the server sends with each result. */
export function readQuotaHeaders(headers: Headers): QuotaInfo | null {
  const limit = Number(headers.get("x-chromafy-daily-limit"));
  const remaining = Number(headers.get("x-chromafy-daily-remaining"));
  const resetsAt = Date.parse(headers.get("x-chromafy-daily-reset") ?? "");
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(remaining) || remaining < 0 || Number.isNaN(resetsAt)) return null;
  return { limit, remaining: Math.min(remaining, limit), resetsAt };
}

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string().max(300) }) });

export async function requestTransform(
  image: Blob,
  mood: MoodId | "surprise",
  signal: AbortSignal,
  options: { turnstileToken?: string } = {},
): Promise<TransformResult> {
  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`/api/transform?mood=${encodeURIComponent(mood)}`, {
      method: "POST",
      body: image,
      headers: {
        "Content-Type": "image/jpeg",
        ...(options.turnstileToken ? { "X-Turnstile-Token": options.turnstileToken } : {}),
      },
      signal: AbortSignal.any([signal, timeout]),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    if (signal.aborted) throw new TransformClientError("cancelled", "The request was cancelled.");
    if (timeout.aborted) throw new TransformClientError("client_timeout", "That took too long. Please try again.");
    throw new TransformClientError("network", "We couldn't reach Chromafy. Check your connection and try again.");
  }

  if (!response.ok) {
    const parsed = errorSchema.safeParse(await response.json().catch(() => null));
    if (parsed.success && isErrorCode(parsed.data.error.code)) {
      throw new TransformClientError(parsed.data.error.code, parsed.data.error.message);
    }
    throw new TransformClientError("internal", "Something went wrong on our side. Please try again.");
  }

  const type = response.headers.get("content-type") ?? "";
  const resolvedMood = response.headers.get("x-chromafy-mood");
  if (!/^image\/(jpeg|png|webp)$/.test(type) || !isMoodId(resolvedMood)) {
    throw new TransformClientError("invalid_output", "The image service returned an unusable result. Please try again.");
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new TransformClientError("invalid_output", "The image service returned an unusable result. Please try again.");
  }
  return { blob, mood: resolvedMood, quota: readQuotaHeaders(response.headers) };
}
