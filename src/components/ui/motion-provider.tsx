"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** Honours the visitor's reduced-motion setting and passes the CSP nonce to injected styles. */
export function MotionProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <MotionConfig reducedMotion="user" nonce={nonce} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}>
      {children}
    </MotionConfig>
  );
}
