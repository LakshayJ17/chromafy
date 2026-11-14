import Link from "next/link";

/** The whole band is the action. On hover and focus, field and word swap colours. */
export function ActionBand() {
  return (
    <Link
      href="/create"
      className="group relative flex h-[46svh] min-h-[320px] flex-col justify-end overflow-hidden bg-accent px-[var(--gutter)] pb-6 text-on-accent transition-colors duration-150 hover:bg-paper-2 hover:text-accent focus-visible:bg-paper-2 focus-visible:text-accent focus-visible:outline-offset-[-6px] lg:h-[60svh]"
    >
      <span className="absolute left-[var(--gutter)] top-6 max-w-[22rem] text-lead">
        Keep the moment. Change the feeling. Open the studio and bring a photo.
      </span>
      <svg
        viewBox="0 0 48 48"
        className="absolute right-[var(--gutter)] top-6 size-8 lg:size-12"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 36 36 12M16 12h20v20" />
      </svg>
      <span className="block font-display text-[clamp(4rem,19vw,19rem)] font-normal leading-[0.85] tracking-[-0.045em]">
        Reimagine
      </span>
    </Link>
  );
}
