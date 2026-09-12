// Blinkit prototype, phase 4: full headless extraction to orders.json.
// Uses the logged-in persistent profile. Paginates order_history via
// cursor, fetches each order_details, maps to the split-utils schema.

import { chromium } from "playwright";

const DAYS = 30;
const OUT = "/home/sid/ai-scratch/split-utils/out";
await Deno.mkdir(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext("/tmp/dsh/blinkit-profile", {
  headless: false, // keep headful for now: visibility for the first full run
  viewport: { width: 1280, height: 900 },
  executablePath: "/home/sid/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
});
const page = ctx.pages()[0] ?? await ctx.newPage();

// ---- helpers ----
function parseRs(text: string): number | null {
  const m = text.replace(/,/g, "").match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function parseDate(text: string, year = 2026): Date | null {
  // "08 Sep, 9:38 am" (list) — no year; assume current year.
  const m = text.trim().match(/^(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mi = months.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  if (mi < 0) return null;
  let hour = parseInt(m[3], 10) % 12;
  if (m[5].toLowerCase() === "pm") hour += 12;
  return new Date(year, mi, parseInt(m[1], 10), hour, parseInt(m[4], 10));
}

// One Blinkit layout widget: order header, item line, or bill row.
interface BlinkitSnippet {
  widget_type: string;
  data: {
    items: BlinkitSnippet[];
    title: { text: string };
    subtitle: { text: string };
    subtitle1?: { text?: string };
    subtitle3?: { text?: string };
    left_header: { text: string };
    right_header: { text: string };
    left_underlined_subtitle: { text: string };
  };
  tracking: { common_attributes: { order_id: string; deeplink?: string } };
}

// One Blinkit layout response: order history page or order detail.
interface BlinkitLayout {
  response: {
    snippets: BlinkitSnippet[];
    pagination?: { cursor?: string };
  };
}

// One extracted line item with the paid unit price.
interface BlinkitLineItem {
  name: string;
  qtyText: string;
  unitPrice: number;
  mrp?: number;
}

async function apiJson(url: string): Promise<unknown> {
  const res = await page.evaluate(async (u) => {
    // Replicate the site's own XHR headers (observed via request probe):
    // access_token + auth_key + device_id from localStorage.
    const auth = JSON.parse(localStorage.getItem("auth") ?? "{}");
    const r = await fetch(u, {
      method: "POST", // the /v1/layout family is POSTed, bodyless
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "app_client": "consumer_web",
        "platform": "desktop_web",
        "access_token": auth.accessToken ?? "",
        "auth_key": localStorage.getItem("authKey") ?? "",
        "device_id": localStorage.getItem("deviceId") ?? "",
      },
    });
    return { status: r.status, body: await r.text() };
  }, url);
  if (res.status !== 200) throw new Error(`${url} -> ${res.status}`);
  return JSON.parse(res.body);
}

// ---- list all orders (cursor pagination) ----
await page.goto("https://blinkit.com/account/orders", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

const orders: Array<Record<string, unknown>> = [];
const cutoff = Date.now() - DAYS * 86_400_000;
let cursor: string | null = null;
let pageIndex = 0;

outer:
while (true) {
  const url = cursor === null
    ? "https://blinkit.com/v1/layout/order_history"
    : `https://blinkit.com/v1/layout/order_history?offset=0&limit=10&cursor=${cursor}&get_failed_carts_history=false&last_snippet_type=order_history_container_vr&last_widget_type=order+history+widget&page_index=${pageIndex}&total_entities_processed=${
      pageIndex + 1
    }`;
  const data = await apiJson(url) as BlinkitLayout;
  const snips = data.response.snippets.filter((s: BlinkitSnippet) =>
    s.widget_type === "order_history_container_vr"
  );
  for (const s of snips) {
    const header = s.data.items.find((i: BlinkitSnippet) =>
      i.widget_type === "image_text_vr_type_header"
    );
    if (!header) continue;
    const attrs = header.tracking.common_attributes;
    const orderId = attrs.order_id;
    const deeplink = attrs.deeplink ?? "";
    const cartId = deeplink.match(/cart_id=(\d+)/)?.[1] ?? "";
    const amount = parseRs(header.data.left_underlined_subtitle.text);
    const dateText = header.data.subtitle.text;
    const date = parseDate(dateText);
    if (date && date.getTime() < cutoff) {
      console.log(`[ext] ${orderId}: ${dateText} older than ${DAYS}d — stop`);
      break outer;
    }
    orders.push({ orderId, cartId, amount, dateText, date: date?.toISOString() });
    console.log(`[ext] ${orderId} ${dateText} ₹${amount}`);
  }
  const pag = data.response.pagination;
  cursor = pag?.cursor ?? null;
  if (!cursor) break;
  pageIndex += 1;
}

console.log(`[ext] ${orders.length} orders within ${DAYS} days`);

// ---- detail per order ----
for (const o of orders) {
  const d = await apiJson(
    `https://blinkit.com/v1/layout/order_details/${o.orderId}?cart_id=${o.cartId}`,
  ) as BlinkitLayout;
  const snips = d.response.snippets;
  const items: BlinkitLineItem[] = [];
  const fees: Array<{ label: string; amount: number }> = [];
  let itemTotal = 0, billTotal = 0;
  for (const s of snips) {
    if (s.widget_type === "z_v3_image_text_snippet_type_30") {
      const t = s.data.subtitle3?.text ?? "";
      // "~~<...|{grey-600|₹215}>~~ ₹205" — last price is the paid unit price
      const prices = [...t.matchAll(/₹\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
      const qty = s.data.subtitle1?.text ?? "";
      if (prices.length) {
        items.push({
          name: s.data.title.text,
          qtyText: qty,
          unitPrice: prices[prices.length - 1],
          mrp: prices.length > 1 ? prices[0] : undefined,
        });
      }
    } else if (s.widget_type === "cart_bill_item") {
      const label = s.data.left_header.text;
      const val = s.data.right_header.text;
      const amt = parseRs(val);
      if (label === "Item total") itemTotal = amt ?? 0;
      else if (label === "Bill total") billTotal = amt ?? 0;
      else if (amt !== null && !/FREE|discount/i.test(val)) fees.push({ label, amount: amt });
    }
  }
  o.items = items;
  o.fees = fees;
  o.itemTotal = itemTotal;
  o.billTotal = billTotal;
  console.log(
    `[ext] ${o.orderId}: ${items.length} items, itemTotal=${itemTotal}, billTotal=${billTotal}`,
  );
}

await Deno.writeTextFile(`${OUT}/blinkit-orders-raw.json`, JSON.stringify(orders, null, 2));
console.log(`[ext] wrote ${OUT}/blinkit-orders-raw.json`);
await ctx.close();
