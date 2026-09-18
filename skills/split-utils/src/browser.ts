/// <reference lib="dom" />
// The reference above is needed because a few helpers below pass a
// callback to page.evaluate. That callback runs inside the browser, so
// it reads document and the window globals. This file used to type
// check only by luck: another module in the same run happened to pull
// the DOM types in, and the moment it was checked on its own it failed.
//
// Shared, stateless browser helpers for the delivery-site gatherers.
// Every function takes the page/context it operates on; no module state.
// Site-specific knowledge (auth header names, API paths) stays in each
// site module; only the mechanics live here.

import { type BrowserContext, chromium, type Page } from "npm:playwright@1.57.0";

// THERE IS NO DEFAULT BINARY PATH, deliberately. This module used to export
// DEFAULT_CHROMIUM, a hardcoded "/home/sid/.cache/ms-playwright/..." path
// whose own comment called it "fixed path for prototyping". It shipped, and a
// user on Windows met it as a launch failure naming a stranger's home
// directory. Any constant naming one machine's filesystem is wrong for every
// other machine, so the fallback is Playwright's own bundled build, which is
// reached by passing NO executablePath at all.

/**
 * The binary strategies this session will try, in order. Pure, so the rule can
 * be tested without launching a browser: the defect this replaced shipped past
 * a 334-test suite precisely because the decision lived inside a launch call
 * that no test could reach.
 *
 * "bundled" means Playwright's own download, selected by passing no
 * executablePath. It is ALWAYS last and always present, because it is the only
 * strategy that needs nothing configured on the machine.
 */
export function binaryOrder(
  opts: Pick<SessionOptions, "executablePath" | "channel">,
): ("explicit" | "channel" | "bundled")[] {
  if (opts.executablePath !== undefined) return ["explicit"];
  if (opts.channel !== undefined) return ["channel", "bundled"];
  return ["bundled"];
}

/**
 * The binary-selection half of the launch options, merged BEFORE any caller
 * override. Pure, so the chain can be tested and not only the order.
 *
 * Only set executablePath when the caller named one: omitting the key is what
 * selects the bundled build. The old code passed a fallback constant here,
 * which silently overrode a resolver that had correctly answered "not found".
 *
 * THIS IS SEPARATE FROM binaryOrder ON PURPOSE. binaryOrder says what WILL be
 * tried. This says what one attempt actually CARRIES. A review found the two
 * disagreeing: the order promised "channel, then bundled" while the chain sent
 * the channel twice, because the bundled retry passed an empty override and
 * these base options survived it. Keeping both pure lets a test hold them
 * against each other instead of trusting that they agree.
 */
export function binaryOptions(
  opts: Pick<SessionOptions, "executablePath" | "channel">,
): Record<string, unknown> {
  if (opts.executablePath !== undefined) {
    return { executablePath: opts.executablePath };
  }
  if (opts.channel !== undefined) return { channel: opts.channel };
  return {};
}

/**
 * The override the BUNDLED attempt must send. Both keys are present and both
 * are undefined, which removes them from the merged options: `extra` spreads
 * LAST inside the launch helper, so an EMPTY override leaves the base options
 * intact and a branded channel survives into the retry.
 *
 * It is a function rather than a literal at the call site so a test can hold
 * the chain to it. A behavioural test cannot see this defect: the wrong
 * override still merges to a valid object, and the difference appears only
 * against a real browser on a machine without the branded channel. So the pin
 * is that the chain CALLS THIS, checked in the source.
 */
export function bundledOptions(): Record<string, unknown> {
  return { channel: undefined, executablePath: undefined };
}

export interface SessionOptions {
  profileDir: string;
  headless?: boolean;
  /** Compact window with no tab bar: launched as Chromium --app=<url>. */
  appUrl?: string;
  /** Mobile-only surfaces (Swiggy) need a mobile UA. */
  userAgent?: string;
  viewport?: { width: number; height: number };
  /** OS window size for headed --app windows. Matches viewport by default. */
  windowSize?: { width: number; height: number };
  /** Force the render scale (desktop HiDPI fix). Never use with mobile. */
  forceScaleFactor?: number;
  /** Full mobile emulation: mobile viewport, touch, devicePixelRatio. */
  mobile?: boolean;
  deviceScaleFactor?: number;
  geolocation?: { latitude: number; longitude: number };
  permissions?: string[];
  executablePath?: string;
  /**
   * Branded browser to launch, for example "chrome". Used only when
   * executablePath misses. A miss at launch falls back to the bundled
   * build instead of failing: channel "chrome" finds real Google
   * Chrome on Windows and macOS, where no distro path exists.
   */
  channel?: string;
  /** Set false to keep navigator.webdriver === true (debugging). */
  maskWebdriver?: boolean;
}

