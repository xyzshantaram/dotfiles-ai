# Splitter schema contract

This file defines the two JSON files around the splitter. `orders.json` is the gatherer output and
the splitter input. `output.json` is the splitter output and the AI-agent contract. The TypeScript
models live in `src/common.ts`. `buildOutputDoc` in `src/splitstate.ts` is the reference writer of
`output.json`, and `scripts/validate.ts` is the reference reader.

## orders.json

`orders.json` holds an array of `Order` objects. Each order has these keys.

- `id`: string. Platform order id with a platform prefix. Sample: `"zomato-8470552516"`.
- `platform`: string. Sample values: `"zomato"`, `"blinkit"`, `"swiggy_food"`, `"swiggy_instamart"`.
- `date`: string. Display form `"YYYY-MM-DD h:mm AM/PM"` or ISO-8601. Sample:
  `"2026-08-14 3:23 PM"`.
- `paid`: number. Rupees the buyer paid for the whole order.
- `items`: array of order items. Each item has `name` (string), `price` (number, the UNIT price in
  rupees), and `quantity` (number). Price can stay zero for free items and can go negative for
  discounts. The consumer expands quantity into per-unit lines. The splitter shows one line per
  unit.
- `fees`: object with `delivery` (number) and `packaging` (number). These fields exist on every
  order. The splitter ignores them. It reads fees from bracketed pseudo-items instead (see below).

### Fee pseudo-items

Fees travel as normal items with bracketed names. Match the whole name only. `"[Handling]"` is a fee
item. `"[Combo] Milky Mist Paneer ..."` is a real item because it has trailing text. The `isFeeItem`
helper in `src/common.ts` encodes this rule. Observed names include `[GST]`, `[Handling]`, `[Tip]`,
`[Discount]` (negative price), `[Delivery]`, `[Taxes]`, `[Packaging]`, `[Convenience]`,
`[Rounding]`, and `[Fees]`. The list stays open. Any whole-bracket name counts. Zepto bakes some
fees into item prices instead of listing them.

## output.json

`output.json` holds one object with five keys. `buildOutputDoc` in `src/splitstate.ts` assembles it.

- `split_at`: string. Timestamp of the export. The writer uses `new Date().toISOString()`. Sample:
  `"2026-09-09T11:05:58.278Z"`. The validator checks only that it is a string, so another ISO-8601
  form passes.
- `people`: non-empty string array. It names every person who shares the cost.
- `splits`: array of split entries. It holds one entry per assigned item.
- `totals`: object. Person name maps to rupees assigned across all splits, rounded to 2 decimals.
- `settlements`: array of settlement entries (see below).

### Split entry

Each entry has these keys.

- `item`: string. Item name as it appears in `orders.json`.
- `platform`: string. Copied from the source item.
- `order_id`: string, optional. Platform order id without prefix. It is `""` for legacy rows that
  lack one.
- `date`: string. Display form `"YYYY-MM-DD h:mm AM/PM"`. `formatOutputDate` in `src/splitstate.ts`
  writes it. The month and day keep zero padding. The hour uses 12-hour time without a leading zero.
  Sample: `"2026-09-09 12:45 AM"`. When the source date does not parse, the writer keeps the raw
  string. The validator checks only that it is a string.
- `price`: number. Rupees for this line.
- `split_type`: string. One of `equal`, `single`, `percentage`, `custom`.
  - `equal`: the price splits evenly across the named people. The rounding gap goes to the last
    person.
  - `single`: one person takes the full price.
  - `percentage`: each person takes a stated percent of the price.
  - `custom`: each person takes a stated rupee amount.
  - `assignments` always stores RUPEES, in every mode.
- `assignments`: object. Person name maps to rupees. Every key must appear in `people`. Rule: the
  values must sum to `price`.

### Totals

`totals[p]` equals the sum of `p`'s assignment amounts across all splits. Values round to 2
decimals.

### Settlements

Each entry has `from` (string), `to` (string), and `amount` (number).

- `from` names the person who owes money. `to` names the payer who fronted the orders. The payer
  defaults to `people[0]`.
- `amount` is the rupees owed, rounded to 2 decimals. Only positive debts appear.
- The entries cover every non-payer. The amounts sum to the non-payers' totals.

## Agent contract

An AI agent may write `output.json` directly instead of driving the wizard UI. The file must pass
the validator.

1. Run `deno run --no-lock --allow-read scripts/validate.ts <output.json> [--orders <orders.json>]`
   and fix every `FAIL` line.
2. Skipped items simply do not appear in `splits`. The `--orders` cross-check expects full
   assignment. It fails groups with skipped items because their prices stay out of the sum.
3. Keep every `assignments` key inside `people`. Keep each line balanced. Name `split_type`
   honestly.
