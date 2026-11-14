"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export const PROCESSING_MESSAGES = [
  "Finding another light.",
  "Exploring a new palette.",
  "Reimagining the atmosphere.",
  "Preparing your alternate world.",
];

/**
 * Activity, not progress: rotating general messages and real elapsed
 * time. There is no percentage because the provider reports none.
 */
export function ProcessingOverlay({ moodName, onCancel }: { moodName: string; onCancel: () => void }) {
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      setIndex(Math.floor(elapsed / 4) % PROCESSING_MESSAGES.length);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col justify-end overflow-hidden rounded-media">
      <div className="absolute inset-0 bg-ink/35" aria-hidden="true" />
      <div className="light-sweep absolute inset-y-0 left-0 w-1/3 bg-paper/25 blur-2xl" aria-hidden="true" />
      <div className="relative m-3 flex flex-wrap items-end justify-between gap-4 rounded-[16px] bg-paper p-5 sm:m-4">
        <div aria-hidden="true">
          <p className="text-small text-ink-2">Reimagining in {moodName}</p>
          <div className="relative mt-1 h-8 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={index}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="font-display text-[1.5rem] leading-8 tracking-[-0.02em]"
              >
                {PROCESSING_MESSAGES[index]}
              </motion.p>
            </AnimatePresence>
          </div>
          <p className="mt-1 text-small text-ink-2">{seconds}s · this can take up to two minutes</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-full bg-paper-3 px-5 text-small font-medium text-ink transition-colors hover:bg-[#ddd4c3]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
