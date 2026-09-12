// Swiggy raw-extraction → split-utils orders.json mapping.
//
// API contract (verified 2026-09-09, www.swiggy.com mobile web,
// logged-in profile; see docs/playbook-swiggy.md):
// - Food: GET mapi/order/all?order_id=<cursor> — orders[] carry
//   order_items[] (name, string quantity, line-total `total`/`final_price`
//   in rupees) and every money field inline (item_total, order_tax,
//   convenience_fees, platform_fee_tax, order_delivery_charge,
//   restaurant_packing_charges, tipDetails.amount). order_total == paid.
//   Reconciliation incl. tip verified to the paisa.
// - Instamart (DASH): GET mapi/order/dash?count=10&from_time=<ms> lists
//   groups (names+quantities only, no prices) then
//   GET mapi/order/v2/dash/details?order_id=<id> gives items with
//   finalPrice (LINE total, post-discount) plus billLineItems display
//   rows ("Item Bill", "Delivery Fee", "Handling Fee", "Convenience
//   Fee", "Offer Discount " negative, "Delivery Partner Tip").
//
// Fee conventions shared with the other site modules:
// - fees: {delivery, packaging} on the order (dashboard adds on top).
// - Everything else split like an item via "[Label]" pseudo-items.
// - paid = Σ(items incl. pseudo) + fees.delivery + fees.packaging.

import { formatISTDate } from "./common.ts";

export { formatISTDate };

// ---------- raw shapes ----------

export interface SwiggyFoodItem {
  name: string;
  quantity: string; // STRING on this API
  total: string; // line total, rupees
  final_price?: string;
  base_price?: string;
  packing_charges?: string;
}

export interface SwiggyFoodOrder {
  order_id: string | number;
  restaurant_name: string;
  order_time: string; // "2026-09-09 03:21:14" IST, no timezone
  order_status: string;
  order_items: SwiggyFoodItem[];
  item_total: string | number;
  order_total: string | number;
  net_total?: string | number;
  order_tax?: string | number;
  total_tax?: string | number;
  platform_fee_tax?: string | number;
  convenience_fees?: string | number;
  convenience_fees_with_tax?: string | number;
  order_discount_effective?: string | number;
  order_delivery_charge?: string | number;
  restaurant_packing_charges?: string | number;
  coupon_discount_effective?: string | number;
  weather_fee_breakup?: {
    rainFee?: string | number;
    anchorRainFee?: string | number;
    rainFeeDiscount?: string | number;
    rainFeeGst?: string | number;
  };
  tipDetails?: { amount?: number | string };
}

export interface SwiggyDashItem {
  id: string;
  description: string;
  quantity: string; // STRING on this API
  totalBasePrice: number; // MRP, rupees
  finalPrice: number; // LINE total, post-discount, rupees
  removed?: boolean;
}

export interface SwiggyBillRow {
  title?: { title?: string; text?: string };
  amount?: { title?: string; text?: string };
}

export interface SwiggyDashDetail {
  data?: {
    orderId: string | number;
    totalBill: number;
    shipmentDetails?: Array<{ items?: SwiggyDashItem[] }>;
    billDetail?: { billLineItems?: SwiggyBillRow[] };
  };
}

export interface SwiggyDashGroup {
  order_id: string | number;
  created_at: number | string; // epoch ms (string on some payloads)
  order_data_v2?: {
    total?: { units?: number; nanos?: number };
  };
}

// ---------- schema order ----------

export interface SwiggySchemaOrder {
  id: string;
  platform: "swiggy";
  date: string;
  paid: number;
  items: Array<{
    name: string;
    price: number; // UNIT price in rupees
    quantity: number;
    estimated: boolean;
    source: string;
  }>;
  fees: { delivery: number; packaging: number };
}

const n = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
};

/** "2026-09-09 03:21:14" (IST, naive) → Date in UTC. */
export function parseFoodTime(raw: string): Date {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  return new Date(Date.UTC(y, mo - 1, d, h - 5, mi - 30, s)); // IST = UTC+5:30
}

// ---------- food mapper ----------

