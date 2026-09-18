// Pure split engine for ticket W2a. No side effects, no I/O.
// Rounding uses two decimals. The gap lands on the last person.

import { round2 } from "./common.ts";

// Split the price evenly. The rounding gap lands on the last person.
export function equalShare(
  price: number,
  people: string[],
): Record<string, number> {
  if (people.length === 0) throw new Error("equal split needs one person");
  const share = round2(price / people.length);
  const out: Record<string, number> = {};
  for (const name of people) out[name] = share;
  const last = people[people.length - 1];
  out[last] = round2(price - share * (people.length - 1));
  return out;
}

// Split by whole percents. Percents must sum to 100.
// The rounding gap lands on the last person.
export function percentShare(
  price: number,
  percents: Record<string, number>,
): Record<string, number> {
  const names = Object.keys(percents);
  if (names.length === 0) throw new Error("percent split needs one person");
  const out: Record<string, number> = {};
  for (const name of names) out[name] = round2((price * percents[name]) / 100);
  let sum = 0;
  for (const name of names.slice(0, -1)) sum += out[name];
  const last = names[names.length - 1];
  out[last] = round2(price - sum);
  return out;
}

// Use the given amounts. Each amount rounds to two decimals.
// The amounts must match the price within one paisa.
export function customShare(
  price: number,
  amounts: Record<string, number>,
): Record<string, number> {
  const names = Object.keys(amounts);
  if (names.length === 0) throw new Error("custom split needs one person");
  const out: Record<string, number> = {};
  for (const name of names) {
    const amt = amounts[name];
    if (typeof amt !== "number" || !Number.isFinite(amt)) {
      throw new Error("amount for " + name + " is not a number");
    }
    out[name] = round2(amt);
  }
  const sum = round2(Object.values(out).reduce((a, b) => a + b, 0));
  if (Math.abs(sum - price) > 0.01) {
    throw new Error(
      "amounts sum to " + sum.toFixed(2) + " but price is " + price.toFixed(2),
    );
  }
  return out;
}

// Give the full price to one person.
export function singleShare(
  price: number,
  person: string,
): Record<string, number> {
  return { [person]: round2(price) };
}

// Scale previous amounts by the price ratio.
// The rounding gap lands on the last person.
export function scaleRepeat(
  prevPrice: number,
  newPrice: number,
  prev: Record<string, number>,
): Record<string, number> {
  const names = Object.keys(prev);
  if (names.length === 0) throw new Error("repeat split needs one person");
  const ratio = prevPrice > 0 ? newPrice / prevPrice : 0;
  const out: Record<string, number> = {};
  for (const name of names) out[name] = round2((prev[name] ?? 0) * ratio);
  let sum = 0;
  for (const name of names.slice(0, -1)) sum += out[name];
  const last = names[names.length - 1];
  out[last] = round2(newPrice - sum);
  return out;
}

// Fee lines for the output. Only fees above 0.001 appear.
export function feeLines(fees: {
  delivery?: number;
  packaging?: number;
}): { name: string; price: number }[] {
  const out: { name: string; price: number }[] = [];
  if ((fees.delivery ?? 0) > 0.001) {
    out.push({ name: "[Delivery]", price: fees.delivery as number });
  }
  if ((fees.packaging ?? 0) > 0.001) {
    out.push({ name: "[Packaging]", price: fees.packaging as number });
  }
  return out;
}

// Build the output doc from saved splits.
// Totals sum every split. Debts point at the payer.
export function buildOutput(
  splits: {
    item: string;
    platform: string;
    order_id: string;
    date: string;
    price: number;
    split_type: string;
    assignments: Record<string, number>;
  }[],
  people: string[],
  payer: string,
): {
  split_at: string;
  people: string[];
  splits: typeof splits;
  totals: Record<string, number>;
  settlements: { from: string; to: string; amount: number }[];
} {
  const totals: Record<string, number> = {};
  for (const name of people) totals[name] = 0;
  for (const split of splits) {
    for (const [name, amt] of Object.entries(split.assignments)) {
      totals[name] = round2((totals[name] ?? 0) + amt);
    }
  }
  const settlements: { from: string; to: string; amount: number }[] = [];
  for (const name of people) {
    if (name === payer) continue;
    const amount = round2(totals[name] ?? 0);
    if (amount > 0.001) settlements.push({ from: name, to: payer, amount });
  }
  return {
    split_at: new Date().toISOString(),
    people: [...people],
    splits,
    totals,
    settlements,
  };
}
