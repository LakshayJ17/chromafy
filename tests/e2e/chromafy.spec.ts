import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/*
 * MOCKED transformation: /api/transform is fulfilled inside the browser with a
 * stand-in image. These tests prove the UI workflow, not the real provider.
 */
const UPLOAD = readFileSync("public/samples/blue-wall.jpg");
const STAND_IN_RESULT = readFileSync("public/samples/camper-van.jpg");

function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

async function mockTransform(page: Page, responses: Array<"ok" | "safety">) {
  const calls: Array<{ url: string; bytes: number }> = [];
  await page.route("**/api/transform?**", async (route) => {
    const request = route.request();
    calls.push({ url: request.url(), bytes: request.postDataBuffer()?.byteLength ?? 0 });
    const mood = new URL(request.url()).searchParams.get("mood") ?? "golden";
    const next = responses.shift() ?? "ok";
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (next === "safety") {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "provider_safety", message: "The image service declined this photo or its result under its safety policy. Try a different photo." } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "image/jpeg", headers: { "x-chromafy-mood": mood }, body: STAND_IN_RESULT });
  });
  return calls;
}

test("landing page renders with strict security headers and no console errors", async ({ page }) => {
  const problems = watchConsole(page);
  const response = await page.goto("/");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-powered-by"]).toBeUndefined();
  expect(headers["content-security-policy"]).not.toContain("unsafe-eval");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/What if it felt\s*different\?/);
  await expect(page.getByRole("navigation", { name: "The four worlds" }).getByRole("link")).toHaveCount(5);

  await page.getByRole("navigation", { name: "The four worlds" }).getByRole("link", { name: /After Rain/ }).click();
  await expect(page.getByRole("button", { name: "After Rain", pressed: true })).toBeVisible();
  await expect(page.getByRole("region", { name: /After Rain/ })).toContainText("cooler");

  await page.getByRole("link", { name: "Reimagine a photo" }).click();
  await expect(page).toHaveURL(/\/create$/);
  expect(problems.filter((text) => !text.includes("Download the React DevTools"))).toEqual([]);
});

test("full studio workflow with a mocked transformation", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium");
  const problems = watchConsole(page);
  const calls = await mockTransform(page, ["ok", "safety", "ok"]);
  await page.goto("/create");

  await page.getByLabel(/Choose a photo/).setInputFiles({ name: "blue-wall.jpg", mimeType: "image/jpeg", buffer: UPLOAD });
  await expect(page.getByAltText("Your original photo")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Reimagine/ })).toBeDisabled();

  await page.getByText("Golden", { exact: true }).click();
  await page.getByRole("button", { name: /^Reimagine/ }).click();
  await expect(page.getByText("Reimagining in Golden")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reimagining…" })).toBeDisabled();

  const slider = page.getByRole("slider", { name: "Compare original and reimagined" });
  await expect(slider).toBeVisible();
  await expect(page.getByRole("heading", { name: "Golden" })).toBeVisible();
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", "100");

  await page.getByRole("button", { name: "Side by side" }).click();
  await expect(page.locator("figcaption", { hasText: "Reimagined · Golden" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/^chromafy-golden-\d{4}-\d{2}-\d{2}\.jpg$/);

  // Another mood fails (mocked safety rejection): original kept, message shown.
  await page.getByText("After Rain", { exact: true }).click();
  await page.getByRole("button", { name: /^Reimagine/ }).click();
  await expect(page.getByRole("complementary", { name: "Controls" }).getByRole("alert")).toContainText("safety policy");
  await expect(page.getByAltText("Your original photo")).toBeVisible();

  // Retry without re-uploading.
  await page.getByRole("button", { name: /^Reimagine/ }).click();
  await expect(page.getByRole("heading", { name: "After Rain" })).toBeVisible();

  expect(calls.map((call) => new URL(call.url).search)).toEqual(["?mood=golden", "?mood=after-rain", "?mood=after-rain"]);
  // Every attempt uploaded the same prepared original, not a previous result.
  expect(new Set(calls.map((call) => call.bytes)).size).toBe(1);
  expect(problems.filter((text) => !text.includes("Download the React DevTools") && !text.includes("422"))).toEqual([]);
});

test("share falls back to a download where file sharing is unavailable", async ({ page }) => {
  await mockTransform(page, ["ok"]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  await page.goto("/create?sample=cafe-table");
  await expect(page.getByAltText("Your original photo")).toBeVisible();
  await page.getByRole("button", { name: /Surprise me/ }).click();
  await expect(page.getByRole("slider", { name: "Compare original and reimagined" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share" }).click();
  expect((await download).suggestedFilename()).toMatch(/^chromafy-[a-z-]+-\d{4}-\d{2}-\d{2}\.jpg$/);
  await expect(page.getByText(/downloaded it instead/)).toBeVisible();
});

test("curated samples load from the site's own registry only", async ({ page }) => {
  await page.goto("/create?sample=jetty");
  await expect(page.getByText("Jetty sample", { exact: true })).toBeVisible();
  await page.goto("/create?sample=https://evil.example/x.jpg");
  await expect(page.getByText("Drop a photo here")).toBeVisible();
});

test("the API rejects cross-site and malformed requests before any provider call", async ({ request }) => {
  const crossSite = await request.post("/api/transform?mood=golden", {
    headers: { "content-type": "image/jpeg", origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    data: UPLOAD,
  });
  expect(crossSite.status()).toBe(403);
  expect(await crossSite.json()).toEqual({ error: { code: "forbidden_origin", message: expect.any(String) } });

  const badMood = await request.post("/api/transform?mood=neon", { headers: { "content-type": "image/jpeg" }, data: UPLOAD });
  expect(badMood.status()).toBe(400);

  const injected = await request.post("/api/transform?mood=golden&prompt=anything", { headers: { "content-type": "image/jpeg" }, data: UPLOAD });
  expect(injected.status()).toBe(400);

  // This production server has no Upstash configured, so an otherwise acceptable
  // upload is refused by the fail-closed rate limiter before validation or any provider call.
  const failClosed = await request.post("/api/transform?mood=golden", { headers: { "content-type": "image/jpeg" }, data: UPLOAD });
  expect(failClosed.status()).toBe(503);
  expect((await failClosed.json()).error.code).toBe("rate_limiter_unavailable");
  expect(failClosed.headers()["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
  expect(failClosed.headers()["cache-control"]).toBe("no-store");
});
