import type { PreparedUpload } from "@/lib/client/prepare-upload";
import type { MoodId } from "@/lib/config/moods";

export type Original = {
  /** The untouched photo the user chose. Every transformation starts from this, never from a result. */
  blob: Blob;
  label: string;
  width: number;
  height: number;
};

export type StudioError = { code: string; message: string };

export type StudioState = {
  phase: "empty" | "loading" | "ready" | "processing" | "result";
  original: Original | null;
  /** Upload-ready copy of the original, cached so trying another mood does not re-decode it. */
  prepared: PreparedUpload | null;
  mood: MoodId | null;
  processingMood: MoodId | null;
  result: { blob: Blob; mood: MoodId; width: number; height: number } | null;
  fileError: string | null;
  transformError: StudioError | null;
};

export type StudioAction =
  | { type: "file/loading" }
  | { type: "file/ready"; original: Original }
  | { type: "file/error"; message: string }
  | { type: "file/remove" }
  | { type: "mood/select"; mood: MoodId }
  | { type: "transform/start"; mood: MoodId }
  | { type: "transform/prepared"; prepared: PreparedUpload }
  | { type: "transform/success"; result: NonNullable<StudioState["result"]> }
  | { type: "transform/error"; error: StudioError }
  | { type: "transform/cancelled" };

export const initialStudioState: StudioState = {
  phase: "empty",
  original: null,
  prepared: null,
  mood: null,
  processingMood: null,
  result: null,
  fileError: null,
  transformError: null,
};

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "file/loading":
      return { ...state, phase: "loading", fileError: null, transformError: null };
    case "file/ready":
      // A new photo replaces the old one and discards its cached copy and result.
      return {
        ...state,
        phase: "ready",
        original: action.original,
        prepared: null,
        result: null,
        fileError: null,
        transformError: null,
      };
    case "file/error":
      return { ...state, phase: state.original ? (state.result ? "result" : "ready") : "empty", fileError: action.message };
    case "file/remove":
      return { ...initialStudioState, mood: state.mood };
    case "mood/select":
      return { ...state, mood: action.mood, transformError: null };
    case "transform/start":
      if (!state.original || state.phase === "processing") return state;
      return { ...state, phase: "processing", mood: action.mood, processingMood: action.mood, result: null, transformError: null };
    case "transform/prepared":
      return { ...state, prepared: action.prepared };
    case "transform/success":
      return { ...state, phase: "result", result: action.result, mood: action.result.mood, processingMood: null };
    case "transform/error":
      // The original stays so the user can retry without starting over.
      return { ...state, phase: state.original ? "ready" : "empty", processingMood: null, transformError: action.error };
    case "transform/cancelled":
      return { ...state, phase: state.original ? "ready" : "empty", processingMood: null };
  }
}
