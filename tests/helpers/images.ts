import sharp from "sharp";

export async function makeImage(
  format: "jpeg" | "png" | "webp",
  width = 640,
  height = 480,
  options: { alpha?: boolean } = {},
): Promise<Buffer> {
  const image = sharp({
    create: {
      width,
      height,
      channels: options.alpha ? 4 : 3,
      background: options.alpha ? { r: 200, g: 120, b: 80, alpha: 0.5 } : { r: 200, g: 120, b: 80 },
    },
  });
  return image.toFormat(format).toBuffer();
}

/** A JPEG carrying EXIF with GPS coordinates and a camera make, to prove stripping. */
export async function makeJpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 300, channels: 3, background: "#4477aa" } })
    .withExif({
      IFD0: { Make: "TestCamera", Model: "Secret Model" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 0/1" },
    })
    .jpeg()
    .toBuffer();
}

export async function makeAnimatedWebp(): Promise<Buffer> {
  const frame = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();
  const frame2 = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#0000ff" } })
    .png()
    .toBuffer();
  return sharp([frame, frame2], { join: { animated: true } })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
}

export async function makeGif(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 300, channels: 3, background: "#00ff00" } })
    .gif()
    .toBuffer();
}

/** A PNG whose header claims enormous dimensions: a decompression-bomb shape. */
export async function makeHugeDimensionPng(): Promise<Buffer> {
  const png = await makeImage("png", 300, 300);
  const forged = Buffer.from(png);
  // IHDR width/height live at byte offsets 16 and 20.
  forged.writeUInt32BE(60_000, 16);
  forged.writeUInt32BE(60_000, 20);
  return forged;
}

export const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><script>alert(1)</script></svg>',
);

export function truncate(bytes: Buffer, keep = 0.4): Buffer {
  return bytes.subarray(0, Math.floor(bytes.byteLength * keep));
}
