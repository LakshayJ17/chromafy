import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet";

const base =
  "group inline-flex min-h-12 select-none items-center justify-center gap-3 rounded-full text-body font-medium transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-accent pl-6 pr-2 text-on-accent hover:bg-accent-press",
  secondary: "bg-paper-3 px-6 text-ink hover:bg-[#ddd4c3]",
  quiet: "min-h-11 px-3 text-ink underline-offset-4 hover:underline",
};

/** The nested trailing icon: a circle inside the pill that leans toward the action on hover. */
function TrailingIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 ease-out group-hover:-translate-y-px group-hover:translate-x-0.5"
    >
      {children}
    </span>
  );
}

type Common = { variant?: Variant; icon?: ReactNode; className?: string; children: ReactNode };

export function Button({ variant = "primary", icon, className = "", children, ...props }: Common & ComponentProps<"button">) {
  return (
    <button {...props} className={`${base} ${variants[variant]} ${variant === "primary" && !icon ? "pr-6" : ""} ${className}`}>
      {children}
      {icon && variant === "primary" ? <TrailingIcon>{icon}</TrailingIcon> : icon}
    </button>
  );
}

export function ButtonLink({ variant = "primary", icon, className = "", children, ...props }: Common & ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={`${base} ${variants[variant]} ${variant === "primary" && !icon ? "pr-6" : ""} ${className}`}>
      {children}
      {icon && variant === "primary" ? <TrailingIcon>{icon}</TrailingIcon> : icon}
    </Link>
  );
}
