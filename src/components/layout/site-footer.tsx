import Link from "next/link";
import { Wordmark } from "./logo";

export function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer
      id="about"
      className={`flex flex-col bg-paper-2 px-[var(--gutter)] pt-10 text-ink ${compact ? "pb-8" : "min-h-[80svh] pb-8"}`}
    >
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-3">
          <Wordmark />
        </div>
        <div className="max-w-[60ch] text-body lg:col-span-4">
          <h2 className="sr-only">About Chromafy</h2>
          <p>
            Chromafy is a small creative playground. You bring an ordinary photo, choose one of four
            worlds, and an AI image model reinterprets its colour, light and atmosphere. Results are
            artistic interpretations, not restorations or factual records.
          </p>
        </div>
        <div className="max-w-[60ch] text-body lg:col-span-4">
          <p>
            To transform a photo, it is sent to this server and to an AI image provider. Chromafy keeps
            no gallery and stores no images.{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-accent">
              Read the privacy notes
            </Link>
            .
          </p>
        </div>
        <div className="lg:col-span-1 lg:text-right">
          <a href="#top" className="text-small underline-offset-4 hover:underline">
            Back to top
          </a>
        </div>
      </div>

      {!compact && (
        <p className="mt-auto text-balance pt-24 font-display text-[clamp(2.75rem,8.6vw,8.25rem)] font-light leading-[1.02] tracking-[-0.022em]">
          The world, in another light.
        </p>
      )}

      <div className={`grid gap-2 text-small text-ink-2 sm:grid-cols-3 ${compact ? "mt-10" : "mt-8"}`}>
        <nav aria-label="Footer" className="flex gap-5">
          <Link href="/create" className="hover:text-ink">
            Studio
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/#how" className="hover:text-ink">
            How it works
          </Link>
        </nav>
        <p className="sm:text-center">Sample photos: Unsplash, via Lorem Picsum</p>
        <p className="sm:text-right">Chromafy · 2026</p>
      </div>
    </footer>
  );
}