export interface Session {
  ctx: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export async function openSession(opts: SessionOptions): Promise<Session> {
  // Collect launch args first so app mode and UA flags combine.
  const args: string[] = [];
  // Compact --app mode shows the site with no tab bar.
  if (opts.appUrl) args.push(`--app=${opts.appUrl}`);
  if (opts.userAgent) args.push(`--user-agent=${opts.userAgent}`);
  // Pin the OS window size: headed --app windows otherwise open huge,
  // and HiDPI displays scale them up on top of that.
  if (opts.windowSize) {
    args.push(
      `--window-size=${opts.windowSize.width},${opts.windowSize.height}`,
    );
  }
  if (opts.forceScaleFactor !== undefined) {
    args.push(`--force-device-scale-factor=${opts.forceScaleFactor}`);
  }
  const launch = (extra: Record<string, unknown>) =>
    chromium.launchPersistentContext(opts.profileDir, {
      headless: opts.headless ?? false,
      userAgent: opts.userAgent,
      // Browser-level UA matters alongside the context override: Chromium
      // derives its sec-CH-UA client hints from this flag, so a mobile UA
      // set only at context level claims Android while the hints still
      // say the real desktop platform. Bot managers (AWS WAF on Swiggy)
      // reject that mismatch. Context override keeps navigator.userAgent
      // in sync with the flag.
      ...(args.length > 0 ? { args } : {}),
      viewport: opts.viewport ?? { width: 1280, height: 900 },
      // A phone UA without mobile emulation is a bot-manager giveaway:
      // the page claims Android while touch, maxTouchPoints and the
      // mobile viewport all report a desktop. AWS WAF on Swiggy scores
      // exactly that mismatch.
      ...(opts.mobile
        ? {
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: opts.deviceScaleFactor ?? 2.625,
        }
        : {}),
      ...binaryOptions(opts),
      ...(opts.geolocation
        ? {
          permissions: opts.permissions ?? ["geolocation"],
          geolocation: opts.geolocation,
        }
        : {}),
      ...extra,
    });
  // Binary order: explicit path first, branded channel next, bundled build
  // last. The comment said exactly this before, and the code did not do it:
  // both "fallback" branches launched a hardcoded Linux path instead of the
  // bundled build, so the promise that "Windows and macOS without Chrome keep
  // working" was false for the one case it named. Launching with NO
  // executablePath is what uses Playwright's own download, and it is the only
  // branch that can work on a machine nobody configured.
  const bundled = async () => {
    try {
      // BOTH KEYS MUST BE CLEARED HERE, and the first version of this fix did
      // not clear them. `extra` spreads LAST inside launch(), so an empty
      // object leaves the base options intact, and the base sets `channel`
      // whenever opts.channel is present. `launch({})` therefore retried the
      // same missing branded browser and never reached the bundled build, on
      // exactly the Windows-without-Chrome path this function exists to save.
      // The order function said "channel, then bundled" while the chain did
      // "channel, then channel" -- prose promising what the code did not do,
      // which is the defect this whole ticket was about, reproduced inside its
      // own fix. Passing undefined removes the key, which is what selects
      // Playwright's own download.
      return await launch(bundledOptions());
    } catch (err) {
      // Criterion 5: say what was tried and what to install. The old failure
      // named a path the user had never heard of, on a machine that could
      // never have had it.
      const tried = binaryOrder(opts).join(", then ");
      throw new Error(
        `No usable Chromium. Tried: ${tried}. The last step uses Playwright's ` +
          `own browser, which is installed with \`deno run -A npm:playwright install chromium\`. ` +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
  let ctx;
  if (opts.executablePath !== undefined) {
    ctx = await launch({ executablePath: opts.executablePath });
  } else if (opts.channel !== undefined) {
    try {
      ctx = await launch({ channel: opts.channel });
    } catch {
      ctx = await bundled();
    }
  } else {
    ctx = await bundled();
  }
  if (opts.maskWebdriver !== false) {
    // Playwright leaves navigator.webdriver === true; every bot
    // manager reads it first. Mask before any site script runs.
    await ctx.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", {
        get: () => false,
        configurable: true,
      });
    });
  }
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  // Headless Chromium announces itself in the user agent, as
  // "HeadlessChrome/151" instead of "Chrome/151", and in its client
  // hint brands. Zepto answers that token with HTTP 429, which reads
  // as a rate limit but never clears. Rewrite both before the first
  // navigation. An explicit userAgent already carries no such token.
  if ((opts.headless ?? false) && opts.userAgent === undefined) {
    const real = await page
      .evaluate(() => navigator.userAgent)
      .catch(() => "");
    if (isHeadlessUa(real)) {
      try {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Network.setUserAgentOverride", {
          userAgent: stripHeadlessUa(real),
          userAgentMetadata: uaMetadata(real, opts.mobile === true),
        });
      } catch {
        // An override miss leaves the default agent. The site may
        // refuse it, and the caller reports that refusal out loud.
      }
    }
  }
  return { ctx, page, close: () => ctx.close() };
}

