// TS port of the push formatting surface. Byte-compatible with the Python
// ground truth (tests/run.sh diffs against tests/expected/).
//
// CLI: deno run --allow-read --allow-write scripts/render-fixtures.ts <orders.json> <outdir>

import {
  compact,
  fmtRs,
  isFeeItem,
  itemSummary,
  type OutputDoc,
  parseDate,
  type SplitEntry,
} from "./common.ts";

type Order = SplitEntry[];

export function groupOrders(splits: SplitEntry[]): Order[] {
  if (splits.length === 0) return [];
  const key = (item: SplitEntry): [string, string] => {
    const oid = item.order_id;
    if (oid) return [item.platform, `#${oid}`];
    return [item.platform, item.date];
  };
  const orders: Order[] = [];
  let current: Order = [splits[0]];
  for (const item of splits.slice(1)) {
    const [ap, ak] = key(item);
    const [bp, bk] = key(current[current.length - 1]);
    if (ap === bp && ak === bk) {
      current.push(item);
    } else {
      orders.push(current);
      current = [item];
    }
  }
  orders.push(current);
  return orders;
}

export function inferPayer(order: Order, settlements: { to: string }[]): string {
  if (settlements.length > 0) return settlements[0].to;
  return Object.keys(order[0].assignments)[0];
}

