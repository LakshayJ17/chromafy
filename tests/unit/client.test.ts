import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFile, ClientImageError, sniffImageType } from "@/lib/client/prepare-upload";
import { resultFilename, shareImage } from "@/lib/client/share";
import { requestTransform, TransformClientError } from "@/lib/client/transform-client";

afterEach(() => vi.unstubAllGlobals());

describe("client file checks (UX only; the server re-validates)", () => {
  it("recognises allowed signatures", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });

  it("rejects a renamed non-image even with an image MIME type", async () => {
    const fake = new File(["<svg></svg>"], "photo.jpg", { type: "image/jpeg" });
    await expect(checkFile(fake)).rejects.toBeInstanceOf(ClientImageError);
  });

  it("rejects empty and oversized files", async () => {
    await expect(checkFile(new File([], "empty.jpg"))).rejects.toThrow(/empty/);
    const big = new File([new Uint8Array(21 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    await expect(checkFile(big)).rejects.toThrow(/20 MB/);
  });
});

describe("resultFilename", () => {
  it("uses the mood, the local date and the real extension", () => {
    expect(resultFilename("after-rain", "image/jpeg", new Date(2026, 9, 7))).toBe("chromafy-after-rain-2026-10-07.jpg");
    expect(resultFilename("golden", "image/png", new Date(2026, 0, 1))).toBe("chromafy-golden-2026-01-01.png");
  });
});

describe("shareImage", () => {
  const blob = new Blob(["x"], { type: "image/jpeg" });

  it("reports unsupported when the Web Share API is missing", async () => {
    vi.stubGlobal("navigator", {});
    expect(await shareImage(blob, "a.jpg")).toBe("unsupported");
  });

  it("reports unsupported when files cannot be shared", async () => {
    vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => false });
    expect(await shareImage(blob, "a.jpg")).toBe("unsupported");
  });

  it("shares the file itself when supported", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    expect(await shareImage(blob, "a.jpg")).toBe("shared");
    expect(share.mock.calls[0][0].files?.[0].name).toBe("a.jpg");
  });

  it("treats a dismissed share sheet as dismissed, not a failure", async () => {
    vi.stubGlobal("navigator", { share: vi.fn(async () => Promise.reject(new DOMException("x", "AbortError"))), canShare: () => true });
    expect(await shareImage(blob, "a.jpg")).toBe("dismissed");
  });
});

describe("requestTransform", () => {
  const image = new Blob(["img"], { type: "image/jpeg" });

  it("sends only the mood ID and the bytes to the same-origin endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(["out"]), { headers: { "content-type": "image/jpeg", "x-chromafy-mood": "golden" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await requestTransform(image, "golden", new AbortController().signal);
    expect(result.mood).toBe("golden");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/transform?mood=golden");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(image);
  });

  it("surfaces the server's safe error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "rate_limited", message: "Please wait." } }, { status: 429 })));
    await expect(requestTransform(image, "golden", new AbortController().signal)).rejects.toMatchObject({ code: "rate_limited", message: "Please wait." });
  });

  it("does not trust unknown error codes or non-JSON bodies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>proxy error</html>", { status: 502 })));
    await expect(requestTransform(image, "golden", new AbortController().signal)).rejects.toMatchObject({ code: "internal" });
  });

  it("rejects a success response that is not an image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json", "x-chromafy-mood": "golden" } })));
    await expect(requestTransform(image, "golden", new AbortController().signal)).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("reports network failures and cancellation distinctly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(requestTransform(image, "golden", new AbortController().signal)).rejects.toMatchObject({ code: "network" });

    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError"))));
    await expect(requestTransform(image, "golden", controller.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(TransformClientError).toBeDefined();
  });
});
