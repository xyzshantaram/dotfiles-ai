// Canonical split arithmetic. This module states THE REMAINDER RULE once:
// whenever a price is divided into rounded parts, the parts add up to the
// price exactly and any rounding remainder lands on the FIRST person.
//
// Both sides obey it: the browser board (split-board.js, beside this file)
// imports these helpers for what it shows and checkpoints, and the Deno
// engine (src/splitstate.ts) calls them for what it saves and exports. The
// board checkpoints computed amounts to the server unchecked and the export
// copies them verbatim into output.json, so a second, divergent copy of
// this math here would ship real money to the wrong person. Do not re-type
// these helpers anywhere else.
//
// Plain JavaScript with no imports: directly servable to the browser and
// directly importable from Deno. No bundler, no dependency.

/**
 * Round money to two decimal places.
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  return Math.round(n * 100) / 100;
}

// Park the rounding gap of pre-rounded parts on the first person, so the
// parts add up to the price exactly. Every helper below settles through
// here, which is what makes the rule single-sourced and not just stated.
function parkOnFirst(price, names, out) {
  let rest = 0;
  for (const name of names.slice(1)) {
    rest = round2(rest + (out[name] ?? 0));
  }
  out[names[0]] = round2(price - rest);
}

// Split a price evenly across people. The parts add up to the price
// exactly. Any remainder lands on the first person.
/**
 * @param {number} price
 * @param {string[]} people
 * @returns {Record<string, number>}
 */
export function shareEqual(price, people) {
  const names = [...people];
  if (names.length === 0) {
    throw new Error("an equal split needs one person");
  }
  const part = round2(price / names.length);
  const out = {};
  for (const name of names) {
    out[name] = part;
  }
  parkOnFirst(price, names, out);
  return out;
}

// Turn percents into money for one price. The parts add up to the
// price exactly. Any remainder lands on the first person.
/**
 * @param {number} price
 * @param {Record<string, number>} percents
 * @returns {Record<string, number>}
 */
export function sharePercent(price, percents) {
  const names = Object.keys(percents);
  if (names.length === 0) {
    throw new Error("a percent split needs one person");
  }
  const out = {};
  for (const name of names) {
    out[name] = round2((price * percents[name]) / 100);
  }
  parkOnFirst(price, names, out);
  return out;
}

// Put a whole price on one person.
/**
 * @param {number} price
 * @param {string} person
 * @returns {Record<string, number>}
 */
export function shareSingle(price, person) {
  if (person === undefined || person === null || person === "") {
    throw new Error("a single split needs one person");
  }
  return { [person]: round2(price) };
}

// Settle pre-rounded parts for named people onto the price, parking any
// gap on the first person. The engine uses this after scaling a saved
// split onto a new price, where the rounding lands after the per-person
// rounding rather than inside a fresh share.
/**
 * @param {number} price
 * @param {string[]} people
 * @param {Record<string, number>} amounts
 * @returns {Record<string, number>}
 */
export function settleRemainder(price, people, amounts) {
  const names = [...people];
  const out = { ...amounts };
  if (names.length === 0) return out;
  for (const name of names) {
    out[name] = round2(out[name] ?? 0);
  }
  parkOnFirst(price, names, out);
  return out;
}