/** True when a user agent carries the headless brand token. */
export function isHeadlessUa(ua: string): boolean {
  return ua.includes("HeadlessChrome");
}

/** Swap the headless brand token for the plain browser one. */
export function stripHeadlessUa(ua: string): string {
  return ua.replace(/HeadlessChrome/g, "Chrome");
}

/** Major browser version from a user agent, empty when it misses. */
export function uaMajorVersion(ua: string): string {
  const found = /Chrome\/(\d+)/.exec(stripHeadlessUa(ua));
  return found === null ? "" : found[1];
}

/** Platform name for client hints, read from the user agent. */
export function uaPlatform(ua: string): string {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS X")) return "macOS";
  if (ua.includes("Android")) return "Android";
  return "Linux";
}

/** One sec-ch-ua brand pair. */
export interface UaBrand {
  brand: string;
  version: string;
}

/** Client hint metadata, in the shape the CDP override takes. */
export interface UaMetadata {
  brands: UaBrand[];
  fullVersion: string;
  platform: string;
  platformVersion: string;
  architecture: string;
  model: string;
  mobile: boolean;
}

/**
 * Client hint metadata matching a sanitized agent. Chromium derives
 * sec-ch-ua from these brands, so a fixed agent with headless brands
 * still fails a bot check that compares the two.
 */
export function uaMetadata(ua: string, mobile: boolean): UaMetadata {
  const major = uaMajorVersion(ua);
  return {
    brands: [
      { brand: "Chromium", version: major },
      { brand: "Google Chrome", version: major },
      { brand: "Not=A?Brand", version: "24" },
    ],
    fullVersion: major + ".0.0.0",
    platform: uaPlatform(ua),
    platformVersion: "",
    architecture: "x86",
    model: "",
    mobile,
  };
}

export interface WaitOptions {
  /** Default 15 minutes (login pauses). */
  timeoutMs?: number;
  /** Default 2s. */
  pollMs?: number;
  /** Runs once per poll tick so waiters can show progress. */
  onTick?: () => void;
}

/**
 * Poll a page predicate until true or timeout. Predicates run inside
 * try/catch: page navigations routinely make evaluate() throw transiently.
 * Returns false on timeout — callers decide how to fail.
 */
export async function waitFor(
  _page: Page,
  predicate: () => Promise<boolean>,
  opts: WaitOptions = {},
): Promise<boolean> {
  const deadline = Date.now() + (opts.timeoutMs ?? 900_000);
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return true;
    } catch {
      // page navigating mid-evaluate; retry on the next tick
    }
    opts.onTick?.();
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 2000));
  }
  return false;
}

export interface RecorderOptions {
  outDir: string;
  /** Only URLs matching this are saved. Default: everything. */
  urlFilter?: RegExp;
  /** Only matching saved URLs are logged; everything is still saved. */
  logFilter?: RegExp;
  /** Skip saving analytics noise. Applied before urlFilter. */
  skipFilter?: RegExp;
}

export interface Recorder {
  count(): number;
}

export interface PageFetchResult {
  status: number;
  text: string;
}