export function mapFoodOrder(raw: SwiggyFoodOrder): SwiggySchemaOrder {
  const items: SwiggySchemaOrder["items"] = [];
  for (const it of raw.order_items) {
    const line = n(it.total ?? it.final_price);
    const qty = Math.max(1, Math.round(n(it.quantity)));
    items.push({
      name: it.name,
      price: Math.round((line / qty) * 100) / 100,
      quantity: qty,
      estimated: false,
      source: "swiggy-api",
    });
  }

  const fees = { delivery: 0, packaging: 0 };
  fees.delivery += n(raw.order_delivery_charge);
  fees.packaging += n(raw.restaurant_packing_charges);
  const pseudo = (label: string, amount: number) => {
    if (Math.abs(amount) >= 0.005) {
      items.push({
        name: `[${label}]`,
        price: amount,
        quantity: 1,
        estimated: false,
        source: "swiggy-api",
      });
    }
  };
  // order_discount_effective is the FULL discount (coupon + trade
  // discounts stack: verified on 247673718168019 where coupon 124.99 +
  // trade 30 = order_discount_effective 154.99).
  pseudo("GST", n(raw.order_tax ?? raw.total_tax));
  pseudo(
    "Handling",
    n(raw.convenience_fees_with_tax) || n(raw.convenience_fees) + n(raw.platform_fee_tax),
  );
  // Rain/surge fee (weather_fee_breakup, absent unless rain_mode > 0);
  // its GST rides along. Verified on 246181745145919: rainFee 5 +
  // rainFeeGst 0.90 reconcile the bill exactly.
  const weather = raw.weather_fee_breakup;
  if (weather) {
    const rain = n(weather.rainFee);
    if (rain) pseudo("Rain fee", rain + n(weather.rainFeeGst));
  }
  const tip = n(raw.tipDetails?.amount);
  if (tip) pseudo("Tip", tip);
  const discount = n(raw.order_discount_effective);
  if (discount) pseudo("Discount", -discount);

  // Swiggy rounds the final bill to the whole rupee, so components sum
  // to within ₹0.50 of paid (verified across seven orders, worst 0.50
  // on 246842400117346). Absorb the residue as [Rounding], matching
  // the receipt convention.
  const sum = items.reduce((s, i) => s + i.price * i.quantity, 0) + fees.delivery + fees.packaging;
  const gap = Math.round((n(raw.order_total ?? raw.net_total) - sum) * 100) / 100;
  if (Math.abs(gap) >= 0.005 && Math.abs(gap) <= 0.5) pseudo("Rounding", gap);

  return {
    id: `swiggy-${String(raw.order_id)}`,
    platform: "swiggy",
    date: formatISTDate(parseFoodTime(raw.order_time).toISOString()),
    paid: n(raw.order_total ?? raw.net_total),
    items,
    fees,
  };
}

// ---------- instamart mapper ----------

export interface DashFee {
  label: string;
  amount: number; // rupees, signed
}

/** Parse "₹16.00" / "-₹16.00" → signed rupees. */
export function parseRupee(text: string | undefined): number {
  if (!text) return 0;
  const neg = text.trim().startsWith("-") || /-\s*₹/.test(text);
  const m = text.replace(/,/g, "").match(/([\d.]+)/);
  if (!m) return 0;
  return (neg ? -1 : 1) * parseFloat(m[1]);
}

/** Bill rows → fee list. "Item Bill" is Σ items (informational). */
export function extractDashFees(detail: SwiggyDashDetail): DashFee[] {
  const rows = detail.data?.billDetail?.billLineItems ?? [];
  const fees: DashFee[] = [];
  for (const r of rows) {
    const firstText = (o?: { title?: string; text?: string }) =>
      [o?.title, o?.text].find((v) => v && v.trim()) ?? "";
    const label = firstText(r.title).trim();
    if (!label || label === "Item Bill") continue;
    const amount = parseRupee(firstText(r.amount));
    if (Math.abs(amount) >= 0.005) fees.push({ label, amount });
  }
  return fees;
}

export function mapDashOrder(
  group: SwiggyDashGroup,
  detail: SwiggyDashDetail,
): SwiggySchemaOrder {
  const fees = { delivery: 0, packaging: 0 };
  const items: SwiggySchemaOrder["items"] = [];
  for (const ship of detail.data?.shipmentDetails ?? []) {
    for (const it of ship.items ?? []) {
      if (it.removed) continue;
      const qty = Math.max(1, Math.round(parseFloat(it.quantity) || 1));
      items.push({
        name: it.description,
        price: Math.round((it.finalPrice / qty) * 100) / 100,
        quantity: qty,
        estimated: false,
        source: "swiggy-api",
      });
    }
  }
  for (const f of extractDashFees(detail)) {
    if (/^delivery fee$/i.test(f.label)) fees.delivery += f.amount;
    else {
      // Handling / Convenience / Tip / Offer Discount: split like an
      // item, matching the Blinkit/Zepto "[Label]" convention. Labels
      // normalize "X Fee" -> "X".
      const label = f.label.replace(/\s+fee$/i, "").trim() || f.label;
      items.push({
        name: `[${label}]`,
        price: f.amount,
        quantity: 1,
        estimated: false,
        source: "swiggy-api",
      });
    }
  }
  const total = group.order_data_v2?.total;
  const paid = total ? (total.units ?? 0) + (total.nanos ?? 0) / 1e9 : n(detail.data?.totalBill);
  // Same rupee-level rounding as food: absorb sub-half-rupee residue.
  const sum = items.reduce((s, i) => s + i.price * i.quantity, 0) + fees.delivery + fees.packaging;
  const gap = Math.round((paid - sum) * 100) / 100;
  if (Math.abs(gap) >= 0.005 && Math.abs(gap) < 0.5) {
    items.push({
      name: "[Rounding]",
      price: gap,
      quantity: 1,
      estimated: false,
      source: "swiggy-api",
    });
  }
  return {
    id: `swiggy-${String(group.order_id)}`,
    platform: "swiggy",
    date: formatISTDate(new Date(Number(group.created_at)).toISOString()),
    paid,
    items,
    fees,
  };
}

/** Balance check: items + fees must equal paid. */
export function checkBalance(mapped: SwiggySchemaOrder): boolean {
  const itemsSum = mapped.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const feesSum = mapped.fees.delivery + mapped.fees.packaging;
  return Math.abs(itemsSum + feesSum - mapped.paid) < 0.01;
}
