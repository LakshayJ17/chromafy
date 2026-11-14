import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { decodeBase64Image, validateOutputImageOfAnyAllowedType } from "@/lib/images/validate-output";
import { transferLook } from "@/lib/images/transfer-look";
import { withOneRetry, type ImageEditProvider } from "./image-provider";

/**
 * Cloudflare Workers AI adapter for FLUX.2 [klein]
 * (https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/).
 *
 * Documented contract: POST multipart/form-data to
 *   https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/run/{MODEL}
 * with `Authorization: Bearer {TOKEN}` and fields `prompt` (required),
 * `input_image_0` (binary, must be smaller than 512x512), `width`/`height`
 * (256 to 1920). The output schema is `{ image: <base64> }`. The REST API
 * wraps results in Cloudflare's `{ success, result, errors }` envelope.
 */

const API_ORIGIN = "https://api.cloudflare.com";
/** "All input images must be smaller than 512x512": stay safely below. */
export const CLOUDFLARE_INPUT_MAX_EDGE = 496;
/** A 1024px long edge keeps each edit to a few 512px output tiles, so the free daily neurons last. */
export const CLOUDFLARE_OUTPUT_LONG_EDGE = 1024;
const OUTPUT_EDGE_RANGE = { min: 256, max: 1920 };
export const CLOUDFLARE_ATTEMPT_TIMEOUT_MS = 90_000;
/** Base64 of a ~1 MP image is a few MB; anything far larger is not a valid answer. */
const MAX_RESPONSE_BYTES = 40 * 1024 * 1024;

const envelopeSchema = z.object({
  success: z.boolean().optional(),
  result: z.object({ image: z.string() }).nullish(),
  errors: z.array(z.object({ code: z.number().optional(), message: z.string().optional() })).optional(),
});

type Fetch = typeof fetch;

export function computeCloudflareOutputSize(width: number, height: number): { width: number; height: number } {
  const clampEdge = (value: number) =>
    Math.min(OUTPUT_EDGE_RANGE.max, Math.max(OUTPUT_EDGE_RANGE.min, Math.round(value / 16) * 16));
  const scale = CLOUDFLARE_OUTPUT_LONG_EDGE / Math.max(width, height);
  return { width: clampEdge(width * scale), height: clampEdge(height * scale) };
}

export function createCloudflareImageProvider(
  config: { accountId: string; apiToken: string; model: string },
  fetchImpl: Fetch = fetch,
): ImageEditProvider {
  const url = `${API_ORIGIN}/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/run/${config.model}`;

  return {
    async edit({ image, width, height, prompt, keepOriginalDetail, signal }) {
      const reference = await sharp(image)
        .resize({ width: CLOUDFLARE_INPUT_MAX_EDGE, height: CLOUDFLARE_INPUT_MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
      const size = computeCloudflareOutputSize(width, height);

      const send = async () => {
        const form = new FormData();
        // FLUX prompts refer to inputs by index: image 0 is the user's photo.
        form.append("prompt", `Edit image 0, the input photograph. ${prompt}`);
        form.append("input_image_0", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "photo.jpg");
        form.append("width", String(size.width));
        form.append("height", String(size.height));

        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.apiToken}` },
            body: form,
            signal: AbortSignal.any([signal, AbortSignal.timeout(CLOUDFLARE_ATTEMPT_TIMEOUT_MS)]),
            redirect: "error",
            cache: "no-store",
          });
        } catch (error) {
          if (signal.aborted) throw new AppError("cancelled", { cause: error });
          if (error instanceof Error && error.name === "TimeoutError") throw new AppError("timeout", { cause: error });
          throw new AppError("provider_unavailable", { cause: error });
        }

        const text = await readTextWithLimit(response, MAX_RESPONSE_BYTES);
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        const envelope = envelopeSchema.safeParse(json);
        const messages = envelope.success ? (envelope.data.errors ?? []).map((entry) => entry.message ?? "").join(" ") : "";

        if (!response.ok) throw mapCloudflareError(response.status, messages);
        if (!envelope.success || envelope.data.success === false || !envelope.data.result) {
          throw new AppError("invalid_output");
        }
        return envelope.data.result.image;
      };

      const base64 = await withOneRetry(send, signal);
      const edited = await validateOutputImageOfAnyAllowedType(decodeBase64Image(base64));
      if (!keepOriginalDetail) return edited;
      // The model redraws the scene from a sub-512px copy, so its detail is soft and
      // objects can shift. Keep the original's pixels and take only the edit's look.
      let look: Awaited<ReturnType<typeof transferLook>>;
      try {
        look = await transferLook(image, edited.bytes);
      } catch (cause) {
        throw new AppError("internal", { cause });
      }
      return { bytes: look.bytes, mime: "image/jpeg", width: look.width, height: look.height };
    },
  };
}

/**
 * Cloudflare does not document stable error codes for this model, so failures
 * are mapped by HTTP status, with message keywords only to separate a spent
 * daily allocation (quota) from a short-term rate limit, and safety refusals
 * from other bad requests.
 */
export function mapCloudflareError(status: number, message: string): AppError {
  if (status === 401 || status === 403) return new AppError("provider_auth");
  if (status === 429) {
    return new AppError(/neuron|allocation|quota|daily|limit exceeded for today/i.test(message) ? "provider_quota" : "provider_rate_limited");
  }
  if (status === 408 || status === 504) return new AppError("timeout");
  if (status >= 400 && status < 500) {
    return new AppError(/nsfw|safety|unsafe|inappropriate|flagged|content policy/i.test(message) ? "provider_safety" : "provider_rejected");
  }
  return new AppError("provider_unavailable");
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new AppError("invalid_output");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError("invalid_output");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
