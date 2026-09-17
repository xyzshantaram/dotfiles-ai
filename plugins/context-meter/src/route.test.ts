/**
 * Handler-level tests for GET /context-meter/prices (ticket #161 review).
 *
 * The route's 405/503 paths were previously exercised only by the
 * uncommitted probe_route.mjs, so the route itself had no committed test.
 * This pins the contract in the suite against a fake ctx, the way the
 * probe did: apply() with a captured webServer registration, then answer
 * the handler with fake req/res pairs — including the probe's
 * settings-vanished flip, which must answer 503 and never throw.
 */

import { describe, expect, it } from "vitest";
import { apply } from "./index";
import { makePricesHandler, PRICES_ROUTE_PATH, type PricesSettingsLike } from "./route";

/** Fake ServerResponse that captures what sendJson writes. */
function makeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as string | undefined,
  };
  (res as any).setHeader = (key: string, value: string) => {
    res.headers[key] = value;
  };
  (res as any).end = (chunk?: string) => {
    res.body = chunk;
  };
  return res;
}

const NS = "prices";
const RATE = { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 };

function call(handler: (req: any, res: any) => void, method: string) {
  const res = makeRes();
  handler({ method, headers: {}, socket: {} }, res as any);
  return { res, parsed: res.body !== undefined ? JSON.parse(res.body) : undefined };
}

function handlerFor(doc: { rates?: unknown; overrides?: unknown } | undefined) {
  const settings: PricesSettingsLike | undefined =
    doc === undefined ? undefined : { get: () => doc };
  return makePricesHandler(() => settings, NS);
}

describe("makePricesHandler", () => {
  it("serves the resolved table on GET", () => {
    const { res, parsed } = call(
      handlerFor({ rates: { "meridian/claude-opus-5": RATE }, overrides: {} }),
      "GET",
    );
    expect(res.statusCode).toBe(200);
    expect(parsed.ok).toBe(true);
    expect(parsed.prices.rates["meridian/claude-opus-5"]).toEqual(RATE);
    expect(parsed.prices.overrides).toEqual({});
  });

  it("serves ONLY the public table, never extra document keys", () => {
    // Leak pin: a document carrying anything beyond rates/overrides must
    // not ride the route to the browser.
    const { parsed } = call(
      handlerFor({ rates: {}, overrides: {}, secret: "x" } as never),
      "GET",
    );
    expect(Object.keys(parsed).sort()).toEqual(["ok", "prices"]);
    expect(Object.keys(parsed.prices).sort()).toEqual(["overrides", "rates"]);
  });

  it("answers non-GET with 405 and never consults settings", () => {
    let consulted = 0;
    const handler = makePricesHandler(() => {
      consulted += 1;
      return { get: () => ({ rates: {}, overrides: {} }) };
    }, NS);
    for (const method of ["POST", "PUT", "DELETE"]) {
      const { res, parsed } = call(handler, method);
      expect(res.statusCode).toBe(405);
      expect(parsed).toEqual({ ok: false, error: "method not allowed" });
    }
    expect(consulted).toBe(0);
  });

  it("answers 503 when the settings service is gone, never a throw", () => {
    const { res, parsed } = call(handlerFor(undefined), "GET");
    expect(res.statusCode).toBe(503);
    expect(parsed).toEqual({ ok: false, error: "prices unavailable" });
  });

  it("answers 503 when the namespace was never registered", () => {
    const handler = makePricesHandler(() => ({ get: () => undefined }), NS);
    const { res, parsed } = call(handler, "GET");
    expect(res.statusCode).toBe(503);
    expect(parsed).toEqual({ ok: false, error: "prices unavailable" });
  });

  it("defaults absent rates/overrides to empty tables", () => {
    const { res, parsed } = call(handlerFor({}), "GET");
    expect(res.statusCode).toBe(200);
    expect(parsed).toEqual({ ok: true, prices: { rates: {}, overrides: {} } });
  });
});

describe("apply wires the route (probe-style, fake ctx)", () => {
  /** Fake cordis ctx: serves settings registration, answers get(), captures routes. */
  function fakeCtx(box: { svc: PricesSettingsLike | undefined }, withWebServer: boolean) {
    const routes: any[] = [];
    const ctx = {
      routes,
      inject(deps: string[], cb: (scope: any) => void) {
        if (deps.includes("settings")) {
          cb({
            settings: {
              register: () => ({ get: () => ({}), watch: () => () => {} }),
            },
            effect: () => () => {},
          });
        }
        if (deps.includes("webServer") && withWebServer) {
          cb({ webServer: { register: (r: any) => routes.push(r) } });
        }
        return () => {};
      },
      get: (name: string) => (name === "settings" ? box.svc : undefined),
    };
    return ctx;
  }

  it("registers the exact LAN route and serves the resolved table through it", () => {
    const box = {
      svc: {
        get: () => ({ rates: { "meridian/claude-opus-5": RATE }, overrides: {} }),
      } as PricesSettingsLike,
    };
    const ctx = fakeCtx(box, true);
    apply(ctx as any);
    expect(ctx.routes.map((r) => r.path)).toEqual([PRICES_ROUTE_PATH]);
    expect(PRICES_ROUTE_PATH).toBe("/context-meter/prices");
    expect(ctx.routes[0].kind).toBe("exact");
    const { res, parsed } = call(ctx.routes[0].handler, "GET");
    expect(res.statusCode).toBe(200);
    expect(parsed.prices.rates["meridian/claude-opus-5"]).toEqual(RATE);
    // Non-GET through the wired handler answers 405, as the probe showed.
    expect(call(ctx.routes[0].handler, "POST").res.statusCode).toBe(405);
  });

  it("answers 503 through the wired handler once settings vanish, never a throw", () => {
    // The probe's flip: the handler closes over ctx and reads per request.
    const box = {
      svc: {
        get: () => ({ rates: { "meridian/claude-opus-5": RATE }, overrides: {} }),
      } as PricesSettingsLike | undefined,
    };
    const ctx = fakeCtx(box, true);
    apply(ctx as any);
    box.svc = undefined;
    const { res, parsed } = call(ctx.routes[0].handler, "GET");
    expect(res.statusCode).toBe(503);
    expect(parsed).toEqual({ ok: false, error: "prices unavailable" });
  });

  it("loads with no webServer and registers nothing", () => {
    const box = { svc: { get: () => ({}) } as PricesSettingsLike };
    const ctx = fakeCtx(box, false);
    expect(() => apply(ctx as any)).not.toThrow();
    expect(ctx.routes).toEqual([]);
  });
});
