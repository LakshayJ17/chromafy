import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Wordmark } from "@/components/layout/logo";
import { SiteFooter } from "@/components/layout/site-footer";
import { Studio } from "@/components/studio/studio";
import { isLiveTransformConfigured } from "@/lib/config/env";
import { getClientId } from "@/lib/security/client-identity";
import type { QuotaStatus } from "@/lib/security/daily-quota";
import { getServices } from "@/lib/security/services";
import { findSample } from "@/lib/config/samples";

export const metadata: Metadata = {
  title: "Studio",
  description: "Choose a photo, pick a world and see it in another light.",
};

export default async function CreatePage({ searchParams }: PageProps<"/create">) {
  const { sample } = await searchParams;
  // Only IDs from the curated registry are honoured; anything else is ignored.
  const initialSample = findSample(sample);

  const live = isLiveTransformConfigured();
  const requestHeaders = await headers();
  let quota: QuotaStatus | null = null;
  let turnstileSiteKey: string | undefined;
  if (live) {
    const services = getServices();
    // Read-only: showing the allowance never spends a use.
    quota = await services.quota.peek(getClientId(requestHeaders, services.config.clientIpHeader));
    turnstileSiteKey = services.config.turnstile?.siteKey;
  }

  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <header className="page-x flex items-center justify-between py-5">
        <Link href="/" aria-label="Chromafy home" className="rounded-full">
          <Wordmark />
        </Link>
        <nav aria-label="Studio" className="flex gap-1 text-small font-medium">
          <Link href="/#worlds" className="rounded-full px-3 py-2 hover:bg-paper-2">
            The worlds
          </Link>
          <Link href="/privacy" className="rounded-full px-3 py-2 hover:bg-paper-2">
            Privacy
          </Link>
        </nav>
      </header>
      <main className="page-x flex-1 pb-24">
        <h1 className="max-w-[16ch] pb-8 pt-6 text-head lg:pt-10">Reimagine a photo</h1>
        <Studio
          liveEnabled={live}
          quota={quota}
          turnstileSiteKey={turnstileSiteKey}
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          initialSample={initialSample && { id: initialSample.id, title: initialSample.title, src: initialSample.src }}
        />
      </main>
      <SiteFooter compact />
    </div>
  );
}
