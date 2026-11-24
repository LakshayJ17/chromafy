"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";
import { MOODS, type MoodId } from "@/lib/config/moods";
import { findSample } from "@/lib/config/samples";

const HERO_SAMPLE = findSample("hay-field")!;

/** Ordered light to dark, as the direction asks. */
const SWATCH_ORDER: MoodId[] = ["daydream", "golden", "after-rain", "old-soul"];

/**
 * Real Chromafy results for the hero photo, made once with the production
 * pipeline (FLUX.2 [klein] on Cloudflare, its look then applied to the original)
 * and saved as static files. Nothing here is a filter imitation.
 */
const HERO_RESULTS: Record<MoodId, string> = {
  golden: "/samples/hero/hay-field-golden.jpg",
  "after-rain": "/samples/hero/hay-field-after-rain.jpg",
  "old-soul": "/samples/hero/hay-field-old-soul.jpg",
  daydream: "/samples/hero/hay-field-daydream.jpg",
};

/**
 * Headline and menu colour for each world, taken from its palette and checked
 * against the result's sky behind the headline (at least 4.5:1 on average).
 */
const HERO_INK: Record<MoodId | "original", string> = {
  original: "#1A1726",
  golden: "#6B2E0A",
  "after-rain": "#0E3B36",
  "old-soul": "#24120B",
  daydream: "#4E2D6B",
};

const WIPE_SECONDS = 1.1;
const HIDDEN = "inset(0% 100% 0% 0%)";
const SHOWN = "inset(0% 0% 0% 0%)";

