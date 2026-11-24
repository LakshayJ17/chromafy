// Real end-to-end check against a RUNNING Chromafy server (npm run dev).
// Sends one curated sample through /api/transform exactly like the browser does,
// so it uses one real provider call. Prints the outcome; saves the result locally.
//
//   node scripts/smoke-transform.mjs [mood] [sample] [baseUrl]
//   node scripts/smoke-transform.mjs golden jetty http://localhost:3000
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [mood = "golden", sample = "jetty", base = "http://localhost:3000"] = process.argv.slice(2);
if (!/^[a-z-]+$/.test(mood) || !/^[a-z-]+$/.test(sample)) throw new Error("mood and sample must be plain IDs");

const image = readFileSync(new URL(`../public/samples/${sample}.jpg`, import.meta.url));
const started = Date.now();
const response = await fetch(`${base}/api/transform?mood=${mood}`, {
  method: "POST",
  headers: { "content-type": "image/jpeg", origin: base, "sec-fetch-site": "same-origin" },
  body: image,
});
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (!response.ok) {
  console.error(`Failed with ${response.status} after ${seconds}s:`, (await response.text()).slice(0, 500));
  process.exit(1);
}
const bytes = Buffer.from(await response.arrayBuffer());
const type = response.headers.get("content-type");
const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
mkdirSync(new URL("../smoke-output/", import.meta.url), { recursive: true });
const out = new URL(`../smoke-output/${sample}-${response.headers.get("x-chromafy-mood")}.${extension}`, import.meta.url);
writeFileSync(out, bytes);
console.log(`Saved ${type}, ${(bytes.byteLength / 1024).toFixed(0)} KB in ${seconds}s, to ${out.pathname}`);
