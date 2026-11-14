"use client";

import { useEffect, useMemo } from "react";

const pendingRevocations = new Map<string, number>();

/**
 * Creates an object URL for a Blob and revokes it when the Blob changes or the
 * component unmounts, so replaced photos and results release their memory.
 *
 * Revocation is deferred by one task: React's development StrictMode unmounts
 * and immediately remounts effects, and the remount cancels the pending revoke
 * so a URL still on screen is never invalidated.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) return;
    const pending = pendingRevocations.get(url);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      pendingRevocations.delete(url);
    }
    return () => {
      pendingRevocations.set(
        url,
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
          pendingRevocations.delete(url);
        }, 0),
      );
    };
  }, [url]);

  return url;
}
