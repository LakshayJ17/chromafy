"use client";

import { AlertCircle, ArrowUpRight, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ComparisonView, type ComparisonMode } from "@/components/comparison/comparison-view";
import { MoodPicker } from "@/components/moods/mood-picker";
import { ProcessingOverlay } from "@/components/results/processing-overlay";
import { ResultDetails } from "@/components/results/result-details";
import { Turnstile, type TurnstileHandle } from "@/components/security/turnstile";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/upload/dropzone";
import { useObjectUrl } from "@/hooks/use-object-url";
import { checkFile, ClientImageError, prepareUpload } from "@/lib/client/prepare-upload";
import { downloadBlob, resultFilename, shareImage } from "@/lib/client/share";
import { requestTransform, TransformClientError, type QuotaInfo } from "@/lib/client/transform-client";
import { MOODS, pickSurpriseMood, type MoodId } from "@/lib/config/moods";
import type { Sample } from "@/lib/config/samples";
import { initialStudioState, studioReducer, type Original } from "./studio-state";

type Props = {
  liveEnabled: boolean;
  initialSample?: Pick<Sample, "id" | "title" | "src">;
  /** This visitor's daily allowance as the server sees it, or null if unknown. */
  quota?: QuotaInfo | null;
  /** Public Turnstile site key; when present, every transformation needs a bot-check token. */
  turnstileSiteKey?: string;
  nonce?: string;
};

async function readDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

function hoursUntil(time: number): number {
  return Math.max(1, Math.ceil((time - Date.now()) / 3_600_000));
}

/**
 * Scrolls the least distance that shows the whole element, or its bottom (where the result's
 * actions are) when it is taller than the screen. On phones the controls sit far below the
 * photo, so without this the result would appear out of sight.
 */
function bringIntoView(element: HTMLElement | null, { onlyIfMostlyHidden = false, dock = null as HTMLElement | null } = {}) {
  const rect = element?.getBoundingClientRect();
  if (!rect?.height) return;
  const view = window.innerHeight - coveredByDock(dock, rect);
  if (onlyIfMostlyHidden && Math.min(rect.bottom, view) - Math.max(rect.top, 0) >= Math.min(rect.height, view) / 2) return;
  const margin = 16;
  let delta = 0;
  if (rect.height + margin * 2 > view) delta = rect.bottom - (view - margin);
  else if (rect.top < margin) delta = rect.top - margin;
  else if (rect.bottom > view - margin) delta = rect.bottom - (view - margin);
  if (Math.abs(delta) < 1) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollBy({ top: delta, behavior: reduceMotion ? "auto" : "smooth" });
}

/** On narrow screens the sticky actions dock sits over the photo column; leave room for it. */
function coveredByDock(dock: HTMLElement | null, target: DOMRect): number {
  if (!dock || getComputedStyle(dock).position !== "sticky") return 0;
  const rect = dock.getBoundingClientRect();
  return rect.left < target.right && rect.right > target.left ? rect.height : 0;
}

