// Redirect-origin decision logic for MCP OAuth (#137). PURE: the inputs are
// a Host header value and an explicitly configured origin string, so this
// module needs no server and no DOM.
//
// BACKGROUND. The OAuth redirect_uri must match the browser's origin
// EXACTLY, scheme included. Two things make that origin unrecoverable from
// the request here:
//
//  1. The scheme was hardcoded to http. Behind a TLS-terminating proxy the
//     browser's origin is https://<host> while derivation yields
//     http://<host>, so the redirect_uri mismatches.
//  2. When dsh-remote gates (its trustProxy defaults TRUE) it rewrites BOTH
//     Host and Origin to the loopback authority for every authenticated
//     request, stashing the original on a module-private Symbol we cannot
//     read. For such a request NEITHER scheme NOR authority is recoverable.
//
// TRUST DECISION (written down because the ticket demands it): NO header is
// trusted for this purpose. x-forwarded-proto / x-forwarded-host are
// attacker-controllable unless the proxy is known to overwrite them, and no
// such trust decision exists in this deployment — so they are deliberately
// ignored. Recovery (options 1 and 2 from the ticket) is refused; the origin
// is either PINNED by configuration (option 3) or the flow FAILS LOUDLY
// (option 4). OAuth providers require a REGISTERED redirect_uri anyway, so
// the value has to be pinned somewhere regardless.
//
// RESOLUTION RULES (resolveRedirectOrigin):
//  - A valid configured origin ALWAYS wins, even when the request looks like
//    loopback. This is load-bearing behind dsh-remote: a rewritten proxied
//    request is indistinguishable from a genuine loopback one, so preferring
//    derivation for loopback-appearing hosts would silently discard the pin
//    exactly where it is needed most. Consequence: while redirectOrigin is
//    set, every OAuth flow uses the public origin, including flows started
//    from a loopback browser tab. Unset it for a loopback-only deployment.
//  - With no configured origin, a loopback request derives http://<host> —
//    today's behaviour, already correct, unchanged.
//  - With no configured origin, a non-loopback request FAILS with a loud
//    error naming the loopback constraint, instead of producing a
//    redirect_uri the provider would reject with an opaque error.
//  - An explicitly configured but INVALID origin fails loudly everywhere,
//    including on loopback: an operator setting must never be silently
//    ignored in favour of a guess.

export type OriginVerdict =
  { ok: true; origin: string; source: "configured" | "loopback" } | { ok: false; error: string };

export type ConfigVerdict = { ok: true; origin: string } | { ok: false; error: string };

/** True for hostnames that can only mean this machine. */
export function isLoopbackHostname(hostname: string): boolean {
  // URL.hostname keeps IPv6 brackets ("[::1]"), so strip them first.
  const h = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (h === "localhost" || h === "::1") return true;
  // The whole 127/8 range is loopback, not just 127.0.0.1.
  const parts = h.split(".");
  if (parts.length === 4 && parts[0] === "127") {
    return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
  }
  return false;
}

function invalidConfig(raw: unknown, why: string): ConfigVerdict {
  return {
    ok: false,
    error:
      `mcp-servers: invalid redirectOrigin ${JSON.stringify(raw) ?? String(raw)}: ${why} ` +
      `It must be the exact public origin browsers use, for example ` +
      `"https://harness.example.com". MCP OAuth is loopback-only until a valid ` +
      `origin is pinned here.`,
  };
}

/**
 * Validate the operator-pinned redirect origin. Returns origin "" when unset
 * (undefined, null, or blank), the normalised URL origin when valid, or a
 * loud error when explicitly set but unusable. Normalisation strips any path
 * or trailing slash, so "https://host/cb/" pins "https://host".
 */
export function normalizeConfiguredOrigin(raw: unknown): ConfigVerdict {
  if (raw === undefined || raw === null) return { ok: true, origin: "" };
  if (typeof raw !== "string" || raw.trim() === "") {
    if (typeof raw === "string") return { ok: true, origin: "" };
    return invalidConfig(raw, "it must be a string.");
  }
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return invalidConfig(raw, "it is not an absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return invalidConfig(raw, `its scheme is "${url.protocol}" instead of http or https.`);
  }
  return { ok: true, origin: url.origin };
}

function loudUnconfigured(hostShown: string): OriginVerdict {
  return {
    ok: false,
    error:
      `mcp-servers: cannot build an OAuth redirect_uri for host "${hostShown}": ` +
      `the browser's true origin is not recoverable from this request. Behind a ` +
      `TLS-terminating proxy the scheme is lost, and when dsh-remote gates it ` +
      `rewrites Host and Origin to the loopback authority for authenticated ` +
      `requests, so neither scheme nor authority can be trusted here; ` +
      `x-forwarded-* headers are attacker-controllable and deliberately ignored. ` +
      `MCP OAuth is loopback-only unless a redirect origin is pinned: set ` +
      `redirectOrigin in the mcp-servers plugin config to the exact public origin ` +
      `browsers use (for example "https://harness.example.com") and register ` +
      `"https://harness.example.com/mcp-servers/callback/<server>" with the OAuth ` +
      `provider as a redirect URI.`,
  };
}

/**
 * Decide the redirect origin for one request.
 *
 * @param host The Host header value as seen by this handler (already
 *   rewritten to loopback by dsh-remote for gated requests; undefined when
 *   the header is absent, which derivation treats as loopback like before).
 * @param configuredOrigin A validated origin from normalizeConfiguredOrigin,
 *   or "" when unset.
 */
export function resolveRedirectOrigin(
  host: string | undefined,
  configuredOrigin: string,
): OriginVerdict {
  // The pin wins unconditionally — see the module header for why a
  // loopback-appearing request must not shadow it.
  if (configuredOrigin !== "") {
    return { ok: true, origin: configuredOrigin, source: "configured" };
  }
  const rawHost = host ?? "127.0.0.1";
  let url: URL;
  try {
    url = new URL(`http://${rawHost}`);
  } catch {
    return loudUnconfigured(rawHost);
  }
  if (isLoopbackHostname(url.hostname)) {
    return { ok: true, origin: url.origin, source: "loopback" };
  }
  return loudUnconfigured(rawHost);
}
