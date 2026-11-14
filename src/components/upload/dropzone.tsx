"use client";

import { ImageUp } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { ACCEPT_ATTRIBUTE } from "@/lib/client/prepare-upload";

export function Dropzone({ onFile, disabled = false }: { onFile: (file: File) => void; disabled?: boolean }) {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      data-dragging={dragging || undefined}
      className="flex h-full min-h-[420px] flex-col items-center justify-center gap-6 rounded-surface bg-paper-3 px-6 py-12 text-center transition-colors duration-200 data-[dragging]:bg-accent-soft"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-paper text-ink" aria-hidden="true">
        <ImageUp className="size-7" strokeWidth={1.5} />
      </span>
      <div>
        <p className="font-display text-[1.75rem] leading-tight tracking-[-0.022em] sm:text-[2.25rem]">
          {dragging ? "Drop it here" : "Drop a photo here"}
        </p>
        <p id={hintId} className="mt-2 text-small text-ink-2">
          JPEG, PNG or WebP · still images · up to 20 MB · at least 256 px
        </p>
      </div>
      <label
        htmlFor={inputId}
        className="inline-flex min-h-12 cursor-pointer items-center rounded-full bg-ink px-6 text-body font-medium text-paper transition-[background-color,transform] duration-200 ease-out hover:bg-ink/85 active:scale-[0.98] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent"
      >
        Choose a photo
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          aria-describedby={hintId}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so choosing the same file again still fires a change.
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
      </label>
    </div>
  );
}
