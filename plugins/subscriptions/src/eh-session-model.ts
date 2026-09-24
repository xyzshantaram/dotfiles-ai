/**
 * ElectronHub browser-session harvest (ticket #108): pure helpers, no node
 * builtins, no react — importable from vitest like ./eh-section-model.ts.
 *
 * The dashboard authenticates with a session JWT, not the ek- API key. The
 * captured HAR proves the JWT rides `Authorization: Bearer <584-char JWT>`
 * on api.electronhub.ai, with payload claims sub, key_id, iat, exp, jti,
 * refresh_token_id, tier, kid, sid. The key the repo stores (ek-dev-…)
 * authenticates inference only and answers 401 on every account-scoped
 * endpoint (criterion 1, probed live 2026-09-17 — negative).
 *
 * Profile findings (verified live on this machine, 2026-09-17):
 * - The JWT itself is NOT harvestable: localStorage `electron_hub.auth`
 *   holds profile fields (email, plan, credits, the ek- apiKey) but no JWT,
 *   and the app's `eh_jwt_db` IndexedDB record is opaque (app-encrypted).
 * - The durable session credential in the profile IS the httpOnly
 *   `refresh_token` cookie for host `api.electronhub.ai`. Minting is
 *   POST /v1/auth/refresh with `Cookie: refresh_token=<value>`, which
 *   answers `{access_token, expires_in}` (observed: a 584-char JWT,
 *   expires_in 3600). So harvest = read that ONE cookie → mint → Bearer.
 * - Refresh tokens ROTATE: each successful mint consumes the presented
 *   value (a second mint with the same value answers 401 "Invalid or
 *   expired refresh token"). The host reflects the rotation successor (the
 *   Set-Cookie of the mint response) back into the profile row it read, so
 *   the chain in the profile stays current. A mint therefore happens only
 *   on an explicit user action (the panel's "Fetch session" button), never
 *   on the panel's poll loop — a per-minute auto-mint would churn the
 *   browser's own rotation chain.
 * - Firefox keeps cookies.sqlite in WAL mode: the live values may sit in
 *   cookies.sqlite-wal, so the host snapshots sqlite+wal together. The
 *   cookie read goes through a scratch copy and the temp dir is removed
 *   afterwards; nothing credential-shaped is ever logged, rendered, or
 *   written to the repo.
 *
 * Security posture, per the owner's four constraints (evidence row 0):
 * 1. Expiry: the minted JWT's `exp` is decoded and checked BEFORE use; an
 *    expired token (or any 401 from the dashboard endpoints) surfaces the
 *    login-again message — never zero usage, never a stale figure.
 * 2. No credential value is logged, rendered, persisted to the repo, or
 *    included in a report. The only display helper here masks dashboard-style
 *    (`ek-dev••••tKci`); JWTs are never displayable at all.
 * 3. Narrow: exactly one cookie (name + host pinned below), read from the
 *    profile at harvest time. Not a general browser-credential facility.
 * 4. No hardcoded profile path: profiles are resolved through the machine's
 *    own profiles.ini, Install-default first, then the Default=1 profile,
 *    then the rest — every candidate with a cookie DB is tried in order
 *    (multi-profile safe, never "glob and take the first hit").
 */

// ── Narrow harvest recipe ─────────────────────────────────────────────────

export var EH_FIREFOX_COOKIE_HOST = "api.electronhub.ai";
export var EH_FIREFOX_COOKIE_NAME = "refresh_token";
/** The mint endpoint; the refresh token rides the Cookie header, not a body. */
export var EH_REFRESH_PATH = "/auth/refresh";
/** Dashboard paths the HAR documents, all GET, all Bearer-JWT in the capture. */
export var EH_SESSION_ENDPOINT_PATHS = [
  "/v1/auth/subscription",
  "/v1/auth/permanent-credits/info",
  "/v1/flex-credits/info",
];

// ── User-facing session messages (derived from what happened) ─────────────

/** No usable cookie in any profile: the honest affordance is a login hint. */
export var EH_SESSION_NO_COOKIE =
  "no ElectronHub browser session in any Firefox profile — open app.electronhub.ai " +
  "in Firefox and sign in, then fetch the session again";
