/**
 * ElectronHub section fold: two fetch envelopes -> everything the panel renders.
 *
 * This module is deliberately dependency-free (no react, no CSS, no settings
 * panel, no node builtins): the fold is a pure function of its inputs, and
 * keeping it importable from vitest is what lets the table test pin the
 * never-a-bare-heading contract. client.tsx renders from this model; the
 * render code lives there, the state decision lives here.
 *
 * Ticket #141: this module now also owns the account/key-type detection and
 * the extended /user/me + /user/models parsers, because those are exactly the
 * parts that must be proven against fixture responses of all three account
 * shapes (regular ek- key, ek-dev- dev key, coding-plan subscription) and
 * importing the host half (index.ts) into vitest would drag in Cordis and
 * schemastery. index.ts imports these helpers and re-exports the two parsers
 * it previously owned.
 *
 * The predicate/filter agreement (item 4, #74): ehUsageHasContent counts only
 * endpoints that will actually RENDER. The endpointCards loop in client.tsx
 * skips any entry whose `name` is not a string, so these two must agree — if
 * one changes, change both.
 */

/** The failure string of one fetch result, or null. */
export function ehResultError(result, fallback) {
  if (!result) return null;
  if (typeof result.error === "string" && result.error !== "") return result.error;
  // request() in shared/client-util already folds an `{ error }` body into the
  // envelope's error, so this second branch only catches a route that answers
  // `{ ok: false }` without one.
  var body = result.data;
  if (body && typeof body === "object" && body.ok === false) {
    return typeof body.error === "string" && body.error !== "" ? body.error : fallback;
  }
  return null;
}

/** The payload of one fetch result, only when the route answered `ok: true`. */
export function ehResultBody(result) {
  if (!result) return null;
  var body = result.data;
  return body && typeof body === "object" && body.ok === true ? body : null;
}

// ── Account/key-type detection (#141) ───────────────────────────────────────

/** Dev keys answer 401 on BOTH usage endpoints — by design, not an invalid key. */
export var ELECTRONHUB_DEV_PREFIX = "ek-dev-";

/**
 * The one message a dev key may ever earn from this section. It must name the
 * design fact, never say "invalid": the key works fine for inference.
 */
export var ELECTRONHUB_DEV_NOTE =
  "usage endpoints are unavailable to dev keys (ek-dev-… answers HTTP 401 on " +
  "/user/me and /user/models by design — the key is valid for inference only)";

/** Dev key or not, decided by prefix BEFORE any request is sent. */
export function ehIsDevKey(key) {
  return typeof key === "string" && key.slice(0, ELECTRONHUB_DEV_PREFIX.length) === ELECTRONHUB_DEV_PREFIX;
}

/**
 * Coding-plan detection, from the /user/me payload's subscription/tier fields.
 * The coding plan announces itself as a subscription (or tier) whose name
 * mentions "coding" — as a plain string or inside a {tier}/{name} object.
 */
export function ehCodingPlanName(source) {
  if (!source || typeof source !== "object") return null;
  var candidates = [source.subscription, source.tier, source.plan];
  if (source.subscription && typeof source.subscription === "object") {
    candidates = [source.subscription.tier, source.subscription.name].concat(candidates);
  }
  for (var i = 0; i < candidates.length; i++) {
    var value = candidates[i];
    if (typeof value === "string" && /coding/i.test(value)) return value;
  }
  return null;
}

// ── Shared field coercion ────────────────────────────────────────────────────

/** Number or numeric string -> number; anything else -> null. */
export function ehNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** One daily history row; null when the entry carries no usable date. */
function ehHistoryEntry(item) {
  if (item === null || typeof item !== "object") return null;
  const entry = item;
  if (typeof entry.date !== "string" || entry.date === "") return null;
  return { date: entry.date, requests: ehNumber(entry.requests) ?? 0 };
}

/**
 * The reference monitor's _fmt_ts: a timestamp arriving as unix seconds,
 * unix milliseconds, or an ISO string -> a display string; null when none
 * of the three parse. (Seconds ~1.7e9, millis ~1.7e12; 1e11 splits them.)
 */
