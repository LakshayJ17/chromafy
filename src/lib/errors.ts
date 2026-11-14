/**
 * Every failure the transform API can report. The browser only ever sees the
 * code and the matching safe message below, never an exception message,
 * stack trace, provider payload or configuration value.
 */
export const ERROR_CATALOGUE = {
  missing_image: { status: 400, message: "Choose a photo to reimagine." },
  invalid_request: { status: 400, message: "That request was not understood. Please try again." },
  invalid_mood: { status: 400, message: "That mood is not available. Pick one of the worlds." },
  unsupported_media: {
    status: 415,
    message: "That file type is not supported. Use a JPEG, PNG or WebP photo.",
  },
  invalid_image: {
    status: 422,
    message: "That image could not be read. It may be damaged or incomplete.",
  },
  animated_image: { status: 422, message: "Animated images are not supported. Use a still photo." },
  image_too_small: { status: 422, message: "That image is too small. Use a photo at least 256 pixels on each side." },
  image_too_large: { status: 413, message: "That photo is too large. Try a smaller file." },
  image_dimensions: {
    status: 422,
    message: "That photo has too many pixels to process. Try a smaller version.",
  },
  forbidden_origin: { status: 403, message: "Requests must come from the Chromafy app." },
  rate_limited: {
    status: 429,
    message: "That's a lot of requests in a short time. Please wait a few minutes and try again.",
  },
  daily_limit_reached: {
    status: 429,
    message: "You've used all of today's transformations. They reset at midnight UTC.",
  },
  service_daily_limit: {
    status: 503,
    message: "Chromafy has reached today's limit for everyone. Please come back tomorrow.",
  },
  bot_check_failed: {
    status: 403,
    message: "We couldn't confirm this request came from a person. Please reload the page and try again.",
  },
  bot_check_unavailable: {
    status: 503,
    message: "The security check is unavailable right now. Please try again in a moment.",
  },
  busy: { status: 503, message: "Chromafy is busy right now. Please try again in a moment." },
  rate_limiter_unavailable: {
    status: 503,
    message: "Chromafy cannot accept new transformations right now. Please try again later.",
  },
  not_configured: {
    status: 503,
    message: "Live transformation is not configured on this server yet.",
  },
  provider_auth: {
    status: 502,
    message: "The image service rejected this server's credentials. The site owner needs to check them.",
  },
  provider_quota: {
    status: 503,
    message: "The image service quota has been used up for now. Please try again later.",
  },
  provider_rate_limited: {
    status: 503,
    message: "The image service is busy. Please wait a moment and try again.",
  },
  provider_safety: {
    status: 422,
    message:
      "The image service declined this photo or its result under its safety policy. Try a different photo.",
  },
  provider_rejected: {
    status: 422,
    message: "The image service could not process this photo. Try a different one.",
  },
  provider_unavailable: {
    status: 502,
    message: "The image service did not respond properly. Please try again.",
  },
  timeout: { status: 504, message: "That took too long. Please try again." },
  invalid_output: {
    status: 502,
    message: "The image service returned an unusable result. Please try again.",
  },
  cancelled: { status: 499, message: "The request was cancelled." },
  internal: { status: 500, message: "Something went wrong on our side. Please try again." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, options?: { cause?: unknown; retryAfterSeconds?: number }) {
    super(code, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_CATALOGUE[code].status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export type ErrorBody = { error: { code: ErrorCode; message: string } };

export function errorBody(code: ErrorCode): ErrorBody {
  return { error: { code, message: ERROR_CATALOGUE[code].message } };
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_CATALOGUE, value);
}