/**
 * The stored session is dead (refresh 401, dashboard 401, or the minted JWT
 * is already expired): the user must log in again. Never rendered as zero
 * usage, never rendered as a stale figure presented as current.
 */
export var EH_SESSION_EXPIRED =
  "ElectronHub browser session expired — log in to ElectronHub in Firefox again, " +
  "then fetch the session again";

// ── Harvest outcome decision (pure; pinned by table tests) ─────────────────

/**
 * Decide the honest extract answer from what the mint loop saw.
 *
 * The split that matters (probed live 2026-09-24): a profile that HOLDS the
 * refresh_token cookie but whose mint answers 401 is EXPIRED, not absent —
 * relabeling it NO_COOKIE sent the owner hunting a harvest bug that did not
 * exist while the cookie sat in the profile, merely dead. NO_COOKIE is
 * reserved for a profile set that holds no ElectronHub cookie at all.
 * Transport/parse failures keep their own message; success carries whether
 * the rotation successor was written back to the profile.
 */
export function ehHarvestOutcome(input) {
  if (input === null || typeof input !== "object") return { kind: "no-cookie" };
  var error = input.error;
  if (error !== null && error !== undefined) {
    var message = error instanceof Error ? error.message : String(error);
    if (message === EH_SESSION_EXPIRED) return { kind: "expired" };
    return { kind: "error", message: message };
  }
  var minted = input.minted;
  if (minted === null || minted === undefined) return { kind: "no-cookie" };
  return { kind: "session", reflected: minted.reflected === true };
}
/**
 * Analytics endpoints unidentified (criterion 7): the token/API usage tabs
 * ride an authenticated WebSocket (/v1/ws/auth, protocol unknown from the
 * HAR — Firefox cannot export frames), so they are stated as a limitation,
 * never approximated from another source.
 */
export var EH_SESSION_ANALYTICS_NOTE =
  "Token and request usage are not shown: the analytics tabs ride an " +
  "authenticated WebSocket whose message protocol is unidentified, so there " +
  "is no usage endpoint to call — nothing is approximated from other figures";
/**
 * Account/tier mismatch (criterion 8): the HAR's /v1/auth/subscription
 * reports tier 0 / Free / inactive for simsid66@gmail.com while the owner's
 * Coding Plan PDF shows an active paid plan. Recorded here as UNRESOLVED:
 * `tier`/`tier_label` render as raw fields only and must never headline as
 * the plan indicator.
 */
export var EH_SESSION_TIER_UNRESOLVED_NOTE =
  "tier here is unresolved: this endpoint can report tier 0 / Free while a " +
  "paid coding plan is active, so the tier fields below are not a plan verdict";

// ── Firefox profiles.ini resolution (constraint 4) ────────────────────────

/** One [ProfileN] section: name, relative-or-absolute path, Default flag. */
function ehIniProfiles(text) {
  var out = [];
  var current = null;
  var lines = String(text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var section = /^\[([^\]]+)\]$/.exec(line);
    if (section !== null) {
      current = { section: section[1], fields: {} };
      out.push(current);
      continue;
    }
    if (current === null) continue;
    var eq = line.indexOf("=");
    if (eq === -1) continue;
    current.fields[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Order the profile directories named by profiles.ini: Install-section
 * Defaults first (new Firefox's per-install default), then the profile
 * carrying Default=1, then every other [ProfileN] by name. IsRelative=1
 * paths resolve under <home>/.mozilla/firefox; absolute paths pass through.
 * Returns absolute directory paths, deduplicated, in try-order. Never
 * hardcodes a machine-specific path: `homeDir` is the runtime's own home.
 */
export function ehResolveFirefoxProfiles(iniText, homeDir) {
  var sections = ehIniProfiles(iniText);
  var base = String(homeDir).replace(/\/+$/, "") + "/.mozilla/firefox";
  var profiles = [];
  var installDefaults = [];
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i];
    if (/^Profile\d+$/.test(s.section)) {
      var rawPath = s.fields.Path || "";
      if (rawPath === "") continue;
      var dir =
        s.fields.IsRelative === "0" ? rawPath : base + "/" + rawPath.replace(/^\/+/, "");
      profiles.push({ name: s.fields.Name || s.section, dir: dir, def: s.fields.Default === "1" });
    } else if (/^Install/i.test(s.section)) {
      if (s.fields.Default) installDefaults.push(s.fields.Default);
    }
  }
  var ordered = [];
  var pushDir = function (dir) {
    if (dir && ordered.indexOf(dir) === -1) ordered.push(dir);
  };
  var d;
  // Install defaults may name a profile directory leaf or a relative path —
  // resolve both against the firefox root.
  for (var a = 0; a < installDefaults.length; a++) {
    var inst = installDefaults[a];
    var abs = inst.indexOf("/") === -1 ? base + "/" + inst : inst;
    pushDir(abs);
  }
  for (var b = 0; b < profiles.length; b++) if (profiles[b].def) pushDir(profiles[b].dir);
  var rest = profiles.slice().sort(function (x, y) {
    return x.name < y.name ? -1 : x.name > y.name ? 1 : 0;
  });
  for (var c = 0; c < rest.length; c++) pushDir(rest[c].dir);
  return ordered;
}

/**
 * Narrow cookie pick: from moz_cookies rows, return the ONE ElectronHub
 * session token (host + name pinned above). Every other cookie is ignored —
 * this module never enumerates a credential store, it selects one row.
 */
export function ehPickRefreshCookie(rows) {
  if (!Array.isArray(rows)) return null;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || typeof row !== "object") continue;
    if (row.host === EH_FIREFOX_COOKIE_HOST && row.name === EH_FIREFOX_COOKIE_NAME) {
      var value = row.value;
      if (typeof value === "string" && value !== "") return value;
    }
  }
  return null;
}

