/**
 * Browser-half helpers shared by the settings panels and the model seat.
 *
 * One source implementation per helper, so the client bundles cannot drift.
 * All helpers are side-effect free except `injectStyle`, which guards itself
 * against double-injection. No types from shims, plain constants only.
 *
 * Import surface. The three client bundles — plugins/profiles-client/src/
 * client.tsx, plugins/session-archive/src/client.tsx, and plugins/
 * subscriptions/src/client.tsx — import `fetchJson`/`postJson`/`putJson`
 * from here. Any new client bundle must import them from here too, never
 * re-implement the fetch+parse {data, error} shape inline. These helpers are
 * browser-only (they call `fetch`): host plugins that answer these routes
 * over `node:http` use plugins/shared/http.ts (sendJson/readBody/isPlainObject)
 * instead; the two sides cannot share one implementation.
 */

/**
 * Inject one stylesheet into the document head, once per style id.
 *
 * Both guards match the historical behavior of every client bundle: the tag
 * is only created when the document exists and when no sibling `style` with
 * the same `data-plugin-css` value is already present. The tag carries the
 * owning plugin name and the style id as dataset fields, then receives the
 * CSS text verbatim.
 */
export function injectStyle(pluginName: string, styleId: string, cssText: string): void {
  if (typeof document === "undefined") return;
  if (
    document.querySelector(
      'style[data-plugin-css="' +
        (typeof CSS !== "undefined" && (CSS as unknown as { escape(s: string): string }).escape
          ? (CSS as unknown as { escape(s: string): string }).escape(styleId)
          : String(styleId).replace(/"/g, '\\"')) +
        '"]',
    ) !== null
  )
    return;
  const tag = document.createElement("style");
  tag.dataset.plugin = pluginName;
  tag.dataset.pluginCss = styleId;
  tag.textContent = cssText;
  document.head.appendChild(tag);
}

/**
 * Join CSS parts into one stylesheet string.
 *
 * Each part is a string or an array of strings; arrays are flattened and
 * empty parts dropped, so callers can pass a shared token block, a shared
 * control block, and a bundle-local block in any nesting.
 */
export function mergeCss(...parts: Array<string | string[]>): string {
  return parts.flat().filter(Boolean).join("\n");
}

/**
 * Fetch one same-origin route with any method, always resolving to a
 * plain object.
 *
 * The result always has the shape { data, error }. A non-JSON response
 * maps to a null body. A { error } body maps to that error. An HTTP
 * failure maps to "HTTP <status>". A network failure maps to its message.
 *
 * The body and its content-type header are attached only when a body is
 * given and the method is not GET. Logs a debug line on start, an info
 * line on success, and an error line on any failure.
 */
export function request(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ data: any; error: string | null }> {
  const hasBody = body !== undefined && method !== "GET";
  console.debug("[client-util] " + method + " " + url);
  return fetch(url, {
    method: method,
    cache: "no-store",
    ...(hasBody ? { headers: { "content-type": "application/json" } } : {}),
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  })
    .then(function (res) {
      return res
        .json()
        .catch(function () {
          return null;
        })
        .then(function (json) {
          return { ok: res.ok, status: res.status, json: json };
        });
    })
    .then(function (result) {
      if (result.json !== null && result.json.error) {
        console.error(
          "[client-util] " + method + " " + url + " failed: server error " + result.status,
        );
        return { data: null, error: String(result.json.error) };
      }
      if (!result.ok) {
        console.error("[client-util] " + method + " " + url + " failed: HTTP " + result.status);
        return { data: null, error: "HTTP " + result.status };
      }
      console.info("[client-util] " + method + " " + url + " ok (HTTP " + result.status + ")");
      return { data: result.json, error: null };
    })
    .catch(function (e) {
      console.error("[client-util] " + method + " " + url + " failed: network error");
      return { data: null, error: String((e && e.message) || e) };
    });
}

/**
 * Fetch one same-origin route. Thin wrapper over `request` with GET.
 */
export function fetchJson(url: string) {
  return request("GET", url);
}

/**
 * POST one same-origin route. Sends a JSON body only when one is given.
 * Thin wrapper over `request`.
 */
export function postJson(url: string, body?: unknown) {
  return request("POST", url, body);
}

/**
 * PUT one same-origin route with a JSON body. Thin wrapper over `request`.
 */
export function putJson(url: string, body: unknown) {
  return request("PUT", url, body);
}

/**
 * Escape a string for safe interpolation into HTML text.
 */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Register one locale namespace with its en and zh dictionaries.
 *
 * The call shape matches every client bundle: `ctx.locale.register(ns, { en, zh })`
 * inside the plugin's apply effect.
 */
export function registerLocale(ctx: any, ns: string, en: unknown, zh: unknown): any {
  return ctx.locale.register(ns, { en: en, zh: zh });
}
