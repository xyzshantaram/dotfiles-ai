// Render frozen fixtures from an orders file. Write one text block per order.
// Run with deno run from the repo root. Print usage and exit when args miss.
import {
  buildItemizedComment,
  formatTitle,
  groupOrders,
  inferPayer,
  orderFingerprint,
  summariseOrder,
} from "../src/render.ts";

// Read the orders file and write the text blocks to the out dir.
const [inputPath, outdirArg] = Deno.args;
if (!inputPath || !outdirArg) {
  console.error(
    "usage: deno run scripts/render-fixtures.ts <orders.json> <outdir>",
  );
  Deno.exit(2);
}
const data = JSON.parse(await Deno.readTextFile(inputPath));
const people: string[] = data.people;
const orders = groupOrders(data.splits);
const settlements: { to: string }[] = data.settlements ?? [];

const outdir = outdirArg;
await Deno.mkdir(outdir, { recursive: true });
const fingerprints: string[] = [];
for (let i = 0; i < orders.length; i++) {
  const payer = inferPayer(orders[i], settlements);
  await Deno.writeTextFile(
    `${outdir}/order-${String(i).padStart(2, "0")}-table.txt`,
    summariseOrder(orders[i], people, payer, i, orders.length) + "\n",
  );
  await Deno.writeTextFile(
    `${outdir}/order-${String(i).padStart(2, "0")}-comment.txt`,
    buildItemizedComment(orders[i], people) + "\n",
  );
  await Deno.writeTextFile(
    `${outdir}/order-${String(i).padStart(2, "0")}-title.txt`,
    formatTitle(orders[i]) + "\n",
  );
  fingerprints.push(
    `${String(i).padStart(2, "0")} ${orderFingerprint(orders[i])} payer=${payer} n_items=${
      orders[i].length
    }`,
  );
}
await Deno.writeTextFile(`${outdir}/fingerprints.txt`, fingerprints.join("\n") + "\n");
console.log(`wrote ${orders.length * 3 + 1} files to ${outdirArg}`);
