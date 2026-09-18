// Every site mapper must stamp each item with its source and with
// whether the price was estimated.
//
// This used to be guaranteed by the type system. Each site module
// declared its own output type, and each one required both fields. The
// Z9 audit found those three types were near copies of the canonical
// Order, so they went. The canonical OrderItem marks both fields
// optional, which means nothing forces a mapper to set them now, and no
// test drove a mapper at all. These tests hold that line instead.
//
// The fields matter downstream. A missing source hides which site a
// line came from when a bill looks wrong, and a missing estimated flag
// lets a guessed price read as a known one.

import { assertEquals } from "@std/assert";
import { mapOrder as mapBlinkit } from "@app/src/blinkit.ts";
import { mapFoodOrder } from "@app/src/swiggy.ts";
import { mapOrder as mapZepto } from "@app/src/zepto.ts";
import type { Order } from "@app/src/common.ts";

// Assert the shared rules for one mapped order.
function assertStamped(mapped: Order, platform: string): void {
  assertEquals(mapped.platform, platform, "names its platform");
  assertEquals(mapped.items.length > 0, true, "maps at least one item");
  for (const item of mapped.items) {
    assertEquals(typeof item.source, "string", "every item carries a source");
    assertEquals(item.source !== "", true, "the source is not empty");
    assertEquals(typeof item.estimated, "boolean", "every item says if it is estimated");
  }
}

Deno.test("the blinkit mapper stamps every item", () => {
  const mapped = mapBlinkit({
    orderId: "b1",
    cartId: "c1",
    amount: 100,
    dateText: "12 Sep 2026",
    date: "2026-09-12T10:00:00Z",
    items: [{ name: "Milk", qtyText: "1 L x 2", unitPrice: 80 }],
    fees: [{ label: "Delivery charges", amount: 20 }],
    itemTotal: 80,
    billTotal: 100,
  });
  assertStamped(mapped, "blinkit");
});

Deno.test("the swiggy food mapper stamps every item", () => {
  const mapped = mapFoodOrder({
    order_id: "s1",
    restaurant_name: "Test Kitchen",
    order_time: "2026-09-12 15:04:05",
    order_status: "delivered",
    order_items: [{ name: "Biryani", quantity: "2", total: "300" }],
    item_total: "300",
    order_total: "340",
  });
  // The mapper writes "swiggy" for both the food and the Instamart
  // surface. docs/schema.md and tests/fixtures/orders.json both name
  // "swiggy_food" and "swiggy_instamart", and no code produces either.
  // This asserts what the code really does. If someone makes the two
  // surfaces distinct, this test fails and the doc must move with it.
  assertStamped(mapped, "swiggy");
});

Deno.test("the zepto mapper stamps every item", () => {
  const mapped = mapZepto({
    id: "z1",
    code: "Z-1",
    status: "delivered",
    grandTotalAmount: 20000,
    placedTime: "2026-09-12T10:00:00Z",
    products: [{
      id: "p1",
      quantityOrdered: 2,
      unitMrp: 12000,
      unitSellingPrice: 10000,
      unitFinalSellingPrice: 10000,
      totalFinalSellingPrice: 20000,
      storeProduct: {
        product: { name: "Bread" },
        productVariant: { formattedPacksize: "400 g" },
      },
    }],
  });
  assertStamped(mapped, "zepto");
});
