#!/usr/bin/env -S deno run --no-lock --allow-read --allow-write --allow-run --allow-env --allow-sys --allow-net
//
// Gatherer wizard for split-utils. It collects orders from each
// delivery platform and writes one orders.json run dir.
// An AI agent uses the same path through --emit prompt mode.
//

/// <reference lib="dom" />

import type { Page, Response as PWResponse } from "playwright";
import { dot, lineEnd, lineStart, say, step, wizardExit } from "../src/term.ts";
import { createRun, ensureRun, stateRoot } from "../src/runstate.ts";
import { loadSettings } from "../src/settings.ts";
import { createRunLog, type RunLog } from "../src/log.ts";
import { detectDrift, driftMessage, type FailureEvent } from "../src/drift.ts";
import {
  isBlockedStatus,
  openSession,
  pageFetch,
  pageThrough,
  scrollUntilStable,
  type Session,
  waitFor,
} from "../src/browser.ts";
import type { Order } from "../src/common.ts";
import { renderTree } from "../src/render.ts";
import {
  checkBalance as checkZepto,
  extractFees,
  extractProducts,
  mapOrder as mapZepto,
  type ZeptoBillFee,
  type ZeptoRawOrder,
} from "../src/zepto.ts";
import {
  type BlinkitRawOrder,
  checkBalance as checkBlinkit,
  mapOrder as mapBlinkit,
} from "../src/blinkit.ts";
import {
  checkBalance as checkSwiggy,
  mapDashOrder,
  mapFoodOrder,
  type SwiggyDashDetail,
  type SwiggyDashGroup,
  type SwiggyFoodOrder,
} from "../src/swiggy.ts";
import {
  completeConsent,
  DEFAULT_LOCATION,
  exchangeCode,
  fetchHistoryPage,
  fetchLoginChallenge,
  fetchOrderDetail,
  type HistorySkeleton,
  loadLoginState,
  loadTokens,
  type LoginState,
  mapHistoryOrder,
  parseBill,
  parseHistoryPage,
  parseZomatoDate,
  saveTokens,
  sendOtp,
  verifyOtp,
  type ZomatoLocation,
} from "../src/zomato.ts";

// STAGES: eight fixed stages. Platform steps run only when picked.

// Sign in wait per platform before the retry question, in ms.
const LOGIN_TIMEOUT_MS = 5 * 60_000;
// Pseudo item that marks a screenshot only order for the splitter.
const SCREENSHOT_ITEM = "[Screenshot only]";
// Sidecar that lists screenshot files inside the run dir.
const SHOT_MANIFEST = "screenshots.json";

// One platform id per gather path.
type PlatformId = "zepto" | "blinkit" | "zomato" | "swiggy" | "manual";

// One screenshot waiting for a run dir.
interface PendingShot {
  orderId: string;
  platform: string;
  tempPath: string;
}

// Orders plus screenshots gathered from one platform.
interface GatherResult {
  orders: Order[];
  shots: PendingShot[];
  notes: string[];
}

// Shared bag every step appends to. Finish writes it once.
const bag: {
  orders: Order[];
  shots: PendingShot[];
  notes: string[];
  failures: FailureEvent[];
  splitLater: string[];
  counts: Record<string, number>;
} = {
  orders: [],
  shots: [],
  notes: [],
  failures: [],
  splitLater: [],
  counts: {},
};

// Active run log. Emit mode and live mode both set it.
let LOG: RunLog | null = null;

// Write one info line to the run log when it exists.
function logInfo(line: string): void {
  if (LOG) LOG.write("info", line);
}

// Write one warn line to the run log when it exists.
function logWarn(line: string): void {
  if (LOG) LOG.write("warn", line);
}

// Write one error line to the run log when it exists.
function logError(line: string): void {
  if (LOG) LOG.write("error", line);
}

// Read one flag value from --name=x or --name x form.
function flagValue(name: string): string | null {
  const args = Deno.args;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--" + name && i + 1 < args.length) return args[i + 1];
    if (arg.startsWith("--" + name + "=")) return arg.slice(name.length + 3);
  }
  return null;
}

// True when the named bare flag is present.
function hasFlag(name: string): boolean {
  return Deno.args.includes("--" + name);
}

// Parse the --platforms flag to a clean id list.
function parsePlatforms(
  raw: string | null,
  fallback: PlatformId[],
): PlatformId[] {
  const known: PlatformId[] = [
    "zepto",
    "blinkit",
    "zomato",
    "swiggy",
    "manual",
  ];
  if (raw === null) return fallback;
  const out: PlatformId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (known.includes(id as PlatformId) && !out.includes(id as PlatformId)) {
      out.push(id as PlatformId);
    }
  }
  return out.length > 0 ? out : fallback;
}

// Parse the --days flag to a positive day count.
function parseDays(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 365);
}

// Cutoff timestamp for a day range.
function cutoffMs(days: number): number {
  return Date.now() - days * 86_400_000;
}

// Profile dir for one site under the active state root.
function profileDir(site: string): string {
  return stateRoot() + "/share/profiles/" + site;
}

// Saved Zomato location path under the active state root.
function locationPath(): string {
  return stateRoot() + "/share/config/zomato-location.json";
}

// Load the saved Zomato location or null when it misses.
async function loadLocation(): Promise<ZomatoLocation | null> {
  try {
    const raw = await Deno.readTextFile(locationPath());
    const data = JSON.parse(raw) as Partial<ZomatoLocation>;
    if (typeof data.lat !== "string" || typeof data.long !== "string") {
      return null;
    }
    if (typeof data.cityId !== "string") return null;
    return {
      city: typeof data.city === "string" ? data.city : "Saved city",
      lat: data.lat,
      long: data.long,
      cityId: data.cityId,
    };
  } catch {
    return null;
  }
}

// Save the Zomato location for future runs.
async function saveLocation(loc: ZomatoLocation): Promise<void> {
  const path = locationPath();
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(loc, null, 2) + "\n");
}

// Read people names from settings when the file names any.
async function readPeople(): Promise<string[]> {
  try {
    const raw = await Deno.readTextFile(stateRoot() + "/config/settings.json");
    const data = JSON.parse(raw) as { people?: unknown };
    if (
      Array.isArray(data.people) &&
      data.people.every((p) => typeof p === "string")
    ) {
      return data.people as string[];
    }
    return [];
  } catch {
    return [];
  }
}

// Build a screenshot only order that balances by construction.
function screenshotOrder(
  platform: string,
  id: string,
  date: string,
  paid: number,
): Order {
  return {
    id: platform + "-" + id,
    platform,
    date,
    paid,
    items: [{ name: SCREENSHOT_ITEM, price: paid, quantity: 1 }],
    fees: { delivery: 0, packaging: 0 },
  };
}

// Save a screenshot of the current page to the temp shot dir.
async function snapPage(
  page: Page,
  platform: string,
  orderId: string,
  shotDir: string,
): Promise<PendingShot | null> {
  const safe = orderId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60) || "order";
  const tempPath = shotDir + "/" + platform + "-" + safe + ".png";
  try {
    await page.screenshot({ path: tempPath });
    logInfo(platform + " screenshot saved for order " + orderId);
    return { orderId: platform + "-" + orderId, platform, tempPath };
  } catch (e) {
    logWarn(
      platform +
        " screenshot failed: " +
        (e instanceof Error ? e.message : String(e)),
    );
    return null;
  }
}

// Report zero parsed bills with the settled drift message.
function reportZeroBills(platform: string, failures: FailureEvent[]): string {
  const events: FailureEvent[] = failures.length > 0
    ? failures
    : [{ platform, kind: "parse", detail: "no bills parsed" }];
  const sig = detectDrift(events);
  const logPath = LOG ? LOG.path : "no log file";
  if (sig === null) {
    const line = "No orders came through for " +
      platform +
      ". See the log at " +
      logPath +
      ".";
    logWarn(platform + " gathered zero orders without a drift match");
    return line;
  }
  const msg = driftMessage(sig, logPath);
  logWarn(platform + " drift: " + msg.dev);
  return msg.user;
}