export function ehFormatTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value !== "") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
  const num = ehNumber(value);
  if (num === null) return null;
  const ms = Math.abs(num) >= 1e11 ? num : num * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** The reference's page-accurate percentage: round(min(100, used/limit*100)). */
export function ehPercent(used, limit) {
  const u = ehNumber(used);
  const l = ehNumber(limit);
  if (u === null || l === null || l <= 0) return null;
  return Math.round(Math.min(100, (u / l) * 100));
}

/** One claude/openai monthly box; null when the payload omits the block. */
function ehMonthlyBox(value) {
  if (value === null || typeof value !== "object") return null;
  const entry = value;
  const used = ehNumber(entry.used);
  const limit = ehNumber(entry.limit);
  if (used === null && limit === null && ehNumber(entry.remaining) === null) return null;
  return {
    used: used,
    limit: limit,
    remaining: ehNumber(entry.remaining),
    reset: ehFormatTimestamp(entry.reset),
    percent: ehPercent(used, limit),
  };
}

// ── /v1/user/me parser ───────────────────────────────────────────────────────

/** /v1/user/me payload -> the panel shape; missing fields degrade to null/empty. */
export function parseElectronHubUsage(data) {
  const source = data !== null && typeof data === "object" ? data : {};
  const usageSrc =
    source.usage !== null && typeof source.usage === "object" ? source.usage : {};
  const history = [];
  if (Array.isArray(source.history)) {
    for (const item of source.history) {
      const entry = ehHistoryEntry(item);
      if (entry !== null) history.push(entry);
    }
  }
  // `endpoints` is documented as an object keyed by endpoint path. The value
  // semantics are unverified, so accept counts (number or numeric string) and
  // treat a boolean as present(1)/absent(0) in case the field is a set.
  const endpoints = [];
  const endpointsSrc =
    source.endpoints !== null &&
    typeof source.endpoints === "object" &&
    !Array.isArray(source.endpoints)
      ? source.endpoints
      : {};
  for (const name of Object.keys(endpointsSrc)) {
    const value = endpointsSrc[name];
    const requests = ehNumber(value) ?? (value === true ? 1 : 0);
    endpoints.push({ name, requests });
  }
  // The tier may arrive as a plain string or as a {tier}/{name} object; both
  // fold to a display string. The coding-plan flag rides alongside it (#141).
  const codingPlanName = ehCodingPlanName(source);
  let subscription = null;
  if (typeof source.subscription === "string" && source.subscription !== "") {
    subscription = source.subscription;
  } else if (source.subscription && typeof source.subscription === "object") {
    const named = [source.subscription.tier, source.subscription.name].find(
      (candidate) => typeof candidate === "string" && candidate !== "",
    );
    if (typeof named === "string") subscription = named;
  }
  if (subscription === null && typeof source.tier === "string" && source.tier !== "") {
    subscription = source.tier;
  }
  return {
    subscription,
    codingPlan: codingPlanName !== null,
    credits: ehNumber(source.credits),
    weeklyCredits: ehNumber(source.weekly_credits),
    studioCredits: ehNumber(source.studio_credits),
    usage: {
      inputTokens: ehNumber(usageSrc.input_tokens) ?? 0,
      outputTokens: ehNumber(usageSrc.output_tokens) ?? 0,
    },
    monthly: {
      claude: ehMonthlyBox(source.claude_monthly_tokens),
      openai: ehMonthlyBox(source.openai_monthly_tokens),
    },
    history,
    endpoints,
  };
}

// ── /v1/user/models account-shape parser (#141) ──────────────────────────────

/** One per-model usage row of the account-scoped /user/models payload. */
function ehAccountModel(id, entry) {
  const src = entry !== null && typeof entry === "object" ? entry : {};
  return {
    id: String(id),
    requests: ehNumber(src.requests) ?? 0,
    inputTokens: ehNumber(src.input_tokens),
    outputTokens: ehNumber(src.output_tokens),
    totalCost: ehNumber(src.total_cost),
    ownedBy: typeof src.owned_by === "string" && src.owned_by !== "" ? src.owned_by : null,
  };
}

