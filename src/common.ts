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
