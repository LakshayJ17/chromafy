// @vitest-environment jsdom
/**
 * Studio workflow with the network MOCKED: fetch returns a stand-in image,
 * so no request reaches the server or the provider.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Studio } from "@/components/studio/studio";

vi.mock("@/lib/client/prepare-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client/prepare-upload")>();
  return { ...actual, prepareUpload: vi.fn(async (blob: Blob) => ({ blob, width: 800, height: 600 })) };
});

const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const photo = () => new File([JPEG_HEADER], "street.jpg", { type: "image/jpeg" });

let urlCount = 0;
const revoked: string[] = [];

beforeEach(() => {
  urlCount = 0;
  revoked.length = 0;
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 800, height: 600, close: () => undefined })));
  URL.createObjectURL = vi.fn(() => `blob:test/${++urlCount}`);
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
});

afterEach(() => vi.unstubAllGlobals());

async function upload() {
  await userEvent.upload(screen.getByLabelText(/Choose a photo/), photo());
  await screen.findByAltText("Your original photo");
}

describe("Studio without a provider key", () => {
  it("says live transformation is not configured and keeps Reimagine off", async () => {
    render(<Studio liveEnabled={false} />);
    expect(screen.getByTestId("not-configured")).toHaveTextContent("Live transformation isn't set up yet");
    await upload();
    await userEvent.click(screen.getByLabelText(/Golden/));
    expect(screen.getByRole("button", { name: /Reimagine/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Surprise me/ })).toBeDisabled();
  });
});

describe("Studio workflow (mocked network)", () => {
  it("uploads, transforms, compares, tries another mood from the original, and recovers from an error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Blob(["golden"], { type: "image/jpeg" }), { headers: { "content-type": "image/jpeg", "x-chromafy-mood": "golden" } }))
      .mockResolvedValueOnce(Response.json({ error: { code: "provider_safety", message: "The image service declined this photo." } }, { status: 422 }))
      .mockResolvedValueOnce(new Response(new Blob(["old"], { type: "image/jpeg" }), { headers: { "content-type": "image/jpeg", "x-chromafy-mood": "old-soul" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<Studio liveEnabled />);
    const reimagine = () => screen.getByRole("button", { name: /Reimagine/ });

    await upload();
    expect(reimagine()).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Golden/));
    await userEvent.click(reimagine());

    expect(await screen.findByRole("slider", { name: /Compare original/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Golden" })).toBeInTheDocument();
    expect(screen.getByText(/We asked for warmer amber/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Side by side" }));
    expect(screen.getByText("Original", { selector: "figcaption" })).toBeInTheDocument();

    // Another mood: the request body is the prepared ORIGINAL, never the previous result.
    await userEvent.click(screen.getByLabelText(/Old Soul/));
    await userEvent.click(reimagine());
    expect(await screen.findByRole("alert")).toHaveTextContent("The image service declined this photo.");
    expect(screen.getByAltText("Your original photo")).toBeInTheDocument();
    const firstBody = fetchMock.mock.calls[0][1].body as Blob;
    const secondBody = fetchMock.mock.calls[1][1].body as Blob;
    expect(secondBody).toBe(firstBody);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/transform?mood=old-soul");

    // Retry after the error works without re-uploading.
    await userEvent.click(reimagine());
    expect(await screen.findByRole("heading", { name: "Old Soul" })).toBeInTheDocument();
    expect(fetchMock.mock.calls[2][1].body).toBe(firstBody);
  });

  it("cancels an in-flight request and keeps the photo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))),
    );
    render(<Studio liveEnabled />);
    await upload();
    await userEvent.click(screen.getByLabelText(/Daydream/));
    await userEvent.click(screen.getByRole("button", { name: /Reimagine/ }));
    expect(await screen.findByText(/Reimagining in Daydream/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reimagining/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(/Reimagining in Daydream/)).not.toBeInTheDocument());
    expect(screen.getByAltText("Your original photo")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects an unsupported file with a visible message", async () => {
    render(<Studio liveEnabled />);
    const input = screen.getByLabelText(/Choose a photo/);
    await userEvent.upload(input, new File(["GIF89a......"], "anim.jpg", { type: "image/jpeg" }), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a JPEG, PNG or WebP photo");
  });

  it("revokes object URLs when the photo is removed", async () => {
    render(<Studio liveEnabled />);
    await upload();
    const status = screen.getByRole("status");
    expect(within(status.parentElement!).getByAltText("Your original photo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(revoked).toContain("blob:test/1");
  });
});

describe("Studio daily allowance", () => {
  const resetsAt = Date.now() + 5 * 3_600_000;

  it("shows how many transformations are left and updates after a result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Blob(["x"], { type: "image/jpeg" }), {
          headers: {
            "content-type": "image/jpeg",
            "x-chromafy-mood": "golden",
            "x-chromafy-daily-limit": "5",
            "x-chromafy-daily-remaining": "1",
            "x-chromafy-daily-reset": new Date(resetsAt).toISOString(),
          },
        }),
      ),
    );
    render(<Studio liveEnabled quota={{ limit: 5, remaining: 2, resetsAt }} />);
    expect(screen.getByTestId("quota")).toHaveTextContent("2 of 5 transformations left today.");
    await upload();
    await userEvent.click(screen.getByLabelText(/Golden/));
    await userEvent.click(screen.getByRole("button", { name: /Reimagine/ }));
    await screen.findByRole("slider", { name: /Compare original/ });
    expect(screen.getByTestId("quota")).toHaveTextContent("1 of 5 transformations left today.");
  });

  it("turns Reimagine and Surprise me off when the allowance is used up", async () => {
    render(<Studio liveEnabled quota={{ limit: 5, remaining: 0, resetsAt }} />);
    await upload();
    await userEvent.click(screen.getByLabelText(/Golden/));
    expect(screen.getByRole("button", { name: /Reimagine/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Surprise me/ })).toBeDisabled();
    expect(screen.getByTestId("quota")).toHaveTextContent("You've used today's 5 transformations. More in about 5 h (midnight UTC).");
  });

  it("drops the count to zero when the server says the limit is reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { code: "daily_limit_reached", message: "You've used all of today's transformations." } }, { status: 429 })),
    );
    render(<Studio liveEnabled quota={{ limit: 5, remaining: 3, resetsAt }} />);
    await upload();
    await userEvent.click(screen.getByLabelText(/Golden/));
    await userEvent.click(screen.getByRole("button", { name: /Reimagine/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've used all of today's transformations.");
    expect(screen.getByTestId("quota")).toHaveTextContent("You've used today's 5 transformations.");
  });
});