/**
 * /v1/user/models account shape -> per-model usage sorted by requests
 * (descending), plus total_consumption and a tolerant last_updated. Answers
 * null when the body is not the account shape (e.g. the public catalog), so
 * the caller can fall back. The reference's field map:
 * { total_consumption, last_updated, models: { id: { requests, input_tokens,
 * output_tokens, total_cost, owned_by } } }.
 */
export function parseElectronHubAccountModels(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const source = data;
  const modelsSrc = source.models;
  if (modelsSrc === null || typeof modelsSrc !== "object" || Array.isArray(modelsSrc)) return null;
  const ids = Object.keys(modelsSrc);
  if (ids.length === 0) return null;
  const entries = ids.map((id) => ehAccountModel(id, modelsSrc[id]));
  entries.sort((a, b) => b.requests - a.requests);
  return {
    entries,
    totalConsumption: ehNumber(source.total_consumption),
    lastUpdated: ehFormatTimestamp(source.last_updated),
  };
}

// ── Public-catalog parser (kept verbatim from index.ts, #43) ─────────────────

/**
 * /v1/models payload -> model names. The endpoint's shape is UNVERIFIED, so
 * accept the three shapes a catalog endpoint plausibly answers with: a bare
 * array, a `{data: [...]}` envelope, or a `{models: [...]}` wrapper. Each
 * item may be a string or an object carrying an id/name/slug/model-ish string
 * field; items that carry none of those are dropped rather than guessed at.
 */
export function parseElectronHubModels(data) {
  let items = data;
  if (items !== null && typeof items === "object" && !Array.isArray(items)) {
    const wrapper = items;
    if (Array.isArray(wrapper.data)) items = wrapper.data;
    else if (Array.isArray(wrapper.models)) items = wrapper.models;
    else return [];
  }
  if (!Array.isArray(items)) return [];
  const models = [];
  for (const item of items) {
    if (typeof item === "string") {
      if (item !== "") models.push(item);
      continue;
    }
    if (item === null || typeof item !== "object") continue;
    const entry = item;
    const name = [entry.id, entry.name, entry.slug, entry.model].find(
      (candidate) => typeof candidate === "string" && candidate !== "",
    );
    if (typeof name === "string") models.push(name);
  }
  return models;
}

// ── The fold ─────────────────────────────────────────────────────────────────

/** Does this usage payload carry anything the section can draw? */
export function ehUsageHasContent(usage) {
  if (!usage) return false;
  if (typeof usage.subscription === "string" && usage.subscription !== "") return true;
  if (typeof usage.credits === "number") return true;
  if (usage.usage && (Number(usage.usage.inputTokens) > 0 || Number(usage.usage.outputTokens) > 0))
    return true;
  if (Array.isArray(usage.history) && usage.history.length > 0) return true;
  // Count only endpoints that will actually RENDER. endpointCards skips any
  // entry whose `name` is not a string, so testing raw array length let a
  // hand-shaped legacy payload report "has content" and then draw a bare
  // heading with no cards beneath it. This predicate and that filter must
  // agree; if one changes, change both.
  if (
    Array.isArray(usage.endpoints) &&
    usage.endpoints.some((ep) => ep && typeof ep.name === "string")
  )
    return true;
  return false;
}

/** The one-line statement that the coding plan's live numbers are console-only. */
export var ELECTRONHUB_CODING_PLAN_NOTE =
  "Coding plan subscription: the live today/weekly headroom numbers are " +
  "console-only (they ride an authenticated WebSocket plus a browser session, " +
  "not REST), so they are not shown here — everything above is what the REST " +
  "API returns";

