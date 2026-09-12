// Swiggy prototype, phase 6: capture-free extraction.
// The mapi GETs need session cookies only, so the logged-in page itself
// fetches every endpoint (same-origin, WAF-approved) and we map + balance
// in one pass. No response harvesting from disk.

/// <reference lib="dom" />

import { openSession } from "../src/browser.ts";
import {
  checkBalance,
  mapDashOrder,
  mapFoodOrder,
  type SwiggyDashDetail,
  type SwiggyDashGroup,
  type SwiggyFoodOrder,
} from "../src/swiggy.ts";

const DAYS = 30;
const OUT = "/home/sid/ai-scratch/split-utils/out";
await Deno.mkdir(OUT, { recursive: true });

const session = await openSession({
  profileDir: "/tmp/dsh/swiggy-profile2",
  executablePath: "/usr/bin/chromium-browser", // real build; CfT gets WAF-flagged
  mobile: true, // phone UA without touch/mobile viewport scores as bot
  viewport: { width: 412, height: 915 },
  userAgent:
    "Mozilla/5.0 (Linux; Android 17; Pixel 9a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Mobile Safari/537.36",
  geolocation: { latitude: 12.9341967, longitude: 77.7241821 },
});
const { page, ctx } = session;
await page.goto("https://www.swiggy.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(4000);

/** Same-origin fetch with page credentials; retries once on 403 (WAF). */
const j = async (path: string): Promise<unknown> => {
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate(
      async (p: string) => {
        const resp = await fetch(p, { headers: { accept: "application/json" } });
        return { status: resp.status, body: await resp.json().catch(() => null) };
      },
      path,
    );
    if (r.status === 200 && r.body) return r.body;
    console.log(`[ext] ${path.split("?")[0]} -> ${r.status}, retry ${i + 1}`);
    await page.waitForTimeout(3000);
  }
  throw new Error(`mapi fetch failed: ${path}`);
};

// ---- food: page by order_id cursor ----
const cutoff = Date.now() - DAYS * 86_400_000;
const foodRaw: SwiggyFoodOrder[] = [];
let cursor = "";
for (let i = 0; i < 20; i++) {
  const body = await j(`/mapi/order/all?order_id=${cursor}`) as {
    data?: { orders?: SwiggyFoodOrder[] };
  };
  const orders: SwiggyFoodOrder[] = body?.data?.orders ?? [];
  if (!orders.length) break;
  let older = false;
  for (const o of orders) {
    const t = Date.parse(
      (o.order_time ?? "").replace(" ", "T") + "+05:30",
    );
    if (t < cutoff) {
      older = true;
      continue;
    }
    foodRaw.push(o);
  }
  console.log(`[ext] food page ${i + 1}: ${orders.length} orders`);
  const last = orders[orders.length - 1];
  cursor = String(last.order_id);
  if (older) break;
}
console.log(`[ext] food: ${foodRaw.length} orders in ${DAYS}d`);

// ---- instamart: walk from_time, then per-order detail ----
const dashGroups: SwiggyDashGroup[] = [];
let fromTime = Date.now();
for (let i = 0; i < 20; i++) {
  const body = await j(`/mapi/order/dash?count=10&from_time=${fromTime}&order_type=DASH`) as {
    data?: { orders?: SwiggyDashGroup[] };
  };
  const groups: SwiggyDashGroup[] = body?.data?.orders ?? [];
  if (!groups.length) break;
  let older = false;
  for (const g of groups) {
    if (Number(g.created_at) < cutoff) {
      older = true;
      continue;
    }
    dashGroups.push(g);
  }
  console.log(`[ext] dash page ${i + 1}: ${groups.length} groups`);
  fromTime = Number(groups[groups.length - 1].created_at);
  if (older) break;
}
console.log(`[ext] dash: ${dashGroups.length} groups in ${DAYS}d`);

const dashRaw: Array<{ group: SwiggyDashGroup; detail: SwiggyDashDetail }> = [];
for (const g of dashGroups) {
  const detail = await j(`/mapi/order/v2/dash/details?order_id=${g.order_id}`) as SwiggyDashDetail;
  dashRaw.push({ group: g, detail });
  const nItems = detail?.data?.shipmentDetails?.[0]?.items?.length ?? 0;
  console.log(`[ext] detail ${g.order_id}: ${nItems} items, total ${detail?.data?.totalBill}`);
}

// ---- map + balance ----
const mapped = [
  ...foodRaw.map((o) => mapFoodOrder(o)),
  ...dashRaw.map(({ group, detail }) => mapDashOrder(group, detail)),
];
let allOk = true;
for (const m of mapped) {
  if (!checkBalance(m)) {
    allOk = false;
    const sum = m.items.reduce((s, x) => s + x.price * x.quantity, 0) + m.fees.delivery +
      m.fees.packaging;
    console.log(`MISMATCH ${m.id}: items+fees=${sum.toFixed(2)} paid=${m.paid}`);
  }
}
console.log(allOk ? `ALL ${mapped.length} BALANCE` : "balance failures above");

await Deno.writeTextFile(
  `${OUT}/orders-swiggy.json`,
  JSON.stringify(
    { orders: mapped, meta: { source: "swiggy-api", generated_at: new Date().toISOString() } },
    null,
    2,
  ),
);
console.log(`[ext] wrote ${OUT}/orders-swiggy.json`);
await ctx.close();
