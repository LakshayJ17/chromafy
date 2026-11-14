/**
 * The public half of the mood registry. Safe for the browser: names, copy and
 * palette swatches. The server-side transformation instructions for each mood
 * live in `src/lib/ai/prompt-builder.ts` and are keyed by the same stable IDs.
 */
export const MOOD_IDS = ["golden", "after-rain", "old-soul", "daydream", "doodle"] as const;

export type MoodId = (typeof MOOD_IDS)[number];

export type Mood = {
  id: MoodId;
  name: string;
  feeling: string;
  description: string;
  palette: string;
  lighting: string;
  contrast: string;
  /** Shown under a result. Describes the direction requested, not detected edits. */
  explanation: string;
  /** Four representative swatches, used for UI only. */
  swatches: [string, string, string, string];
  /** Chapter colour on the landing page, plus the ink that reads on it. */
  field: { background: string; ink: string };
  /**
   * "look" worlds change colour, light and atmosphere only. "drawing" worlds
   * add new marks to the photo, so the model's own picture is the result.
   */
  kind: "look" | "drawing";
};

export const MOODS: Record<MoodId, Mood> = {
  golden: {
    id: "golden",
    name: "Golden",
    feeling: "Warm, inviting, optimistic",
    description: "Late light that makes an ordinary place feel like somewhere you want to stay.",
    palette: "Amber, peach, honey and terracotta",
    lighting: "Low directional sun with soft highlights",
    contrast: "Balanced shadows, gentle warmth",
    explanation:
      "We asked for warmer amber and honey tones in the light and highlights, a low directional sun, and natural shadows instead of an orange tint over everything.",
    swatches: ["#F2C46D", "#E9965A", "#C8693F", "#7A4A2E"],
    field: { background: "#EDB458", ink: "#1A1726" },
    kind: "look",
  },
  "after-rain": {
    id: "after-rain",
    name: "After Rain",
    feeling: "Fresh, atmospheric, reflective",
    description: "The cool, clean hush just after a shower has passed.",
    palette: "Fresh greens, clean whites and a cooler white balance",
    lighting: "Soft, even, diffused daylight",
    contrast: "Crisp and clean, with a gentle sheen on reflective surfaces",
    explanation:
      "We asked for a slightly cooler, crisper light, fresher greens and clean whites, with a soft, reflective atmosphere.",
    swatches: ["#BFE3D5", "#5FB3A1", "#1F6B63", "#173F45"],
    field: { background: "#1F5F58", ink: "#FBF8F2" },
    kind: "look",
  },
  "old-soul": {
    id: "old-soul",
    name: "Old Soul",
    feeling: "Nostalgic and intimate",
    description: "A film-inspired memory of the scene, warm in the highlights and quiet in the reds.",
    palette: "Muted reds, earth tones and warm film highlights",
    lighting: "Warm, slightly faded highlights",
    contrast: "Gentle, with subtle grain",
    explanation:
      "We asked for a film-inspired grade with muted reds, earthy tones, warm highlights and gentle contrast. It is an artistic interpretation, not a historical restoration.",
    swatches: ["#E4C9A8", "#B5654A", "#7E3A2F", "#3E2A24"],
    field: { background: "#7C3A2D", ink: "#FBF8F2" },
    kind: "look",
  },
  daydream: {
    id: "daydream",
    name: "Daydream",
    feeling: "Luminous, gentle, whimsical",
    description: "Soft pastel light, as if the scene were remembered on a very good day.",
    palette: "Coordinated pastels: rose, lilac and pale sky",
    lighting: "Soft and luminous, still clear and well exposed",
    contrast: "Gentle and airy, with texture kept",
    explanation:
      "We asked for coordinated pastels and soft, luminous light, keeping the photo clear and the composition in place, with a restrained dreamlike quality.",
    swatches: ["#F6D5DD", "#DCCBF2", "#BFD9F2", "#8E86B8"],
    field: { background: "#E6D3EE", ink: "#1A1726" },
    kind: "look",
  },
  doodle: {
    id: "doodle",
    name: "Doodle",
    feeling: "Playful, hand-drawn, cheerful",
    description: "Your photo, sketched over with paint markers by a friend in a very good mood.",
    palette: "White marker with coral, sunny yellow and sky blue",
    lighting: "The photo's own light, unchanged",
    contrast: "Bold strokes over the original picture",
    explanation:
      "We asked for a handful of friendly marker doodles, each tied to something in your photo: an outline around the main subject, a cartoon face on an object, motion lines, steam or a scribbled sun. Faces stay clear and no words are added. The model redraws the photo to add them, so fine details can change.",
    swatches: ["#FFFFFF", "#FF7A6B", "#FFD23F", "#5AA9F5"],
    field: { background: "#FFD23F", ink: "#1A1726" },
    kind: "drawing",
  },
};

export const MOOD_LIST: Mood[] = MOOD_IDS.map((id) => MOODS[id]);

export function isMoodId(value: unknown): value is MoodId {
  return typeof value === "string" && (MOOD_IDS as readonly string[]).includes(value);
}

/**
 * Surprise Me picks a light-and-colour world from the same trusted list (never
 * Doodle, which draws on the photo); `random` is injectable for tests.
 */
export function pickSurpriseMood(exclude?: MoodId, random: () => number = Math.random): MoodId {
  const pool = MOOD_IDS.filter((id) => MOODS[id].kind === "look" && id !== exclude);
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}
