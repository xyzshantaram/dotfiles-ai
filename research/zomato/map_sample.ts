// Map a history page to the split-utils orders.json schema.
// History cards carry names and quantities but no unit prices.
// Unit prices and fee lines must come from crystal_v2 detail data.
// Until detail keys are pinned, each order balances with one bracketed
// pseudo-item, which the schema allows. Run:
// deno run --allow-net --allow-read map_sample.ts
import { parseHistoryPage } from "./zomato_client.ts";

const raw = JSON.parse(await Deno.readTextFile("./sample_history_page.json"));
const { orders } = parseHistoryPage(raw);

// "30 Apr 2024 at 9:11PM" -> "2024-04-30 9:11 PM" IST (site uses IST wall time)
const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};
function toSchemaDate(rawDate: string): string {
  const m = rawDate.match(/(\d+) (\w+) (\d+) at (\d+):(\d+)(AM|PM)/);
  if (!m) return rawDate;
  return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")} ${m[4]}:${m[5]} ${m[6]}`;
}

const out = orders.map((o) => {
  const items = o.items.map((it) => ({
    name: it.name,
    price: 0,
    quantity: it.quantity,
    estimated: true,
    source: "zomato-api",
  }));
  // Placeholder keeps items summing to paid until detail data lands.
  items.push({
    name: "[Detail capture pending]",
    price: o.paid,
    quantity: 1,
    estimated: true,
    source: "zomato-api",
  });
  return {
    id: `zomato-${o.orderId}`,
    platform: "zomato",
    date: toSchemaDate(o.date),
    paid: o.paid,
    items,
    fees: { delivery: 0, packaging: 0 },
  };
});

console.log(JSON.stringify(out, null, 2));
const sum = out[0].items.reduce((a: number, i: { price: number }) => a + i.price, 0);
if (Math.abs(sum - out[0].paid) > 0.005) throw new Error("items do not sum to paid");
console.log("CHECK: items sum to paid =", sum === out[0].paid);
