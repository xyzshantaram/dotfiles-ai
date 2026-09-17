/**
 * GET /context-meter/prices over the plugin's own webServer route (#161).
 *
 * The settings mirror is loopback-only, so a browser reached over the LAN
 * (potato.local) never sees the `prices` namespace through the scope. This
 * route serves the same RESOLVED document over plain same-origin fetch,
 * which survives a remote browser: the client reads the scope first and
 * falls back here when the scope yields no document. Plugin exact routes
 * get no trust fence, unlike settings.describe in PRIVILEGED_METHODS.
 *
 * Contract, pinned by route.test.ts: exact path below, GET only (405),
 * missing settings service or unregistered namespace (503, never a throw),
 * and the body carries ONLY the public table ({rates, overrides} from
 * models.dev plus hand rows — isPriced admits numerics only, so nothing
 * secret can ride it). The client unwraps it with unwrapRoutePrices
 * (cost.ts), which the suite executes.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../../shared/http";

/** Exact webServer path the client fetches (fetchJson("/context-meter/prices")). */
export const PRICES_ROUTE_PATH = "/context-meter/prices";

/** Minimal structural view of the settings service, matching profiles.ts. */
export interface PricesSettingsLike {
  get(ns: unknown): { rates?: unknown; overrides?: unknown } | undefined;
}

/**
 * Build the prices handler. The settings service is read per request
 * through `readSettings`, so a sync-models run shows up without a restart
 * and a vanished service answers 503 instead of throwing the route off
 * the server.
 */
export function makePricesHandler(
  readSettings: () => PricesSettingsLike | undefined,
  namespace: unknown,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, error: "method not allowed" });
      return;
    }
    const doc = readSettings()?.get(namespace);
    if (doc === undefined) {
      sendJson(res, 503, { ok: false, error: "prices unavailable" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      prices: {
        rates: doc.rates ?? {},
        overrides: doc.overrides ?? {},
      },
    });
  };
}
