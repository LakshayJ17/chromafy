import { describe, expect, it } from "vitest";
import { initialStudioState, studioReducer, type StudioState } from "@/components/studio/studio-state";

const original = { blob: new Blob(["a"]), label: "photo.jpg", width: 800, height: 600 };
const ready: StudioState = studioReducer(initialStudioState, { type: "file/ready", original });

describe("studioReducer", () => {
  it("keeps the original after a failed transformation so the user can retry", () => {
    const processing = studioReducer(ready, { type: "transform/start", mood: "golden" });
    const failed = studioReducer(processing, { type: "transform/error", error: { code: "timeout", message: "Too long" } });
    expect(failed.phase).toBe("ready");
    expect(failed.original).toBe(original);
    expect(failed.transformError?.code).toBe("timeout");
  });

  it("ignores a second start while processing (duplicate submission guard)", () => {
    const processing = studioReducer(ready, { type: "transform/start", mood: "golden" });
    expect(studioReducer(processing, { type: "transform/start", mood: "daydream" })).toBe(processing);
  });

  it("cannot start without a photo", () => {
    expect(studioReducer(initialStudioState, { type: "transform/start", mood: "golden" })).toBe(initialStudioState);
  });

  it("trying another mood keeps the original, not the previous result", () => {
    const prepared = { blob: new Blob(["p"]), width: 800, height: 600 };
    let state = studioReducer(ready, { type: "transform/start", mood: "golden" });
    state = studioReducer(state, { type: "transform/prepared", prepared });
    state = studioReducer(state, { type: "transform/success", result: { blob: new Blob(["r"]), mood: "golden", width: 1, height: 1 } });
    state = studioReducer(state, { type: "transform/start", mood: "old-soul" });
    expect(state.original).toBe(original);
    expect(state.prepared).toBe(prepared);
    expect(state.result).toBeNull();
  });

  it("a new photo discards the cached upload and the old result", () => {
    let state = studioReducer(ready, { type: "transform/prepared", prepared: { blob: new Blob(["p"]), width: 1, height: 1 } });
    state = studioReducer(state, { type: "file/ready", original: { ...original, label: "new.jpg" } });
    expect(state.prepared).toBeNull();
    expect(state.result).toBeNull();
  });

  it("a cancelled request returns to ready without an error", () => {
    const processing = studioReducer(ready, { type: "transform/start", mood: "golden" });
    const cancelled = studioReducer(processing, { type: "transform/cancelled" });
    expect(cancelled.phase).toBe("ready");
    expect(cancelled.transformError).toBeNull();
  });
});
