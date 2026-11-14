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
  doodle: [
    "Add a few playful, hand-drawn doodles on top of the photograph, as if a friend had drawn on a printed copy with white and brightly coloured paint markers.",
    "Every doodle must interact with something real in the photo, so the drawings tell a small, funny story about this scene.",
    "First find the one to three main subjects, then draw on and around them: trace a loose outline that hugs the main subject, give objects a simple cartoon face or expression, add motion lines behind anything that could move, steam or sparkles above anything warm or shiny, a scribbled sun or moon placed in the sky that matches the light, and small hearts or stars right next to the thing they are about.",
    "Use about five to eight doodles in total, each placed on or touching the object it belongs to. Never scatter stray arrows, symbols or faces across empty sky, ground or walls, and never draw abstract squiggles or loose lines: every doodle is a clear, recognisable little drawing.",
    "Use confident, slightly wobbly single strokes of even thickness, in white plus coral, sunny yellow and sky blue.",
  ].join(" "),
};

const PRESERVATION_RULES = [
  "Edit only colour, light, contrast and atmosphere.",
  "Preserve the original subject, composition, framing, perspective, geometry and the identity of any people exactly.",
  "Do not add, remove or move objects, people, text or logos.",
  "Keep the output photographic and natural rather than illustrated.",
].join(" ");

/** For worlds that add drawings: the photo underneath stays as it is. */
const DRAWING_RULES = [
  "Keep the photograph underneath unchanged: the same subject, composition, framing, perspective, colours and light.",
  "Leave people's faces clear of drawings and keep the identity of any people exactly.",
  "Keep it friendly and kind: nothing mocking, rude, frightening or suggestive, and no words, letters, numbers or logos.",
].join(" ");

export function buildTransformPrompt(moodId: MoodId): string {
  const mood = MOODS[moodId];
  const rules = mood.kind === "drawing" ? DRAWING_RULES : PRESERVATION_RULES;
  return `${rules}\n\nMood: ${mood.name}. ${MOOD_INSTRUCTIONS[moodId]}`;
}

export const __testing = { MOOD_INSTRUCTIONS, PRESERVATION_RULES, DRAWING_RULES };
