/**
 * Host row of the context meter. It keeps the client-module registry
 * discovering the `dsh.client` entry, and it owns the `prices` settings
 * namespace the browser-side cost figure reads.
 *
 * The namespace shape revives the W6 cost chip's contract (per-model USD
 * rates per million tokens keyed "provider/model"), extended with the
 * cache_read/cache_write dimensions the old chip lacked. Rows stay
 * loosely typed on purpose: a hand-written partial row must degrade to
 * "unknown price" for that model, never fail the whole registration and
 * take every other model's figure down with it. The client validates rows
 * before pricing (see ./cost.ts isPriced).
 *
 * The settings mirror is loopback-only, so a browser reached over the LAN
 * (or any browser whose mirror stalls) never sees the namespace. The GET
 * route in ./route serves the same resolved document over plain same-origin
 * fetch, which survives a remote browser (#161): the client reads the
 * scope first and falls back to this route when the scope yields no doc.
 */

import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { makePricesHandler, PRICES_ROUTE_PATH } from "./route";

const name = "context-meter";

/** No hard host dependencies: services are looked up lazily per request. */
const inject: string[] = [];

/** The `prices` settings namespace owned here. */
const PRICES_NS = settingsNamespace("prices");

/**
 * Schema of the prices section. `rates` is rebuilt wholesale by
 * sync-models.mjs; `overrides` is hand-kept and wins in the client.
 */
const PRICES_SCHEMA = z.object({
  rates: z.dict(z.any()).default({}),
  overrides: z.dict(z.any()).default({}),
});

/** Minimal structural view of the settings service, matching profiles.ts. */
interface SettingsReader {
  get(ns: unknown): { rates?: unknown; overrides?: unknown } | undefined;
}

function apply(ctx: any) {
  // The browser reads prices through the settings scope (bound in the
  // client); the host half only registers the namespace with its schema.
  // installSettingsSection parks on ctx.inject(["settings"]), so this stays
  // loadable when no settings provider mounts.
  installSettingsSection(
    ctx,
    PRICES_NS,
    PRICES_SCHEMA,
    { rates: {}, overrides: {} },
    {
      setSource: () => {},
      onChange: () => {},
    },
  );

  // Lazy inject: the plugin still loads where no web server mounts. The
  // handler (./route) reads the RESOLVED namespace per request, so each NEW
  // fetch after a sync-models run sees the new table without a restart — but
  // that is true of the ROUTE, not of every caller: an already-loaded LAN
  // client fetched its copy once (see the routeDoc effect in client.tsx) and
  // keeps pricing from the old table until a reload, while a loopback client
  // re-renders reactively through the scope. A comment true of one caller and
  // false of another is how the last two defects in this plugin were missed
  // (#166), so say which. A missing settings service answers 503 instead of
  // throwing the route off the server.
  try {
    ctx.inject(["webServer"], (scope: any) => {
      const server = scope.webServer as {
        register(options: unknown): unknown;
      };
      server.register({
        kind: "exact",
        path: PRICES_ROUTE_PATH,
        handler: makePricesHandler(
          () =>
            (ctx as { get(name: string): unknown }).get("settings") as
            | SettingsReader
            | undefined,
          PRICES_NS,
        ),
      });
    });
  } catch {
    // No webServer: the settings scope path still works where it can.
  }
}

export { apply, inject, name };
