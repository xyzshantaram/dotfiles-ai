// Blinkit prototype, phase 1 round 2: login + capture.
// Fixes over round 1: exact auth-key detection (useragent was a
// false positive), geolocation pre-granted (no permission prompt),
// direct candidate URL probing for the orders page.

import { chromium } from "playwright";

const OUT = "/tmp/dsh/blinkit";
await Deno.mkdir(OUT, { recursive: true });
await Deno.mkdir("/home/sid/ai-scratch/split-utils/state", { recursive: true });

const ctx = await chromium.launchPersistentContext("/tmp/dsh/blinkit-profile", {
  headless: false,
  viewport: { width: 1280, height: 900 },
  executablePath: "/home/sid/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  permissions: ["geolocation"],
  geolocation: { latitude: 13.0827, longitude: 80.2707 }, // Chennai
});
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto("https://blinkit.com", { waitUntil: "domcontentloaded" });
console.log("[proto] browser open at blinkit.com — LOG IN if not already");

// Strict login detection: auth.accessToken must be non-null.
// (The auth/user keys exist pre-login holding null/empty values.)
async function loggedIn(): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      try {
        const auth = JSON.parse(localStorage.getItem("auth") ?? "{}");
        return typeof auth.accessToken === "string" && auth.accessToken.length > 20;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

const deadline = Date.now() + 15 * 60_000;
while (Date.now() < deadline && !(await loggedIn())) {
  await page.waitForTimeout(2000);
}
if (!(await loggedIn())) {
  console.log("[proto] timed out waiting for login");
  await ctx.close();
  Deno.exit(1);
}
console.log("[proto] logged in: accessToken present");
console.log("[proto] 30s pause — pick your location in the window if needed");
await page.waitForTimeout(30_000);

// Persist storage state.
const state = await ctx.storageState();
await Deno.writeTextFile(
  "/home/sid/ai-scratch/split-utils/state/blinkit.storage.json",
  JSON.stringify(state, null, 2),
);
console.log("[proto] storage state saved");

// Dump localStorage auth/user key shapes (first 60 chars) for diagnosis.
const keyDump = await page.evaluate(() => {
  const out: Record<string, string> = {};
  for (const k of ["auth", "user"]) {
    const v = localStorage.getItem(k);
    out[k] = v ? v.slice(0, 60) : "(absent)";
  }
  return out;
});
console.log("[proto] key shapes:", JSON.stringify(keyDump));

// Enumerate all nav-ish links for discovery.
await page.goto("https://blinkit.com", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a[href]"))
    .map((a) => ({
      href: (a as HTMLAnchorElement).getAttribute("href") ?? "",
      text: (a.textContent ?? "").trim().slice(0, 30),
    }))
    .filter((l) => l.href && !l.href.startsWith("javascript"))
    .slice(0, 40)
);
console.log("[proto] links:", JSON.stringify(links, null, 2));

// Probe candidate orders URLs.
const candidates = [
  "https://blinkit.com/account/orders",
  "https://blinkit.com/my-orders",
  "https://blinkit.com/orders",
];
for (const url of candidates) {
  const res = await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => null);
  await page.waitForTimeout(4000);
  const slug = url.replace(/https:\/\/blinkit\.it\//, "").replace(/[^\w-]/g, "_");
  await page.screenshot({ path: `${OUT}/probe-${slug}.png`, fullPage: true });
  const bodyText = (await page.evaluate(() => document.body.innerText.slice(0, 400)))
    .replace(/\n+/g, " | ");
  console.log(`[proto] probe ${url} status=${res?.status()} text="${bodyText.slice(0, 200)}"`);
  if (/order/i.test(bodyText) && !/not found|404/i.test(bodyText)) {
    await Deno.writeTextFile(`${OUT}/orders.html`, await page.content());
    console.log("[proto] plausible orders page captured:", url);
    break;
  }
}
console.log("[proto] done capturing; browser stays open — close it when you like");
// Deliberately NOT closing: the user closes the window by hand.
// ctx stays alive until the process ends.
await new Promise(() => {});
