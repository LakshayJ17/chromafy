import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { transferLook } from "@/lib/images/transfer-look";

const WIDTH = 400;
const HEIGHT = 300;

/** A neutral image with a full range of tones (a vertical ramp) and sharp stripes: easy to measure detail. */
async function striped(): Promise<Buffer> {
  const data = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const v = Math.round(50 + (140 * y) / HEIGHT + (x % 16 < 8 ? 30 : -30));
      data.set([v, v, v], (y * WIDTH + x) * 3);
    }
  }
  return sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).png().toBuffer();
}

/** The "edit": warm and at a lower resolution, like the model's redraw. */
async function warmSoftEdit(source: Buffer): Promise<Buffer> {
  return sharp(source).resize(200, 150).tint({ r: 255, g: 170, b: 90 }).jpeg().toBuffer();
}

async function rawOf(bytes: Buffer) {
  return sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

/** Mean squared difference between horizontal neighbours (green channel): high for sharp images. */
function edgeEnergy(data: Buffer, width: number, height: number): number {
  let sum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const i = (y * width + x) * 3;
      sum += (data[i + 1] - data[i - 2]) ** 2;
    }
  }
  return sum / (height * (width - 1));
}

function channelMeans(data: Buffer): [number, number, number] {
  const sums = [0, 0, 0];
  for (let i = 0; i < data.length; i += 3) for (let c = 0; c < 3; c++) sums[c] += data[i + c];
  const n = data.length / 3;
  return [sums[0] / n, sums[1] / n, sums[2] / n];
}

describe("transferLook", () => {
  it("returns a JPEG at the original's size, not the edit's", async () => {
    const original = await striped();
    const result = await transferLook(original, await warmSoftEdit(original));
    const meta = await sharp(result.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height, result.width, result.height]).toEqual([WIDTH, HEIGHT, WIDTH, HEIGHT]);
  });

  it("takes on the edit's colour", async () => {
    const original = await striped();
    const result = await transferLook(original, await warmSoftEdit(original));
    const [r, , b] = channelMeans((await rawOf(result.bytes)).data);
    const [or, , ob] = channelMeans((await rawOf(original)).data);
    expect(Math.abs(or - ob)).toBeLessThan(1); // the original is neutral
    expect(r - b).toBeGreaterThan(30); // the result is clearly warm
  });

  it("keeps the original's sharp detail instead of the enlarged edit's softness", async () => {
    const original = await striped();
    const edit = await warmSoftEdit(original);
    const result = await rawOf((await transferLook(original, edit)).bytes);
    const enlarged = await sharp(edit).resize(WIDTH, HEIGHT, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const originalEnergy = edgeEnergy((await rawOf(original)).data, WIDTH, HEIGHT);
    const resultEnergy = edgeEnergy(result.data, WIDTH, HEIGHT);
    expect(resultEnergy).toBeGreaterThan(edgeEnergy(enlarged, WIDTH, HEIGHT) * 1.5);
    expect(resultEnergy).toBeGreaterThan(originalEnergy * 0.5);
  });

  it("never returns the original unchanged when the edit differs", async () => {
    const original = await striped();
    const result = await rawOf((await transferLook(original, await warmSoftEdit(original))).bytes);
    const source = (await rawOf(original)).data;
    let diff = 0;
    for (let i = 0; i < source.length; i++) diff += Math.abs(source[i] - result.data[i]);
    expect(diff / source.length).toBeGreaterThan(5);
  });

  it("accepts an edit with a different aspect ratio", async () => {
    const original = await striped();
    const edit = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#3a6ea5" } }).png().toBuffer();
    const result = await transferLook(original, edit);
    expect([result.width, result.height]).toEqual([WIDTH, HEIGHT]);
  });
});
