"use client";

import { MoveHorizontal } from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Before-and-after slider. The reimagined image fills the frame; the original
 * is revealed from the left up to the handle. Works with mouse, touch, pen and keyboard.
 */
export function CompareSlider({
  beforeUrl,
  afterUrl,
  beforeAlt,
  afterAlt,
  afterLabel,
  aspectRatio,
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeAlt: string;
  afterAlt: string;
  afterLabel: string;
  aspectRatio: number;
}) {
  const [position, setPosition] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return;
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100));
  }, []);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, PageDown: -10, PageUp: 10 };
    if (event.key in steps) setPosition((current) => clamp(current + steps[event.key]));
    else if (event.key === "Home") setPosition(0);
    else if (event.key === "End") setPosition(100);
    else return;
    event.preventDefault();
  }

  return (
    <div
      ref={frameRef}
      className="relative w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-media bg-paper-3"
      style={{ aspectRatio }}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => dragging.current && moveTo(event.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URLs are not optimisable */}
      <img src={afterUrl} alt={afterAlt} draggable={false} className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URLs are not optimisable */}
        <img src={beforeUrl} alt={beforeAlt} draggable={false} className="absolute inset-0 size-full object-cover" />
      </div>

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-small font-medium text-ink">
        Original
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-ink/90 px-3 py-1 text-small font-medium text-paper">
        {afterLabel}
      </span>

      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-paper" style={{ left: `${position}%` }} aria-hidden="true" />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Compare original and reimagined"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${Math.round(position)}% original showing`}
        onKeyDown={onKeyDown}
        className="absolute top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-ink shadow-float focus-visible:outline-offset-4"
        style={{ left: `${position}%` }}
      >
        <MoveHorizontal className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </div>
    </div>
  );
}
