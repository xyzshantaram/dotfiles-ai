// Zepto raw-extraction → split-utils orders.json mapping.
//
// API contract (verified 2026-09-09, www.zepto.com, logged-in profile):
// - List: GET bff-gateway.zepto.com/api/v2/order/?page_number=N
//   (cookies only; CORS-allowed from the site origin) until endOfList.
//   Per order: id, code, grandTotalAmount (PAISE), placedTime (ISO UTC),
//   status.
// - Detail: POST bff-gateway.zepto.com/pfs-postorder/api/v1/get-page/
//   ORDER_DETAILS with JSON {orderId, page_size: 8, isArchived: false,
//   enforce_platform_type: "DESKTOP"} (+last_widget_id/page_number if the
//   response paginates).
//   Products: pageLayout.widgets[].data.items[0].orderProductsV2
//   .sectionData[].orderProducts[] with storeProduct.product.name,
//   storeProduct.productVariant.formattedPacksize, quantityOrdered, and
//   paise price fields unitMrp / unitSellingPrice / unitFinalSellingPrice /
//   totalFinalSellingPrice (line total).
// - Fees (delivery/handling/GST/restaurant charges) are ALREADY baked into
//   product line prices: Σ totalFinalSellingPrice == grandTotalAmount,
//   verified to the paisa. So fees stay {0,0} and no pseudo-items are
//   added — matching the existing "Zepto fees baked into item prices"
//   convention.

import { formatISTDate, type Order, round2 } from "./common.ts";

export interface ZeptoRawProduct {
  id: string;
  quantityOrdered: number;
  quantityFulfilled?: number;
  unitMrp: number;
  unitSellingPrice: number;
  unitFinalSellingPrice: number;
  totalFinalSellingPrice: number; // line total, paise
  storeProduct: {
    product: { name: string; brand?: string };
    productVariant: { formattedPacksize?: string };
  };
}

export interface ZeptoRawOrder {
  id: string;
  code: string;
  status: string;
  grandTotalAmount: number; // paise
  placedTime: string; // ISO UTC
  products: ZeptoRawProduct[];
  billFees?: ZeptoBillFee[];
}

/** Pick ALL products out of a captured ORDER_DETAILS response.
 * Multi-shipment orders render one widget item per shipment — gather
 * every orderProductsV2 list, not just the first. */
export function extractProducts(detail: {
  pageLayout?: { widgets?: Array<{ data?: { items?: unknown[] } }> };
}): ZeptoRawProduct[] {
  const widgets = detail.pageLayout?.widgets ?? [];
  const all: ZeptoRawProduct[] = [];
  for (const w of widgets) {
    const items = (w.data?.items ?? []) as Array<{
      orderProductsV2?: {
        sectionData?: Array<{ orderProducts?: ZeptoRawProduct[] }>;
      };
    }>;
    for (const item of items) {
      for (const s of item.orderProductsV2?.sectionData ?? []) {
        all.push(...(s.orderProducts ?? []));
      }
    }
  }
  return all;
}

export interface ZeptoBillFee {
  label: string;
  amount: number; // rupees
}

/**
 * Fee rows out of a BILL_INFO widget. Takes the NON-strikethrough right
 * value of each feesAndGst row; FREE means 0. WARNING: some fees (e.g.
 * Cafe GST) may already be baked into product line prices — always
 * reconcile against paid before adding.
 */
export function extractFees(detail: {
  pageLayout?: { widgets?: Array<{ data?: { items?: unknown[] } }> };
}): ZeptoBillFee[] {
  const widgets = detail.pageLayout?.widgets ?? [];
  const fees: ZeptoBillFee[] = [];
  const rs = (n: number) => n / 100;
  for (const w of widgets) {
    const items = (w.data?.items ?? []) as Array<Record<string, unknown>>;
    for (const item of items) {
      if (!Array.isArray(item.rightStructureInfos)) continue;
      if (item.feeSection !== "feesAndGst") continue;
      const label = (item.leftStructureInfos as Array<{ text?: string }>)[0]?.text?.trim();
      if (!label) continue;
      const rights = item.rightStructureInfos as Array<{
        text?: string;
        variant?: string;
      }>;
      const live = rights.filter((r) => r.variant !== "strikethrough3" && r.text);
      const text = live[live.length - 1]?.text ?? "0";
      const m = text.match(/₹\s*([\d.]+)/);
      const amount = m ? parseFloat(m[1]) : 0; // FREE -> 0
      if (amount > 0) fees.push({ label, amount: rs(Math.round(amount * 100)) });
    }
  }
  return fees;
}

export function mapOrder(
  raw: ZeptoRawOrder,
  billFees: ZeptoBillFee[] = [],
): Order {
  const items = raw.products.map((p) => {
    const pack = p.storeProduct.productVariant.formattedPacksize?.trim();
    const name = pack ? `${p.storeProduct.product.name} (${pack})` : p.storeProduct.product.name;
    const qty = p.quantityOrdered || 1;
    // Line total carries the fees; unit price = line / qty.
    return {
      name,
      price: round2(p.totalFinalSellingPrice / 100 / qty),
      quantity: qty,
      estimated: false,
      source: "zepto-api",
    };
  });

  // Reconcile: only fees NOT already baked into product lines may be added.
  const productsSum = raw.products.reduce((s, p) => s + p.totalFinalSellingPrice, 0) / 100;
  const diff = round2(raw.grandTotalAmount / 100 - productsSum);
  if (Math.abs(diff) >= 0.005) {
    const feesSum = round2(billFees.reduce((s, f) => s + f.amount, 0));
    if (Math.abs(feesSum - diff) < 0.005) {
      for (const f of billFees) {
        items.push({
          name: `[${f.label}]`,
          price: f.amount,
          quantity: 1,
          estimated: false,
          source: "zepto-api",
        });
      }
    } else {
      // Labeled fees do not reconcile (some already baked in): catch-all.
      items.push({
        name: "[Fees]",
        price: diff,
        quantity: 1,
        estimated: false,
        source: "zepto-api",
      });
    }
  }

  return {
    id: `zepto-${raw.code}`,
    platform: "zepto",
    date: formatISTDate(raw.placedTime),
    paid: raw.grandTotalAmount / 100,
    items,
    fees: { delivery: 0, packaging: 0 },
  };
}

/** Balance check: items must sum to paid (fees are baked in). */
export function checkBalance(mapped: Order): boolean {
  const itemsSum = mapped.items.reduce((s, i) => s + i.price * i.quantity, 0);
  return Math.abs(itemsSum - mapped.paid) < 0.01;
}
