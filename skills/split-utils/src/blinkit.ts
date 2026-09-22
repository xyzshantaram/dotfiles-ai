// Blinkit raw-extraction → split-utils orders.json mapping.
// Input shape: out/blinkit-orders-raw.json rows from the network capture.
//
// Schema conventions (mirrors the receipt-built orders.json):
// - items[]: {name, price: UNIT price, quantity} plus bracketed
//   pseudo-items for fees that must be split like items ("[Handling]").
// - fees: {delivery, packaging} — added by the dashboard on top of items.
// - paid = Σ(items incl. pseudo) + fees.delivery + fees.packaging.
//
// Key facts (verified against live data 2026-09-09):
// - subtitle3 carries the LINE price (qty included), e.g. "~~₹192~~ ₹150"
//   for "1 pc x 2": 150 is for both units.
// - Bill rows: delivery goes to fees.delivery; handling / convenience /
//   other charges become bracketed pseudo-items; MRP, Product discount and
//   totals rows are informational (items carry post-discount prices).

export interface BlinkitRawItem {
  name: string;
  qtyText: string;
  unitPrice: number; // NOTE: this is the LINE price despite the field name
  mrp?: number;
}

export interface BlinkitRawOrder {
  orderId: string;
  cartId: string;
  amount: number;
  dateText: string;
  date: string;
  items: BlinkitRawItem[];
  fees: Array<{ label: string; amount: number }>;
  itemTotal: number;
  billTotal: number;
}

/** "700 g x 1" / "3 x 200 ml x 1" / "1 pc x 2" -> pack text + qty. */
export function parseQtyText(qtyText: string): { pack: string; qty: number } {
  const m = qtyText.trim().match(/^(.*?)\s*x\s+(\d+)$/);
  if (!m) return { pack: qtyText.trim(), qty: 1 };
  return { pack: m[1].trim(), qty: parseInt(m[2], 10) };
}

/** Bill-row labels that are informational, never fees. */
const SKIP_LABELS = new Set([
  "MRP",
  "Product discount",
  "Item total",
  "Bill total",
  "To pay",
]);

export function mapOrder(raw: BlinkitRawOrder): Order {
  const items: OrderItem[] = raw.items.map((it) => {
    const { pack, qty } = parseQtyText(it.qtyText);
    const name = pack && pack !== "1" ? `${it.name} (${pack})` : it.name;
    return {
      name,
      price: round2(it.unitPrice / qty),
      quantity: qty,
      estimated: false,
      source: "blinkit-api",
    };
  });

  const fees = { delivery: 0, packaging: 0 };
  for (const f of raw.fees) {
    if (SKIP_LABELS.has(f.label)) continue;
    if (f.label === "Delivery charges") {
      fees.delivery += f.amount;
    } else {
      // Handling, Convenience, surge, tip ...: split like an item.
      // Normalize "X charge" -> "X" to match the receipt convention.
      const label = f.label.replace(/\s+charge$/i, "");
      items.push({
        name: `[${label}]`,
        price: f.amount,
        quantity: 1,
        estimated: false,
        source: "blinkit-api",
      });
    }
  }

  return {
    id: `blinkit-${raw.orderId}`,
    platform: "blinkit",
    date: formatISTDate(raw.date),
    paid: raw.billTotal,
    items,
    fees,
  };
}

import { checkBalance, formatISTDate, type Order, type OrderItem, round2 } from "./common.ts";

export { checkBalance };
