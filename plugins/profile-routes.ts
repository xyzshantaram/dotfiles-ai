/**
 * Shared route-chain model for the `profile` settings namespace.
 *
 * Used by plugins/profiles.ts (role-tool dispatch with fallback) and
 * plugins/see.ts (namespace owner; takes the chain head). One data model in
 * one file so the two bundles cannot drift.
 *
 * Since W21 a profile entry carries TWO named chains, one per agent depth:
 *
 *   { orchestrator: { routes: [ { provider, model }, ... ] },
 *     subagent:     { routes: [ { provider, model }, ... ] } }
 *
 * Depth-0 agents ride the orchestrator chain; spawned children (depth >= 1)
 * ride the subagent chain. The legacy shapes still resolve: a single route,
 * or an ordered `routes` chain. chainOf picks one named chain and falls back
 * to the other, then to the legacy shapes, then to [].
 *
 * The FIRST entry of a chain is its head; later entries are fallbacks tried
 * in order when a route fails (start error, or a foreground child ending
 * with stopReason "error"). Consumers that cannot retry (see) take the head.
 */

/** One routable provider/model pair. */
export interface RouteCandidate {
  provider: string;
  model: string;
}

/** Shape of one work/personal entry in the `profile` namespace section. */
export type ProfileEntry =
  | RouteCandidate
  | { routes?: RouteCandidate[] }
  | { orchestrator?: unknown; subagent?: unknown };

/** The two named chains of a profile entry (W21). */
export type ChainName = "orchestrator" | "subagent";

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

/**
 * Resolve one named chain of a profile entry. A nested entry (W21 shape)
 * yields its own chain first, then the other named chain, then []. A legacy
 * entry (single route or flat `routes`) yields normalizeEntry(entry). This
 * keeps see.ts and the pre-W21 settings shape working unchanged.
 */
export function chainOf(entry: unknown, chainName: ChainName): RouteCandidate[] {
  if (typeof entry === "object" && entry !== null) {
    const obj = entry as Record<string, unknown>;
    if ("orchestrator" in obj || "subagent" in obj) {
      const own = normalizeEntry(chainName === "orchestrator" ? obj.orchestrator : obj.subagent);
      if (own.length > 0) return own;
      const other = normalizeEntry(chainName === "orchestrator" ? obj.subagent : obj.orchestrator);
      if (other.length > 0) return other;
      return [];
    }
  }
  return normalizeEntry(entry);
}
