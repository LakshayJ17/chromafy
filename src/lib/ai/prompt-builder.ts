import "server-only";
import { MOODS, type MoodId } from "@/lib/config/moods";

/**
 * Server-only transformation instructions. The browser sends a mood ID; this
 * module turns it into the full instruction. No client text is ever
 * concatenated into the prompt.
 */
const MOOD_INSTRUCTIONS: Record<MoodId, string> = {
  golden: [
    "Regrade the scene toward a warm, inviting, optimistic golden-hour atmosphere.",
    "Palette: warm amber, peach, honey and terracotta accents.",
    "Lighting: low directional sunlight consistent with the existing light direction, soft highlights, balanced shadows that keep detail.",
    "Keep the warmth moderate: the sky and highlights may turn golden, but shadows stay neutral and whites, greys and skin tones stay natural.",
    "Do not apply a uniform orange or amber colour cast over the whole image.",
  ].join(" "),
  "after-rain": [
    "Make the photograph feel fresh, crisp and calm, like the clear, clean daylight just after a rain shower has passed.",
    "Colour: natural and true to the scene, with a slightly cooler white balance, richer fresh greens and clean, bright whites.",
    "Lighting: soft, even, diffused daylight with crisp clean contrast and a gentle sheen on surfaces that are already reflective.",
    "Do not add rain, puddles, droplets, clouds or any new structural details that are not already present.",
  ].join(" "),
  "old-soul": [
    "Regrade the scene as a nostalgic, intimate, film-inspired photograph.",
    "Palette: muted reds, earthy browns and olives, warm creamy highlights.",
    "Lighting and tone: gentle contrast, slightly faded blacks, very subtle fine grain.",
    "This is an artistic colour interpretation, not a historical restoration: do not add period props, damage, scratches or borders.",
  ].join(" "),
  daydream: [
    "Make the photograph feel gentle, airy and whimsical, like a fond memory of a perfect afternoon.",
    "Colour: a soft, coordinated pastel palette of rose, lilac and pale sky blue blended with the scene's own colours.",
    "Lighting: soft and luminous, while the photo stays clear and well exposed, with readable mid-tones, visible texture and gentle contrast.",
    "Keep it restrained: no fantasy objects, sparkles, creatures or added scenery.",
  ].join(" "),
};

const PRESERVATION_RULES = [
  "Edit only colour, light, contrast and atmosphere.",
  "Preserve the original subject, composition, framing, perspective, geometry and the identity of any people exactly.",
  "Do not add, remove or move objects, people, text or logos.",
  "Keep the output photographic and natural rather than illustrated.",
].join(" ");

export function buildTransformPrompt(moodId: MoodId): string {
  const mood = MOODS[moodId];
  return `${PRESERVATION_RULES}\n\nMood: ${mood.name}. ${MOOD_INSTRUCTIONS[moodId]}`;
}

export const __testing = { MOOD_INSTRUCTIONS, PRESERVATION_RULES };
