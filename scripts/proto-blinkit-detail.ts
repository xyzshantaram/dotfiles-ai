// Blinkit prototype, phase 3: order detail capture.
// Click the first order card, capture the detail API response.

import { chromium } from "playwright";

const OUT = "/tmp/dsh/blinkit/net";
await Deno.mkdir(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext("/tmp/dsh/blinkit-profile", {
  headless: false,
  viewport: { width: 1280, height: 900 },
  executablePath: "/home/sid/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
});
const page = ctx.pages()[0] ?? await ctx.newPage();

let n = 100;
page.on("response", async (res) => {
  const url = res.url();
  if (!/blinkit\.com\/(v1|v2|api)\//.test(url)) return;
  const ct = res.headers()["content-type"] ?? "";
  if (!ct.includes("json")) return;
  const slug = url
    .replace(/^https?:\/\/[^\/]+\//, "")
    .replace(/[^\w-]/g, "_")
    .slice(0, 80);
  try {
    const body = await res.text();
    n += 1;
    await Deno.writeTextFile(`${OUT}/${String(n).padStart(3, "0")}-${slug}.json`, body);
    console.log(`[net] ${res.status()} ${url} (${body.length}b)`);
  } catch (e) {
    console.log(`[net] ${res.status()} ${url} (unreadable: ${e.message})`);
  }
});

await page.goto("https://blinkit.com/account/orders", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8_000);
console.log("[proto] clicking first order card");

// The card container: element whose text starts with "Arrived in" / any
// order-status title inside the list. Click the title's card ancestor.
const card = page.locator("text=/Arrived in|Delivered|Cancelled/").first();
await card.click({ timeout: 10_000 });
await page.waitForTimeout(10_000);
console.log("[proto] now at", page.url());
await page.screenshot({ path: "/tmp/dsh/blinkit/order-detail.png", fullPage: true });

// Also try the direct URL form for future headless use.
const orderId = "2633822793";
await page.goto(
  `https://blinkit.com/account/orders/${orderId}`,
  { waitUntil: "domcontentloaded" },
).catch(() => console.log("[proto] direct URL nav failed"));
await page.waitForTimeout(8_000);
console.log("[proto] direct URL landed at", page.url());
await page.screenshot({ path: "/tmp/dsh/blinkit/order-direct-url.png", fullPage: true });

await page.waitForTimeout(2_000);
console.log("[proto] done; closing");
await ctx.close();