/** The mint request sends exactly one pair — never a harvested jar. */
export function ehSessionCookieHeader(refreshValue) {
  return EH_FIREFOX_COOKIE_NAME + "=" + refreshValue;
}

// ── Mint response + rotation successor ────────────────────────────────────

/**
 * POST /v1/auth/refresh answers `{access_token, expires_in}` (observed
 * 2026-09-17). Returns null when the shape is anything else.
 */
export function ehParseRefreshBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  var token = body.access_token;
  if (typeof token !== "string" || token === "") return null;
  var ttl = body.expires_in;
  return {
    accessToken: token,
    expiresIn: typeof ttl === "number" && Number.isFinite(ttl) && ttl > 0 ? ttl : null,
  };
}

/**
 * Rotation reflection: the mint response's Set-Cookie carries the successor
 * refresh token, which the host writes back into the profile row it read so
 * the profile's chain stays current. Accepts a header string or an array of
 * them; answers the successor value or null when no refresh_token pair is
 * present (then the host skips reflection — never guesses).
 */
export function ehParseRefreshSuccessor(setCookie) {
  var headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (typeof header !== "string") continue;
    var semi = header.indexOf(";");
    var first = (semi === -1 ? header : header.slice(0, semi)).trim();
    var eq = first.indexOf("=");
    if (eq === -1) continue;
    var name = first.slice(0, eq).trim();
    var value = first.slice(eq + 1).trim();
    if (name === EH_FIREFOX_COOKIE_NAME && value !== "") return value;
  }
  return null;
}

/** Refresh-token values are opaque alphanumerics; anything else is refused. */
export function ehIsPlausibleTokenChars(value) {
  return typeof value === "string" && value !== "" && /^[A-Za-z0-9._~+/-]+=*$/.test(value);
}

// ── JWT claims: decode, expiry, masking ───────────────────────────────────