/** Fetch a URL from inside the page (same-origin cookies apply). */
export async function pageFetch(
  page: Page,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<PageFetchResult> {
  return await page.evaluate(
    async ({ u, i }) => {
      const r = await fetch(u, i);
      return { status: r.status, text: await r.text() };
    },
    { u: url, i: init },
  );
}

/** Parse a page JSON response body; throws with status context on bad JSON. */
export async function pageFetchJson(
  page: Page,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<unknown> {
  const res = await pageFetch(page, url, init);
  if (res.status !== 200) {
    throw new Error(`${url} -> ${res.status}: ${res.text.slice(0, 120)}`);
  }
  return JSON.parse(res.text);
}

export interface StorageDump {
  localStorage: Record<string, string>;
  cookieNames: string[];
}

// A refused answer with the request URL. Callers use it to report blocks.
export interface BlockedStatus {
  status: number;
  url: string;
}

// Bot wall answers. A caller must never read one as an empty result.
const BLOCKED_STATUSES = new Set([401, 403, 407, 418, 429, 503]);

/**
 * True when the status means a bot wall refused the request.
 * The trap it closes is a block that reads as an empty list.
 */
export function isBlockedStatus(status: number): boolean {
  return BLOCKED_STATUSES.has(status);
}

// Why a paging loop stopped.
export type PageStop = "end" | "edge" | "stalled" | "limit" | "error";

// One paging loop expressed as data. next lands one more page.
export interface PageThroughOptions {
  next: () => Promise<boolean>;
  isDone: () => boolean;
  isPastEdge?: () => boolean;
  limit?: number;
  onPage?: (page: number) => void;
}

// Page count plus the stop reason. detail carries the error text.
export interface PageThroughResult {
  pages: number;
  stop: PageStop;
  detail?: string;
}

/**
 * Read the next history page URL a Blinkit-style layout response offers (#189).
 *
 * The server answers each page with `response.pagination.next_url`: a ready
 * made RELATIVE url carrying the cursor, the limit, the page index and the
 * running entity count. Following it is strictly better than rebuilding the
 * query by hand, which is what the caller used to do with a hardcoded limit
 * and its own page arithmetic while reading a `cursor` key the server never
 * sends. The result was one page of ten orders reported as a complete run.
 *
 * Returns null when no next page is offered, which is the honest end of a
 * history. The CALLER decides whether that end is expected: reaching the date
 * cutoff is a normal stop, and running out of pages before the cutoff means
 * orders are missing and must be reported.
 *
 * IT LIVES HERE, BESIDE pageThrough, RATHER THAN IN THE GATHERER, because
 * scripts/gatherer.ts is an ENTRY POINT: it runs at import and calls
 * Deno.exit(1) without a mode flag, so nothing inside it can be unit tested.
 * That is the structural reason Blinkit's hand-rolled loop had no pins while
 * Zepto's pageThrough loop did.
 */
export function readNextUrl(response: unknown): string | null {
  if (response === null || typeof response !== "object") return null;
  const pagination = (response as Record<string, unknown>)["pagination"];
  if (pagination === null || typeof pagination !== "object") return null;
  for (const key of ["next_url", "nextUrl"]) {
    const value = (pagination as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/**
 * Run one paging loop and return why it stopped, never a bare list.
 * The trap it closes is a loop that ends calmly with no reason said.
 */
export async function pageThrough<T>(
  opts: PageThroughOptions,
): Promise<PageThroughResult> {
  const limit = opts.limit ?? 40;
  let pages = 0;
  while (true) {
    if (opts.isDone()) return { pages, stop: "end" };
    if (opts.isPastEdge?.() === true) return { pages, stop: "edge" };
    if (pages >= limit) {
      return { pages, stop: "limit", detail: "page cap " + limit + " reached" };
    }
    let landed: boolean;
    try {
      landed = await opts.next();
    } catch (e) {
      return {
        pages,
        stop: "error",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
    if (!landed) return { pages, stop: "stalled" };
    pages += 1;
    opts.onPage?.(pages);
  }
}

// Scroll choice for a lazy bill page.
export interface ScrollUntilStableOptions {
  rounds?: number;
  waitMs?: number;
  onRound?: (round: number) => void;
}

/**
 * Scroll to the bottom and wait until the height stops growing.
 * The trap it closes is a hand loop that scrolls a fixed count blindly.
 */
export async function scrollUntilStable(
  page: Page,
  opts: ScrollUntilStableOptions = {},
): Promise<number> {
  const rounds = opts.rounds ?? 3;
  const waitMs = opts.waitMs ?? 2000;
  let prev: number | null = null;
  try {
    prev = await page.evaluate(() => document.body.scrollHeight) as number;
  } catch {
    prev = null;
  }
  let ran = 0;
  for (let i = 0; i < rounds; i++) {
    await page.evaluate(() => globalThis.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(waitMs);
    ran += 1;
    opts.onRound?.(ran);
    let cur: number | null = null;
    try {
      cur = await page.evaluate(() => document.body.scrollHeight) as number;
    } catch {
      cur = null;
    }
    if (prev !== null && cur !== null && cur <= prev) break;
    if (cur !== null) prev = cur;
  }
  return ran;
}
