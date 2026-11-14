import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_IMAGE_MODEL, parseServerConfig } from "@/lib/config/env";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

describe("parseServerConfig", () => {
  it("treats a missing key as not configured rather than failing", () => {
    const config = parseServerConfig({ NODE_ENV: "production" });
    expect(config.provider).toBeNull();
    expect(config.upstash).toBeNull();
    expect(config.isProduction).toBe(true);
    expect(config.maxImageBytes).toBe(10 * 1024 * 1024);
  });

  it("defaults to the documented editing model", () => {
    expect(parseServerConfig({ OPENAI_API_KEY: "sk-test" }).provider).toEqual({ kind: "openai", apiKey: "sk-test", model: DEFAULT_IMAGE_MODEL });
  });

  it("rejects models outside the allowlist", () => {
    expect(() => parseServerConfig({ OPENAI_API_KEY: "sk-test", OPENAI_IMAGE_MODEL: "dall-e-2" })).toThrow(ConfigError);
  });

  it("never includes secret values in configuration errors", () => {
    try {
      parseServerConfig({ UPSTASH_REDIS_REST_URL: "http://insecure.example", UPSTASH_REDIS_REST_TOKEN: "super-secret-token" });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("super-secret-token");
      expect(String(error)).not.toContain("insecure.example");
    }
  });

  it("only trusts a client IP header on Vercel or when explicitly configured", () => {
    expect(parseServerConfig({}).clientIpHeader).toBeNull();
    expect(parseServerConfig({ VERCEL: "1" }).clientIpHeader).toBe("x-vercel-forwarded-for");
    expect(parseServerConfig({ TRUSTED_CLIENT_IP_HEADER: "cf-connecting-ip" }).clientIpHeader).toBe("cf-connecting-ip");
  });

  it("bounds the size limits", () => {
    expect(() => parseServerConfig({ MAX_IMAGE_SIZE_MB: "500" })).toThrow(ConfigError);
    expect(() => parseServerConfig({ MAX_IMAGE_PIXELS: "10" })).toThrow(ConfigError);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("is strict in production", () => {
    const csp = buildContentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain("*");
  });

  it("allows Turnstile's frame only when it is configured", () => {
    expect(buildContentSecurityPolicy("n", false)).toContain("frame-src 'none'");
    expect(buildContentSecurityPolicy("n", false, { turnstile: true })).toContain("frame-src https://challenges.cloudflare.com");
  });

  it("only relaxes eval in development", () => {
    expect(buildContentSecurityPolicy("abc", true)).toContain("'unsafe-eval'");
  });
});

describe("provider selection", () => {
  const cloudflare = { CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", CLOUDFLARE_API_TOKEN: "cf-test-token" };

  it("uses Cloudflare when it is the only configured provider", () => {
    expect(parseServerConfig(cloudflare).provider).toEqual({
      kind: "cloudflare",
      accountId: cloudflare.CLOUDFLARE_ACCOUNT_ID,
      apiToken: "cf-test-token",
      model: "@cf/black-forest-labs/flux-2-klein-4b",
    });
  });

  it("requires an explicit choice when both are configured", () => {
    expect(() => parseServerConfig({ ...cloudflare, OPENAI_API_KEY: "sk-test" })).toThrow(ConfigError);
    expect(parseServerConfig({ ...cloudflare, OPENAI_API_KEY: "sk-test", IMAGE_PROVIDER: "cloudflare" }).provider?.kind).toBe("cloudflare");
  });

  it("never falls back silently when the chosen provider lacks credentials", () => {
    expect(() => parseServerConfig({ IMAGE_PROVIDER: "cloudflare", OPENAI_API_KEY: "sk-test" })).toThrow(ConfigError);
  });

  it("rejects half-configured Cloudflare credentials and malformed account IDs", () => {
    expect(() => parseServerConfig({ CLOUDFLARE_API_TOKEN: "cf-test-token" })).toThrow(ConfigError);
    expect(() => parseServerConfig({ CLOUDFLARE_ACCOUNT_ID: cloudflare.CLOUDFLARE_ACCOUNT_ID })).toThrow(ConfigError);
    expect(() => parseServerConfig({ ...cloudflare, CLOUDFLARE_ACCOUNT_ID: "../../evil" })).toThrow(ConfigError);
  });

  it("allowlists Cloudflare models", () => {
    expect(() => parseServerConfig({ ...cloudflare, CLOUDFLARE_IMAGE_MODEL: "@cf/meta/llama-3" })).toThrow(ConfigError);
    expect(parseServerConfig({ ...cloudflare, CLOUDFLARE_IMAGE_MODEL: "@cf/black-forest-labs/flux-2-klein-9b" }).provider?.model).toBe(
      "@cf/black-forest-labs/flux-2-klein-9b",
    );
  });

  it("keeps secret values out of errors", () => {
    try {
      parseServerConfig({ CLOUDFLARE_API_TOKEN: "super-secret-cf-token" });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("super-secret-cf-token");
    }
  });
});

describe("quota and Turnstile configuration", () => {
  it("defaults to 5 a day per person and a global daily cap", () => {
    expect(parseServerConfig({}).quota).toEqual({ perClient: 5, global: 80 });
    expect(parseServerConfig({ DAILY_IMAGE_LIMIT: "3", DAILY_GLOBAL_LIMIT: "200" }).quota).toEqual({ perClient: 3, global: 200 });
    expect(() => parseServerConfig({ DAILY_IMAGE_LIMIT: "0" })).toThrow(ConfigError);
  });

  it("refuses Cloudflare's always-pass test keys in production", () => {
    const testKeys = { TURNSTILE_SITE_KEY: "1x00000000000000000000BB", TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" };
    expect(parseServerConfig(testKeys).turnstile).not.toBeNull();
    expect(() => parseServerConfig({ ...testKeys, NODE_ENV: "production" })).toThrow(ConfigError);
  });

  it("requires both Turnstile keys or neither", () => {
    expect(parseServerConfig({}).turnstile).toBeNull();
    expect(() => parseServerConfig({ TURNSTILE_SITE_KEY: "1x00000000000000000000BB" })).toThrow(ConfigError);
    expect(parseServerConfig({ TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" }).turnstile).toEqual({ siteKey: "site", secretKey: "secret" });
  });
});
