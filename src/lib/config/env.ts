import "server-only";
import { z } from "zod";
import { TURNSTILE_TEST_KEY } from "@/lib/security/turnstile";

/**
 * Image models the OpenAI adapter may call. Every entry supports
 * `/v1/images/edits` with custom `WIDTHxHEIGHT` sizes (verified against the
 * openai SDK's ImageEditParams documentation).
 */
export const ALLOWED_IMAGE_MODELS = [
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-sunburst-2026-09-08",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-flare-2026-09-08",
  "gpt-image-2",
  "gpt-image-2-2026-04-21",
] as const;

export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-sunburst";

/**
 * Cloudflare Workers AI models that accept an input image for editing
 * (FLUX.2 [klein], multipart `input_image_0`). 4B is the default because it
 * costs the fewest neurons, so the free daily allocation goes furthest.
 */
export const ALLOWED_CLOUDFLARE_MODELS = [
  "@cf/black-forest-labs/flux-2-klein-4b",
  "@cf/black-forest-labs/flux-2-klein-9b",
] as const;

export const DEFAULT_CLOUDFLARE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

export const PROVIDER_KINDS = ["openai", "cloudflare"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** The provider names shown to people on the privacy page. */
export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  openai: "OpenAI",
  cloudflare: "Cloudflare Workers AI",
};

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  IMAGE_PROVIDER: optionalString.pipe(z.enum(PROVIDER_KINDS).optional()),
  OPENAI_API_KEY: optionalString,
  OPENAI_IMAGE_MODEL: optionalString.pipe(z.enum(ALLOWED_IMAGE_MODELS).optional()),
  CLOUDFLARE_ACCOUNT_ID: optionalString.pipe(
    z
      .string()
      .regex(/^[0-9a-f]{32}$/, "must be a 32-character hexadecimal account ID")
      .optional(),
  ),
  CLOUDFLARE_API_TOKEN: optionalString,
  CLOUDFLARE_IMAGE_MODEL: optionalString.pipe(z.enum(ALLOWED_CLOUDFLARE_MODELS).optional()),
  UPSTASH_REDIS_REST_URL: optionalString.pipe(z.url({ protocol: /^https$/ }).optional()),
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  DAILY_IMAGE_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  DAILY_GLOBAL_LIMIT: z.coerce.number().int().min(1).max(100_000).default(80),
  TURNSTILE_SITE_KEY: optionalString.pipe(z.string().max(100).optional()),
  TURNSTILE_SECRET_KEY: optionalString,
  MAX_IMAGE_SIZE_MB: z.coerce.number().min(1).max(20).default(10),
  MAX_IMAGE_PIXELS: z.coerce.number().int().min(1_000_000).max(50_000_000).default(20_000_000),
  TRUSTED_CLIENT_IP_HEADER: optionalString.pipe(
    z
      .string()
      .regex(/^[a-z0-9-]+$/, "must be a lowercase header name")
      .optional(),
  ),
  VERCEL: optionalString,
});

export type ProviderConfig =
  | { kind: "openai"; apiKey: string; model: string }
  | { kind: "cloudflare"; accountId: string; apiToken: string; model: string };

export type ServerConfig = {
  isProduction: boolean;
  /** The image provider in use, or null when none is configured. */
  provider: ProviderConfig | null;
  upstash: { url: string; token: string } | null;
  /** Transformations per person per UTC day, and for everyone together. */
  quota: { perClient: number; global: number };
  /** Cloudflare Turnstile bot check; null when not configured. The site key is public. */
  turnstile: { siteKey: string; secretKey: string } | null;
  maxImageBytes: number;
  maxImagePixels: number;
  clientIpHeader: string | null;
};

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    // Only field names and rule descriptions are reported, never values.
    super(`Invalid server configuration: ${issues.join("; ")}`);
    this.name = "ConfigError";
  }
}

export function parseServerConfig(source: Record<string, string | undefined>): ServerConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  const env = result.data;

  // On Vercel, x-vercel-forwarded-for is set by the platform edge and cannot be
  // supplied by the client. Elsewhere, only an explicitly configured header is trusted.
  const clientIpHeader =
    env.TRUSTED_CLIENT_IP_HEADER ?? (env.VERCEL === "1" ? "x-vercel-forwarded-for" : null);

  const upstash =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }
      : null;

  const available: Partial<Record<ProviderKind, ProviderConfig>> = {};
  if (env.OPENAI_API_KEY) {
    available.openai = { kind: "openai", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL };
  }
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    available.cloudflare = {
      kind: "cloudflare",
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env.CLOUDFLARE_API_TOKEN,
      model: env.CLOUDFLARE_IMAGE_MODEL ?? DEFAULT_CLOUDFLARE_MODEL,
    };
  }
  if (env.CLOUDFLARE_ACCOUNT_ID && !env.CLOUDFLARE_API_TOKEN) {
    throw new ConfigError(["CLOUDFLARE_API_TOKEN: required when CLOUDFLARE_ACCOUNT_ID is set"]);
  }
  if (env.CLOUDFLARE_API_TOKEN && !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new ConfigError(["CLOUDFLARE_ACCOUNT_ID: required when CLOUDFLARE_API_TOKEN is set"]);
  }

  if (Boolean(env.TURNSTILE_SITE_KEY) !== Boolean(env.TURNSTILE_SECRET_KEY)) {
    throw new ConfigError(["TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY: set both or neither"]);
  }
  // Cloudflare's documented dummy keys (1x/2x/3x followed by zeros) accept any token.
  // They are for local testing only; in production they would silently disable the bot check.
  if (env.NODE_ENV === "production" && [env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET_KEY].some((key) => key && TURNSTILE_TEST_KEY.test(key))) {
    throw new ConfigError(["TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY: Cloudflare test keys are not allowed in production"]);
  }

  let provider: ProviderConfig | null;
  if (env.IMAGE_PROVIDER) {
    // An explicit choice must be fully configured; never fall back silently to another provider.
    provider = available[env.IMAGE_PROVIDER] ?? null;
    if (!provider) throw new ConfigError([`IMAGE_PROVIDER: "${env.IMAGE_PROVIDER}" is selected but its credentials are not set`]);
  } else {
    const configured = Object.values(available);
    if (configured.length > 1) {
      throw new ConfigError(["IMAGE_PROVIDER: set it to choose between the configured providers"]);
    }
    provider = configured[0] ?? null;
  }

  return {
    isProduction: env.NODE_ENV === "production",
    provider,
    upstash,
    quota: { perClient: env.DAILY_IMAGE_LIMIT, global: env.DAILY_GLOBAL_LIMIT },
    turnstile:
      env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY
        ? { siteKey: env.TURNSTILE_SITE_KEY, secretKey: env.TURNSTILE_SECRET_KEY }
        : null,
    maxImageBytes: Math.round(env.MAX_IMAGE_SIZE_MB * 1024 * 1024),
    maxImagePixels: env.MAX_IMAGE_PIXELS,
    clientIpHeader,
  };
}

let cached: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  cached ??= parseServerConfig(process.env);
  return cached;
}

/** Safe to expose to the UI: a boolean, never a credential. */
export function isLiveTransformConfigured(): boolean {
  return getActiveProviderKind() !== null;
}

/** Safe to expose to the UI: which provider receives photos, never its credentials. */
export function getActiveProviderKind(): ProviderKind | null {
  try {
    return getServerConfig().provider?.kind ?? null;
  } catch {
    return null;
  }
}
