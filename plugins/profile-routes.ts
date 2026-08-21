/**
 * Shared route-chain model for the `profile` settings namespace.
 *
 * Used by plugins/profiles.ts (role-tool dispatch with fallback) and
 * plugins/see.ts (namespace owner; takes the chain head). One data model in
 * one file so the two bundles cannot drift.
 *
 * A profile entry accepts either legacy single-route shape or a chain:
 *
 *   { provider: meridian, model: claude-opus-5 }          # single route
 *   { routes: [ { provider, model }, ... ] }              # ordered chain
 *
 * The FIRST entry is the primary route; later entries are fallbacks tried in
 * order when a route fails (start error, or a foreground child ending with
 * stopReason "error"). Consumers that cannot retry (see) take the head.
 */

/** One routable provider/model pair. */
export interface RouteCandidate {
  provider: string;
  model: string;
}

/** Shape of one work/personal entry in the `profile` namespace section. */
export type ProfileEntry = RouteCandidate | { routes?: RouteCandidate[] };

function isRouteCandidate(value: unknown): value is RouteCandidate {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { provider?: unknown }).provider === "string" &&
    typeof (value as { model?: unknown }).model === "string"
  );
}

/**
 * Normalize one profile entry into an ordered candidate list. Returns [] when
 * the entry is absent or malformed, so callers fall through to their own
 * defaults instead of throwing on hand-edited settings.
 */
export function normalizeEntry(entry: unknown): RouteCandidate[] {
  if (isRouteCandidate(entry)) return [entry];
  if (typeof entry === "object" && entry !== null && Array.isArray((entry as { routes?: unknown }).routes)) {
    return (entry as { routes: unknown[] }).routes.filter(isRouteCandidate);
  }
  return [];
}