/**
 * Fold the two ElectronHub results into everything the section renders.
 *
 * The blank-section defect lived here. The old code knew exactly two states,
 * "an error string is present" and "data.ok === true", and drew a bare <h4>
 * for everything else — and two situations reach that gap:
 *
 *   1. `undefined` results. The panel restores its previous snapshot from
 *      localStorage before the first fetch resolves, and a snapshot written
 *      by a build that predates ElectronHub carries no ehUsage/ehModels keys.
 *   2. `ok: true` with an empty payload. Every field of parseElectronHubUsage
 *      degrades to null/0/[] when upstream answers a shape it does not know,
 *      so a successful fetch can still carry nothing to draw.
 *
 * Exactly one of errorLine / emptyLine / real content is now always present,
 * so the section can never render as a lone heading again.
 *
 * #141 additions: a dev-key payload (the host answers it from the key prefix
 * WITHOUT fetching) reads as ready-with-note, never as an error or as an
 * invalid key; a coding-plan payload gains the console-only note exactly
 * once; and the models envelope may carry the account-scoped per-model usage,
 * which is passed through for client.tsx to render.
 */
export function ehSectionModel(ehUsage, ehModels) {
  var errorLine =
    ehResultError(ehUsage, "usage unavailable") || ehResultError(ehModels, "models unavailable");

  var usage = ehResultBody(ehUsage);
  var modelsBody = ehResultBody(ehModels);
  var models = modelsBody && Array.isArray(modelsBody.models) ? modelsBody.models : null;
  // The host spreads the account usage into the envelope (camelCase); if a
  // raw account-shaped body arrives without it, derive it in place.
  var derivedAccount =
    modelsBody !== null && !Array.isArray(modelsBody.accountUsage)
      ? parseElectronHubAccountModels(modelsBody)
      : null;
  var accountUsage =
    modelsBody && Array.isArray(modelsBody.accountUsage)
      ? modelsBody.accountUsage
      : derivedAccount !== null
        ? derivedAccount.entries
        : null;
  if (accountUsage !== null && accountUsage.length === 0) accountUsage = null;

  var notes = [];
  if (usage && typeof usage.note === "string" && usage.note !== "") notes.push(usage.note);
  if (modelsBody) {
    if (typeof modelsBody.note === "string" && modelsBody.note !== "") notes.push(modelsBody.note);
    if (modelsBody.source === "catalog" && models !== null && models.length > 0) {
      notes.push("model list is ElectronHub's public catalog, not an account-scoped list");
    }
  }
  // The coding-plan limitation, stated ONCE and plainly — never as zeros or
  // wrong numbers standing in for the WebSocket-only headroom figures.
  if (usage && usage.codingPlan === true) notes.push(ELECTRONHUB_CODING_PLAN_NOTE);

  var hasContent =
    ehUsageHasContent(usage) ||
    (models !== null && models.length > 0) ||
    (accountUsage !== null && accountUsage.length > 0);

  // A dev key's answer IS the note: the section renders ready-with-note, not
  // an error, and never the "invalid key" reading (#74 kept honest).
  var isDevKeyAnswer = usage !== null && usage.devKey === true;

  var status;
  if (errorLine) status = "error";
  else if (usage === null && modelsBody === null) status = "pending";
  else if (isDevKeyAnswer) status = "ready";
  else if (!hasContent) status = "empty";
  else status = "ready";

  var emptyLine = null;
  if (status === "pending") emptyLine = "Loading ElectronHub usage…";
  else if (status === "empty") emptyLine = "ElectronHub reported no usage data for this key.";

  return {
    status: status,
    errorLine: errorLine ? "ElectronHub: " + errorLine : null,
    notes: notes,
    usage: usage,
    models: models,
    accountUsage: accountUsage,
    totalConsumption:
      modelsBody !== null
        ? (ehNumber(modelsBody.totalConsumption) ??
          (derivedAccount !== null ? derivedAccount.totalConsumption : null))
        : null,
    lastUpdated:
      modelsBody !== null
        ? (typeof modelsBody.lastUpdated === "string"
            ? modelsBody.lastUpdated
            : derivedAccount !== null
              ? derivedAccount.lastUpdated
              : null)
        : null,
    emptyLine: emptyLine,
  };
}
