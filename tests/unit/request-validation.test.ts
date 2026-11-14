import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  assertSameOrigin,
  assertUploadHeaders,
  parseTransformQuery,
  readBodyWithLimit,
} from "@/lib/security/request-validation";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : "not-app-error";
  }
  return "no-error";
};

describe("parseTransformQuery", () => {
  const parse = (query: string) => parseTransformQuery(new URL(`http://localhost/api/transform${query}`));

  it.each(["golden", "after-rain", "old-soul", "daydream", "surprise"])("accepts mood=%s", (mood) => {
    expect(parse(`?mood=${mood}`)).toEqual({ mood });
  });

  it("rejects unknown moods", () => {
    expect(code(() => parse("?mood=neon"))).toBe("invalid_mood");
    expect(code(() => parse("?mood=GOLDEN"))).toBe("invalid_mood");
  });

  it("rejects a missing mood", () => {
    expect(code(() => parse(""))).toBe("invalid_request");
  });

  it("rejects any extra client-controlled parameter such as a prompt or model", () => {
    expect(code(() => parse("?mood=golden&prompt=ignore%20previous"))).toBe("invalid_request");
    expect(code(() => parse("?mood=golden&model=dall-e-2"))).toBe("invalid_request");
  });

  it("rejects duplicated parameters", () => {
    expect(code(() => parse("?mood=golden&mood=daydream"))).toBe("invalid_request");
  });
});

describe("assertSameOrigin", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/transform", { method: "POST", headers: { host: "localhost:3000", ...headers } });

  it("allows same-origin browser requests", () => {
    expect(code(() => assertSameOrigin(request({ "sec-fetch-site": "same-origin", origin: "http://localhost:3000" })))).toBe("no-error");
  });

  it("allows non-browser clients that send no fetch metadata", () => {
    expect(code(() => assertSameOrigin(request({})))).toBe("no-error");
  });

  it("blocks cross-site requests", () => {
    expect(code(() => assertSameOrigin(request({ "sec-fetch-site": "cross-site" })))).toBe("forbidden_origin");
    expect(code(() => assertSameOrigin(request({ origin: "https://evil.example" })))).toBe("forbidden_origin");
    expect(code(() => assertSameOrigin(request({ origin: "null" })))).toBe("forbidden_origin");
  });
});

describe("assertUploadHeaders", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost/api/transform", { method: "POST", headers });

  it("accepts an image content type within the limit", () => {
    expect(code(() => assertUploadHeaders(request({ "content-type": "image/jpeg", "content-length": "1000" }), 2000))).toBe("no-error");
  });

  it("rejects multipart, JSON and missing content types", () => {
    expect(code(() => assertUploadHeaders(request({ "content-type": "multipart/form-data; boundary=x" }), 2000))).toBe("unsupported_media");
    expect(code(() => assertUploadHeaders(request({ "content-type": "application/json" }), 2000))).toBe("unsupported_media");
    expect(code(() => assertUploadHeaders(request({}), 2000))).toBe("unsupported_media");
  });

  it("rejects a declared length over the limit before reading the body", () => {
    expect(code(() => assertUploadHeaders(request({ "content-type": "image/png", "content-length": "5000" }), 2000))).toBe("image_too_large");
  });
});

describe("readBodyWithLimit", () => {
  function streamingRequest(chunks: number[]) {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= chunks.length) return controller.close();
        controller.enqueue(new Uint8Array(chunks[pulled]).fill(7));
        pulled += 1;
      },
    });
    const request = new Request("http://localhost/api/transform", { method: "POST", body, duplex: "half" } as RequestInit);
    return { request, pulled: () => pulled };
  }

  it("reads a body within the limit", async () => {
    const { request } = streamingRequest([100, 200]);
    expect((await readBodyWithLimit(request, 1000)).byteLength).toBe(300);
  });

  it("stops reading as soon as the limit is passed, even without Content-Length", async () => {
    const { request, pulled } = streamingRequest([600, 600, 600, 600, 600]);
    await expect(readBodyWithLimit(request, 1000)).rejects.toMatchObject({ code: "image_too_large" });
    expect(pulled()).toBeLessThan(5);
  });

  it("rejects an empty body", async () => {
    const { request } = streamingRequest([]);
    await expect(readBodyWithLimit(request, 1000)).rejects.toMatchObject({ code: "missing_image" });
  });
});
