import "server-only";
import OpenAI, { APIConnectionTimeoutError, APIError, APIUserAbortError, toFile } from "openai";
import { AppError } from "@/lib/errors";
import { computeOutputSize } from "@/lib/images/normalize-image";
import { decodeBase64Image, validateOutputImage, type OutputImage } from "@/lib/images/validate-output";

export type ImageEditRequest = {
  /** The normalized original: a metadata-free JPEG. */
  image: Buffer;
  mime: "image/jpeg";
  /** Dimensions of `image`; each adapter derives an output size its API accepts. */
  width: number;
  height: number;
  prompt: string;
  signal: AbortSignal;
};

/**
 * The only contract the rest of the app knows about. Swapping providers means
 * writing another implementation of this interface; the route and UI stay the same.
 */
export interface ImageEditProvider {
  edit(request: ImageEditRequest): Promise<OutputImage>;
}

/** Per-attempt timeout. The docs note complex edits can take up to two minutes. */
export const PROVIDER_ATTEMPT_TIMEOUT_MS = 150_000;
const OUTPUT_FORMAT = "jpeg" as const;

type EditCall = (
  params: OpenAI.Images.ImageEditParamsNonStreaming,
  options: { signal: AbortSignal },
) => Promise<OpenAI.Images.ImagesResponse>;

export function createOpenAIImageProvider(config: { apiKey: string; model: string }, call?: EditCall): ImageEditProvider {
  // Retries are handled below so that only transient failures are retried, and only once.
  const client = call
    ? null
    : new OpenAI({ apiKey: config.apiKey, timeout: PROVIDER_ATTEMPT_TIMEOUT_MS, maxRetries: 0 });
  const edit: EditCall = call ?? ((params, options) => client!.images.edit(params, options));

  return {
    async edit({ image, width, height, prompt, signal }) {
      const size = computeOutputSize(width, height);
      const params: OpenAI.Images.ImageEditParamsNonStreaming = {
        model: config.model,
        image: await toFile(image, "photo.jpg", { type: "image/jpeg" }),
        prompt,
        n: 1,
        size: `${size.width}x${size.height}`,
        quality: "medium",
        output_format: OUTPUT_FORMAT,
        output_compression: 90,
      };

      const response = await withOneRetry(() => edit(params, { signal }), signal);
      const first = response.data?.[0];
      const bytes = decodeBase64Image(first?.b64_json);
      return validateOutputImage(bytes, "image/jpeg");
    },
  };
}

export async function withOneRetry<T>(attempt: () => Promise<T>, signal: AbortSignal): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    const mapped = mapProviderError(error);
    if (mapped.code !== "provider_unavailable" || signal.aborted) throw mapped;
    await new Promise((resolve) => setTimeout(resolve, 750));
    if (signal.aborted) throw new AppError("cancelled");
    try {
      return await attempt();
    } catch (retryError) {
      throw mapProviderError(retryError);
    }
  }
}

/** Translates SDK and network failures into the app's controlled error codes. */
export function mapProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof APIUserAbortError) return new AppError("cancelled", { cause: error });
  if (error instanceof APIConnectionTimeoutError) return new AppError("timeout", { cause: error });
  if (error instanceof Error && error.name === "AbortError") return new AppError("cancelled", { cause: error });

  if (error instanceof APIError) {
    const code = typeof error.code === "string" ? error.code : "";
    const status = error.status;
    if (status === undefined) return new AppError("provider_unavailable", { cause: error });
    if (status === 401 || status === 403) return new AppError("provider_auth", { cause: error });
    if (status === 429) {
      return new AppError(code === "insufficient_quota" ? "provider_quota" : "provider_rate_limited", { cause: error });
    }
    if (status === 400 && /moderation|safety|content_policy/i.test(code)) {
      return new AppError("provider_safety", { cause: error });
    }
    if (status === 408) return new AppError("timeout", { cause: error });
    if (status >= 400 && status < 500) return new AppError("provider_rejected", { cause: error });
    return new AppError("provider_unavailable", { cause: error });
  }
  return new AppError("internal", { cause: error });
}
