import type { MoodId } from "@/lib/config/moods";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** chromafy-after-rain-2026-10-17.jpg: mood, local date and the real extension of the bytes. */
export function resultFilename(mood: MoodId, type: string, now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `chromafy-${mood}-${date}.${EXTENSIONS[type] ?? "jpg"}`;
}

export function downloadBlob(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

export type ShareOutcome = "shared" | "dismissed" | "unsupported";

/** Shares the actual file through the device's share sheet. Never uploads it anywhere. */
export async function shareImage(blob: Blob, filename: string): Promise<ShareOutcome> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return "unsupported";
  const file = new File([blob], filename, { type: blob.type });
  const data: ShareData = { files: [file], title: "Reimagined with Chromafy" };
  if (typeof navigator.canShare === "function" && !navigator.canShare(data)) return "unsupported";
  try {
    await navigator.share(data);
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "dismissed";
    return "unsupported";
  }
}
