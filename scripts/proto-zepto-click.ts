/// <reference lib="dom" />
// Zepto prototype, phase 4: click the first order card, capture detail API.
// No login needed — profile is logged in. Auto-closes.

import { openSession, recordJson } from "../src/browser.ts";

const OUT = "/tmp/dsh/zepto5";
await Deno.mkdir(OUT, { recursive: true });

const session = await openSession({
  profileDir: "/tmp/dsh/zepto-profile",
  viewport: { width: 1280, height: 900 },
  geolocation: { latitude: 12.9341967, longitude: 77.7241821 },
});
const { page, ctx } = session;
const recorder = recordJson(page, { outDir: OUT, logFilter: /order/i });

await page.goto("https://www.zeptonow.com/account/orders", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
await page.screenshot({ path: `${OUT}/list.png` });

// Dump anchors + card-ish elements on the list page.
const structure = await page.evaluate(() => {
  const anchors = Array.from(document.querySelectorAll("a[href]"))
    .map((a) => ({
      href: (a as HTMLAnchorElement).getAttribute("href") ?? "",
      text: (a.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
    }))
    .filter((l) => l.href)
    .slice(0, 20);
  const orderTexts = Array.from(document.querySelectorAll("div,section"))
    .map((d) => (d.textContent ?? "").trim().replace(/\s+/g, " "))
    .filter((t) => /placed at/i.test(t))
    .slice(0, 3);
  return { anchors, orderTexts };
});
console.log("[proto] anchors:", JSON.stringify(structure.anchors, null, 1));
console.log("[proto] placed-at elements:", JSON.stringify(structure.orderTexts, null, 1));

// Click the card containing "Placed at".
const card = page.locator("div:has-text('Placed at'), section:has-text('Placed at')").first();
await card.click({ timeout: 10_000 }).catch((e) => console.log("[proto] card click:", e.message));
await page.waitForTimeout(9000);
console.log("[proto] after click:", page.url());
await page.screenshot({ path: `${OUT}/detail.png`, fullPage: true });

console.log(`[proto] ${recorder.count()} saved; closing`);
await ctx.close();
