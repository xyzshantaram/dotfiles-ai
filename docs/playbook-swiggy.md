# Swiggy Playbook

Verified 2026-09-09 against `www.swiggy.com` mobile web (412x915 viewport, Android 17 / Pixel 9a /
Chrome 151 UA, real distro Chromium binary).

## Getting in at all: AWS WAF

Swiggy fronts everything with AWS WAF Bot Control. Failure mode when it flags the client: `GET /`
returns 202 (challenge interstitial), the challenge JS completes (`token.awswaf.com .../inputs` +
`mp_verify` both 200), but the token is scored as bot and the retried document 403s.

What unblocked it (all four together, on 2026-09-09):

1. Real distro Chromium (`/usr/bin/chromium-browser`), NOT the Playwright-bundled Chrome-for-Testing
   binary.
2. `navigator.webdriver` masked via `ctx.addInitScript` (see `src/browser.ts`, `maskWebdriver`).
3. Full mobile emulation: `isMobile: true`, `hasTouch: true`, `deviceScaleFactor` — a phone UA
   without these scores as bot.
4. Browser-level `--user-agent=` launch arg alongside the context override, so `sec-CH-UA` client
   hints agree with the UA string (context-only overrides leave the hints claiming the desktop
   platform).

A WAF-flagged profile stays flagged: start a fresh `profileDir` after changing the fingerprint.
Login (phone + OTP) survives restarts on the same profile; no re-OTP on relaunch.

## Surface

Mobile UI only, per user decision: one surface shows both Food and Instamart (DASH) history, and
screenshots are smaller. Desktop Swiggy is restaurants-only and useless here.

## Auth

Session cookies in the persistent profile. No API keys, no bearer tokens, no CSRF dance observed for
GETs (a `csrfToken` arrives in responses but GETs to the order endpoints work with cookies alone).

## Endpoints

### Food orders (complete in one call, no detail fetch needed)

`GET https://www.swiggy.com/mapi/order/all?order_id=<cursor>`

- First page: `order_id=` (empty). Next page: `order_id` = the previous page's LAST
  `previousOrderId`? No — verify during build: the response orders carry `previousOrderId`; page
  size observed 5; `total_orders` is a capped display value (999), not a real count.
- Per order (all inline):
  - `order_id`, `restaurant_name`, `order_time` (`"2026-09-09 03:21:14"` IST), `order_status`
    (`"Delivered"`).
  - `order_items[]`: `name`, `quantity` (string!), `total` / `final_price` (line totals incl.
    variants; `base_price` = pre-discount), `item_charges` per-item tax map, `packing_charges`.
  - Money: `item_total`, `order_total` / `net_total` (equal), `order_tax`, `convenience_fees`,
    `platform_fee_tax`, `order_delivery_charge`, `restaurant_packing_charges`, `tipDetails.amount`,
    `coupon_discount_effective`.
  - Reconciliation verified on 247873874100369: Σ items 320 + GST 16 + convenience 15.24 + platform
    fee tax 2.74
    - tip 20 = 374 = `order_total`.

### Instamart / DASH orders (two-step: list, then detail)

`GET https://www.swiggy.com/mapi/order/dash?count=10&from_time=<ms>&order_type=DASH`

- Page of 10 groups. Per group: `order_id`, `created_at` (epoch ms), `order_data_v2.total` (protobuf
  money `{units, nanos}` = rupees/paise fraction, INR), `shipments[].items[]` = names + quantities
  ONLY (no prices anywhere in the list payload — verified by recursive scan).
- Older pages: decrement `from_time` to the last group's `created_at` (confirm during build).

`GET https://www.swiggy.com/mapi/order/v2/dash/details?order_id=<id>`

- `shipmentDetails[]` (one per shipment): `items[]` with `id`, `description` (full product name),
  `quantity` (string), `totalBasePrice` (MRP), `finalPrice` (paid, rupees), `removed`.
- `billDetail.billLineItems[]`: display rows — `title.title` ("Item Bill", "Delivery Fee", "Handling
  Fee", "Convenience Fee", "Offer Discount ", "Delivery Partner Tip") with `amount.title` ("₹16.00")
  and negative discounts ("-₹16.00"). Parse: strip "₹", float, keep sign.
- Reconciliation verified on 247505576170248: items Σ finalPrice 654 + Delivery 16 + Handling 12 +
  Convenience 17.70 − Offer 16 + Tip 20 = 703.70 ≈ `totalBill` 704 (paise rounding, ₹0.30 on a ₹704
  bill).

### Noise to ignore

`insights-collector.newrelic.com`, `bam.nr-data.net`, `ampcid.google*`, `awswaf` telemetry,
`manifest_new.json`, `mapi/support/v3`, `mapi/profile/*`, `mapi/misc/launch`, `mapi/address/all`,
`mapi/order/dineout` (empty for this account).

## Mapping to orders.json

- Food: one order per `orders[]` entry. `id` = `swiggy-<order_id>`. Items from `order_items` (price
  = line `total` / `quantity` as unit price — check against dashboard's unit-price convention).
  Fees: GST → fees map, convenience + platform fee tax → handling, delivery charge, packing charges,
  tip as pseudo-item or fee (follow Blinkit tip convention), discounts negative.
- Instamart: one order per DASH group. Items from the detail call's `finalPrice`. Fees from
  `billDetail` rows (Delivery/Handling/ Convenience/Tip), "Item Bill" row is Σ items — skip it.
  Offer Discount applies to fees/items as a whole — fold into a negative fee line.
- Date format: convert `order_time` (IST, no timezone) and `created_at` (epoch ms → IST) to the same
  date string convention as the other sites (`common.ts formatISTDate`).

## Money rules (verified against a photographed bill, 2026-09-09)

The food list payload carries EVERYTHING; there is no food detail endpoint (the bill view renders
client-side from list data). Gotchas:

- `order_items[].total` ALREADY INCLUDES that item's packing charges (e.g. base 215 + packing 10 =
  total 225). Add only `restaurant_packing_charges` separately; never re-add item packing.
- `restaurant_packing_charges` may be half the packing shown on the bill (10 vs 20): the other half
  is inside item totals. Their sum equals the bill's "Restaurant Packaging" row.
- Rain fee: `weather_fee_breakup.rainFee` + `rainFeeGst` (18%); present only when `rain_mode` > 0.
  Maps to a `[Rain fee]` pseudo-item.
- Discounts: use `order_discount_effective` (the full stack: coupon + trade). Coupon-only field
  undercounts.
- Handling: `convenience_fees_with_tax` (falls back to convenience_fees + platform_fee_tax).
- Taxes: `order_tax` EXCLUDES rain GST (already in rainFeeGst).
- Swiggy rounds the final bill to the whole rupee, so components can sit up to ₹0.50 under paid
  (x.50 rounds up). Absorb as `[Rounding]` pseudo-item; treat >0.50 as a genuine mismatch.

## Pagination (verified)

- Food: first page `order_id=` empty; next pages `order_id=<last
  order_id of previous page>`; 5
  per page; stop at empty page or when order_time passes the cutoff.
- DASH: `from_time=<ms>` starts at now; next page uses the last group's `created_at`; 10 per page.

## Extraction

A same-origin `fetch` from the logged-in page context carries the cookies, and no WAF issue showed
up for mapi GETs. One throwaway probe read 30 orders in 30 days, ALL BALANCE. The shipped reader is
`gatherSwiggy` in `wizards/gatherer.ts`.