export function Hero() {
  const [active, setActive] = useState<MoodId | null>(null);
  const reduceMotion = useReducedMotion();
  const ink = HERO_INK[active ?? "original"];

  return (
    <header className="bg-paper">
      <div className="grid gap-2 p-2 lg:h-[max(640px,min(100svh,980px))] lg:grid-cols-12 lg:gap-[10px] lg:p-[10px]">
        <div className="relative h-[64svh] min-h-[460px] overflow-hidden rounded-media lg:col-span-10 lg:h-auto">
          <div className="drift absolute inset-0">
            <Image
              src={HERO_SAMPLE.src}
              alt={
                active
                  ? `${HERO_SAMPLE.alt}, reimagined by Chromafy in the ${MOODS[active].name} world.`
                  : `${HERO_SAMPLE.alt}. An original photograph, not a Chromafy result.`
              }
              fill
              priority
              sizes="(min-width: 1024px) 84vw, 100vw"
              className="object-cover object-[50%_70%]"
            />
            {SWATCH_ORDER.map((id) => {
              const isActive = id === active;
              // The new world sweeps in from the left over the current picture; the
              // one underneath is hidden only once the sweep has covered it.
              const transition = reduceMotion
                ? { duration: 0 }
                : isActive
                  ? { duration: WIPE_SECONDS, ease: [0.32, 0.72, 0, 1] as const }
                  : active === null
                    ? { duration: WIPE_SECONDS * 0.8, ease: [0.32, 0.72, 0, 1] as const }
                    : { duration: 0, delay: WIPE_SECONDS };
              return (
                <motion.div
                  key={id}
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{ zIndex: isActive ? 2 : 1, clipPath: HIDDEN }}
                  initial={false}
                  animate={{ clipPath: isActive ? SHOWN : HIDDEN }}
                  transition={transition}
                >
                  <Image
                    src={HERO_RESULTS[id]}
                    alt=""
                    fill
                    loading="eager"
                    sizes="(min-width: 1024px) 84vw, 100vw"
                    className="object-cover object-[50%_70%]"
                  />
                </motion.div>
              );
            })}
          </div>
          <div className="scrim-bottom absolute inset-x-0 bottom-0 z-[3] h-1/2" aria-hidden="true" />

          <nav
            aria-label="Main"
            className="absolute inset-x-0 top-0 z-[4] flex items-center justify-between gap-3 p-4 transition-colors duration-700 sm:p-5 lg:p-7"
            style={{ color: ink }}
          >
            <Link href="/" aria-label="Chromafy home" className="rounded-full">
              <Wordmark />
            </Link>
            <ul className="flex items-center gap-1 text-small font-medium sm:gap-2">
              <li>
                <a href="#how" className="hidden rounded-full px-3 py-2.5 hover:bg-paper/60 md:inline-block">
                  How it works
                </a>
              </li>
              <li>
                <Link href="/privacy" className="hidden rounded-full px-3 py-2.5 hover:bg-paper/60 sm:inline-block">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/create" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ink px-4 py-2.5 text-paper hover:bg-ink/85">
                  Open studio
                </Link>
              </li>
            </ul>
          </nav>

          <h1
            className="absolute inset-x-5 top-[22%] z-[4] text-center text-[12vw] leading-[1.02] transition-colors duration-700 lg:top-[17%] lg:text-display"
            style={{ color: ink }}
          >
            What if it felt
            <br /> different?
          </h1>

          <div className="absolute inset-x-5 bottom-6 z-[4] flex flex-col items-center gap-5 lg:inset-x-7 lg:bottom-9 lg:block">
            <p className="hidden max-w-[22rem] text-body text-paper lg:absolute lg:bottom-1 lg:left-0 lg:block">
              Take an ordinary moment. Give it a new atmosphere.
            </p>
            <div className="lg:flex lg:justify-center">
              <ButtonLink href="/create" icon={<ArrowUpRight className="size-5" strokeWidth={1.5} />}>
                Reimagine a photo
              </ButtonLink>
            </div>
            <p aria-live="polite" className="text-center text-small text-paper/90 lg:absolute lg:bottom-1 lg:right-0 lg:text-right">
              {active
                ? `Chromafy result: ${MOODS[active].name}. Photo by ${HERO_SAMPLE.credit.author} on Unsplash`
                : `The unedited original. Photo by ${HERO_SAMPLE.credit.author} on Unsplash`}
            </p>
          </div>
        </div>

        <nav aria-label="The worlds" className="lg:col-span-2">
          <ul className="grid grid-cols-2 gap-1 overflow-hidden rounded-media sm:grid-cols-4 lg:flex lg:h-full lg:flex-col lg:gap-0 lg:overflow-visible lg:rounded-none">
            {SWATCH_ORDER.map((id) => {
              const mood = MOODS[id];
              const isActive = id === active;
              return (
                <li key={id} className="lg:flex-1">
                  <button
                    type="button"
                    aria-pressed={isActive}
                    aria-label={`Show this photo in ${mood.name}`}
                    onClick={() => setActive(isActive ? null : id)}
                    className="group flex h-14 w-full items-center justify-between px-3 text-left sm:px-5 transition-[filter] duration-200 hover:brightness-95 lg:h-full lg:flex-col lg:items-start lg:justify-between lg:pb-5 lg:pt-4"
                    style={{ backgroundColor: mood.field.background, color: mood.field.ink }}
                  >
                    <span className="flex items-center gap-2 text-small font-medium lg:text-body">
                      {mood.name}
                      {isActive && <Check className="size-4" strokeWidth={2} aria-hidden="true" />}
                    </span>
                    <span className="hidden text-small opacity-90 lg:block">
                      {isActive ? "Tap again for the original" : mood.feeling}
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="col-span-2 sm:col-span-4 lg:flex-1">
              <a
                href="#samples"
                className="flex h-14 items-center justify-between bg-ink px-3 text-paper transition-colors duration-200 hover:bg-[#2b2638] sm:px-5 lg:h-full lg:flex-col lg:items-start lg:pb-5 lg:pt-4"
              >
                <span className="text-small font-medium lg:text-body">
                  <span className="lg:hidden">Samples</span>
                  <span className="hidden lg:inline">Try a sample photo</span>
                </span>
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
