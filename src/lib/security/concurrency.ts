import "server-only";

/**
 * Caps simultaneous provider calls on one server instance so a burst cannot
 * pile up long-running requests and memory. Excess requests are rejected
 * immediately rather than queued.
 */
export function createConcurrencyGate(maxInFlight: number) {
  let inFlight = 0;
  return {
    tryAcquire(): (() => void) | null {
      if (inFlight >= maxInFlight) return null;
      inFlight += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        inFlight -= 1;
      };
    },
    get inFlight() {
      return inFlight;
    },
  };
}

export type ConcurrencyGate = ReturnType<typeof createConcurrencyGate>;