export function Studio({ liveEnabled, initialSample, quota: initialQuota = null, turnstileSiteKey, nonce }: Props) {
  const [quota, setQuota] = useState<QuotaInfo | null>(initialQuota);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [state, dispatch] = useReducer(studioReducer, initialStudioState);
  const [view, setView] = useState<ComparisonMode>("slider");
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const originalUrl = useObjectUrl(state.original?.blob);
  const resultUrl = useObjectUrl(state.result?.blob);

  // Refs keep async work honest: only the latest request may update the screen,
  // and nothing updates after the component has gone.
  const stateRef = useRef(state);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const fileRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const canvasRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // A new result: make sure it, its actions and its explanation are on screen.
  useEffect(() => {
    if (state.result) bringIntoView(canvasRef.current, { dock: dockRef.current });
  }, [state.result]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const loadOriginal = useCallback(async (blob: Blob, label: string, verify: File | null) => {
    const fileRequest = ++fileRequestRef.current;
    controllerRef.current?.abort();
    dispatch({ type: "file/loading" });
    setNotice(null);
    try {
      if (verify) await checkFile(verify);
      const { width, height } = await readDimensions(blob);
      if (!mountedRef.current || fileRequest !== fileRequestRef.current) return;
      const original: Original = { blob, label, width, height };
      dispatch({ type: "file/ready", original });
      setAnnouncement(`${label} is ready. Choose a world, then press Reimagine.`);
    } catch (error) {
      if (!mountedRef.current || fileRequest !== fileRequestRef.current) return;
      const message =
        error instanceof ClientImageError ? error.message : "That image could not be read. It may be damaged or in an unsupported format.";
      dispatch({ type: "file/error", message });
      setAnnouncement(message);
    }
  }, []);

  const handleFile = useCallback((file: File) => void loadOriginal(file, file.name || "Your photo", file), [loadOriginal]);

  // Curated samples are fetched from this site's own /samples folder only.
  useEffect(() => {
    if (!initialSample) return;
    const controller = new AbortController();
    fetch(initialSample.src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("sample unavailable");
        return response.blob();
      })
      .then((blob) => loadOriginal(blob, `${initialSample.title} sample`, null))
      .catch(() => {
        if (!controller.signal.aborted) dispatch({ type: "file/error", message: "That sample photo could not be loaded." });
      });
    return () => controller.abort();
  }, [initialSample, loadOriginal]);

  const runTransform = useCallback(
    async (mood: MoodId) => {
      const current = stateRef.current;
      if (!liveEnabled || !current.original || current.phase === "processing" || current.phase === "loading") return;

      const requestId = ++requestIdRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      const isCurrent = () => mountedRef.current && requestId === requestIdRef.current;

      dispatch({ type: "transform/start", mood });
      bringIntoView(canvasRef.current, { onlyIfMostlyHidden: true, dock: dockRef.current });
      setNotice(null);
      setAnnouncement(`Reimagining your photo in ${MOODS[mood].name}. This can take up to two minutes.`);

      try {
        let prepared = current.prepared;
        if (!prepared) {
          prepared = await prepareUpload(current.original.blob);
          if (!isCurrent()) return;
          dispatch({ type: "transform/prepared", prepared });
        }
        let turnstileToken: string | undefined;
        if (turnstileSiteKey) {
          try {
            turnstileToken = await turnstileRef.current?.getToken();
          } catch {
            throw new TransformClientError("bot_check_failed", "The security check didn't complete. Please try again.");
          }
          if (!isCurrent()) return;
        }
        const result = await requestTransform(prepared.blob, mood, controller.signal, { turnstileToken });
        const size = await readDimensions(result.blob);
        if (!isCurrent()) return;
        if (result.quota) setQuota(result.quota);
        dispatch({ type: "transform/success", result: { blob: result.blob, mood: result.mood, ...size } });
        setAnnouncement(`Your ${MOODS[result.mood].name} version is ready. Use the slider to compare it with the original.`);
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof TransformClientError && error.code === "cancelled") {
          dispatch({ type: "transform/cancelled" });
          setAnnouncement("Cancelled. Your original photo is still here.");
          return;
        }
        const message =
          error instanceof TransformClientError || error instanceof ClientImageError
            ? error.message
            : "The result could not be displayed. Please try again.";
        const code = error instanceof TransformClientError ? error.code : "client";
        if (code === "daily_limit_reached") setQuota((current) => current && { ...current, remaining: 0 });
        dispatch({ type: "transform/error", error: { code, message } });
        setAnnouncement(message);
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [liveEnabled, turnstileSiteKey],
  );

  function cancel() {
    controllerRef.current?.abort();
  }

  function surprise() {
    const mood = pickSurpriseMood(state.result?.mood ?? state.mood ?? undefined);
    dispatch({ type: "mood/select", mood });
    void runTransform(mood);
  }

  function removePhoto() {
    controllerRef.current?.abort();
    fileRequestRef.current += 1;
    requestIdRef.current += 1;
    dispatch({ type: "file/remove" });
    setAnnouncement("Photo removed.");
  }

  async function share() {
    if (!state.result || !resultUrl) return;
    const filename = resultFilename(state.result.mood, state.result.blob.type);
    const outcome = await shareImage(state.result.blob, filename);
    if (outcome === "unsupported") {
      downloadBlob(resultUrl, filename);
      setNotice("Sharing files isn't available in this browser, so we downloaded it instead.");
    }
  }

  const busy = state.phase === "processing" || state.phase === "loading";
  const selectedMood = state.mood ? MOODS[state.mood] : null;
  const resultMood = state.result ? MOODS[state.result.mood] : null;
  const outOfUses = quota?.remaining === 0;
  const canTransform = liveEnabled && !outOfUses && !!state.original && !!state.mood && !busy;
  const tryAnotherLabel = state.result && state.mood && state.mood !== state.result.mood ? `Reimagine in ${MOODS[state.mood].name}` : "Reimagine";

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Canvas: double bezel, the photo is the loudest thing on screen. */}
      <section ref={canvasRef} aria-label="Photo" className="rounded-shell bg-paper-2 p-2 lg:col-span-8">
        <div className="relative rounded-surface bg-paper-3">
          {state.phase === "empty" || (!state.original && state.phase === "loading") ? (
            <Dropzone onFile={handleFile} disabled={state.phase === "loading"} />
          ) : null}

          {state.original && originalUrl && !(state.result && resultUrl) && (
            <div className="relative p-3 sm:p-4">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL preview */}
                <img
                  src={originalUrl}
                  alt="Your original photo"
                  className="max-h-[72svh] w-full rounded-media object-contain"
                  style={{ aspectRatio: state.original.width / state.original.height }}
                />
                {state.phase === "processing" && state.processingMood && (
                  <ProcessingOverlay moodName={MOODS[state.processingMood].name} onCancel={cancel} />
                )}
                {state.phase !== "processing" && (
                  <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-small font-medium">Original</span>
                )}
              </div>
            </div>
          )}

          {state.original && originalUrl && state.result && resultUrl && resultMood && (
            <div className="p-3 sm:p-4">
              <ComparisonView
                beforeUrl={originalUrl}
                afterUrl={resultUrl}
                moodName={resultMood.name}
                aspectRatio={state.result.width / state.result.height}
                mode={view}
                onModeChange={setView}
              />
              <ResultDetails
                moodName={resultMood.name}
                explanation={resultMood.explanation}
                notice={notice}
                onDownload={() => state.result && downloadBlob(resultUrl, resultFilename(state.result.mood, state.result.blob.type))}
                onShare={share}
                onStartAgain={removePhoto}
              />
            </div>
          )}

          {state.phase === "loading" && state.original && (
            <p className="absolute inset-x-0 bottom-4 text-center text-small text-ink-2">Loading photo...</p>
          )}
        </div>
      </section>

      {/* Rail: the steps, in order. */}
      <aside aria-label="Controls" className="flex flex-col gap-6 lg:sticky lg:top-6 lg:col-span-4">
        {!liveEnabled && (
          <div className="rounded-surface bg-paper-2 p-5" data-testid="not-configured">
            <p className="flex items-center gap-2 text-body font-medium">
              <AlertCircle className="size-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              Live transformation isn&apos;t set up yet
            </p>
            <p className="mt-2 text-small text-ink-2">
              This server has no image provider key configured, so Reimagine is turned off. You can still
              choose a photo, preview it and explore the worlds. Nothing is faked in the meantime.
            </p>
          </div>
        )}

        {state.original && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface bg-paper-2 p-4">
            <p className="min-w-0 truncate text-small">
              <span className="text-ink-2">Photo: </span>
              <span className="font-medium">{state.original.label}</span>
            </p>
            <div className="flex gap-1">
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-3 text-small font-medium hover:bg-paper-3 has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                <RefreshCw className="size-4" strokeWidth={1.5} aria-hidden="true" />
                Replace
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) handleFile(file);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={removePhoto}
                className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-small font-medium hover:bg-paper-3"
              >
                <Trash2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
        )}

        {state.fileError && (
          <p role="alert" className="flex gap-2 rounded-surface bg-paper-2 p-4 text-small text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {state.fileError}
          </p>
        )}

        <MoodPicker
          value={state.mood}
          onChange={(mood) => dispatch({ type: "mood/select", mood })}
          disabled={state.phase === "processing"}
        />

        {selectedMood && !state.result && (
          <p className="-mt-2 text-small text-ink-2">
            <span className="font-medium text-ink">{selectedMood.name}:</span> {selectedMood.description}
          </p>
        )}
        {state.result && (
          <p className="-mt-2 text-small text-ink-2">
            To try another world, pick one above. Chromafy always starts again from your original.
          </p>
        )}

        {/* The actions dock: once there is a photo it stays on screen while the worlds scroll beneath it. */}
        <div
          ref={dockRef}
          data-testid="actions"
          className={`flex flex-col gap-3 ${
            state.original
              ? "sticky bottom-0 z-10 -mx-[var(--gutter)] bg-paper px-[var(--gutter)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-linear-to-t before:from-paper before:to-transparent lg:mx-0 lg:px-0"
              : ""
          }`}
        >
          {state.transformError && (
            <div role="alert" className="rounded-surface bg-paper-2 p-4">
              <p className="flex gap-2 text-small font-medium text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {state.transformError.message}
              </p>
              <p className="mt-1 pl-6 text-small text-ink-2">Your original photo is still here, so you can try again.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!canTransform}
              aria-disabled={!canTransform}
              onClick={() => state.mood && runTransform(state.mood)}
              icon={<ArrowUpRight className="size-5" strokeWidth={1.5} />}
            >
              {state.phase === "processing" ? "Reimagining..." : tryAnotherLabel}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!liveEnabled || outOfUses || !state.original || busy}
              onClick={surprise}
              icon={<Shuffle className="size-4" strokeWidth={1.5} aria-hidden="true" />}
            >
              {/* Below 350px both labels cannot share one row; the shuffle icon stands in, the name stays for screen readers. */}
              <span className="max-[349px]:sr-only">Surprise me</span>
            </Button>
          </div>
          {liveEnabled && quota && (
            <p data-testid="quota" className={`-mt-1 text-small ${outOfUses ? "font-medium text-ink" : "text-ink-2"}`}>
              {outOfUses
                ? `You've used today's ${quota.limit} transformations. More in about ${hoursUntil(quota.resetsAt)} h (midnight UTC).`
                : `${quota.remaining} of ${quota.limit} transformations left today.`}
            </p>
          )}
          {!state.original && liveEnabled && <p className="-mt-1 text-small text-ink-2">Choose a photo first, then a world.</p>}
          {state.original && !state.mood && liveEnabled && <p className="-mt-1 text-small text-ink-2">Now pick a world, or let Surprise me choose.</p>}
          {/* Inside the dock, so the tick box Cloudflare sometimes asks for is never hidden beneath it. */}
          {liveEnabled && turnstileSiteKey && <Turnstile ref={turnstileRef} siteKey={turnstileSiteKey} nonce={nonce} />}
        </div>
      </aside>
    </div>
  );
}
