/**
 * Ticket #341 — pins for the console REST parsing (opencode-console.ts).
 *
 * Fixtures mirror the live shapes probed 2026-09-24 (synthetic values, real
 * keys): microCents STRINGS, meters under access.meters, the month meter
 * with NO resetsAt, billing/status with balanceMicroCents/availableMicroCents.
 */
import { describe, expect, it } from "vitest";
import {
  OPENCODE_USD_SCALE,
  buildConsoleCookie,
  consoleStatusIsStale,
  microCentsToUsd,
  parseBillingStatus,
  parseConsoleMeter,
  parseConsoleOrgs,
  parseGoStatus,
  shapeConsoleBalance,
} from "./opencode-console";

describe("microCentsToUsd", () => {
  it("converts microCents strings to dollars", () => {
    expect(microCentsToUsd("887007726")).toBeCloseTo(8.87007726, 8);
    expect(microCentsToUsd("1200000000")).toBe(12);
    expect(microCentsToUsd("0")).toBe(0);
  });
  it("accepts numbers and rejects garbage", () => {
    expect(microCentsToUsd(3000000000)).toBe(30);
    expect(microCentsToUsd(null)).toBeNull();
    expect(microCentsToUsd(undefined)).toBeNull();
    expect(microCentsToUsd("")).toBeNull();
    expect(microCentsToUsd("not-a-number")).toBeNull();
    expect(microCentsToUsd(Number.NaN)).toBeNull();
  });
  it("keeps the 1e8 scale shared with the old billing parser", () => {
    expect(OPENCODE_USD_SCALE).toBe(100_000_000);
  });
});

describe("parseConsoleOrgs", () => {
  it("takes the first org id", () => {
    expect(
      parseConsoleOrgs([
        { id: "wrk_01KYSJZ99NCKWQJP5TDNBWV03G", name: "Default" },
        { id: "wrk_second", name: "Second" },
      ]),
    ).toBe("wrk_01KYSJZ99NCKWQJP5TDNBWV03G");
  });
  it("returns null for empty, id-less, and non-array payloads", () => {
    expect(parseConsoleOrgs([])).toBeNull();
    expect(parseConsoleOrgs([{ name: "Default" }])).toBeNull();
    expect(parseConsoleOrgs(null)).toBeNull();
    expect(parseConsoleOrgs({ id: "wrk_x" })).toBeNull();
    expect(parseConsoleOrgs("wrk_x")).toBeNull();
  });
});

describe("parseConsoleMeter", () => {
  it("maps a full meter to USD + percent + reset", () => {
    const win = parseConsoleMeter({
      startsAt: "2026-09-21T00:00:00.000Z",
      resetsAt: "2026-09-28T00:00:00.000Z",
      limitMicroCents: "3000000000",
      usedMicroCents: "321467596",
    });
    expect(win).not.toBeNull();
    expect(win!.used).toBeCloseTo(3.21467596, 6);
    expect(win!.cap).toBe(30);
    expect(win!.percent).toBeCloseTo(10.7155, 3);
    expect(win!.resetsAt).toBe("2026-09-28T00:00:00.000Z");
  });
  it("maps the month meter (no resetsAt) to a null reset, never NaN", () => {
    const win = parseConsoleMeter({
      limitMicroCents: "6000000000",
      usedMicroCents: "2643781303",
    });
    expect(win).not.toBeNull();
    expect(win!.used).toBeCloseTo(26.43781303, 6);
    expect(win!.cap).toBe(60);
    expect(win!.resetsAt).toBeNull();
  });
  it("returns null for unparseable money instead of a zero row", () => {
    expect(parseConsoleMeter({ limitMicroCents: "6000000000" })).toBeNull();
    expect(parseConsoleMeter({ usedMicroCents: "x", limitMicroCents: "y" })).toBeNull();
    expect(parseConsoleMeter(null)).toBeNull();
    expect(parseConsoleMeter([])).toBeNull();
  });
});

