"use client";

import { motion } from "framer-motion";
import { CompareSlider } from "./compare-slider";

export type ComparisonMode = "slider" | "side";

type Props = {
  beforeUrl: string;
  afterUrl: string;
  moodName: string;
  aspectRatio: number;
  mode: ComparisonMode;
  onModeChange: (mode: ComparisonMode) => void;
};

export function ComparisonView({ beforeUrl, afterUrl, moodName, aspectRatio, mode, onModeChange }: Props) {
  const afterLabel = `Reimagined · ${moodName}`;
  const beforeAlt = "Your original photo";
  const afterAlt = `Your photo reimagined in the ${moodName} world`;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col gap-4">
      <div role="group" aria-label="Comparison view" className="inline-flex self-start rounded-full bg-paper p-1">
        {(
          [
            ["slider", "Slider"],
            ["side", "Side by side"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
            className={`min-h-10 rounded-full px-4 text-small font-medium transition-colors duration-200 ${
              mode === value ? "bg-ink text-paper" : "text-ink hover:bg-paper-3"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "slider" ? (
        <CompareSlider
          beforeUrl={beforeUrl}
          afterUrl={afterUrl}
          beforeAlt={beforeAlt}
          afterAlt={afterAlt}
          afterLabel={afterLabel}
          aspectRatio={aspectRatio}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { url: beforeUrl, alt: beforeAlt, label: "Original" },
            { url: afterUrl, alt: afterAlt, label: afterLabel },
          ].map((item) => (
            <figure key={item.label} className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob URLs are not optimisable */}
              <img
                src={item.url}
                alt={item.alt}
                className="w-full rounded-media bg-paper-3 object-cover"
                style={{ aspectRatio }}
              />
              <figcaption className="text-small font-medium">{item.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </motion.div>
  );
}
