# Security checklist

Status key:

- **Tested**: implemented and covered by automated tests run on 2026-10-17.
- **Implemented**: in code, verified manually or indirectly.
- **Deploy**: needs configuration outside the code.
- **Not verified**: cannot be verified in this environment.

## Secrets

| Control | Where | Status |
| --- | --- | --- |
| API key read only on the server; no `NEXT_PUBLIC_` variables | `src/lib/config/env.ts` (`import "server-only"`) | Tested (config tests) |
| UI receives a boolean, never the key | `isLiveTransformConfigured()`, `src/app/create/page.tsx` | Implemented |
| Config errors list field names, never values | `ConfigError` in `env.ts` | Tested |
| Real `.env*` files ignored; `.env.example` holds placeholders only | `.gitignore`, `.env.example` | Implemented (`git check-ignore` verified) |
| No committed secrets | Repository scan for key patterns | Implemented (scan clean on 2026-10-17) |
| Provider spend alerts and monthly budget | OpenAI dashboard / Cloudflare usage page | **Deploy** |
| Provider choice is explicit; both configured without `IMAGE_PROVIDER` is a config error; no silent fallback | `parseServerConfig` | Tested |
| Cloudflare account ID format-checked (32 hex) before it is placed in the URL path; models allowlisted | `env.ts` | Tested |

## Upload validation (all before any provider call)

| Control | Where | Status |
| --- | --- | --- |
| Only raw image bodies are accepted (`image/jpeg`, `png`, `webp`, `octet-stream`), not multipart | `assertUploadHeaders` | Tested |
| Declared `Content-Length` checked early | `assertUploadHeaders` | Tested |
| Streamed byte cap, so memory never exceeds the limit even without `Content-Length` | `readBodyWithLimit` | Tested |
| Type identified by signature (file-type); name, extension and MIME are ignored | `validate-image.ts` | Tested |
| Allowlist: JPEG, PNG, WebP. Rejects GIF, SVG, APNG, animated WebP and text | `validate-image.ts` | Tested |
| Pixel limit checked from the header before decoding (decompression bombs) | `validate-image.ts`, `MAX_IMAGE_PIXELS` | Tested |
| Full decode under `limitInputPixels`; corrupt or truncated files rejected | `normalize-image.ts` | Tested |
| Re-encode to JPEG, applying orientation; EXIF/GPS/ICC dropped | `normalize-image.ts` | Tested (GPS fixture) |
| In memory only, with no temp files and libvips cache disabled | `sharp.cache(false)` | Implemented |
| Platform body limits (about 4.5 MB on Vercel) | Browser downscales to a JPEG of at most 2048 px first | Implemented; **Deploy**: keep `MAX_IMAGE_SIZE_MB` within platform limits |

## Abuse and cost

| Control | Where | Status |
| --- | --- | --- |
| Strict query schema: only `mood` (enum or `surprise`); extra or duplicate params rejected | `request-validation.ts` | Tested |
| Model, prompt, size, quality and format chosen on the server; model allowlisted | `image-provider.ts`, `env.ts` | Tested |
| Daily allowance: 5 per person per UTC day, reserved after validation, refunded only for provider-side failures | `daily-quota.ts`, `handler.ts` | Tested (memory implementation and handler; Redis wrapper with a fake) |
| Global daily cap (default 80) across everyone | `daily-quota.ts` | Tested |
| Atomic Redis reserve/release (Lua) so parallel requests cannot overshoot | `daily-quota.ts` | **Not verified against real Redis** |
| Flood limit: 20 requests per 10 min per person, before the body is read | `rate-limit.ts` | Tested |
| Turnstile bot check: single-use token verified server-side before any work; fails closed if siteverify is unreachable; token action must be `transform` | `turnstile.ts`, `handler.ts` | Tested (mocked); verified once in Chrome with Cloudflare's test keys |
| Cloudflare test Turnstile keys refused in production | `env.ts` | Tested |
| Client identity hashed (SHA-256); IPv6 grouped by /64 | `client-identity.ts` | Tested |
| Production fails closed without Upstash, on Redis errors, and on Upstash's fail-open timeout (flood limiter and daily allowance) | `rate-limit.ts`, `daily-quota.ts` | Tested (unit, route, and e2e against `next start`) |
| Forwarded headers not trusted unless the platform sets them | `getClientAddress`, `TRUSTED_CLIENT_IP_HEADER` | Tested |
| Per-instance concurrency cap (4) | `concurrency.ts` | Tested |
| Provider timeout of 150 s per attempt; overall deadline of 170 s; client timeout of 190 s | `image-provider.ts`, `handler.ts`, `transform-client.ts` | Tested (mapping) |
| One retry, only for 5xx/network errors; never for safety, quota or auth | `withOneRetry` | Tested |
| Output validated: base64 alphabet and size, signature equals requested JPEG, full decode, dimensions | `validate-output.ts` | Tested |
| Cloudflare: response body capped at 40 MB while streaming; non-JSON, error envelopes and missing images rejected; redirects refused | `cloudflare-provider.ts` | Tested (mocked) |
| Cloudflare: reference image re-encoded below the 512px input limit; only documented form fields sent | `cloudflare-provider.ts` | Tested (mocked) |
| Cloudflare: the validated output's colour and light are applied to the original (`transferLook`); the result is re-encoded as JPEG at the original's size | `transfer-look.ts` | Tested |
| Upstash credentials and limits in production | Environment | **Deploy** |

