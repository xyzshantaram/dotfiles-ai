// Swiggy prototype, phase 1: login + discovery on the MOBILE UI.
// Android UA + 9:16 viewport (desktop Swiggy shows restaurants only).
// User logs in, browses Food orders and Instamart orders, closes the
// window to stop. Storage snapshots every 5s; JSON captured throughout.

import { dumpStorage, openSession, recordJson, untilClosed } from "../src/browser.ts";

const OUT = "/tmp/dsh/swiggy";
await Deno.mkdir(OUT, { recursive: true });

const session = await openSession({
  profileDir: "/tmp/dsh/swiggy-profile2", // fresh; profile1 is WAF-flagged
  executablePath: "/usr/bin/chromium-browser", // real distro build, not CfT
  mobile: true, // touch + mobile viewport; UA alone scores as bot
  viewport: { width: 412, height: 915 }, // 9:16 phone
  // Matches the user's real phone (Pixel 9a, Android 17) and the engine
  // (bundled Chromium is 151.0.7922.34; UA major must agree with it).
  userAgent:
    "Mozilla/5.0 (Linux; Android 17; Pixel 9a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Mobile Safari/537.36",
  geolocation: { latitude: 12.9341967, longitude: 77.7241821 },
});
const { page, ctx } = session;

// Log EVERY response status + URL so the exact 403 target is visible.
const statusLog = await Deno.open(`${OUT}/status.log`, { create: true, append: true });
page.on("response", (r) => {
  const line = new TextEncoder().encode(`${r.status()} ${r.request().method()} ${r.url()}\n`);
  statusLog.write(line);
});
page.on("requestfailed", (r) => {
  const line = new TextEncoder().encode(
    `FAIL ${r.method()} ${r.url()} ${r.failure()?.errorText}\n`,
  );
  statusLog.write(line);
});

const recorder = recordJson(page, {
  outDir: `${OUT}/net`,
  logFilter: /./, // capture everything for discovery
});

// Fault-tolerant navigation: WAF 403s surface as goto errors; keep the
// window up and retry so a passing challenge or manual reload still works.
for (let attempt = 1; attempt <= 60; attempt++) {
  try {
    await page.goto("https://www.swiggy.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log(`[proto] loaded (attempt ${attempt})`);
    break;
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.log(`[proto] nav attempt ${attempt} failed: ${msg}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
console.log("[proto] swiggy.com open in mobile UI");
console.log("[proto] 1. LOG IN (phone + OTP)");
console.log("[proto] 2. open your ORDERS (Food) and your INSTAMART orders if reachable");
console.log("[proto] 3. CLOSE the window when done — everything records until then");

let tick = 0;
const interval = setInterval(async () => {
  tick += 1;
  try {
    const dump = await dumpStorage(page);
    await Deno.writeTextFile(`${OUT}/storage-snapshot.json`, JSON.stringify(dump, null, 2));
  } catch { /* mid-navigation */ }
}, 5000);

await untilClosed(ctx);
clearInterval(interval);
console.log(`[proto] closed after ~${tick * 5}s; ${recorder.count()} JSON responses saved`);
