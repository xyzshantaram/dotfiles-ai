/// <reference lib="dom" />
// Zepto prototype, phase 2: order detail discovery.
// Logged-in profile; open orders page, click first order, capture APIs.

import { dumpStorage, openSession, recordJson, untilClosed } from "../src/browser.ts";

const OUT = "/tmp/dsh/zepto3";
await Deno.mkdir(OUT, { recursive: true });

const session = await openSession({
  profileDir: "/tmp/dsh/zepto-profile",
  viewport: { width: 1280, height: 900 },
  geolocation: { latitude: 12.9341967, longitude: 77.7241821 },
});
const { page, ctx } = session;
const recorder = recordJson(page, {
  outDir: OUT,
  logFilter: /order|api/i,
});

await page.goto("https://www.zeptonow.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
console.log("[proto] finding the orders entry point");

// Discover the orders route from anchor/menu links.
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a[href]"))
    .map((a) => ({
      href: (a as HTMLAnchorElement).getAttribute("href") ?? "",
      text: (a.textContent ?? "").trim().slice(0, 30),
    }))
    .filter((l) => /order/i.test(l.href + " " + l.text))
    .slice(0, 10)
);
console.log("[proto] order links:", JSON.stringify(links, null, 2));

const ordersUrl = links.find((l) => /order/i.test(l.href))?.href ??
  "https://www.zeptonow.com/orders";
await page.goto(ordersUrl, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
console.log("[proto] at", page.url(), "— clicking the first order card");

const card = page.locator("text=/DELIVERED|Delivered|Arriving/").first();
await card.click({ timeout: 15_000 }).catch((e) => console.log("[proto] click failed:", e.message));
await page.waitForTimeout(8000);
console.log("[proto] detail view at", page.url());
await page.screenshot({ path: `${OUT}/zepto-detail.png`, fullPage: true });

const dump = await dumpStorage(page);
await Deno.writeTextFile(`${OUT}/storage-snapshot.json`, JSON.stringify(dump, null, 2));
console.log(`[proto] ${recorder.count()} responses saved; window stays open — close when done`);
await untilClosed(ctx);