export function orderFingerprint(order: Order): string {
  const platform = order[0].platform;
  const date = order[0].date;
  const oid = order[0].order_id ?? "";
  const total = fmtRs(order.reduce((s, i) => s + i.price, 0));
  return `${platform}|${oid}|${date}|${total}`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function ljust(s: string, n: number): string {
  return pad(s.length > n ? s.slice(0, n) : s, n);
}

function rjust(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function titleCase(platform: string): string {
  // Mimics Python str.title(): capitalize letters that follow non-letters.
  return platform.replace(
    /(^|[^A-Za-z])([a-z])/g,
    (_m, p1: string, p2: string) => p1 + p2.toUpperCase(),
  );
}

function titleCaseSpaced(platform: string): string {
  // Python format_title: underscores become spaces, then .title().
  return titleCase(platform.replace(/_/g, " "));
}

export function summariseOrder(
  order: Order,
  people: string[],
  payer: string,
  idx: number,
  totalOrders: number,
  cur: string = "₹",
): string {
  const total = order.reduce((s, i) => s + i.price, 0);
  const nameW = Math.min(38, Math.max(...[4, ...order.map((i) => i.item.length)])) + 2;
  const personWs = new Map(people.map((p) => [p, Math.max(9, p.length + 2)]));
  const totalW = 11;
  const width = nameW + [...personWs.values()].reduce((a, b) => a + b, 0) + totalW;
  const sep = "-".repeat(width);

  const lines: string[] = [];
  lines.push("=".repeat(width));
  lines.push(
    `Order ${idx + 1}/${totalOrders}: ${titleCase(order[0].platform)} ` +
      `— ${order[0].date} — total ${cur}${fmtRs(total)} — payer ${payer}`,
  );
  lines.push("=".repeat(width));

  let header = ljust("Item", nameW);
  for (const p of people) {
    header += rjust(p.slice(0, personWs.get(p)! - 1), personWs.get(p)!);
  }
  header += rjust("Total", totalW);
  lines.push(header);
  lines.push(sep);

  const personOwed = new Map(people.map((p) => [p, 0]));
  for (const item of order) {
    let row = ljust(item.item.slice(0, nameW - 2), nameW);
    for (const p of people) {
      const amt = item.assignments[p];
      if (amt) {
        personOwed.set(p, personOwed.get(p)! + amt);
        row += rjust(fmtRs(amt), personWs.get(p)!);
      } else {
        row += rjust("-", personWs.get(p)!);
      }
    }
    row += rjust(fmtRs(item.price), totalW);
    lines.push(row);
  }

  lines.push(sep);
  let totalRow = ljust("TOTAL", nameW);
  for (const p of people) {
    totalRow += rjust(fmtRs(personOwed.get(p)!), personWs.get(p)!);
  }
  totalRow += rjust(fmtRs(total), totalW);
  lines.push(totalRow);
  lines.push("=".repeat(width));
  return lines.join("\n");
}

// Generic tree: root title plus one row per string. The last row takes
// the corner arm. No markers, no wrapping: callers format each row.
// This is the reusable core every wizard screen builds on.
export function renderTree(root: string, rows: string[]): string {
  const out: string[] = [root];
  rows.forEach((row, i) => {
    out.push((i === rows.length - 1 ? "└─" : "├─") + " " + row);
  });
  return out.join("\n");
}

// One row of the live split tree. Done and skipped rows sit above the
// current line in position order. Lines after the current one collapse
// into a single count through the todoAfter argument.
export interface OrderTreeRow {
  name: string;
  price: number;
  isFee: boolean;
  estimated: boolean;
  state: "done" | "skipped" | "current";
  people?: string[];
}

// Render one order as a tree: root title, one row per decided line, the
// current line marked, then a collapsed count of what follows.
export function renderOrderTree(
  root: string,
  rows: OrderTreeRow[],
  todoAfter: number,
  cur: string,
): string {
  const lines = rows.map((r) => {
    const mark = r.state === "done" ? "✓" : r.state === "skipped" ? "⊘" : "▸";
    const quote = r.isFee ? r.name : "\u201c" + r.name + "\u201d";
    let text = mark + " " + quote + " — " + cur + fmtRs(r.price);
    if (r.state === "done" && r.people) text += " → " + r.people.join(", ");
    if (r.state === "skipped") text += " · skipped";
    const flags = r.isFee ? "fee, split evenly" : r.estimated ? "estimated" : "";
    if (flags !== "" && r.state !== "skipped") text += " · " + flags;
    return text;
  });
  if (todoAfter > 0) {
    lines.push(
      "○ " + todoAfter + (todoAfter === 1 ? " more line" : " more lines") + " after this one",
    );
  }
  return renderTree(root, lines);
}

function formatWhen(dateText: string): string | null {
  const dt = parseDate(dateText);
  if (dt === null) return null;
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const h24 = dt.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${mm}-${dd} ${h12}:${String(dt.getMinutes()).padStart(2, "0")} ${ampm}`;
}

export function formatTitle(order: Order, cur: string = "₹"): string {
  const platform = titleCaseSpaced(order[0].platform);
  const summary = itemSummary(order.map((entry) => ({ name: entry.item })));
  if (summary !== undefined) return `${summary} [${platform}]`;
  // Sum the order total the same way the title line does.
  const total = order.reduce((s, i) => s + i.price, 0);
  const when = formatWhen(order[0].date);
  // Fall back to merchant plus total when the date misses.
  if (when === null) return `${platform} — ${cur}${fmtRs(total)}`;
  return `${platform} order ${when}`;
}

function initialsFor(people: string[]): Map<string, string> {
  const initials = new Map<string, string>();
  const used = new Set<string>();
  for (const p of people) {
    let letter = p.trim()[0]?.toUpperCase() ?? "?";
    while (used.has(letter) && letter.length < p.length) {
      letter = p.trim().slice(0, letter.length + 1);
      letter = letter.charAt(0).toUpperCase() + letter.slice(1).toLowerCase();
    }
    used.add(letter);
    initials.set(p, letter);
  }
  return initials;
}

export function buildItemizedComment(order: Order, people: string[]): string {
  const initials = initialsFor(people);
  const platform = titleCaseSpaced(order[0].platform);
  const when = formatWhen(order[0].date) ?? order[0].date;
  const shares = (assignments: Record<string, number>): string =>
    people.filter((p) => assignments[p]).map((p) => `${initials.get(p)}:${compact(assignments[p])}`)
      .join(" ");

  const lines: string[] = [
    `${platform} — ${when}`,
    people.map((p) => `${initials.get(p)}=${p}`).join(" "),
  ];

  let feeTotal = 0;
  const feeAssignments: Record<string, number> = {};
  for (const item of order) {
    if (isFeeItem(item.item)) {
      feeTotal += item.price;
      for (const [name, amt] of Object.entries(item.assignments)) {
        feeAssignments[name] = (feeAssignments[name] ?? 0) + amt;
      }
      continue;
    }
    const shareStr = shares(item.assignments) || "unassigned";
    lines.push(`${item.item} (${compact(item.price)}) - ${shareStr}`);
  }

  if (feeTotal > 0) {
    lines.push(`Fees (${compact(feeTotal)}) - ${shares(feeAssignments)}`);
  }

  const personOwed: Record<string, number> = {};
  for (const item of order) {
    for (const [name, amt] of Object.entries(item.assignments)) {
      personOwed[name] = (personOwed[name] ?? 0) + amt;
    }
  }
  lines.push(`Total - ${shares(personOwed)}`);

  return lines.join("\n");
}

// Build one text block for a no API summary expense.
export function buildAggregateSummary(
  groups: Order[],
  people: string[],
  payer: string,
  settlements: OutputDoc["settlements"],
  cur: string = "₹",
): string {
  // Fix the separator width for the whole block.
  const sep = "=".repeat(74);
  // Sum every share for one person across all groups.
  const owedTotal = (person: string): number =>
    groups.reduce(
      (sum, order) =>
        sum + order.reduce((inner, item) => inner + (item.assignments[person] ?? 0), 0),
      0,
    );
  // Sum every group total into one grand total.
  const grand = groups.reduce((sum, order) => sum + order.reduce((s, i) => s + i.price, 0), 0);
  const lines: string[] = [];
  lines.push(sep);
  lines.push(
    `Summary expense — ${groups.length} orders — total ${cur}${fmtRs(grand)} — paid by ${payer}`,
  );
  lines.push(sep);
  lines.push("Amounts to enter:");
  // Pad names so the rupee column stays aligned.
  const nameW = Math.max(...people.map((p) => p.length));
  for (const p of people) {
    lines.push("  " + pad(p, nameW) + " " + cur + fmtRs(owedTotal(p)));
  }
  if (settlements.length > 0) {
    lines.push("Settlements:");
    // Pad pairs so the rupee column stays aligned.
    const pairs = settlements.map((s) => `${s.from} → ${s.to}`);
    const pairW = Math.max(...pairs.map((s) => s.length));
    settlements.forEach((s, i) => {
      lines.push("  " + pad(pairs[i], pairW) + " " + cur + fmtRs(s.amount));
    });
  }
  lines.push(sep);
  lines.push("Itemized summary for the comment:");
  // Reuse short initials for the per order shares.
  const initials = initialsFor(people);
  groups.forEach((order, i) => {
    // Read the merchant and the time from the order itself. This line
    // used to slice them back out of the title text, which broke the
    // moment the title stopped naming a date.
    const merchant = titleCaseSpaced(order[0].platform);
    const dateText = formatWhen(order[0].date) ?? order[0].date;
    const total = order.reduce((s, item) => s + item.price, 0);
    // Show each share with two decimals.
    const shares = people
      .map((p) => {
        const share = order.reduce((s, item) => s + (item.assignments[p] ?? 0), 0);
        return `${initials.get(p)} ${fmtRs(share)}`;
      })
      .join(" · ");
    lines.push(`   ${i + 1}. ${merchant} — ${dateText} — ${cur}${fmtRs(total)} — ${shares}`);
    const goods = itemSummary(order.map((entry) => ({ name: entry.item })));
    if (goods !== undefined) lines.push("      " + goods);
  });
  lines.push(sep);
  lines.push("Paste the itemized part as a comment. Title the expense anything you");
  lines.push("like. No Splitwise account or API is needed.");
  return lines.join("\n");
}
