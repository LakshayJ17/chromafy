# Chromafy

**The world, in another light.**

Chromafy turns an ordinary photo into the same moment in a different light. Upload a photo or pick
a sample, choose a world, and an image-editing model reworks its colour, light, contrast and
atmosphere while keeping the subject and composition.

## Features

- Four light-and-colour worlds (**Golden**, **After Rain**, **Old Soul**, **Daydream**) and **Surprise me**
- Drag-and-drop upload with preview, replace and remove
- Eight built-in sample photos
- Before/after slider (mouse, touch and keyboard) and a side-by-side view
- **Try another world** from the original photo at any time
- Download and native sharing
- Daily usage limits, bot protection and strict upload validation
- No accounts, and no images stored

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript
- Tailwind CSS 4, Framer Motion, Lucide icons
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) (FLUX.2 [klein]) or the OpenAI Images API
- sharp and file-type for image validation and processing
- Upstash Redis for rate limiting and daily quotas
- Cloudflare Turnstile for bot protection
- Vitest, Testing Library and Playwright

## Getting started

**Requirements:** Node.js 20.9 or later, npm, and Google Chrome (for end-to-end tests).

```bash
git clone <your-repo-url> chromafy
cd chromafy
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without an image provider configured, the app
runs normally but transformations are disabled.

### Setting up Cloudflare Workers AI (free tier)

1. Create a Cloudflare account.
2. Copy your **Account ID** from the dashboard.
3. Go to **My Profile → API Tokens** and create a token with the **Workers AI** permission.
4. Add both values to `.env.local`:
   ```bash
   CLOUDFLARE_ACCOUNT_ID=...
   CLOUDFLARE_API_TOKEN=...
   ```
5. Restart the dev server.

The free plan includes 10,000 neurons a day, enough for about 60–90 transformations.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `IMAGE_PROVIDER` | If both providers are set | `cloudflare` or `openai` |
| `CLOUDFLARE_ACCOUNT_ID` | For Cloudflare | 32-character account ID |
| `CLOUDFLARE_API_TOKEN` | For Cloudflare | API token with Workers AI permission |
| `CLOUDFLARE_IMAGE_MODEL` | No | `@cf/black-forest-labs/flux-2-klein-4b` (default) or `flux-2-klein-9b` |
| `OPENAI_API_KEY` | For OpenAI | OpenAI API key |
| `OPENAI_IMAGE_MODEL` | No | Defaults to `gpt-image-2.5-sunburst` |
| `UPSTASH_REDIS_REST_URL` | In production | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | In production | Upstash Redis REST token |
| `TURNSTILE_SITE_KEY` | Recommended | Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY` | Recommended | Cloudflare Turnstile secret key |
| `DAILY_IMAGE_LIMIT` | No | Transformations per person per day (default `5`) |
| `DAILY_GLOBAL_LIMIT` | No | Transformations per day across all users (default `80`) |
| `MAX_IMAGE_SIZE_MB` | No | Maximum upload size (default `10`) |
| `MAX_IMAGE_PIXELS` | No | Maximum decoded pixel count (default `20000000`) |
| `TRUSTED_CLIENT_IP_HEADER` | Non-Vercel hosts | Header your proxy sets with the client IP |

In production, transformations are refused unless Upstash is configured.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript checks |
| `npm test` | Run unit, route and UI tests |
| `npm run test:e2e` | Run end-to-end tests in Chrome |
| `npm run check` | Lint, typecheck, test and build |

Automated tests use a mocked image provider and never call a real API. To test a real
transformation against a running server:

```bash
node scripts/smoke-transform.mjs golden jetty http://localhost:3000
```

## Project structure

```text
src/
  app/            Pages (/, /create, /privacy) and the /api/transform route
  components/     Landing page, studio, upload, comparison and shared UI
  hooks/          React hooks
  lib/
    ai/           Image providers and prompt building
    images/       Upload validation, normalisation and output checks
    security/     Rate limiting, daily quota, Turnstile, CSP, request validation
    transform/    The transform request handler
    config/       Environment, moods and samples
    client/       Browser-side upload, request and share helpers
  proxy.ts        Per-request Content Security Policy
tests/            Unit, route, UI and end-to-end tests
public/samples/   Sample photos
docs/             Security checklist
```

## How it works

1. The browser resizes the photo to at most 2048px and sends it to `/api/transform?mood=<world>`.
2. The server checks the origin, request, rate limit and bot token, then validates the image.
3. The image is re-encoded, which removes metadata such as GPS location.
4. A daily use is reserved, and the image is sent to the provider with a server-side prompt.
5. With Cloudflare, the model's colour and light are applied to the full-resolution original, so the
   result keeps the original's detail and framing.
6. The result is validated and returned to the browser. Nothing is stored.

Uses lost to provider failures are refunded. Uses for safety refusals are not.

## Security

- API keys stay on the server. The client can only choose a world.
- Uploads are size-limited while streaming, identified by file signature and pixel-limited.
- Per-person daily limits, a global daily cap and burst rate limiting, backed by Redis.
- Turnstile bot verification before any work is done.
- A strict nonce-based Content Security Policy and hardened security headers.
- Safe error messages that never expose internal details.

See [docs/security-checklist.md](docs/security-checklist.md) for the full list.

## Privacy

Chromafy has no accounts, database or analytics. Photos are processed in memory and sent only to
the configured image provider. Rate limits use a one-way hash of the visitor's IP address. See the
in-app `/privacy` page for details.

## Deployment

Chromafy is designed for [Vercel](https://vercel.com):

1. Import the repository into Vercel.
2. Add the environment variables, including Upstash and Turnstile.
3. Deploy.
4. Add your Vercel domain to the Turnstile widget's allowed hostnames.

The transform route needs a function duration of up to 180 seconds.

## Limitations

- Results are artistic interpretations. Fine details can change.
- Accepts JPEG, PNG and WebP only. HEIC, AVIF, GIF and animated images are not supported.
- Usage limits apply per network address, so people on a shared network share one allowance.
- With Cloudflare, results change colour, light and tone only. The model works from a small copy, so
  its own redraw is not used directly, and effects that add new detail (such as new clouds) are lost.

## Credits

Sample photos from [Unsplash](https://unsplash.com) (Unsplash License) by May Pamintuan, Luke
Chesser, Charles L., Sylwia Bartyzel, Kyle Szegedi, Breather, Padurariu Alexandru and Gozha Net.
Typeface: Stack Sans.
