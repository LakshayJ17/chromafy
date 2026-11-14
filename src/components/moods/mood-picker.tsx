"use client";

import { Check } from "lucide-react";
import { MOOD_LIST, type MoodId } from "@/lib/config/moods";

/** Native radio inputs: arrow keys, labels and the selected state work without extra script. */
export function MoodPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: MoodId | null;
  onChange: (mood: MoodId) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-small font-medium text-ink-2">Choose a world</legend>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {MOOD_LIST.map((mood) => {
          const selected = value === mood.id;
          return (
            <label
              key={mood.id}
              className={`group relative flex cursor-pointer flex-col gap-3 rounded-[16px] p-3 transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.985] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                selected ? "bg-accent-soft ring-2 ring-accent" : "bg-paper hover:bg-paper-3"
              }`}
            >
              <input
                type="radio"
                name="mood"
                value={mood.id}
                checked={selected}
                onChange={() => onChange(mood.id)}
                className="sr-only"
              />
              <span className="flex h-10 overflow-hidden rounded-[8px]" aria-hidden="true">
                {mood.swatches.map((swatch) => (
                  <span key={swatch} className="flex-1" style={{ backgroundColor: swatch }} />
                ))}
              </span>
              <span className="flex items-start justify-between gap-2">
                <span>
                  <span className="block text-body font-medium leading-tight">{mood.name}</span>
                  <span className="mt-0.5 block text-small leading-snug text-ink-2">{mood.feeling}</span>
                </span>
                {selected && (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                    <Check className="size-4" strokeWidth={2} aria-hidden="true" />
                    <span className="sr-only">Selected</span>
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
