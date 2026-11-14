/**
 * Chromafy's own mark: a prism that splits one ray of light into four short
 * bands, one per world. Inline SVG, no external asset.
 */
export function PrismMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d="M2 17.5h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 5 25 25H5Z" fill="currentColor" />
      <path d="M17.5 14.5 31 9.5" stroke="#EDB458" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M18.5 16.5 31 14" stroke="#2E8A7E" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M19.5 18.5 31 18.5" stroke="#B5654A" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M20.5 20.5 31 23" stroke="#C9B3E6" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <PrismMark />
      <span className="font-display text-[1.375rem] font-normal tracking-[-0.03em]">chromafy</span>
    </span>
  );
}