## Injection and AI safety

| Control | Where | Status |
| --- | --- | --- |
| Prompts built only from server-defined text keyed by mood ID | `prompt-builder.ts` | Tested |
| Provider moderation left at its default; `moderation_blocked` maps to a safe 422; no retry or prompt weakening | `mapProviderError` | Tested |
| Copy never claims detected edits or historical accuracy | `moods.ts` explanations | Tested |

## Browser security

| Control | Where | Status |
| --- | --- | --- |
| Nonce CSP: `script-src 'self' 'nonce-...' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `connect-src 'self'` | `src/proxy.ts`, `src/lib/security/csp.ts` | Tested (unit + e2e headers; zero console CSP violations in a production build) |
| `style-src-attr 'unsafe-inline'` (inline style attributes for motion and colour tokens; cannot run script) | `csp.ts` | Implemented, accepted trade-off |
| Dev-only relaxations: `'unsafe-eval'`, inline `<style>`, websockets | `csp.ts` (`isDev`) | Tested |
| API responses: `default-src 'none'`, `no-store`, `nosniff` | `next.config.ts`, `handler.ts` | Tested (e2e) |
| `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera, mic and geolocation off), COOP | `next.config.ts` | Tested (e2e) |
| HSTS in production builds | `next.config.ts` | Tested (e2e on `next start`); **Deploy**: serve over HTTPS |
| `X-Powered-By` removed | `poweredByHeader: false` | Tested |
| Same-origin check (`Sec-Fetch-Site` / `Origin`) on the costly endpoint; no cookies, so classic CSRF does not apply | `assertSameOrigin` | Tested |
| No `dangerouslySetInnerHTML`, `eval` or dynamic scripts | Codebase | Implemented (grep-clean) |
| Server errors never include stacks, paths, env values or provider messages | `errors.ts`, `handler.ts` | Tested |

## Privacy

| Control | Where | Status |
| --- | --- | --- |
| No database, storage or logging of image bytes | Architecture | Implemented |
| Logs are structured events: code, mood, duration, size | `handler.ts` | Implemented |
| Blob URLs revoked on replace, remove and unmount; no localStorage | `useObjectUrl` | Tested |
| Provider data terms checked before writing the privacy page | `src/app/privacy/page.tsx` (OpenAI "Your data" docs, Oct 2026) | Implemented |
| No URL fetching; samples come from the local registry only | `findSample`, `create/page.tsx` | Tested (e2e) |

## Not verified here

- The Cloudflare adapter has been run against the real API; the OpenAI adapter is verified only
  with mocks. Cloudflare's exact error messages (used to tell a spent daily allocation from a rate
  limit, and safety refusals from other 400s) are not documented, so that mapping is a best guess.
- Upstash behaviour against a real Redis instance (wrapper logic is unit-tested with fakes).
- Deployed-platform behaviour (Vercel body limits, `maxDuration`, `x-vercel-forwarded-for`).
- Dev-dependency audit: `npm audit` reports 5 high findings in `braces` via `eslint-config-next`
  (lint tooling only; the suggested fix downgrades Next to v14). `npm audit --omit=dev` reports 0.