describe("parseGoStatus", () => {
  const live = {
    product: "go",
    access: {
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-10-01T00:00:00.000Z",
      meters: {
        fiveHour: {
          startsAt: "2026-09-24T06:17:37.498Z",
          resetsAt: "2026-09-24T11:17:37.498Z",
          limitMicroCents: "1200000000",
          usedMicroCents: "18385688",
        },
        week: {
          startsAt: "2026-09-21T00:00:00.000Z",
          resetsAt: "2026-09-28T00:00:00.000Z",
          limitMicroCents: "3000000000",
          usedMicroCents: "321467596",
        },
        month: { limitMicroCents: "6000000000", usedMicroCents: "2643781303" },
      },
    },
  };
  it("maps fiveHour/week/month to rolling/weekly/monthly", () => {
    const meters = parseGoStatus(live);
    expect(meters).not.toBeNull();
    expect(meters!.rolling!.cap).toBe(12);
    expect(meters!.rolling!.used).toBeCloseTo(0.18385688, 6);
    expect(meters!.weekly!.cap).toBe(30);
    expect(meters!.monthly!.cap).toBe(60);
    expect(meters!.monthly!.resetsAt).toBeNull();
  });
  it("returns null when access.meters is absent", () => {
    expect(parseGoStatus({ product: "go" })).toBeNull();
    expect(parseGoStatus({ access: {} })).toBeNull();
    expect(parseGoStatus(null)).toBeNull();
  });
});

describe("parseBillingStatus", () => {
  it("reads the spendable balance in USD", () => {
    const money = parseBillingStatus({
      billingMode: "prepaid",
      mode: "pay-as-you-go",
      balanceMicroCents: "887007726",
      creditLimitMicroCents: null,
      availableMicroCents: "887007726",
    });
    expect(money).not.toBeNull();
    expect(money!.balance).toBeCloseTo(8.87007726, 6);
    expect(money!.available).toBeCloseTo(8.87007726, 6);
  });
  it("returns null when no money parses", () => {
    expect(parseBillingStatus({ mode: "pay-as-you-go" })).toBeNull();
    expect(parseBillingStatus(null)).toBeNull();
  });
});

describe("shapeConsoleBalance", () => {
  it("folds meters + billing into the balance-route payload", () => {
    const shaped = shapeConsoleBalance(
      {
        access: {
          meters: {
            fiveHour: { resetsAt: "2026-09-24T11:17:37.498Z", limitMicroCents: "1200000000", usedMicroCents: "18385688" },
            week: { resetsAt: "2026-09-28T00:00:00.000Z", limitMicroCents: "3000000000", usedMicroCents: "321467596" },
            month: { limitMicroCents: "6000000000", usedMicroCents: "2643781303" },
          },
        },
      },
      { mode: "pay-as-you-go", balanceMicroCents: "887007726", availableMicroCents: "887007726" },
    );
    expect(shaped).not.toBeNull();
    expect(shaped!.balance).toBeCloseTo(8.87007726, 6);
    expect(shaped!.monthlyUsage).toBeCloseTo(26.43781303, 6);
    expect(shaped!.monthlyLimit).toBe(60);
    expect(shaped!.usage.rolling!.cap).toBe(12);
    expect(shaped!.usage.weekly!.cap).toBe(30);
    expect(shaped!.usage.monthly!.resetsAt).toBeNull();
  });
  it("falls back to balanceMicroCents when available is absent", () => {
    const shaped = shapeConsoleBalance(null, { balanceMicroCents: "100000000" });
    expect(shaped).not.toBeNull();
    expect(shaped!.balance).toBe(1);
  });
  it("returns null when nothing renderable arrives", () => {
    expect(shapeConsoleBalance(null, null)).toBeNull();
    expect(shapeConsoleBalance({ access: {} }, { mode: "x" })).toBeNull();
  });
});

describe("consoleStatusIsStale", () => {
  it("maps 401/403 to stale, nothing else", () => {
    expect(consoleStatusIsStale(401)).toBe(true);
    expect(consoleStatusIsStale(403)).toBe(true);
    expect(consoleStatusIsStale(200)).toBe(false);
    expect(consoleStatusIsStale(500)).toBe(false);
    expect(consoleStatusIsStale(429)).toBe(false);
  });
});

describe("buildConsoleCookie", () => {
  it("joins both cookies, __Host-console_session mandatory", () => {
    expect(buildConsoleCookie("a1", "s2")).toBe("auth=a1; __Host-console_session=s2");
  });
  it("fails closed when either cookie is missing", () => {
    expect(buildConsoleCookie("a1", "")).toBeNull();
    expect(buildConsoleCookie("", "s2")).toBeNull();
    expect(buildConsoleCookie(null, "s2")).toBeNull();
    expect(buildConsoleCookie("a1", null)).toBeNull();
  });
});
