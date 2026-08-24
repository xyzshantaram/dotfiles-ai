/**
 * Host half of the W6 profiles-client web plugin.
 *
 * One job, small: keep the host row active so the client-module registry
 * discovers this package's `dsh.client` declaration and serves
 * ./dist/client.js. The W24 cost chip removal also dropped the `prices`
 * settings namespace: its only consumer was the browser-side cost figure.
 */
/** Stable Cordis plugin name; also the client loader entry id. */
export const name = "profiles-client";

/** Keep the host row active; no host-side logic remains. */
export function apply() {
  void 0;
}
