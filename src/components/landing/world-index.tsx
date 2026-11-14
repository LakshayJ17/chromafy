"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { isMoodId, MOOD_LIST, MOODS, type MoodId } from "@/lib/config/moods";

/**
 * The world index: four names on the left, and on the right a stage in the
 * chosen world's colour holding the real explanation card the studio shows
 * beside a result. No transformed image is shown here, because none exists
 * until someone runs a real transformation.
 */
export function WorldIndex() {
  const [selected, setSelected] = useState<MoodId>("golden");
  const mood = MOODS[selected];

  // The hero's swatch column links to #world-<id>; follow it.
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.replace("#world-", "");
      if (isMoodId(id)) setSelected(id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <section id="worlds" aria-labelledby="worlds-title" className="bg-paper py-24 lg:py-32">
      <div className="page-x grid gap-10 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-5 lg:pt-16">
          <h2 id="worlds-title" className="sr-only">
            The four worlds
          </h2>
          <div
            role="group"
            aria-label="Choose a world to read about"
            className="-mx-[var(--gutter)] flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-6 overflow-x-auto px-[var(--gutter)] pb-2 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0"
          >
            {MOOD_LIST.map((entry) => {
              const active = entry.id === selected;
              return (
                <button
                  key={entry.id}
                  id={`world-${entry.id}`}
                  type="button"
                  aria-pressed={active}
                  aria-controls="world-stage"
                  onClick={() => setSelected(entry.id)}
                  className={`shrink-0 snap-start scroll-mt-24 text-left font-display text-lead tracking-[-0.022em] transition-colors duration-200 lg:text-head ${
                    active ? "text-ink" : "text-ink-2/70 hover:text-ink"
                  }`}
                >
                  {entry.name}
                </button>
              );
            })}
          </div>
          <p className="mt-10 max-w-[30rem] text-body">
            Each world is a written direction for colour, light and contrast, not a preset filter. The
            model interprets it for your photo, so two photos in the same world will not look identical.
          </p>
        </div>

        <div
          id="world-stage"
          role="region"
          aria-live="polite"
          aria-label={`${mood.name}: what we ask the model for`}
          className="relative h-[70svh] min-h-[520px] overflow-hidden transition-colors duration-300 ease-out lg:col-span-7 lg:h-[88svh] lg:max-h-[880px]"
          style={{ backgroundColor: mood.field.background }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.article
              key={selected}
              data-ui
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="absolute left-4 top-[72px] w-[min(560px,calc(100%-2rem))] rounded-media bg-paper p-6 text-ink sm:left-16 sm:p-8"
            >
              <div className="flex items-center gap-2 text-small font-medium">
                <Check className="size-4 text-success" strokeWidth={1.75} aria-hidden="true" />
                What we ask the model for
              </div>
              <h3 className="mt-5 text-head">{mood.name}</h3>
              <p className="mt-2 text-lead text-ink-2">{mood.feeling}</p>

              <div className="mt-7 flex h-14 overflow-hidden rounded-[8px]" aria-hidden="true">
                {mood.swatches.map((swatch) => (
                  <span key={swatch} className="flex-1" style={{ backgroundColor: swatch }} />
                ))}
              </div>

              <dl className="mt-7 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-body">
                <dt className="text-ink-2">Palette</dt>
                <dd>{mood.palette}</dd>
                <dt className="text-ink-2">Light</dt>
                <dd>{mood.lighting}</dd>
                <dt className="text-ink-2">Contrast</dt>
                <dd>{mood.contrast}</dd>
              </dl>

              <p className="mt-8 bg-paper-2 p-5 text-body">{mood.explanation}</p>
              <p className="mt-6 text-small text-ink-2">{mood.description}</p>
            </motion.article>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
