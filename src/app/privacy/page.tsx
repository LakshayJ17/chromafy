import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/layout/logo";
import { SiteFooter } from "@/components/layout/site-footer";
import { getActiveProviderKind, PROVIDER_LABELS, type ProviderKind } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What happens to a photo you reimagine with Chromafy.",
};

const linkClass = "underline underline-offset-4 hover:text-accent";

/** Provider terms as published by each provider; checked October 2026. */
const PROVIDER_TERMS: Record<ProviderKind, React.ReactNode> = {
  cloudflare: (
    <>
      <p>
        Chromafy uses Cloudflare Workers AI, running the FLUX.2 [klein] image model by Black Forest Labs on
        Cloudflare&apos;s own infrastructure. Cloudflare&apos;s Workers AI data documentation (checked October
        2026) says it does not use content processed by Workers AI to train AI models, does not keep inputs or
        outputs after they are no longer needed to answer the request, and keeps only operational metadata
        such as timings and sizes, which does not include the content.
      </p>
      <p>
        Read{" "}
        <a href="https://developers.cloudflare.com/workers-ai/platform/data-usage/" className={linkClass} rel="noreferrer">
          Cloudflare&apos;s Workers AI data usage page
        </a>{" "}
        and the{" "}
        <a href="https://bfl.ai/legal/terms-of-service" className={linkClass} rel="noreferrer">
          model&apos;s terms
        </a>
        . To fit the model&apos;s input limit, the photo it receives is under 512 pixels on its longest side.
      </p>
    </>
  ),
  openai: (
    <>
      <p>
        Chromafy uses OpenAI&apos;s Images API. According to OpenAI&apos;s published API data controls (checked
        October 2026), data sent through the API is not used to train its models by default, the image
        endpoints keep no application state, and abuse-monitoring logs may be retained for up to 30 days. OpenAI
        also scans submitted images for child sexual abuse material and may keep flagged images for review.
      </p>
      <p>
        Read{" "}
        <a href="https://developers.openai.com/api/docs/guides/your-data" className={linkClass} rel="noreferrer">
          OpenAI&apos;s data controls documentation
        </a>
        .
      </p>
    </>
  ),
};

function buildSections(provider: ProviderKind | null): Array<{ title: string; body: React.ReactNode }> {
  const providerName = provider ? PROVIDER_LABELS[provider] : "the image provider";
  return [
    {
      title: "What leaves your device",
      body: (
        <>
          <p>
            Choosing or previewing a photo happens in your browser. Nothing is uploaded until you choose a
            world and press <strong className="font-medium">Reimagine</strong>.
          </p>
          <p>
            Before uploading, your browser makes a resized copy of the photo, at most 2048 pixels on its
            longest side. That copy goes to this application&apos;s server, which checks it, re-encodes it
            and removes metadata such as camera details and GPS location. The server then sends it to our
            image provider, {providerName}, with the instructions for the world you chose.
          </p>
        </>
      ),
    },
    {
      title: "What Chromafy keeps",
      body: (
        <>
          <p>
            Nothing. There are no accounts, no gallery and no database of images. The server processes
            each photo in memory and returns the result directly to your browser. Image contents are never
            written to logs or sent to analytics. Chromafy has no analytics.
          </p>
          <p>
            In your browser, the original and the result are held as temporary in-memory object URLs.
            They are released when you replace the photo, start again or leave the page, and they are never
            saved to local storage. Your downloads are yours to keep.
          </p>
          <p>
            To prevent misuse, each person can reimagine a limited number of photos per day. The server
            counts uses against a one-way hash of your network address (never the address itself): a
            daily counter that expires within two days, and a short counter for bursts of requests that
            expires within minutes. In production these counters live in Upstash Redis.
          </p>
          <p>
            If the security check is enabled, your browser also runs Cloudflare Turnstile when you press
            Reimagine. Cloudflare says it processes signals such as your IP address and browser details
            only to tell people from bots, not to identify or profile anyone. See{" "}
            <a href="https://www.cloudflare.com/turnstile-privacy-policy/" className={linkClass} rel="noreferrer">
              Cloudflare&apos;s Turnstile privacy addendum
            </a>
            .
          </p>
        </>
      ),
    },
    {
      title: "What the provider does",
      body: (
        <>
          {provider ? (
            PROVIDER_TERMS[provider]
          ) : (
            <p>This server has no image provider configured yet, so no photo leaves it.</p>
          )}
          <p>Chromafy cannot delete anything held by the provider on your behalf.</p>
        </>
      ),
    },
    {
      title: "What a result is, and is not",
      body: (
        <>
          <p>
            A result is a generative reinterpretation. The model is asked to keep your subject and
            composition, but details can change. Old Soul is a film-inspired mood, not a historical
            restoration. Please don&apos;t present a result as a factual record of a place, event or person.
          </p>
          <p>
            The image provider may decline some photos under its safety policy. Chromafy does not try to get
            around those decisions.
          </p>
        </>
      ),
    },
    {
      title: "Sharing",
      body: (
        <p>
          Share uses your device&apos;s own share sheet when it supports sharing files. Chromafy never
          uploads your result anywhere to create a public link.
        </p>
      ),
    },
  ];
}

export default function PrivacyPage() {
  const sections = buildSections(getActiveProviderKind());
  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <header className="page-x flex items-center justify-between py-5">
        <Link href="/" aria-label="Chromafy home" className="rounded-full">
          <Wordmark />
        </Link>
        <Link href="/create" className="rounded-full bg-ink px-4 py-2 text-small font-medium text-paper hover:bg-ink/85">
          Open studio
        </Link>
      </header>
      <main className="page-x flex-1 pb-28 pt-16 lg:pt-24">
        <h1 className="max-w-[14ch] text-display">Your photo, plainly</h1>
        <p className="mt-8 max-w-[38rem] text-lead">
          What happens to a photo when you reimagine it, where it goes, and what is kept.
        </p>
        <div className="mt-20 grid gap-16 lg:grid-cols-12">
          {sections.map((section) => (
            <section key={section.title} className="grid gap-4 lg:col-span-12 lg:grid-cols-12 lg:gap-6">
              <h2 className="text-[1.75rem] leading-tight lg:col-span-4">{section.title}</h2>
              <div className="flex max-w-[40rem] flex-col gap-4 text-body lg:col-span-7 lg:col-start-6">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter compact />
    </div>
  );
}
