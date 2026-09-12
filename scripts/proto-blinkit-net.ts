// Blinkit prototype, phase 2: network capture on the orders pages.
// Profile is already logged in. Navigate to /account/orders, log every
// XHR/fetch response, save JSON bodies, click into the first order for
// the detail (items) shape.

import { chromium } from "playwright";

const OUT = "/tmp/dsh/blinkit/net";
await Deno.mkdir(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext("/tmp/dsh/blinkit-profile", {
  headless: false,
  viewport: { width: 1280, height: 900 },
  executablePath: "/home/sid/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  permissions: ["geolocation"],
});
const page = ctx.pages()[0] ?? await ctx.newPage();

let n = 0;
page.on("response", async (res) => {
  const url = res.url();
  if (!/^https?:\/\/[^\/]*blinkit\.com\//.test(url)) return;
  const ct = res.headers()["content-type"] ?? "";
  if (!ct.includes("json")) return;
  const slug = url
    .replace(/^https?:\/\/[^\/]+\//, "")
    .replace(/[^\w-]/g, "_")
    .slice(0, 80) || "root";
  try {
    const body = await res.text();
    n += 1;
    await Deno.writeTextFile(`${OUT}/${String(n).padStart(3, "0")}-${slug}.json`, body);
    console.log(`[net] ${res.status()} ${url} (${body.length}b)`);
  } catch (e) {
    console.log(`[net] ${res.status()} ${url} (body unreadable: ${e.message})`);
  }
});

await page.goto("https://blinkit.com/account/orders", { waitUntil: "domcontentloaded" });
console.log("[proto] on /account/orders, waiting for XHRs");
await page.waitForTimeout(10_000);

// Scroll to bottom a few times to trigger pagination.
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => globalThis.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2_500);
}
await page.screenshot({ path: "/tmp/dsh/blinkit/orders-list.png", fullPage: true });
console.log("[proto] list scrolled + captured");

// Click into the first order card for the detail shape.
const first = page.locator("a[href*='/account/orders/'], [class*=order] >> nth=0");
try {
  await first.first().click({ timeout: 5_000 });
  await page.waitForTimeout(8_000);
  await page.screenshot({ path: "/tmp/dsh/blinkit/order-detail.png", fullPage: true });
  console.log("[proto] detail page captured at", page.url());
} catch (e) {
  console.log("[proto] first-card click failed:", e.message);
}

await page.waitForTimeout(3_000);
console.log(`[proto] captured ${n} JSON responses; closing`);
await ctx.close();
