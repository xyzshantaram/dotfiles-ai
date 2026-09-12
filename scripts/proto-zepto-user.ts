// Zepto prototype, phase 1b: user-driven discovery.
// No login-guessing: record everything until the user closes the window.
// Storage snapshots save every 5s so pre/post-login keys can be diffed.

import { dumpStorage, openSession, recordJson, untilClosed } from "../src/browser.ts";

const OUT = "/tmp/dsh/zepto2";
await Deno.mkdir(OUT, { recursive: true });

const session = await openSession({
  profileDir: "/tmp/dsh/zepto-profile",
  viewport: { width: 1280, height: 900 },
  geolocation: { latitude: 12.9341967, longitude: 77.7241821 },
});
const { page, ctx } = session;

const recorder = recordJson(page, {
  outDir: OUT,
  logFilter: /order|history|bff|api/i,
});

await page.goto("https://www.zeptonow.com/", { waitUntil: "domcontentloaded" });
console.log("[proto] zeptonow.com open");
console.log("[proto] 1. LOG IN (phone + OTP)");
console.log("[proto] 2. open your ORDERS / order history");
console.log("[proto] 3. CLOSE the window when done — everything records until then");

let tick = 0;
const interval = setInterval(async () => {
  tick += 1;
  try {
    const dump = await dumpStorage(page);
    await Deno.writeTextFile(
      `${OUT}/storage-snapshot.json`,
      JSON.stringify(dump, null, 2),
    );
  } catch { /* mid-navigation */ }
}, 5000);

await untilClosed(ctx);
clearInterval(interval);
console.log(`[proto] window closed after ~${tick * 5}s; ${recorder.count()} JSON responses saved`);
console.log("[proto] final storage snapshot written alongside them");
