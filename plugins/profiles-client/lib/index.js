/**
 * Host half of the W6 profiles-client web plugin.
 *
 * Two jobs, both small:
 * - Keep the host row active so the client-module registry discovers this
 *   package's `dsh.client` declaration and serves ./dist/client.js.
 * - Own the `prices` settings namespace: per-model USD rates per million
 *   tokens, read by the browser-side cost chip through the shared describe
 *   mirror of ui-settings. installSettingsSection parks on ctx.inject(
 *   ["settings"]), so this stays loadable when no settings provider mounts.
 */

import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";

/** Stable Cordis plugin name; also the client loader entry id. */
export const name = "profiles-client";

/** The `prices` settings namespace owned here. */
const PRICES_NS = settingsNamespace("prices");

/**
 * Schema of the prices section. One rate row per model, keyed
 * "provider/model"; input and output are USD per million tokens.
 */
const PRICES_SCHEMA = z.object({
  rates: z.dict(z.object({ input: z.number(), output: z.number() })),
});

export function apply(ctx) {
  // The browser reads prices through the ui-settings shared describe mirror;
  // the host half only needs the namespace registered with its schema.
  installSettingsSection(ctx, PRICES_NS, PRICES_SCHEMA, {}, {
    setSource: () => {},
    onChange: () => {},
  });
}
