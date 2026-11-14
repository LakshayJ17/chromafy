import { describe, expect, it } from "vitest";
import { __testing, buildTransformPrompt } from "@/lib/ai/prompt-builder";
import { isMoodId, MOOD_IDS, MOOD_LIST, MOODS, pickSurpriseMood } from "@/lib/config/moods";

describe("mood registry", () => {
  it("defines exactly the five worlds with stable IDs", () => {
    expect(MOOD_IDS).toEqual(["golden", "after-rain", "old-soul", "daydream", "doodle"]);
    expect(MOOD_LIST.map((mood) => mood.id)).toEqual([...MOOD_IDS]);
  });

  it.each(MOOD_IDS)("%s has every required field", (id) => {
    const mood = MOODS[id];
    expect(mood.id).toBe(id);
    for (const field of [mood.name, mood.feeling, mood.description, mood.palette, mood.lighting, mood.contrast, mood.explanation]) {
      expect(field.trim().length).toBeGreaterThan(3);
    }
    expect(mood.swatches).toHaveLength(4);
    expect(__testing.MOOD_INSTRUCTIONS[id].length).toBeGreaterThan(50);
  });

  it("explanations describe a requested direction, never detected scene edits", () => {
    for (const mood of MOOD_LIST) {
      expect(mood.explanation).toMatch(/^We (asked|shifted)/);
      expect(mood.explanation).not.toMatch(/\bwe (detected|found|identified|recognised|recognized)\b/i);
    }
  });

  it("validates mood IDs strictly", () => {
    expect(isMoodId("golden")).toBe(true);
    for (const value of ["Golden", "surprise", "", "golden ", "__proto__", null, 1, {}]) {
      expect(isMoodId(value)).toBe(false);
    }
  });

  it("Surprise Me only picks from the registry", () => {
    expect(pickSurpriseMood(undefined, () => 0)).toBe("golden");
    expect(pickSurpriseMood(undefined, () => 0.9999)).toBe("daydream");
    for (let i = 0; i < 200; i += 1) expect(isMoodId(pickSurpriseMood())).toBe(true);
  });

  it("Surprise Me never picks Doodle, which draws on the photo", () => {
    for (let i = 0; i < 300; i += 1) expect(pickSurpriseMood()).not.toBe("doodle");
    expect(MOODS.doodle.kind).toBe("drawing");
    expect(MOOD_LIST.filter((mood) => mood.kind === "look").map((mood) => mood.id)).toEqual(["golden", "after-rain", "old-soul", "daydream"]);
  });

  it("Surprise Me can avoid repeating the current mood", () => {
    for (let i = 0; i < 100; i += 1) expect(pickSurpriseMood("golden")).not.toBe("golden");
  });
});

describe("prompt construction", () => {
  it.each(MOOD_IDS.filter((id) => MOODS[id].kind === "look"))("%s prompt always carries the preservation rules", (id) => {
    const prompt = buildTransformPrompt(id);
    expect(prompt).toContain(__testing.PRESERVATION_RULES);
    expect(prompt).toContain(`Mood: ${MOODS[id].name}.`);
    expect(prompt).toContain(__testing.MOOD_INSTRUCTIONS[id]);
  });

  it("Doodle carries the drawing rules: photo unchanged, faces clear, kind, no words", () => {
    const prompt = buildTransformPrompt("doodle");
    expect(prompt).toContain(__testing.DRAWING_RULES);
    expect(prompt).not.toContain(__testing.PRESERVATION_RULES);
    expect(prompt).toMatch(/faces clear/);
    expect(prompt).toMatch(/no words, letters, numbers or logos/);
    expect(prompt).toMatch(/nothing mocking, rude, frightening or suggestive/);
    expect(prompt).toContain(__testing.MOOD_INSTRUCTIONS.doodle);
  });

  it("After Rain forbids inventing rain or puddles", () => {
    expect(buildTransformPrompt("after-rain")).toMatch(/Do not add rain, puddles/);
  });

  it("Old Soul is framed as interpretation, not restoration", () => {
    expect(buildTransformPrompt("old-soul")).toMatch(/not a historical restoration/);
  });

  it("is deterministic for a given mood", () => {
    expect(buildTransformPrompt("daydream")).toBe(buildTransformPrompt("daydream"));
  });
});