// Open one site over its saved profile. The "login" phase runs headed
// in a compact --app window. The "scrape" phase runs headless and
// carries the login the headed phase left in the profile. Never run
// both phases at once: the profile dir takes one browser at a time.
type SitePhase = "login" | "scrape";
async function openSite(
  site: string,
  siteUrl: string,
  phase: SitePhase,
): Promise<Session> {
  const scrape = phase === "scrape";
  if (site === "swiggy") {
    return await openSession({
      profileDir: profileDir(site),
      headless: scrape,
      ...(scrape ? {} : { appUrl: siteUrl }),
      executablePath: await swiggyBinary(),
      mobile: true,
      viewport: { width: 412, height: 915 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 17; Pixel 9a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Mobile Safari/537.36",
      geolocation: { latitude: 12.9341967, longitude: 77.7241821 },
    });
  }
  return await openSession({
    profileDir: profileDir(site),
    headless: scrape,
    // Bot-guarded sites trip on the bundled build. The distro build
    // carries a human TLS fingerprint, like Swiggy already does.
    // Channel chrome covers Windows and macOS, where no distro
    // path exists; a miss falls back to bundled, never fails.
    executablePath: await swiggyBinary(),
    channel: "chrome",
    // Headed only: the --app window and its OS sizing. The headless
    // scrape keeps just the viewport.
    ...(scrape ? {} : {
      appUrl: siteUrl,
      // Small portrait window, unscaled: the OS window follows
      // --window-size and HiDPI stays at 1x.
      windowSize: { width: 480, height: 860 },
      forceScaleFactor: 1,
    }),
    viewport: { width: 480, height: 860 },
    geolocation: { latitude: 12.9341967, longitude: 77.7241821 },
  });
}

// Pick the real distro Chromium for bot-guarded sites when it exists.
// The bundled build trips the site bot check. Fall back to it otherwise.
async function swiggyBinary(): Promise<string | undefined> {
  try {
    await Deno.stat("/usr/bin/chromium-browser");
    return "/usr/bin/chromium-browser";
  } catch {
    return undefined;
  }
}

// Wait for a stored or fresh login in a headed session, then close it.
// The saved profile keeps the login for the later headless scrape.
// Returns nothing. Throws when the user skips the platform.
// verifyUrl loads a page that fires the signal on its own (for checks
// that harvest the site's own responses instead of calling APIs).
// It waits once and throws when the wait times out.
async function loginWait(
  platform: string,
  siteUrl: string,
  check: (page: Page) => Promise<boolean>,
  opts: {
    verifyUrl?: string;
    verifyWaitMs?: number;
    onPage?: (page: Page) => void;
  } = {},
): Promise<void> {
  step("Opening " + platform + ".");
  const session = await openSite(platform, siteUrl, "login");
  const page = session.page;
  opts.onPage?.(page);
  try {
    await page.goto(opts.verifyUrl ?? siteUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  } catch (e) {
    logWarn(
      platform +
        " first load failed: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
  await page.waitForTimeout(opts.verifyWaitMs ?? 4000);
  try {
    if (await check(page)) {
      logInfo(platform + " stored login works");
      say("Signed in with the saved login.");
      await session.close().catch(() => {});
      return;
    }
  } catch {
    // Treat check errors as not logged in.
  }
  say("Sign in in the small window. The app will continue by itself.");
  say("Waiting for sign in.");
  logInfo(platform + " waits for manual sign in");
  let ok = false;
  try {
    ok = await waitFor(page, () => check(page), {
      timeoutMs: LOGIN_TIMEOUT_MS,
      pollMs: 3000,
      // One dot per poll so the wait is visible.
      onTick: () => dot(),
    });
  } catch {
    ok = false;
  }
  if (ok) {
    logInfo(platform + " sign in seen");
    say("Sign in seen. Fetching orders.");
    await session.close().catch(() => {});
    return;
  }
  logWarn(platform + " sign in wait timed out");
  await session.close().catch(() => {});
  throw new Error(platform + " sign in timed out");
}

// Watch the page for the site's own order-list 200.
// Direct calls fail on purpose: the gateway wants the time-bound
// request-signature header only the site JS makes. Harvesting the
// site's own responses always carries the right headers.
interface OrderWatcher {
  seen: () => boolean;
  detach: () => void;
}
function attachOrderWatcher(page: Page): OrderWatcher {
  let hit = false;
  const handler = (res: PWResponse) => {
    try {
      if (
        res.status() === 200 &&
        /bff-gateway\.zepto\.com\/api\/v2\/order\//.test(res.url())
      ) {
        hit = true;
      }
    } catch {
      // Ignore malformed responses.
    }
  };
  page.on("response", handler);
  return {
    seen: () => hit,
    detach: () => page.removeListener("response", handler),
  };
}

// Blinkit login signal: localStorage auth holds a real access token.
async function blinkitCheck(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      try {
        const auth = JSON.parse(localStorage.getItem("auth") ?? "{}");
        return (
          typeof auth.accessToken === "string" && auth.accessToken.length > 20
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

// Swiggy login signal. The HTTP status cannot carry it: an expired
// session also answers 200, with statusCode 1 and "Session expired.
// Please login again." in the body. Only the app level statusCode
// separates a real answer from a logged out one.
async function swiggyCheck(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(async () => {
      try {
        const r = await fetch("/mapi/order/all?order_id=", {
          headers: { accept: "application/json" },
        });
        if (r.status !== 200) return false;
        const body = await r.json().catch(() => null);
        return body !== null && body.statusCode === 0;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

// Gather Zepto orders through the site own calls plus scroll loading.
async function gatherZepto(
  page: Page,
  days: number,
  shotDir: string,
): Promise<GatherResult> {
  const orders: Order[] = [];
  const shots: PendingShot[] = [];
  const notes: string[] = [];
  const failures: FailureEvent[] = [];
  const cutoff = cutoffMs(days);

  // True once one page carries the site's own end marker.
  function listEnded(bodies: string[]): boolean {
    for (const body of bodies) {
      try {
        const data = JSON.parse(body) as { endOfList?: unknown };
        if (data.endOfList === true) return true;
      } catch {
        // A bad body proves nothing about the end of the list.
      }
    }
    return false;
  }

  // True once the oldest order on hand sits before the day range.
  // Paging further only collects orders the run would drop.
  function oldestBefore(bodies: string[], edge: number): boolean {
    let oldest = Number.POSITIVE_INFINITY;
    for (const body of bodies) {
      try {
        const data = JSON.parse(body) as { orders?: ZeptoRawOrder[] };
        for (const order of data.orders ?? []) {
          const at = new Date(order.placedTime).getTime();
          if (Number.isFinite(at) && at < oldest) oldest = at;
        }
      } catch {
        // Skip a body that does not parse.
      }
    }
    return Number.isFinite(oldest) && oldest < edge;
  }

  // Wait until one more list page lands, or give up. Returns false on
  // the give up path, so the caller can report a stall out loud.
  async function waitForGrowth(
    bodies: string[],
    from: number,
    waitMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      if (bodies.length > from) return true;
      await page.waitForTimeout(400);
    }
    return bodies.length > from;
  }

  // Hold list bodies in memory as they arrive. Throttle hits never
  // carry JSON, so count statuses outside the body filter.
  const listBodies: string[] = [];
  let throttled = 0;
  const onList = (res: PWResponse) => {
    try {
      const url = res.url();
      if (!/api\/v2\/order\//.test(url)) return;
      if (res.status() === 429) {
        throttled += 1;
        return;
      }
      const ct = res.headers()["content-type"] ?? "";
      if (!ct.includes("json")) return;
      res
        .text()
        .then((body) => listBodies.push(body))
        .catch(() => {});
    } catch {
      // Ignore listener errors.
    }
  };
  page.on("response" as never, onList as never);
  try {
    step("Fetching the order list. This could take a while.");
    await page.goto("https://www.zepto.com/account/orders", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(7000);
    // One page holds eight orders and says endOfList false while more
    // wait. Scrolling loads nothing: the Load More button drives every
    // page. So click it until the site says the list ended, until a
    // click brings no new page, or until the oldest order on hand falls
    // outside the day range.
    let stallDetail = "";
    let stallKind: "http" | "parse" = "http";
    const paging = await pageThrough({
      limit: 40,
      isDone: () => listEnded(listBodies),
      isPastEdge: () => oldestBefore(listBodies, cutoff),
      onPage: () => dot(),
      next: async () => {
        const before = listBodies.length;
        // The Load More button measures zero by zero. A locator click
        // therefore never lands: a zero size control sits outside the
        // accessibility tree, and it fails every actionability check.
        // Click it in the page, the way the site's own script does.
        // Measured: an in page click takes the list from 8 to 16.
        const clicked = await page.evaluate(() => {
          const all = Array.from(
            document.querySelectorAll("button, div, span, a"),
          );
          for (const el of all) {
            if (!/^load more$/i.test((el.textContent ?? "").trim())) continue;
            el.scrollIntoView({ block: "center" });
            (el as HTMLElement).click();
            return true;
          }
          return false;
        });
        if (!clicked) {
          // No control and no end marker means the page shape moved.
          stallDetail = "no Load More control while endOfList stays false";
          stallKind = "parse";
          return false;
        }
        // Wait for the page the click asked for, rather than a fixed gap.
        const grew = await waitForGrowth(listBodies, before, 12000);
        if (!grew) {
          stallDetail = "Load More brought no new page";
          stallKind = "http";
          return false;
        }
        return true;
      },
    });
    if (paging.stop === "stalled") {
      failures.push({
        platform: "zepto",
        kind: stallKind,
        detail: stallDetail,
      });
    } else if (paging.stop === "limit") {
      failures.push({
        platform: "zepto",
        kind: "http",
        detail: "paging stopped at the page cap before endOfList",
      });
    } else if (paging.stop === "error") {
      failures.push({
        platform: "zepto",
        kind: "http",
        detail: paging.detail ?? "orders page failed",
      });
    }
  } catch (e) {
    failures.push({
      platform: "zepto",
      kind: "http",
      detail: "orders page failed: " + (e instanceof Error ? e.message : String(e)),
    });
  }
  await page.waitForTimeout(2000);
  page.off("response" as never, onList as never);
  // Parse list bodies to raw orders inside the day range.
  const seen = new Set<string>();
  const raw: ZeptoRawOrder[] = [];
  let skipped = 0;
  let listed = 0;
  if (throttled > 0) {
    // HTTP 429: Zepto is throttling us. More clicks make it last
    // longer, so stop here instead of scraping an empty list.
    failures.push({
      platform: "zepto",
      kind: "http",
      detail: "zepto throttled the scrape with HTTP 429",
    });
    say(
      "Zepto is rate limiting us. Wait a while, then scrape once. " +
        "Nothing was saved as orders.",
    );
  } else if (listBodies.length === 0) {
    // The list endpoint never answered. A silent empty list here is
    // how a flagged session looks, so fail loudly, never as zero.
    failures.push({
      platform: "zepto",
      kind: "http",
      detail: "order list never loaded: no api/v2/order response seen",
    });
    say(
      "Zepto never sent the order list. The session may be flagged. " +
        "Sign in again, then scrape. Nothing was saved as orders.",
    );
  }
  for (const body of listBodies) {
    let data: { orders?: ZeptoRawOrder[] };
    try {
      data = JSON.parse(body) as { orders?: ZeptoRawOrder[] };
    } catch {
      failures.push({
        platform: "zepto",
        kind: "parse",
        detail: "order list JSON failed",
      });
      continue;
    }
    for (const o of data.orders ?? []) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      listed += 1;
      if (o.status === "CANCELLED") {
        skipped += 1;
        continue;
      }
      if (new Date(o.placedTime).getTime() < cutoff) continue;
      raw.push(o);
    }
  }
  logInfo(
    "zepto list holds " +
      raw.length +
      " orders, skipped " +
      skipped +
      " cancelled",
  );
  if (listBodies.length === 0) {
    // Loud message already said above. Nothing else to report.
  } else if (raw.length === 0) {
    // The endpoint answered but nothing lands in range. Say the
    // counts out loud so a soft block cannot pose as no orders.
    say(
      "Zepto sent the list with " +
        listed +
        " orders in total, " +
        skipped +
        " cancelled, none inside the day range. " +
        "Widen the range or check the account before you trust the zero.",
    );
  } else {
    say("Found " + raw.length + " orders. Fetching each bill.");
  }
  // Fetch each bill through its own order page with scroll loading.
  let n = 0;
  for (const o of raw) {
    n += 1;
    lineStart("Zepto order " + n + " of " + raw.length + ": " + o.code);
    const detailBodies: string[] = [];
    const onDetail = (res: PWResponse) => {
      try {
        if (!/ORDER_DETAILS/.test(res.url())) return;
        res
          .text()
          .then((body) => detailBodies.push(body))
          .catch(() => {});
      } catch {
        // Ignore listener errors.
      }
    };
    page.on("response" as never, onDetail as never);
    try {
      await page.goto(
        "https://www.zepto.com/order/" + o.id + "?isArchived=false",
        {
          waitUntil: "domcontentloaded",
        },
      );
      await page.waitForTimeout(5000);
      dot();
      await scrollUntilStable(page, {
        rounds: 3,
        waitMs: 2000,
        onRound: () => dot(),
      });
    } catch (e) {
      failures.push({
        platform: "zepto",
        kind: "http",
        detail: "detail page failed: " + (e instanceof Error ? e.message : String(e)),
      });
    }
    await page.waitForTimeout(1000);
    page.off("response" as never, onDetail as never);
    // Merge every shipment widget to one product list.
    let products: ZeptoRawOrder["products"] = [];
    let fees: ZeptoBillFee[] = [];
    for (const body of detailBodies) {
      try {
        const parsed = JSON.parse(body) as Parameters<
          typeof extractProducts
        >[0];
        const found = extractProducts(parsed);
        if (found.length > 0 && products.length === 0) products = found;
        const feeRows = extractFees(parsed);
        if (feeRows.length > 0 && fees.length === 0) fees = feeRows;
      } catch {
        failures.push({
          platform: "zepto",
          kind: "parse",
          detail: "detail JSON failed",
        });
      }
    }
    if (products.length === 0) {
      failures.push({
        platform: "zepto",
        kind: "parse",
        detail: "empty bill for " + o.code,
      });
      const shot = await snapPage(page, "zepto", o.code, shotDir);
      if (shot) shots.push(shot);
      orders.push(
        screenshotOrder(
          "zepto",
          o.code,
          o.placedTime,
          o.grandTotalAmount / 100,
        ),
      );
      lineEnd("skipped.");
      continue;
    }
    const mapped = mapZepto({ ...o, products }, fees);
    if (!checkZepto(mapped)) {
      failures.push({
        platform: "zepto",
        kind: "parse",
        detail: "balance miss for " + o.code,
      });
      const shot = await snapPage(page, "zepto", o.code, shotDir);
      if (shot) shots.push(shot);
      orders.push(screenshotOrder("zepto", o.code, mapped.date, mapped.paid));
      lineEnd("skipped.");
      continue;
    }
    orders.push(mapped);
    logInfo(
      "zepto " + o.code + " parsed with " + mapped.items.length + " lines",
    );
    lineEnd();
  }
  if (orders.filter((o) => o.items[0]?.name !== SCREENSHOT_ITEM).length === 0) {
    // Zero real bills, with or without a list: say so through the
    // drift report, never as a quiet zero.
    notes.push(reportZeroBills("zepto", failures));
  }
  step("Zepto done: " + orders.length + " orders.");
  return { orders, shots, notes };
}

// Read Blinkit auth headers from the page own storage.
async function blinkitHeaders(
  page: Page,
): Promise<Record<string, string> | null> {
  try {
    const auth = await page.evaluate(() => {
      try {
        return {
          accessToken: JSON.parse(localStorage.getItem("auth") ?? "{}").accessToken ?? "",
          authKey: localStorage.getItem("authKey") ?? "",
          deviceId: localStorage.getItem("deviceId") ?? "",
        };
      } catch {
        return { accessToken: "", authKey: "", deviceId: "" };
      }
    });
    if (!auth.accessToken) return null;
    return {
      accept: "application/json",
      "content-type": "application/json",
      app_client: "consumer_web",
      platform: "desktop_web",
      access_token: auth.accessToken,
      auth_key: auth.authKey,
      device_id: auth.deviceId,
    };
  } catch {
    return null;
  }
}

// Parse one rupee text to a number or null.
function parseRs(text: string): number | null {
  const m = text.replace(/,/g, "").match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

// Parse a Blinkit list date with no year. Rolls back a year on future dates.
function parseBlinkitDate(text: string): Date | null {
  const m = text
    .trim()
    .match(/^(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const mi = months.indexOf(m[2].toLowerCase());
  if (mi < 0) return null;
  let hour = parseInt(m[3], 10) % 12;
  if (m[5].toLowerCase() === "pm") hour += 12;
  const now = new Date();
  let date = new Date(
    now.getFullYear(),
    mi,
    parseInt(m[1], 10),
    hour,
    parseInt(m[4], 10),
  );
  if (date.getTime() > now.getTime()) {
    date = new Date(
      now.getFullYear() - 1,
      mi,
      parseInt(m[1], 10),
      hour,
      parseInt(m[4], 10),
    );
  }
  return date;
}

// Gather Blinkit orders through the site own JSON APIs.
async function gatherBlinkit(
  page: Page,
  days: number,
  shotDir: string,
): Promise<GatherResult> {
  const orders: Order[] = [];
  const shots: PendingShot[] = [];
  const notes: string[] = [];
  const failures: FailureEvent[] = [];
  const cutoff = cutoffMs(days);
  const headers = await blinkitHeaders(page);
  if (headers === null) {
    failures.push({
      platform: "blinkit",
      kind: "http",
      status: 401,
      detail: "auth headers missing",
    });
    notes.push(reportZeroBills("blinkit", failures));
    return { orders, shots, notes };
  }
  // Page the order history until the cutoff date.
  const listed: Array<{
    orderId: string;
    cartId: string;
    dateText: string;
    date: string;
  }> = [];
  let cursor: string | null = null;
  let pageIndex = 0;
  let pageNo = 0;
  try {
    outer: while (true) {
      const url = cursor === null
        ? "https://blinkit.com/v1/layout/order_history"
        : "https://blinkit.com/v1/layout/order_history?offset=0&limit=10&cursor=" +
          cursor +
          "&get_failed_carts_history=false&last_snippet_type=order_history_container_vr&last_widget_type=order+history+widget&page_index=" +
          pageIndex +
          "&total_entities_processed=" +
          (pageIndex + 1);
      const res = await pageFetch(page, url, { method: "POST", headers });
      logInfo("blinkit history page answers " + res.status);
      if (res.status !== 200) {
        failures.push({
          platform: "blinkit",
          kind: "http",
          status: res.status,
          detail: "history page failed",
        });
        break;
      }
      const data = JSON.parse(res.text) as {
        response?: {
          snippets?: Array<Record<string, unknown>>;
          pagination?: { cursor?: string };
        };
      };
      const snips = (data.response?.snippets ?? []).filter(
        (s) => (s["widget_type"] as string) === "order_history_container_vr",
      );
      pageNo += 1;
      say("Blinkit history page " + pageNo + ": " + snips.length + " orders.");
      for (const s of snips) {
        const items = ((s["data"] as Record<string, unknown>)?.["items"] ??
          []) as Array<Record<string, unknown>>;
        const header = items.find(
          (i) => i["widget_type"] === "image_text_vr_type_header",
        );
        if (!header) continue;
        const attrs = (header["tracking"] as Record<string, unknown>)?.[
          "common_attributes"
        ] as Record<string, string> | undefined;
        const hdata = header["data"] as Record<string, Record<string, string>> | undefined;
        if (!attrs || !hdata) continue;
        const orderId = attrs["order_id"] ?? "";
        const deeplink = attrs["deeplink"] ?? "";
        const cartId = deeplink.match(/cart_id=(\d+)/)?.[1] ?? "";
        const dateText = hdata["subtitle"]?.["text"] ?? "";
        const date = parseBlinkitDate(dateText);
        if (date && date.getTime() < cutoff) break outer;
        listed.push({
          orderId,
          cartId,
          dateText,
          date: date?.toISOString() ?? "",
        });
      }
      cursor = data.response?.pagination?.cursor ?? null;
      if (!cursor) break;
      pageIndex += 1;
      if (pageIndex > 30) break;
    }
  } catch (e) {
    failures.push({
      platform: "blinkit",
      kind: "http",
      detail: "history failed: " + (e instanceof Error ? e.message : String(e)),
    });
  }
  logInfo("blinkit list holds " + listed.length + " orders");
  // Fetch each bill and map it to the shared schema.
  let n = 0;
  for (const o of listed) {
    n += 1;
    lineStart("Blinkit order " + n + " of " + listed.length + ": " + o.orderId);
    try {
      const res = await pageFetch(
        page,
        "https://blinkit.com/v1/layout/order_details/" +
          o.orderId +
          "?cart_id=" +
          o.cartId,
        { method: "POST", headers },
      );
      logInfo("blinkit detail " + o.orderId + " answers " + res.status);
      if (res.status !== 200) {
        failures.push({
          platform: "blinkit",
          kind: "http",
          status: res.status,
          detail: "detail failed for " + o.orderId,
        });
        lineEnd("failed.");
        continue;
      }
      const data = JSON.parse(res.text) as {
        response?: { snippets?: Array<Record<string, unknown>> };
      };
      const items: BlinkitRawOrder["items"] = [];
      const fees: BlinkitRawOrder["fees"] = [];
      let itemTotal = 0;
      let billTotal = 0;
      for (const s of data.response?.snippets ?? []) {
        if (s["widget_type"] === "z_v3_image_text_snippet_type_30") {
          const sdata = s["data"] as Record<string, Record<string, string>> | undefined;
          const t = sdata?.["subtitle3"]?.["text"] ?? "";
          const prices = [...t.matchAll(/₹\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
          if (prices.length > 0) {
            items.push({
              name: sdata?.["title"]?.["text"] ?? "Item",
              qtyText: sdata?.["subtitle1"]?.["text"] ?? "",
              unitPrice: prices[prices.length - 1],
              mrp: prices.length > 1 ? prices[0] : undefined,
            });
          }
        } else if (s["widget_type"] === "cart_bill_item") {
          const sdata = s["data"] as Record<string, Record<string, string>> | undefined;
          const label = sdata?.["left_header"]?.["text"] ?? "";
          const val = sdata?.["right_header"]?.["text"] ?? "";
          const amt = parseRs(val);
          if (label === "Item total") itemTotal = amt ?? 0;
          else if (label === "Bill total") billTotal = amt ?? 0;
          else if (amt !== null && !/FREE|discount/i.test(val)) {
            fees.push({ label, amount: amt });
          }
        }
      }
      const raw: BlinkitRawOrder = {
        orderId: o.orderId,
        cartId: o.cartId,
        amount: 0,
        dateText: o.dateText,
        date: o.date,
        items,
        fees,
        itemTotal,
        billTotal,
      };
      if (items.length === 0) {
        failures.push({
          platform: "blinkit",
          kind: "parse",
          detail: "empty bill for " + o.orderId,
        });
        const shot = await snapPage(page, "blinkit", o.orderId, shotDir);
        if (shot) shots.push(shot);
        orders.push(
          screenshotOrder("blinkit", o.orderId, o.dateText, billTotal),
        );
        lineEnd("skipped.");
        continue;
      }
      const mapped = mapBlinkit(raw);
      if (!checkBlinkit(mapped)) {
        failures.push({
          platform: "blinkit",
          kind: "parse",
          detail: "balance miss for " + o.orderId,
        });
        const shot = await snapPage(page, "blinkit", o.orderId, shotDir);
        if (shot) shots.push(shot);
        orders.push(
          screenshotOrder("blinkit", o.orderId, mapped.date, mapped.paid),
        );
        lineEnd("skipped.");
        continue;
      }
      orders.push(mapped);
      logInfo(
        "blinkit " +
          o.orderId +
          " parsed with " +
          mapped.items.length +
          " lines",
      );
      lineEnd();
    } catch (e) {
      failures.push({
        platform: "blinkit",
        kind: "parse",
        detail: "detail parse failed for " +
          o.orderId +
          ": " +
          (e instanceof Error ? e.message : String(e)),
      });
      lineEnd("failed.");
    }
  }
  if (
    listed.length > 0 &&
    orders.filter((o) => o.items[0]?.name !== SCREENSHOT_ITEM).length === 0
  ) {
    notes.push(reportZeroBills("blinkit", failures));
  }
  step("Blinkit done: " + orders.length + " orders.");
  return { orders, shots, notes };
}

// Gather Swiggy food plus Instamart orders through the mapi GETs.
async function gatherSwiggy(
  page: Page,
  days: number,
  shotDir: string,
): Promise<GatherResult> {
  const orders: Order[] = [];
  const shots: PendingShot[] = [];
  const notes: string[] = [];
  const failures: FailureEvent[] = [];
  const cutoff = cutoffMs(days);
  // Same origin fetch with page cookies. Retries once on failure.
  const getJson = async (path: string): Promise<unknown> => {
    for (let i = 0; i < 3; i++) {
      const r = await page.evaluate(async (p: string) => {
        try {
          const resp = await fetch(p, {
            headers: { accept: "application/json" },
          });
          return {
            status: resp.status,
            body: await resp.json().catch(() => null),
          };
        } catch {
          return { status: 0, body: null };
        }
      }, path);
      if (r.status === 200 && r.body) {
        // Swiggy answers 200 for a logged out session and puts the real
        // outcome in the body. statusCode 0 means the call worked.
        // Anything else is an error, and reading data.orders from it
        // silently yields zero orders, which reads as an empty account.
        const app = r.body as { statusCode?: unknown; statusMessage?: unknown };
        if (typeof app.statusCode === "number" && app.statusCode !== 0) {
          const reason = typeof app.statusMessage === "string" && app.statusMessage !== ""
            ? app.statusMessage
            : "no reason given";
          // Record it here, where the reply arrives. The caller turns it
          // into one screen line, and the log keeps the exact wording.
          logWarn(
            "swiggy " + path.split("?")[0] + " answers statusCode " +
              app.statusCode + ": " + reason,
          );
          throw new Error("swiggy says: " + reason);
        }
        return r.body;
      }
      if (isBlockedStatus(r.status)) {
        throw new Error("swiggy blocked with status " + r.status + " for " + path);
      }
      logInfo("swiggy " + path.split("?")[0] + " answers " + r.status);
      await page.waitForTimeout(3000);
    }
    throw new Error("mapi fetch failed: " + path);
  };
  // Food pages walk forward by last order id until the cutoff date.
  const foodRaw: SwiggyFoodOrder[] = [];
  try {
    let cursor = "";
    let foodEnded = false;
    let foodPastEdge = false;
    let foodPage = 0;
    const foodPaging = await pageThrough({
      limit: 20,
      isDone: () => foodEnded,
      isPastEdge: () => foodPastEdge,
      next: async () => {
        const body = (await getJson("/mapi/order/all?order_id=" + cursor)) as {
          data?: { orders?: SwiggyFoodOrder[] };
        };
        const found = body?.data?.orders ?? [];
        if (found.length === 0) {
          foodEnded = true;
          return true;
        }
        let older = false;
        for (const o of found) {
          const t = Date.parse((o.order_time ?? "").replace(" ", "T") + "+05:30");
          if (t < cutoff) {
            older = true;
            continue;
          }
          foodRaw.push(o);
        }
        foodPage += 1;
        say("Swiggy food page " + foodPage + ": " + found.length + " orders.");
        cursor = String(found[found.length - 1].order_id);
        if (older) foodPastEdge = true;
        return true;
      },
    });
    if (foodPaging.stop === "stalled") {
      failures.push({
        platform: "swiggy",
        kind: "http",
        detail: "food list stalled",
      });
    } else if (foodPaging.stop === "limit") {
      failures.push({
        platform: "swiggy",
        kind: "http",
        detail: "food list stopped at the page cap",
      });
    } else if (foodPaging.stop === "error") {
      failures.push({
        platform: "swiggy",
        kind: "http",
        detail: "food list failed: " + (foodPaging.detail ?? "unknown error"),
      });
    }
  } catch (e) {
    failures.push({
      platform: "swiggy",
      kind: "http",
      detail: "food list failed: " + (e instanceof Error ? e.message : String(e)),
    });
  }
  logInfo("swiggy food holds " + foodRaw.length + " orders");
  // Dash pages walk back in time, then each group needs its detail call.
  const dashGroups: SwiggyDashGroup[] = [];
  try {
    let fromTime = Date.now();
    let dashEnded = false;
    let dashPastEdge = false;
    let dashPage = 0;
    const dashPaging = await pageThrough({
      limit: 20,
      isDone: () => dashEnded,
      isPastEdge: () => dashPastEdge,
      next: async () => {
        const body = (await getJson(
          "/mapi/order/dash?count=10&from_time=" + fromTime + "&order_type=DASH",
        )) as { data?: { orders?: SwiggyDashGroup[] } };
        const found = body?.data?.orders ?? [];
        if (found.length === 0) {
          dashEnded = true;
          return true;
        }
        let older = false;
        for (const g of found) {
          if (Number(g.created_at) < cutoff) {
            older = true;
            continue;
          }
          dashGroups.push(g);
        }
        dashPage += 1;
        say(
          "Swiggy Instamart page " + dashPage + ": " + found.length + " orders.",
        );
        fromTime = Number(found[found.length - 1].created_at);
        if (older) dashPastEdge = true;
        return true;
      },
    });
    if (dashPaging.stop === "stalled") {
      failures.push({
        platform: "swiggy",
        kind: "http",
        detail: "dash list stalled",
      });
    } else if (dashPaging.stop === "limit") {
      failures.push({
        platform: "swiggy",
        kind: "http",
        detail: "dash list stopped at the page cap",
      });
    } else if (dashPaging.stop === "error") {
      failures.push({
        platform: "swiggy",
        kind: "http",
        detail: "dash list failed: " + (dashPaging.detail ?? "unknown error"),
      });
    }
  } catch (e) {
    failures.push({
      platform: "swiggy",
      kind: "http",
      detail: "dash list failed: " + (e instanceof Error ? e.message : String(e)),
    });
  }
  logInfo("swiggy dash holds " + dashGroups.length + " groups");
  // Map food orders straight from the list payload.
  for (const o of foodRaw) {
    try {
      const mapped = mapFoodOrder(o);
      if (!checkSwiggy(mapped)) {
        failures.push({
          platform: "swiggy",
          kind: "parse",
          detail: "balance miss for " + o.order_id,
        });
        const shot = await snapPage(
          page,
          "swiggy",
          String(o.order_id),
          shotDir,
        );
        if (shot) shots.push(shot);
        orders.push(
          screenshotOrder(
            "swiggy",
            String(o.order_id),
            mapped.date,
            mapped.paid,
          ),
        );
        continue;
      }
      orders.push(mapped);
    } catch (e) {
      failures.push({
        platform: "swiggy",
        kind: "parse",
        detail: "food map failed: " + (e instanceof Error ? e.message : String(e)),
      });
    }
  }
  // Map dash orders from each detail payload.
  let n = 0;
  for (const g of dashGroups) {
    n += 1;
    lineStart(
      "Swiggy Instamart order " +
        n +
        " of " +
        dashGroups.length +
        ": " +
        g.order_id,
    );
    try {
      const detail = (await getJson(
        "/mapi/order/v2/dash/details?order_id=" + g.order_id,
      )) as SwiggyDashDetail;
      const mapped = mapDashOrder(g, detail);
      if (!checkSwiggy(mapped)) {
        failures.push({
          platform: "swiggy",
          kind: "parse",
          detail: "balance miss for " + g.order_id,
        });
        const shot = await snapPage(
          page,
          "swiggy",
          String(g.order_id),
          shotDir,
        );
        if (shot) shots.push(shot);
        orders.push(
          screenshotOrder(
            "swiggy",
            String(g.order_id),
            mapped.date,
            mapped.paid,
          ),
        );
        lineEnd("skipped.");
        continue;
      }
      orders.push(mapped);
      logInfo(
        "swiggy " +
          g.order_id +
          " parsed with " +
          mapped.items.length +
          " lines",
      );
      lineEnd();
    } catch (e) {
      failures.push({
        platform: "swiggy",
        kind: "parse",
        detail: "dash detail failed for " +
          g.order_id +
          ": " +
          (e instanceof Error ? e.message : String(e)),
      });
      lineEnd("failed.");
    }
  }
  const listed = foodRaw.length + dashGroups.length;
  // A stale Swiggy login lists nothing at all, so the old rule below
  // stayed quiet and the run reported an empty account. Name the cause
  // first, then fall back to the zero bills report.
  const staleLogin = failures.some((event) =>
    /session expired|please login|log ?in again/i.test(event.detail ?? "")
  );
  if (staleLogin) {
    notes.push(
      "Swiggy says the session expired. Sign in to Swiggy again, then gather.",
    );
  } else if (listed === 0 && failures.length > 0) {
    notes.push(reportZeroBills("swiggy", failures));
  } else if (
    listed > 0 &&
    orders.filter((o) => o.items[0]?.name !== SCREENSHOT_ITEM).length === 0
  ) {
    notes.push(reportZeroBills("swiggy", failures));
  }
  step("Swiggy done: " + orders.length + " orders.");
  return { orders, shots, notes };
}

// Map one Zomato bill to shared item lines plus delivery fee.
function mapZomatoBill(detail: unknown): {
  items: Order["items"];
  delivery: number;
} {
  const items: Order["items"] = [];
  let delivery = 0;
  const lines = parseBill(detail);
  for (const l of lines) {
    const name = l.name;
    if (/delivery partner fee/i.test(name)) {
      delivery += l.price;
    } else if (/^gst/i.test(name)) {
      items.push({ name: "[GST]", price: l.price, quantity: l.quantity });
    } else if (/platform fee/i.test(name)) {
      items.push({ name: "[Handling]", price: l.price, quantity: l.quantity });
    } else if (/delivery partner tip/i.test(name)) {
      items.push({ name: "[Tip]", price: l.price, quantity: l.quantity });
    } else if (/coupon applied|item discount|promo/i.test(name)) {
      items.push({
        name: "[Discount]",
        price: -Math.abs(l.price),
        quantity: l.quantity,
      });
    } else if (/item total/i.test(name)) {
      continue;
    } else {
      items.push({ name, price: l.price, quantity: l.quantity });
    }
  }
  return { items, delivery };
}

// Fetch the Zomato login challenge. Shared by the terminal prompt path
// and the machine login start mode. Throws on failure.
async function loadZomatoChallenge(): Promise<LoginState> {
  return await fetchLoginChallenge();
}

// Send the Zomato one time code to the phone. Shared by the terminal
// prompt path and the machine login start mode. Throws on failure.
async function sendZomatoCode(phone: string, state: LoginState): Promise<void> {
  const sent = await sendOtp(phone, state);
  if (!sent.ok) {
    throw new Error("zomato OTP send failed with status " + sent.status);
  }
}

// Verify the code, complete consent, exchange the grant, then save the
// tokens. Shared by the terminal prompt path and the machine login
// finish mode. Returns the access token plus a display name when the
// token carries one.
async function completeZomatoLogin(
  phone: string,
  otp: string,
  state: LoginState,
): Promise<{ accessToken: string; name: string | null }> {
  const { consentUrl } = await verifyOtp(phone, otp, state);
  const grant = await completeConsent(consentUrl, state);
  const pair = await exchangeCode(grant, state);
  await saveTokens(pair.access_token, pair.refresh_token);
  return { accessToken: pair.access_token, name: nameFromToken(pair.access_token) };
}

// Read a display name from a token payload when one is present.
// Returns null for opaque tokens or unparseable payloads.
function nameFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(payload)) as Record<string, unknown>;
    for (const key of ["name", "display_name", "displayName", "username", "user_name"]) {
      const value = json[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  } catch {
    return null;
  }
}

// Gather Zomato orders headlessly through the app gateway.
async function gatherZomato(
  days: number,
  loc: ZomatoLocation,
): Promise<GatherResult> {
  const orders: Order[] = [];
  const shots: PendingShot[] = [];
  const notes: string[] = [];
  const failures: FailureEvent[] = [];
  const cutoff = cutoffMs(days);
  let token: string | null = null;
  const stored = await loadTokens();
  if (stored) token = stored.access_token;
  if (!token) {
    failures.push({
      platform: "zomato",
      kind: "http",
      status: 401,
      detail: "no stored login",
    });
    notes.push(
      "Zomato needs stored sign in for headless use. Run the wizard once to sign in.",
    );
    logWarn("zomato gather skipped without a token");
    return { orders, shots, notes };
  }
  // Page history until the cutoff date or the last page.
  const skeletons: HistorySkeleton[] = [];
  try {
    let postback = "";
    let zomEnded = false;
    let zomPastEdge = false;
    let zomPage = 0;
    const zomPaging = await pageThrough({
      limit: 30,
      isDone: () => zomEnded,
      isPastEdge: () => zomPastEdge,
      next: async () => {
        const raw: unknown = await fetchHistoryPage(token, postback || undefined, loc);
        const parsed = parseHistoryPage(raw);
        let older = false;
        for (const s of parsed.orders) {
          try {
            if (Date.parse(parseZomatoDate(s.date)) < cutoff) {
              older = true;
              continue;
            }
          } catch {
            // Keep cards with odd dates and let detail decide.
          }
          skeletons.push(s);
        }
        postback = parsed.postback;
        zomPage += 1;
        say(
          "Zomato history page " +
            zomPage +
            ": " +
            parsed.orders.length +
            " orders.",
        );
        logInfo(
          "zomato history page " +
            zomPage +
            " holds " +
            parsed.orders.length +
            " cards",
        );
        if (!parsed.hasMore) zomEnded = true;
        if (older) zomPastEdge = true;
        return true;
      },
    });
    if (zomPaging.stop === "stalled") {
      failures.push({
        platform: "zomato",
        kind: "http",
        detail: "history page stalled",
      });
    } else if (zomPaging.stop === "limit") {
      failures.push({
        platform: "zomato",
        kind: "http",
        detail: "history stopped at the page cap",
      });
    } else if (zomPaging.stop === "error") {
      const msg = zomPaging.detail ?? "";
      const status = msg.match(/status (\d+)/)?.[1];
      failures.push({
        platform: "zomato",
        kind: "http",
        status: status ? parseInt(status, 10) : undefined,
        detail: "history page failed",
      });
      logError("zomato history stopped: " + msg);
    }
  } catch (e) {
    logError(
      "zomato history stopped: " + (e instanceof Error ? e.message : String(e)),
    );
  }
  // Fetch each bill and map it to the shared schema.
  let n = 0;
  for (const skel of skeletons) {
    n += 1;
    lineStart(
      "Zomato order " +
        n +
        " of " +
        skeletons.length +
        ": " +
        skel.restaurant,
    );
    try {
      const detail = await fetchOrderDetail(token, skel.orderId);
      const mapped = mapHistoryOrder(skel);
      const bill = mapZomatoBill(detail);
      mapped.fees.delivery += bill.delivery;
      for (const item of bill.items) mapped.items.push(item);
      const sum = mapped.items.reduce((s, i) => s + i.price * i.quantity, 0) +
        mapped.fees.delivery +
        mapped.fees.packaging;
      if (Math.abs(sum - mapped.paid) >= 0.01) {
        failures.push({
          platform: "zomato",
          kind: "parse",
          detail: "balance miss for " + skel.orderId,
        });
        logWarn("zomato " + skel.orderId + " misses balance, skipped");
        lineEnd("skipped.");
        continue;
      }
      orders.push(mapped);
      logInfo(
        "zomato " +
          skel.orderId +
          " parsed with " +
          mapped.items.length +
          " lines",
      );
      lineEnd();
    } catch (e) {
      failures.push({
        platform: "zomato",
        kind: "parse",
        detail: "bill parse failed for " +
          skel.orderId +
          ": " +
          (e instanceof Error ? e.message : String(e)),
      });
      logWarn("zomato " + skel.orderId + " bill unreadable, skipped");
      lineEnd("failed.");
    }
  }
  if (skeletons.length > 0 && orders.length === 0) {
    notes.push(reportZeroBills("zomato", failures));
  }
  step("Zomato done: " + orders.length + " orders.");
  return { orders, shots, notes };
}

// Return the site URL for one browser platform.
function platformSiteUrl(platform: "zepto" | "blinkit" | "swiggy"): string {
  return platform === "zepto"
    ? "https://www.zepto.com"
    : platform === "blinkit"
    ? "https://blinkit.com"
    : "https://www.swiggy.com/";
}

// Build the sign in setup for one browser platform: site URL, sign in
// check, and loginWait options. One helper owns the Zepto order watcher
// so both the wizard and the machine login mode share it.
function browserLoginSetup(
  platform: "zepto" | "blinkit" | "swiggy",
): {
  siteUrl: string;
  check: (page: Page) => Promise<boolean>;
  opts: {
    verifyUrl?: string;
    verifyWaitMs?: number;
    onPage?: (page: Page) => void;
  };
  cleanup: () => void;
} {
  const siteUrl = platformSiteUrl(platform);
  // Zepto detection harvests the site's own order-list 200 through a
  // response watcher owned by this setup. Detached when the stage ends.
  const watcherBox: { current: OrderWatcher | null } = { current: null };
  const check = platform === "zepto"
    // The watcher owns detection: it turns true when the site's own
    // order call answers 200. Attached through onPage below.
    // deno-lint-ignore require-await -- loginWait takes a promise check, so this keeps async.
    ? async (): Promise<boolean> => watcherBox.current?.seen() ?? false
    : platform === "blinkit"
    ? blinkitCheck
    : swiggyCheck;
  const opts = platform === "zepto"
    ? {
      onPage: (page: Page) => {
        watcherBox.current = attachOrderWatcher(page);
      },
      // The orders page fires the order call on its own load, so a
      // saved login shows up without any direct API calls.
      verifyUrl: "https://www.zepto.com/account/orders",
      verifyWaitMs: 15000,
    }
    : {};
  const cleanup = () => {
    // Gathering captures its own responses; the login watcher retires.
    watcherBox.current?.detach();
    watcherBox.current = null;
  };
  return { siteUrl, check, opts, cleanup };
}

// Gather one browser platform with the saved login, then scrape it headless.
async function gatherBrowserPlatform(
  platform: "zepto" | "blinkit" | "swiggy",
  days: number,
  shotDir: string,
): Promise<GatherResult> {
  const siteUrl = platformSiteUrl(platform);
  logInfo(platform + " gather starts for " + days + " days");
  logInfo(platform + " fetches with the saved login");
  // Reopen the same profile headless for the scrape. The headed login
  // phase already closed, so the profile lock is free.
  step("Opening " + platform + " headless for the scrape.");
  const session = await openSite(platform, siteUrl, "scrape");
  try {
    // The scrape phase opens on about:blank, because the app window URL
    // belongs to the headed login phase alone. Load the site before any
    // gather step runs. Both failure modes come from the missing origin:
    // Blinkit reads its access token out of localStorage, which is empty
    // on about:blank, and Swiggy fetches relative paths, which cannot
    // resolve there. Each one then reports zero orders and hides the
    // cause. Zepto escaped it only because it navigates on its own.
    await session.page.goto(siteUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    // Let the app settle so it writes its storage before the first read.
    await session.page.waitForTimeout(2000);
    if (platform === "zepto") {
      return await gatherZepto(session.page, days, shotDir);
    }
    if (platform === "blinkit") {
      return await gatherBlinkit(session.page, days, shotDir);
    }
    return await gatherSwiggy(session.page, days, shotDir);
  } finally {
    // The window closes itself when the flow finishes.
    await session.close().catch(() => {});
    logInfo(platform + " window closed");
  }
}

// Write orders plus manifest to a fresh run dir. Returns run id and dir.
async function writeRun(
  label: string,
  platforms: string[],
  days: number,
  intoId?: string,
): Promise<{ id: string; dir: string }> {
  if (intoId !== undefined && intoId !== null && intoId !== "") {
    return await appendRun(label, platforms, days, intoId);
  }
  const { id, dir } = await createRun(
    label,
    platforms,
    days,
    LOG ? LOG.path : "",
  );
  await Deno.writeTextFile(
    dir + "/orders.json",
    JSON.stringify(bag.orders, null, 2) + "\n",
  );
  // Copy screenshots into the run dir beside the orders.
  const manifest: Array<{ order: string; file: string }> = [];
  let shotNo = 0;
  for (const shot of bag.shots) {
    shotNo += 1;
    const file = shot.platform + "-" + shotNo + ".png";
    try {
      await Deno.copyFile(shot.tempPath, dir + "/" + file);
      manifest.push({ order: shot.orderId, file });
    } catch (e) {
      logWarn(
        "shot copy failed: " + (e instanceof Error ? e.message : String(e)),
      );
    }
  }
  if (manifest.length > 0) {
    await Deno.writeTextFile(
      dir + "/" + SHOT_MANIFEST,
      JSON.stringify(manifest, null, 2) + "\n",
    );
  }
  // Note screenshots and split later flags in the run meta.
  const metaRaw = await Deno.readTextFile(dir + "/meta.json");
  const meta = JSON.parse(metaRaw) as Record<string, unknown>;
  if (manifest.length > 0) meta["screenshots"] = manifest;
  if (bag.splitLater.length > 0) meta["splitLater"] = bag.splitLater;
  await Deno.writeTextFile(
    dir + "/meta.json",
    JSON.stringify(meta, null, 2) + "\n",
  );
  for (const platform of platforms) {
    bag.counts[platform] = bag.orders.filter(
      (o) => o.platform === platform,
    ).length;
  }
  logInfo("run " + id + " holds " + bag.orders.length + " orders");
  if (LOG) LOG.close("gathered " + bag.orders.length + " orders into " + id);
  return { id, dir };
}

// Append orders plus manifest to a shared run dir. Returns run id and dir.
async function appendRun(
  label: string,
  platforms: string[],
  days: number,
  intoId: string,
): Promise<{ id: string; dir: string }> {
  const { dir } = await ensureRun(
    intoId,
    label,
    platforms,
    days,
    LOG ? LOG.path : "",
  );
  const id = intoId;
  // Read the stored orders. A missing file counts as empty.
  let merged: Order[] = [];
  try {
    const raw = await Deno.readTextFile(dir + "/orders.json");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) merged = parsed as Order[];
  } catch {
    merged = [];
  }
  // Append only orders the list does not already hold.
  for (const order of bag.orders) {
    const seen = merged.some(
      (m) => m.platform === order.platform && m.id === order.id,
    );
    if (!seen) merged.push(order);
  }
  await Deno.writeTextFile(
    dir + "/orders.json",
    JSON.stringify(merged, null, 2) + "\n",
  );
  // Read the stored screenshot manifest. A missing file counts as empty.
  let manifest: Array<{ order: string; file: string }> = [];
  try {
    const raw = await Deno.readTextFile(dir + "/" + SHOT_MANIFEST);
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      manifest = parsed as Array<{ order: string; file: string }>;
    }
  } catch {
    manifest = [];
  }
  // Number new files after the stored count, so no name collides.
  let shotNo = manifest.length;
  for (const shot of bag.shots) {
    shotNo += 1;
    const file = shot.platform + "-" + shotNo + ".png";
    try {
      await Deno.copyFile(shot.tempPath, dir + "/" + file);
      manifest.push({ order: shot.orderId, file });
    } catch (e) {
      logWarn(
        "shot copy failed: " + (e instanceof Error ? e.message : String(e)),
      );
    }
  }
  if (manifest.length > 0) {
    await Deno.writeTextFile(
      dir + "/" + SHOT_MANIFEST,
      JSON.stringify(manifest, null, 2) + "\n",
    );
  }
  // Note screenshots and split later flags in the run meta.
  const metaRaw = await Deno.readTextFile(dir + "/meta.json");
  const meta = JSON.parse(metaRaw) as Record<string, unknown>;
  if (manifest.length > 0) meta["screenshots"] = manifest;
  if (bag.splitLater.length > 0) meta["splitLater"] = bag.splitLater;
  await Deno.writeTextFile(
    dir + "/meta.json",
    JSON.stringify(meta, null, 2) + "\n",
  );
  for (const platform of platforms) {
    bag.counts[platform] = merged.filter(
      (o) => o.platform === platform,
    ).length;
  }
  logInfo("run " + id + " holds " + merged.length + " orders");
  if (LOG) LOG.close("gathered " + merged.length + " orders into " + id);
  return { id, dir };
}

// Build the machine readable emit block for one finished run.
function emitBlock(
  id: string,
  dir: string,
  days: number,
): Record<string, unknown> {
  const from = new Date(cutoffMs(days)).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  return {
    runId: id,
    runDir: dir,
    ordersFile: dir + "/orders.json",
    logFile: LOG ? LOG.path : "",
    rangeDays: days,
    dateRange: { from, to },
    platforms: bag.counts,
    screenshots: bag.shots.map((s, i) => s.platform + "-" + (i + 1) + ".png"),
    notes: [...bag.notes],
  };
}

// Build the assignment prompt that tells an agent how to split the run.
async function assignmentPrompt(dir: string): Promise<string> {
  const people = await readPeople();
  const ordersFile = dir + "/orders.json";
  const lines = [
    "Split the gathered orders into output.json.",
    "Read docs/schema.md for the output.json format.",
    people.length > 0
      ? "Split between these people: " + people.join(", ") + "."
      : "Ask the user who shares the cost, then list them as people.",
    "Write the result to " + dir + "/output.json.",
    "Check the file from the repo root with this command:",
    "deno run --no-lock --allow-read scripts/validate.ts " +
    dir +
    "/output.json --orders " +
    ordersFile,
    "Fix every FAIL line the validator prints.",
  ];
  return lines.join("\n");
}

// Emit mode: no prompts, one JSON block plus the assignment prompt.
async function runEmit(): Promise<void> {
  const platforms = parsePlatforms(flagValue("platforms"), [
    "zepto",
    "blinkit",
    "zomato",
    "swiggy",
    "manual",
  ]);
  const days = parseDays(flagValue("days"), 30);
  const intoId = flagValue("into");
  LOG = createRunLog("gather");
  logInfo(
    "emit prompt starts for " + platforms.join(",") + " over " + days + " days",
  );
  const shotDir = await Deno.makeTempDir();
  try {
    for (const platform of platforms) {
      try {
        if (platform === "manual") {
          bag.counts["manual"] = 0;
          continue;
        }
        if (platform === "zomato") {
          const loc = (await loadLocation()) ?? DEFAULT_LOCATION;
          const res = await gatherZomato(days, loc);
          bag.orders.push(...res.orders);
          bag.notes.push(...res.notes);
          for (const note of res.notes) logInfo("zomato note: " + note);
          continue;
        }
        const res = await gatherBrowserPlatform(platform, days, shotDir);
        bag.orders.push(...res.orders);
        bag.shots.push(...res.shots);
        bag.notes.push(...res.notes);
      } catch (e) {
        const msg = platform +
          " headless gather failed: " +
          (e instanceof Error ? e.message : String(e));
        logError(msg);
        bag.notes.push(msg);
      }
    }
    const label = platforms.length === 1 ? platforms[0] : "multi";
    const { id, dir } = await writeRun(
      label,
      platforms,
      days,
      intoId ?? undefined,
    );
    // The agent block serves AI mode only. Human modes get the plain
    // summary: the emit JSON means nothing outside an agent chat.
    const { usage } = await loadSettings();
    if (usage === "ai") {
      console.log(JSON.stringify(emitBlock(id, dir, days), null, 2));
      console.log("");
      console.log(await assignmentPrompt(dir));
    } else {
      summary(id, days);
    }
  } finally {
    try {
      await Deno.remove(shotDir, { recursive: true });
    } catch {
      // Temp cleanup must never fail the run.
    }
  }
}

// Machine mode: start the Zomato phone login without prompts.
// Reads --phone, sends the one time code, then exits. Each path
// prints one human sentence on stdout for the action panel.
async function runZomatoLoginStart(): Promise<void> {
  const phone = (flagValue("phone") ?? "").trim();
  if (phone.replace(/\D/g, "").length < 10) {
    logError("zomato machine login start missed the phone");
    console.log(
      "Could not send the code: Add the phone flag with the account phone number, then try again.",
    );
    Deno.exit(1);
  }
  try {
    const state = await loadZomatoChallenge();
    await sendZomatoCode(phone, state);
  } catch {
    logError("zomato machine login start failed");
    console.log(
      "Could not send the code: Check the connection, then try again.",
    );
    Deno.exit(1);
  }
  logInfo("zomato machine login started");
  console.log("Code sent. Type the code below, then press Verify the code.");
  Deno.exit(0);
}

// Machine mode: finish the Zomato phone login without prompts.
// Reads --phone and --otp, saves the tokens, then exits. Each path
// prints one human sentence on stdout for the action panel.
async function runZomatoLoginFinish(): Promise<void> {
  const otp = (flagValue("otp") ?? "").trim();
  if (!otp) {
    logError("zomato machine login finish missed the code");
    console.log(
      "That code did not work: Add the otp flag with the code Zomato sent, then try again.",
    );
    Deno.exit(1);
  }
  const phone = (flagValue("phone") ?? "").trim();
  if (phone.replace(/\D/g, "").length < 10) {
    logError("zomato machine login finish missed the phone");
    console.log(
      "That code did not work: Add the phone flag with the account phone number, then try again.",
    );
    Deno.exit(1);
  }
  const state = await loadLoginState();
  if (!state) {
    logError("zomato machine login finish missed the saved start");
    console.log(
      "That code did not work: No login start found. Run the start step first, then try again.",
    );
    Deno.exit(1);
  }
  try {
    const done = await completeZomatoLogin(phone, otp, state);
    logInfo("zomato machine login finished");
    if (done.name) {
      console.log("Signed in to Zomato as " + done.name + ".");
    } else {
      console.log("Signed in to Zomato.");
    }
  } catch {
    logError("zomato machine login finish failed");
    console.log(
      "That code did not work: Run the start step again for a new code, then try again.",
    );
    Deno.exit(1);
  }
  Deno.exit(0);
}

// Machine mode: save the Zomato city without prompts.
// Reads --code, --name, --lat, and --lon, then exits. Each path
// prints one human sentence on stdout for the action panel.
async function runZomatoCity(): Promise<void> {
  const code = (flagValue("code") ?? "").trim();
  const name = (flagValue("name") ?? "").trim();
  const lat = (flagValue("lat") ?? "").trim();
  const lon = (flagValue("lon") ?? "").trim();
  if (!code || !name || !lat || !lon) {
    logError("zomato machine city missed a value");
    console.log(
      "Could not save the city: Add the code, name, lat, and lon flags, then try again.",
    );
    Deno.exit(1);
  }
  if (
    !/^\d+$/.test(code) ||
    !Number.isFinite(parseFloat(lat)) ||
    !Number.isFinite(parseFloat(lon))
  ) {
    logError("zomato machine city got a bad value");
    console.log(
      "Could not save the city: Check the code, lat, and lon flags hold plain numbers, then try again.",
    );
    Deno.exit(1);
  }
  const loc: ZomatoLocation = { city: name, lat, long: lon, cityId: code };
  try {
    await saveLocation(loc);
  } catch {
    logError("zomato machine city save failed");
    console.log(
      "Could not save the city: Check the state dir, then try again.",
    );
    Deno.exit(1);
  }
  logInfo("zomato location saved: " + loc.city);
  console.log("City saved: " + loc.city + ".");
  Deno.exit(0);
}

// Machine mode: sign in to one browser platform without prompts.
// Reads --login, opens the sign in window, waits, saves the profile,
// then exits. Each path prints one human sentence on stdout.
function loginFlag(): string | undefined {
  const args = Deno.args;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--login=")) return arg.slice("--login=".length);
    if (arg === "--login") {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) return "";
      return next;
    }
  }
  return undefined;
}

async function runBrowserLogin(raw: string): Promise<void> {
  const id = raw.trim().toLowerCase();
  if (id !== "zepto" && id !== "blinkit" && id !== "swiggy") {
    console.log("Pick a platform to sign in to: zepto, blinkit, or swiggy.");
    wizardExit(1);
  }
  const platform = id as "zepto" | "blinkit" | "swiggy";
  const display = platform === "zepto" ? "Zepto" : platform === "blinkit" ? "Blinkit" : "Swiggy";
  const setup = browserLoginSetup(platform);
  try {
    await loginWait(platform, setup.siteUrl, setup.check, setup.opts);
  } catch (e) {
    setup.cleanup();
    let reason = e instanceof Error ? e.message : String(e);
    reason = reason.replace(/https?:\S+/g, "the page");
    reason = reason.replace(/\s+/g, " ").trim();
    if (!reason) reason = "sign in was not seen";
    if (!reason.endsWith(".")) reason = reason + ".";
    logError("browser machine login failed: " + platform);
    console.log("Sign in did not finish: " + reason);
    wizardExit(1);
  }
  setup.cleanup();
  logInfo("browser machine login done: " + platform);
  console.log("Signed in to " + display + ". Press Next to carry on.");
  wizardExit(0);
}

// Plain summary after the run dir lands on disk.
function summary(id: string, days: number): void {
  const total = bag.orders.length;
  const shotOrders = bag.orders.filter(
    (o) => o.items[0]?.name === SCREENSHOT_ITEM,
  );
  const rows: string[] = [];
  for (const [platform, count] of Object.entries(bag.counts)) {
    if (count > 0) rows.push(count + " from " + platform);
  }
  if (shotOrders.length > 0) {
    rows.push(
      shotOrders.length +
        " orders hold screenshots only. The splitter marks them.",
    );
  }
  console.log(
    renderTree(
      "Saved " + total + " orders from the last " + days + " days.",
      rows,
    ),
  );
  logInfo("run " + id + " holds " + total + " orders");
  for (const note of bag.notes) say(note);
}

// Read the emit mode without eating the next flag: bare --emit means
// prompt, --emit=x names a mode. flagValue would mistake the arg after
// a bare --emit for its value.
function emitMode(): string | null {
  for (const arg of Deno.args) {
    if (arg === "--emit") return "prompt";
    if (arg.startsWith("--emit=")) return arg.slice("--emit=".length);
  }
  return null;
}

const emit = emitMode();
if (emit !== null) {
  if (emit !== "prompt") {
    console.error("Unknown emit mode: " + emit);
    wizardExit(1);
  }
  await runEmit();
  wizardExit(0);
}

if (hasFlag("zomato-login-start")) {
  await runZomatoLoginStart();
}

if (hasFlag("zomato-login-finish")) {
  await runZomatoLoginFinish();
}

if (hasFlag("zomato-city")) {
  await runZomatoCity();
}

const login = loginFlag();
if (login !== undefined) {
  await runBrowserLogin(login);
}

// No machine mode matched. Print the modes and stop.
console.log("This tool runs from the browser app.");
console.log("Pick one mode:");
console.log("  --emit                  collect orders and write a run dir");
console.log("  --login=<platform>      sign in to zepto, blinkit, or swiggy");
console.log("  --zomato-login-start    send the Zomato code");
console.log("  --zomato-login-finish   save the Zomato tokens");
console.log("  --zomato-city           save the Zomato city");
wizardExit(1);
