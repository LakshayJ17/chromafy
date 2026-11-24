import "server-only";
import sharp from "sharp";

/**
 * Applies the colour and light of an AI-edited image to the sharp original.
 *
 * Small image models redraw the whole scene from a low-resolution copy, so
 * fine detail comes back soft and objects can shift. Instead of returning
 * that redraw, the original pixels are kept and only the edit's look moves
 * across, in two parts:
 *
 * 1. Global tone and colour: the original's lightness histogram is matched to
 *    the edit's, and its colour channels take on the edit's mean and spread
 *    (in CIELAB). This carries contrast, faded blacks, warmth and palette.
 * 2. Broad light: a very coarse per-channel gain map (the edit divided by the
 *    original, both reduced to a few dozen pixels) adds where the edit made
 *    areas warmer, cooler, brighter or darker, such as a glowing sky. It is
 *    coarse on purpose, so objects the model moved do not leave halos.
 */

export type LookOptions = {
  /** 0 to 1: how much of the edit's global tone and colour to apply. */
  globalStrength?: number;
  /** 0 to 1: how much of the edit's broad, local light to apply. */
  localStrength?: number;
};

const DEFAULTS: Required<LookOptions> = { globalStrength: 0.85, localStrength: 0.8 };

/** Long edge of the coarse light map; small enough that shifted objects blur away. */
const LIGHT_MAP_EDGE = 48;
const GAIN_RANGE = { min: 0.6, max: 1.7 };
const STD_RATIO_RANGE = { min: 0.7, max: 1.4 };
/** Largest shift of the average a* or b*, so one strong tint cannot recolour the whole photo. */
const MAX_MEAN_SHIFT = 12;
/** Tone-curve slope limits: steeper curves turn noise and JPEG blocks into blotches. */
const SLOPE_RANGE = { min: 0.35, max: 1.8 };
/** Width of the tone-curve smoothing window, in L* units. */
const CURVE_SMOOTHING = 4;
const L_BINS = 1001; // L* from 0 to 100 in steps of 0.1

