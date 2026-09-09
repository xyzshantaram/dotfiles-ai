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
 */

import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";

const name = "context-meter";

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
}

export { apply, name };
