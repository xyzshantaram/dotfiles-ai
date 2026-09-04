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
 * Read one hashed class name out of a stylesheet the conversation package
 * injects. The hash changes per DSH build, so never hard-code it.
 *
 * The conversation package injects each CSS module as a `style` tag carrying
 * `data-plugin-css="@deepseek-ai/dsh-client-ui-conversation/<Module>.module.css"`.
 * This helper regex-matches the first local class whose name ends in the
 * given module suffix out of that tag's text content.
 */
const SHIPPED_CSS_OWNER = "@deepseek-ai/dsh-client-ui-conversation/";

export function shippedClass(moduleName: string, suffix: string): string | null {
  if (typeof document === "undefined") return null;
  const tag = document.querySelector(
    'style[data-plugin-css="' + SHIPPED_CSS_OWNER + moduleName + '"]',
  );
  if (tag === null) return null;
  const found = new RegExp("\\.([A-Za-z0-9_-]+" + suffix + ")\\s*\\{").exec(tag.textContent || "");
  return found === null ? null : found[1];
}

/**
 * Shared outline colours for permission states. An escalation raises sandbox
 * permissions. A guard approval asks about a command rule. The two must stay
 * visually distinct, so the values live here rather than in each stylesheet.
 */
export const PERMISSION_OUTLINE_CSS = `:root {
  --dsh-outline-escalated: #ff8c00;
  --dsh-outline-guard: #00b7ff;
}`;

/**
 * A todo/plan row: a CSS-drawn checkbox (empty for pending, a dash bar for
 * in progress, a green check for done) plus its content. Shared verbatim
 * between durable-todos and tool-render's todo_write card, which must read as
 * the same component. Consumers apply these bare class names directly in
 * their own markup — there is no plugin-specific prefix here on purpose, so
 * a stray leftover local rule from before this was shared cannot silently
 * shadow it.
 */
export const PLAN_ROW_CSS = `
.dsh-plan-item {
  align-items: baseline;
  display: flex;
  gap: 0.375rem;
  padding: 0.125rem 0 0.125rem 0.25rem;
}
.dsh-plan-checkbox {
  align-self: center;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 0.1875rem;
  flex: none;
  height: 0.875rem;
  position: relative;
  width: 0.875rem;
}
.dsh-plan-item[data-done] .dsh-plan-checkbox {
  border-color: var(--dsw-alias-state-success-primary);
}
.dsh-plan-item[data-done] .dsh-plan-checkbox::after {
  color: var(--dsw-alias-state-success-primary);
  content: "✓";
  display: block;
  font-size: 0.6875rem;
  line-height: 0.8125rem;
  text-align: center;
}
.dsh-plan-item[data-active] .dsh-plan-checkbox::after {
  background: var(--dsw-alias-label-tertiary);
  content: "";
  height: 0.09375rem;
  left: 0.1875rem;
  position: absolute;
  right: 0.1875rem;
  top: 50%;
}
.dsh-plan-content {
  font-size: 0.8125rem;
  line-height: 1.25rem;
  overflow-wrap: anywhere;
}
.dsh-plan-item[data-done] .dsh-plan-content {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-plan-item[data-active] .dsh-plan-content {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.dsh-plan-item[data-pending] .dsh-plan-content {
  color: var(--dsw-alias-label-secondary);
}
`;

/**
 * highlight.js github-dark token colors, shared between tool-render and
 * approval-comment so a bash command reads the same in a tool card and in an
 * approval card. This is ONLY the per-token-name color rules — the box
 * treatment (background, padding, base text color) differs by consumer
 * (tool-render wants a dark code-block box; approval-comment wants a
 * transparent block that blends into its own layout), so each plugin keeps
 * its own box CSS locally and injects this alongside it.
 */
export const HLJS_THEME_CSS = [
  ".hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}",
  ".hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}",
  ".hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-variable,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id{color:#79c0ff}",
  ".hljs-regexp,.hljs-string,.hljs-meta .hljs-string{color:#a5d6ff}",
  ".hljs-built_in,.hljs-symbol{color:#ffa657}",
  ".hljs-comment,.hljs-code,.hljs-formula{color:#8b949e}",
  ".hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo{color:#7ee787}",
  ".hljs-subst{color:#c9d1d9}",
  ".hljs-section{color:#1f6feb;font-weight:bold}",
  ".hljs-bullet{color:#f2cc60}",
  ".hljs-emphasis{color:#c9d1d9;font-style:italic}",
  ".hljs-strong{color:#c9d1d9;font-weight:bold}",
  ".hljs-addition{color:#aff5b4;background-color:#033a16}",
  ".hljs-deletion{color:#ffdcd7;background-color:#67060c}",
].join("");

/**
 * React hooks live in `client-react.ts`. This module stays framework-free so
 * its vitest suite can run in plain node, where `react` does not resolve.
 */

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