export async function transferLook(
  original: Buffer,
  edited: Buffer,
  options: LookOptions = {},
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const { globalStrength, localStrength } = { ...DEFAULTS, ...options };

  const base = await sharp(original).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const target = await sharp(edited).removeAlpha().resize(width, height, { fit: "fill" }).raw().toBuffer();

  const pixels = width * height;
  const baseLab = toLab(base.data, pixels);

  // Tone statistics compare the edit with a copy of the original at the edit's own
  // resolution, so the edit's lower detail is not mistaken for a change in contrast.
  const editInfo = await sharp(edited).metadata();
  const statsWidth = Math.min(width, editInfo.width ?? width);
  const statsHeight = Math.min(height, editInfo.height ?? height);
  const statsPixels = statsWidth * statsHeight;
  const [originalSmall, editSmall] = await Promise.all(
    [original, edited].map((bytes) =>
      sharp(bytes).removeAlpha().resize(statsWidth, statsHeight, { fit: "fill" }).raw().toBuffer(),
    ),
  );
  const fromLabStats = toLab(originalSmall, statsPixels);
  const toLabStats = toLab(editSmall, statsPixels);

  // 1. Lightness: histogram matching. Colour: mean and spread of a* and b*.
  const lookup = matchHistogram(fromLabStats, toLabStats, statsPixels);
  const ab = [1, 2].map((channel) => {
    const from = meanStd(fromLabStats, channel, statsPixels);
    const to = meanStd(toLabStats, channel, statsPixels);
    const ratio = clamp(to.std / Math.max(from.std, 1e-3), STD_RATIO_RANGE.min, STD_RATIO_RANGE.max);
    const shift = clamp(to.mean - from.mean, -MAX_MEAN_SHIFT, MAX_MEAN_SHIFT);
    return { from, to: { mean: from.mean + shift, std: to.std }, ratio };
  });
  for (let i = 0; i < pixels; i++) {
    const o = i * 3;
    const l = baseLab[o];
    baseLab[o] = l + globalStrength * (lookup[Math.round(clamp(l, 0, 100) * 10)] - l);
    for (let c = 0; c < 2; c++) {
      const { from, to, ratio } = ab[c];
      const value = baseLab[o + 1 + c];
      const mapped = (value - from.mean) * ratio + to.mean;
      baseLab[o + 1 + c] = value + globalStrength * (mapped - value);
    }
  }
  const graded = fromLab(baseLab, pixels);

  // 2. Broad light: a coarse gain map from the edit, applied in linear light.
  // sharp applies one resize per pipeline, so shrinking and enlarging are separate passes.
  const coarse = async (data: Buffer) => {
    const small = await sharp(data, { raw: { width, height, channels: 3 } })
      .resize(LIGHT_MAP_EDGE, LIGHT_MAP_EDGE, { fit: "inside" })
      .blur(1.5)
      .raw()
      .toBuffer({ resolveWithObject: true });
    return sharp(small.data, { raw: { width: small.info.width, height: small.info.height, channels: 3 } })
      .resize(width, height, { fit: "fill", kernel: "cubic" })
      .raw()
      .toBuffer();
  };
  const [gradedLight, targetLight] = await Promise.all([coarse(graded), coarse(target)]);

  const out = Buffer.alloc(pixels * 3);
  for (let i = 0; i < out.length; i++) {
    const gain = clamp(
      (LINEAR[targetLight[i]] + 0.01) / (LINEAR[gradedLight[i]] + 0.01),
      GAIN_RANGE.min,
      GAIN_RANGE.max,
    );
    out[i] = linearToSrgb(LINEAR[graded[i]] * gain ** localStrength);
  }

  const bytes = await sharp(out, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return { bytes, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

const LINEAR = Float64Array.from({ length: 256 }, (_, v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});

function linearToSrgb(value: number): number {
  const v = clamp(value, 0, 1);
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
}

// sRGB (D65) <-> CIELAB
const WHITE = [0.95047, 1, 1.08883];
const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const labFInv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

function toLab(rgb: Buffer, pixels: number): Float32Array {
  const lab = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    const o = i * 3;
    const r = LINEAR[rgb[o]];
    const g = LINEAR[rgb[o + 1]];
    const b = LINEAR[rgb[o + 2]];
    const fx = labF((0.4124 * r + 0.3576 * g + 0.1805 * b) / WHITE[0]);
    const fy = labF(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const fz = labF((0.0193 * r + 0.1192 * g + 0.9505 * b) / WHITE[2]);
    lab[o] = 116 * fy - 16;
    lab[o + 1] = 500 * (fx - fy);
    lab[o + 2] = 200 * (fy - fz);
  }
  return lab;
}

function fromLab(lab: Float32Array, pixels: number): Buffer {
  const rgb = Buffer.alloc(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    const o = i * 3;
    const fy = (lab[o] + 16) / 116;
    const x = WHITE[0] * labFInv(fy + lab[o + 1] / 500);
    const y = labFInv(fy);
    const z = WHITE[2] * labFInv(fy - lab[o + 2] / 200);
    rgb[o] = linearToSrgb(3.2406 * x - 1.5372 * y - 0.4986 * z);
    rgb[o + 1] = linearToSrgb(-0.9689 * x + 1.8758 * y + 0.0415 * z);
    rgb[o + 2] = linearToSrgb(0.0557 * x - 0.204 * y + 1.057 * z);
  }
  return rgb;
}

function meanStd(lab: Float32Array, channel: number, pixels: number): { mean: number; std: number } {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < pixels; i++) {
    const v = lab[i * 3 + channel];
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / pixels;
  return { mean, std: Math.sqrt(Math.max(0, sumSq / pixels - mean * mean)) };
}

/** Maps each source L* bin to the target L* at the same cumulative share. */
function matchHistogram(source: Float32Array, target: Float32Array, pixels: number): Float32Array {
  const cdf = (lab: Float32Array) => {
    const counts = new Float64Array(L_BINS);
    for (let i = 0; i < pixels; i++) counts[Math.round(clamp(lab[i * 3], 0, 100) * 10)]++;
    for (let b = 1; b < L_BINS; b++) counts[b] += counts[b - 1];
    for (let b = 0; b < L_BINS; b++) counts[b] /= pixels;
    return counts;
  };
  const from = cdf(source);
  const to = cdf(target);
  const raw = new Float32Array(L_BINS);
  let j = 0;
  for (let b = 0; b < L_BINS; b++) {
    while (j < L_BINS - 1 && to[j] < from[b]) j++;
    raw[b] = j / 10;
  }
  return smoothCurve(raw);
}

/** Smooths the matched curve and limits its slope, so tones stay continuous and noise is not amplified. */
function smoothCurve(curve: Float32Array): Float32Array {
  const half = Math.round((CURVE_SMOOTHING * 10) / 2);
  const smoothed = new Float32Array(L_BINS);
  for (let b = 0; b < L_BINS; b++) {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, b - half); k <= Math.min(L_BINS - 1, b + half); k++) {
      sum += curve[k];
      count++;
    }
    smoothed[b] = sum / count;
  }
  // Rebuild from clamped steps (0.1 L* per bin), anchored at the smoothed midpoint.
  const out = new Float32Array(L_BINS);
  const mid = Math.floor(L_BINS / 2);
  out[mid] = smoothed[mid];
  for (let b = mid + 1; b < L_BINS; b++) {
    out[b] = out[b - 1] + clamp(smoothed[b] - smoothed[b - 1], SLOPE_RANGE.min * 0.1, SLOPE_RANGE.max * 0.1);
  }
  for (let b = mid - 1; b >= 0; b--) {
    out[b] = out[b + 1] - clamp(smoothed[b + 1] - smoothed[b], SLOPE_RANGE.min * 0.1, SLOPE_RANGE.max * 0.1);
  }
  for (let b = 0; b < L_BINS; b++) out[b] = clamp(out[b], 0, 100);
  return out;
}
