// Zepto prototype, phase 1: login + network discovery.
// Opens Zepto, user logs in (phone + OTP), then we watch every XHR
// while the user (or we) reach the orders page.

import { chromium } from "playwright";

const OUT = "/tmp/dsh/zepto";
await Deno.mkdir(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext("/tmp/dsh/zepto-profile", {
  headless: false,
  viewport: { width: 1280, height: 900 },
  executablePath: "/home/sid/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  permissions: ["geolocation"],
  geolocation: { latitude: 12.9341967, longitude: 77.7241821 }, // Bengaluru
});
const page = ctx.pages()[0] ?? await ctx.newPage();

// Log JSON XHRs to disk as they happen.
let n = 0;
page.on("response", async (res) => {
  const url = res.url();
  if (!/zepto/i.test(url)) return;
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
    if (/order|history|cart|api/i.test(url)) {
      console.log(`[net] ${res.status()} ${url} (${body.length}b)`);
    }
  } catch { /* body gone */ }
});

await page.goto("https://www.zeptonow.com/", { waitUntil: "domcontentloaded" });
console.log("[proto] browser open at zeptonow.com — LOG IN (phone + OTP)");
console.log("[proto] then open My Orders / order history in the page");

// Wait for login: watch for auth-ish storage on the zepto origin.
async function loggedIn(): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) ?? "";
        const v = localStorage.getItem(k) ?? "";
        if (/token|auth/i.test(k) && v.length > 30 && !/null/.test(v.slice(0, 40))) {
          return true;
        }
      }
      return false;
    });
  } catch {
    return false;
  }
}

const deadline = Date.now() + 15 * 60_000;
while (Date.now() < deadline && !(await loggedIn())) {
  await page.waitForTimeout(2000);
}
console.log("[proto] login signal seen; keep browsing your orders — capturing");
// Let the user drive for 90s while we record everything.
await page.waitForTimeout(90_000);
console.log(`[proto] captured ${n} JSON responses; closing`);
await ctx.close();
