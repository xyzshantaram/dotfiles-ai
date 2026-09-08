/**
 * ElectronHub section fold: two fetch envelopes -> everything the panel renders.
 *
 * This module is deliberately dependency-free (no react, no CSS, no settings
 * panel): the fold is a pure function of its two inputs, and keeping it
 * importable from vitest is what lets the table test pin the
 * never-a-bare-heading contract. client.tsx renders from this model; the
 * render code lives there, the state decision lives here.
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
 */
export function ehSectionModel(ehUsage, ehModels) {
  var errorLine =
    ehResultError(ehUsage, "usage unavailable") || ehResultError(ehModels, "models unavailable");

  var usage = ehResultBody(ehUsage);
  var modelsBody = ehResultBody(ehModels);
  var models = modelsBody && Array.isArray(modelsBody.models) ? modelsBody.models : null;

  var notes = [];
  if (usage && typeof usage.note === "string" && usage.note !== "") notes.push(usage.note);
  if (modelsBody) {
    if (typeof modelsBody.note === "string" && modelsBody.note !== "") notes.push(modelsBody.note);
    if (modelsBody.source === "catalog" && models !== null && models.length > 0) {
      notes.push("model list is ElectronHub's public catalog, not an account-scoped list");
    }
  }

  var hasContent = ehUsageHasContent(usage) || (models !== null && models.length > 0);

  var status;
  if (errorLine) status = "error";
  else if (usage === null && modelsBody === null) status = "pending";
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
    emptyLine: emptyLine,
  };
}
