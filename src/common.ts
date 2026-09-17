// Shared types and pure logic for split-utils. No I/O here.

export interface OrderItem {
  name: string;
  price: number; // unit price; quantity copies are expanded downstream
  quantity: number;
  estimated?: boolean;
  source?: string;
}

export interface OrderFees {
  delivery: number;
  packaging: number;
}

export interface Order {
  id: string;
  platform: string;
  date: string; // "YYYY-MM-DD h:mm AM/PM" or ISO-8601
  paid: number;
  items: OrderItem[];
  fees: OrderFees;
}

export interface SplitEntry {
  item: string;
  platform: string;
  order_id?: string;
  date: string;
  price: number;
  split_type: string;
  assignments: Record<string, number>;
}

export interface OutputDoc {
  split_at: string;
  people: string[];
  splits: SplitEntry[];
  totals: Record<string, number>;
  settlements: { from: string; to: string; amount: number }[];
}

/** True when the whole item name is one bracketed token, e.g. "[Handling]". */
export function isFeeItem(name: string): boolean {
  return name.startsWith("[") && name.endsWith("]") && !name.slice(1, -1).includes("]");
}

/** Format a rupee amount with 2 decimals. */
export function fmtRs(amount: number): string {
  return amount.toFixed(2);
}

/** Format one amount with a currency label, e.g. "INR 240.00". */
export function formatMoney(amount: number, currency: string): string {
  return currency + " " + amount.toFixed(2);
}

/** Compact amount: drops trailing ".00" ("240.00" -> "240"). */
export function compact(amount: number): string {
  const s = fmtRs(amount).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" || s === "-" ? "0" : s;
}

/** Parse ISO-8601 or "YYYY-MM-DD h:mm AM/PM" dates. Returns null on failure. */
export function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  const asIso = new Date(s);
  if (!Number.isNaN(asIso.getTime())) return asIso;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}) (AM|PM)$/i);
  if (!m) return null;
  let hour = parseInt(m[4], 10) % 12;
  if (m[6].toUpperCase() === "PM") hour += 12;
  return new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    hour,
    parseInt(m[5], 10),
  );
}

/** Format a date as YYYY-MM-DD in local time, the shape cutoff checks accept. */
export function formatDayISO(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + mm + "-" + dd;
}

/** ISO UTC -> "YYYY-MM-DD h:mm AM/PM" in IST (Indian delivery sites). */
export function formatISTDate(isoUtc: string): string {
  const d = new Date(isoUtc);
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  let hour = ist.getUTCHours();
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ${hour}:${
    pad(ist.getUTCMinutes())
  } ${ampm}`;
}

// Treat [Fees], [Rounding] and [Screenshot only] as ledger rows.
// Drop them before the pick line shows items.
export function isLedgerRow(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]");
}

// Match a number plus a pack, weight, volume or count unit.
const SIZE_PATTERN = /\d+\s*(kg|ml|ltr|litre|liter|pieces|piece|pcs|pc|packs|pack|combo|g|l)\b/i;

// Strip one trailing size group like pack, weight or volume.
// Repeat the strip while the new tail still states a size.
export function tidyProductName(name: string): string {
  let out = name.trim();
  while (out.endsWith(")")) {
    let depth = 0;
    let open = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] === ")") depth += 1;
      if (out[i] === "(") {
        depth -= 1;
        if (depth === 0) {
          open = i;
          break;
        }
      }
    }
    if (open < 0) break;
    const inner = out.slice(open + 1, out.length - 1).trim();
    const lower = inner.toLowerCase();
    const bare = lower === "pack" || lower === "pcs" || lower === "combo";
    if (!bare && !SIZE_PATTERN.test(inner)) break;
    out = out.slice(0, open).trim();
  }
  return out;
}

// One line summary of the order contents for the pick screen.
// Names the first five items, then counts the rest.
export function itemSummary(items: Array<{ name: string; quantity?: number }>): string | undefined {
  const merged: Array<{ name: string; quantity: number }> = [];
  for (const item of items) {
    const raw = item.name ?? "";
    if (isLedgerRow(raw)) continue;
    const tidy = tidyProductName(raw);
    const qty = item.quantity ?? 1;
    const found = merged.find((entry) => entry.name === tidy);
    if (found === undefined) merged.push({ name: tidy, quantity: qty });
    else found.quantity += qty;
  }
  if (merged.length === 0) return undefined;
  const shown = merged.slice(0, 5).map((entry) =>
    entry.quantity > 1 ? String(entry.quantity) + " " + entry.name : entry.name
  );
  const head = shown.join(", ");
  if (merged.length <= 5) return head;
  return head + " +" + String(merged.length - 5) + " more";
}
