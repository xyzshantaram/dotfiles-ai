/// <reference lib="dom" />
// Zepto prototype, phase 3: /account -> order detail.
// The real orders surface is /account (user-confirmed).

import { dumpStorage, openSession, recordJson, untilClosed } from "../src/browser.ts";

const OUT = "/tmp/dsh/zepto4";
await Deno.mkdir(OUT, { recursive: true });

const session = await openSession({
  profileDir: "/tmp/dsh/zepto-profile",
  viewport: { width: 1280, height: 900 },
  geolocation: { latitude: 12.9341967, longitude: 77.7241821 },
});
const { page, ctx } = session;
const recorder = recordJson(page, {
  outDir: OUT,
  logFilter: /order/i,
});

await page.goto("https://www.zeptonow.com/account", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/account.png`, fullPage: false });
console.log("[proto] at", page.url());

// Any anchor that smells like an order detail.
const orderLinks = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a[href]"))
    .map((a) => ({
      href: (a as HTMLAnchorElement).getAttribute("href") ?? "",
      text: (a.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50),
    }))
    .filter((l) => /order/i.test(l.href) || /order/i.test(l.text))
    .slice(0, 12)
);
console.log("[proto] order-ish links:", JSON.stringify(orderLinks, null, 2));

if (orderLinks.length) {
  await page.click(`a[href="${orderLinks[0].href}"]`, { timeout: 10_000 }).catch((e) =>
    console.log("[proto] click failed:", e.message)
  );
  await page.waitForTimeout(8000);
  console.log("[proto] detail at", page.url());
  await page.screenshot({ path: `${OUT}/detail.png`, fullPage: true });
}

const dump = await dumpStorage(page);
await Deno.writeTextFile(`${OUT}/storage-snapshot.json`, JSON.stringify(dump, null, 2));
console.log(`[proto] ${recorder.count()} saved; close the window when done`);
await untilClosed(ctx);