function ehBase64UrlDecode(segment) {
  var padded = String(segment).replace(/-/g, "+").replace(/_/g, "/");
  var remainder = padded.length % 4;
  if (remainder === 2) padded += "==";
  else if (remainder === 3) padded += "=";
  else if (remainder !== 0) return null;
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8");
    if (typeof atob !== "undefined") {
      var binary = atob(padded);
      var out = "";
      for (var i = 0; i < binary.length; i++) {
        out += "%" + ("00" + binary.charCodeAt(i).toString(16)).slice(-2);
      }
      return decodeURIComponent(out);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Decode the JWT payload WITHOUT verifying the signature (expiry is a
 * client-side freshness check; trust still comes from the API's 200/401).
 * Returns the claims object or null when the token is malformed.
 */
export function ehDecodeJwtPayload(token) {
  if (typeof token !== "string") return null;
  var segments = token.split(".");
  if (segments.length !== 3) return null;
  var text = ehBase64UrlDecode(segments[1]);
  if (text === null) return null;
  try {
    var claims = JSON.parse(text);
    return claims !== null && typeof claims === "object" && !Array.isArray(claims) ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Seconds until `exp` from `nowSec`, or null when `exp` is missing or not a
 * number. A missing exp is NOT treated as fresh — see ehJwtIsExpired.
 */
export function ehJwtSecondsLeft(claims, nowSec) {
  if (!claims || typeof claims !== "object") return null;
  var exp = claims.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return exp - nowSec;
}

/**
 * Fail-closed expiry: expired when exp is past (or at) now, AND when exp is
 * missing or non-numeric. An unknown freshness must never render usage —
 * the caller surfaces the login-again message instead.
 */
export function ehJwtIsExpired(claims, nowSec) {
  var left = ehJwtSecondsLeft(claims, nowSec);
  if (left === null) return true;
  return left <= 0;
}

// ── Session surface parsers: field names match the captured shapes ────────

function ehNum(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function ehStr(value) {
  return typeof value === "string" ? value : null;
}

function ehBool(value) {
  return typeof value === "boolean" ? value : null;
}

/**
 * /v1/auth/subscription -> the captured shape, verbatim keys. `tier` and
 * `tier_label` are carried as RAW fields; the tier-mismatch note (criterion
 * 8) rides alongside and the fold never headlines them as the plan.
 */
export function ehParseSessionSubscription(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  var manage = data.manage !== null && typeof data.manage === "object" ? data.manage : {};
  return {
    tier: ehNum(data.tier),
    tier_label: ehStr(data.tier_label),
    active: ehBool(data.active),
    subscription_status: ehStr(data.subscription_status),
    cancel_at_period_end: ehBool(data.cancel_at_period_end),
    current_period_end: ehStr(data.current_period_end),
    payment_provider: ehStr(data.payment_provider),
    period: ehStr(data.period),
    premium_expiry: ehNum(data.premium_expiry),
    expires_in_days: ehNum(data.expires_in_days),
    amount: ehNum(data.amount),
    email: ehStr(data.email),
    email_verified: ehBool(data.email_verified),
    last_tier_change: ehNum(data.last_tier_change),
    manage: {
      method: ehStr(manage.method),
      has_portal: ehBool(manage.has_portal),
      can_cancel: ehBool(manage.can_cancel),
      portal_endpoint: ehStr(manage.portal_endpoint),
    },
  };
}

/** /v1/auth/permanent-credits/info -> the captured shape, verbatim keys. */
export function ehParseSessionPermanentCredits(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  return {
    balance: ehNum(data.balance),
    enabled: ehBool(data.enabled),
    total_purchased_usd: ehNum(data.total_purchased_usd),
    current_bonus_percentage: ehNum(data.current_bonus_percentage),
    next_discount_threshold: ehNum(data.next_discount_threshold),
    rate_limit_scale_tier: ehNum(data.rate_limit_scale_tier),
    rate_limit_scale_name: ehStr(data.rate_limit_scale_name),
    rate_limit_scale_next: ehStr(data.rate_limit_scale_next),
    monthly_limit: ehNum(data.monthly_limit),
    monthly_spent: ehNum(data.monthly_spent),
    monthly_remaining: ehNum(data.monthly_remaining),
    monthly_reset: ehStr(data.monthly_reset),
  };
}

/** /v1/flex-credits/info -> the captured shape, verbatim keys. */
export function ehParseSessionFlexCredits(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  return {
    flex_credits: ehNum(data.flex_credits),
    flex_credits_enabled: ehBool(data.flex_credits_enabled),
    weekly_save_limit: ehNum(data.weekly_save_limit),
    weekly_saved: ehNum(data.weekly_saved),
    weekly_save_remaining: ehNum(data.weekly_save_remaining),
    total_cap: ehNum(data.total_cap),
  };
}

/** Does the harvested session carry anything the section can draw? */
export function ehSessionHasContent(session) {
  if (!session || typeof session !== "object") return false;
  if (session.subscription !== null && typeof session.subscription === "object") return true;
  if (session.permanentCredits !== null && typeof session.permanentCredits === "object")
    return true;
  if (session.flexCredits !== null && typeof session.flexCredits === "object") return true;
  return false;
}
