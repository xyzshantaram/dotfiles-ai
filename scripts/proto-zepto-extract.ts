// Zepto prototype, phase 6: capture-driven extraction.
// The gateway rejects replayed requests (time-bound request-signature),
// so the site's own JS makes every call; we navigate synthetically and
// harvest the JSON responses. No fabricated API calls at all.

/// <reference lib="dom" />

import { openSession, recordJson } from "../src/browser.ts";
import {
  checkBalance,
  extractFees,
  extractProducts,
  mapOrder,
  type ZeptoRawOrder,
} from "../src/zepto.ts";

const DAYS = 30;
const OUT = "/home/sid/ai-scratch/split-utils/out";
const CAP = "/tmp/dsh/zepto-run";
await Deno.mkdir(OUT, { recursive: true });
await Deno.mkdir(CAP, { recursive: true });
for await (const f of Deno.readDir(CAP)) {
  if (f.isFile) await Deno.remove(`${CAP}/${f.name}`);
}

const session = await openSession({
  profileDir: "/tmp/dsh/zepto-profile",
  viewport: { width: 1280, height: 900 },
  geolocation: { latitude: 12.9341967, longitude: 77.7241821 },
});
const { page, ctx } = session;
const recorder = recordJson(page, {
  outDir: CAP,
  urlFilter: /api\/v2\/order\/|ORDER_DETAILS/,
  logFilter: /api\/v2\/order\/|ORDER_DETAILS/,
});

// ---- phase 1: list via the orders page + Load More ----
await page.goto("https://www.zepto.com/account/orders", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);

const cutoff = Date.now() - DAYS * 86_400_000;
for (let i = 0; i < 20; i++) {
  const more = page.getByText("Load More", { exact: false });
  if (!(await more.count())) break;
  await more.first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3500);
}

// ---- harvest list responses from disk ----
const listRe: RegExp = /api_v2_order__page_number_(\d+)\.json$/;
const listFiles: Array<{ n: number; path: string }> = [];
for await (const f of Deno.readDir(CAP)) {
  const m = f.name.match(listRe);
  if (m) listFiles.push({ n: parseInt(m[1], 10), path: `${CAP}/${f.name}` });
}
listFiles.sort((a, b) => a.n - b.n);

const seen = new Set<string>();
const rawOrders: ZeptoRawOrder[] = [];
for (const { path } of listFiles) {
  const data = JSON.parse(await Deno.readTextFile(path)) as {
    orders?: ZeptoRawOrder[];
  };
  for (const o of data.orders ?? []) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    if (new Date(o.placedTime).getTime() < cutoff) continue;
    rawOrders.push(o);
    console.log(`[ext] ${o.code} ${o.placedTime} ₹${o.grandTotalAmount / 100} ${o.status}`);
  }
}
console.log(
  `[ext] ${rawOrders.length} orders within ${DAYS} days (from ${listFiles.length} list pages)`,
);

// ---- phase 2: details via direct routes ----
const detailFilesBefore = new Set<string>();
for await (const f of Deno.readDir(CAP)) {
  if (/ORDER_DETAILS/.test(f.name)) detailFilesBefore.add(f.name);
}

const fileIndex = (name: string) => parseInt(name.split("-")[0] ?? "0", 10);
const detailed: ZeptoRawOrder[] = [];
for (const o of rawOrders) {
  await page.goto(
    `https://www.zepto.com/order/${o.id}?isArchived=false`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(5000);
  // The bill widget loads on scroll (paged layout): scroll to bottom
  // in steps to trigger the remaining ORDER_DETAILS pages.
  for (let s = 0; s < 3; s++) {
    await page.evaluate(() => globalThis.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  }
  // only files that appeared during THIS navigation
  const fresh: string[] = [];
  for await (const f of Deno.readDir(CAP)) {
    if (/ORDER_DETAILS/.test(f.name) && !detailFilesBefore.has(f.name)) {
      fresh.push(f.name);
      detailFilesBefore.add(f.name);
    }
  }
  fresh.sort((a, b) => fileIndex(a) - fileIndex(b));
  const parsed = [];
  for (const name of fresh.reverse()) {
    parsed.push(JSON.parse(await Deno.readTextFile(`${CAP}/${name}`)));
  }
  const products = parsed.map(extractProducts).find((p) => p.length > 0) ?? [];
  const billFees = parsed.map(extractFees).find((f) => f.length > 0) ?? [];
  detailed.push({ ...o, products, billFees });
  console.log(
    `[ext] ${o.code}: ${products.length} products, fees: ${
      billFees.map((f) => `${f.label}=₹${f.amount}`).join(", ") || "none"
    }`,
  );
}

// ---- map + balance ----
const mapped = detailed.map((o) => mapOrder(o, o.billFees ?? []));
let allOk = true;
mapped.forEach((m) => {
  if (!checkBalance(m)) {
    allOk = false;
    const sum = m.items.reduce((s, i) => s + i.price * i.quantity, 0);
    console.log(`MISMATCH ${m.id}: items=${sum.toFixed(2)} paid=${m.paid}`);
  }
});
console.log(allOk ? `ALL ${mapped.length} BALANCE` : "balance failures above");

await Deno.writeTextFile(`${OUT}/zepto-orders-raw.json`, JSON.stringify(detailed, null, 2));
await Deno.writeTextFile(
  `${OUT}/orders-zepto.json`,
  JSON.stringify(
    { orders: mapped, meta: { source: "zepto-api", generated_at: new Date().toISOString() } },
    null,
    2,
  ),
);
console.log(`[ext] wrote ${OUT}/orders-zepto.json (${recorder.count()} responses seen)`);
await ctx.close();
