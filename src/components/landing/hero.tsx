import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";
import { MOODS, type MoodId } from "@/lib/config/moods";
import { findSample } from "@/lib/config/samples";

const HERO_SAMPLE = findSample("hay-field")!;

/** Ordered light to dark, as the direction asks; each links to its world on the stage below. */
const SWATCH_ORDER: MoodId[] = ["daydream", "golden", "after-rain", "old-soul"];

export function Hero() {
  return (
    <header className="bg-paper">
      <div className="grid gap-2 p-2 lg:h-[max(640px,min(100svh,980px))] lg:grid-cols-12 lg:gap-[10px] lg:p-[10px]">
        <div className="relative h-[64svh] min-h-[460px] overflow-hidden rounded-media lg:col-span-10 lg:h-auto">
          <Image
            src={HERO_SAMPLE.src}
            alt={`${HERO_SAMPLE.alt}. An original photograph, not a Chromafy result.`}
            fill
            priority
            sizes="(min-width: 1024px) 84vw, 100vw"
            className="drift object-cover object-[50%_70%]"
          />
          <div className="scrim-bottom absolute inset-x-0 bottom-0 h-1/2" aria-hidden="true" />

          <nav aria-label="Main" className="absolute inset-x-0 top-0 flex items-center justify-between p-5 text-ink lg:p-7">
            <Link href="/" aria-label="Chromafy home" className="rounded-full">
              <Wordmark />
            </Link>
            <ul className="flex items-center gap-1 text-small font-medium sm:gap-2">
              <li>
                <a href="#how" className="hidden rounded-full px-3 py-2 hover:bg-paper/60 sm:inline-block">
                  How it works
                </a>
              </li>
              <li>
                <Link href="/privacy" className="rounded-full px-3 py-2 hover:bg-paper/60">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/create" className="inline-flex items-center gap-1 rounded-full bg-ink px-4 py-2 text-paper hover:bg-ink/85">
                  Open studio
                </Link>
              </li>
            </ul>
          </nav>

          <h1 className="absolute inset-x-5 top-[22%] text-center text-[12vw] leading-[1.02] text-ink lg:top-[17%] lg:text-display">
            What if it felt
            <br /> different?
          </h1>

          <div className="absolute inset-x-5 bottom-6 flex flex-col items-center gap-5 lg:inset-x-7 lg:bottom-9 lg:block">
            <p className="hidden max-w-[22rem] text-body text-paper lg:absolute lg:bottom-1 lg:left-0 lg:block">
              Take an ordinary moment. Give it a new atmosphere.
            </p>
            <div className="lg:flex lg:justify-center">
              <ButtonLink href="/create" icon={<ArrowUpRight className="size-5" strokeWidth={1.5} />}>
                Reimagine a photo
              </ButtonLink>
            </div>
            <p className="text-center text-small text-paper/90 lg:absolute lg:bottom-1 lg:right-0 lg:text-right">
              Original photo, unedited · {HERO_SAMPLE.credit.author} / Unsplash
            </p>
          </div>
        </div>

        <nav aria-label="The four worlds" className="lg:col-span-2">
          <ul className="flex flex-col lg:h-full">
            {SWATCH_ORDER.map((id) => {
              const mood = MOODS[id];
              return (
                <li key={id} className="lg:flex-1">
                  <a
                    href={`#world-${id}`}
                    className="group flex h-[52px] items-start justify-between px-5 pt-4 transition-[filter] duration-200 hover:brightness-95 lg:h-full lg:flex-col lg:justify-between lg:pb-5"
                    style={{ backgroundColor: mood.field.background, color: mood.field.ink }}
                  >
                    <span className="text-small font-medium lg:text-body">{mood.name}</span>
                    <span className="hidden text-small opacity-90 lg:block">{mood.feeling}</span>
                  </a>
                </li>
              );
            })}
            <li className="lg:flex-1">
              <a
                href="#samples"
                className="flex h-[52px] items-start justify-between bg-ink px-5 pt-4 text-paper transition-colors duration-200 hover:bg-[#2b2638] lg:h-full lg:flex-col lg:pb-5"
              >
                <span className="text-small font-medium lg:text-body">Try a sample photo</span>
                <span className="hidden text-small text-paper/85 lg:block">Eight ordinary moments</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <p className="page-x pt-6 text-lead lg:hidden">Take an ordinary moment. Give it a new atmosphere.</p>
    </header>
  );
}
