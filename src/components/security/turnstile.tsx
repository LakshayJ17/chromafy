"use client";

import Script from "next/script";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileHandle = {
  /** Runs the check and resolves with a fresh single-use token. */
  getToken(): Promise<string>;
};

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN_TIMEOUT_MS = 60_000;

/**
 * Cloudflare Turnstile, rendered on demand. With `execution: "execute"` and
 * `appearance: "interaction-only"` it stays invisible unless Cloudflare decides
 * a person must tick a box, in which case the box appears here.
 */
export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string; nonce?: string }>(function Turnstile(
  { siteKey, nonce },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const pendingRef = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | null>(null);

  const settle = useCallback((outcome: { token: string } | { error: string }) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    if ("token" in outcome) pending.resolve(outcome.token);
    else pending.reject(new Error(outcome.error));
  }, []);

  const ensureWidget = useCallback(() => {
    if (widgetRef.current || !window.turnstile || !containerRef.current) return widgetRef.current;
    widgetRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: "transform",
      execution: "execute",
      appearance: "interaction-only",
      theme: "light",
      callback: (token: string) => settle({ token }),
      "error-callback": () => settle({ error: "Turnstile error" }),
      "expired-callback": () => settle({ error: "Turnstile expired" }),
      "timeout-callback": () => settle({ error: "Turnstile timeout" }),
    });
    return widgetRef.current;
  }, [settle, siteKey]);

  useImperativeHandle(
    ref,
    () => ({
      getToken() {
        return new Promise<string>((resolve, reject) => {
          const widgetId = ensureWidget();
          if (!widgetId || !window.turnstile) {
            reject(new Error("Turnstile not loaded"));
            return;
          }
          pendingRef.current?.reject(new Error("superseded"));
          const timer = window.setTimeout(() => settle({ error: "Turnstile timed out" }), TOKEN_TIMEOUT_MS);
          pendingRef.current = {
            resolve: (token) => {
              window.clearTimeout(timer);
              resolve(token);
            },
            reject: (error) => {
              window.clearTimeout(timer);
              reject(error);
            },
          };
          // Tokens are single use: reset before each run so a fresh one is issued.
          window.turnstile.reset(widgetId);
          window.turnstile.execute(widgetId);
        });
      },
    }),
    [ensureWidget, settle],
  );

  useEffect(() => {
    return () => {
      pendingRef.current?.reject(new Error("unmounted"));
      pendingRef.current = null;
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, []);

  return (
    <>
      <Script src={SCRIPT_URL} strategy="afterInteractive" nonce={nonce} onReady={() => void ensureWidget()} />
      <div ref={containerRef} className="empty:hidden" aria-label="Security check" />
    </>
  );
});
