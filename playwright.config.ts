import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a PRODUCTION build (next build + next start) in
 * the locally installed Google Chrome, so the strict CSP is exercised as deployed. The transform
 * API is intercepted in the browser (page.route), so no request reaches the
 * image provider. The server receives an obvious placeholder key only so the
 * UI renders its live state; it is not a credential and is never used.
 */
const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
    // Values set here win over .env.local, so a developer's real credentials are never used:
    // the provider is pinned to the placeholder, and Upstash is blanked so the API fails closed.
    env: {
      IMAGE_PROVIDER: "openai",
      OPENAI_API_KEY: "e2e-placeholder-not-a-real-key",
      CLOUDFLARE_ACCOUNT_ID: "",
      CLOUDFLARE_API_TOKEN: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
