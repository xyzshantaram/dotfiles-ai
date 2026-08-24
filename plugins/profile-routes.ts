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
 * Since W24 a chain may be defined once and referenced by name. The `profile`
 * namespace may carry a `chains` map (name -> { routes: [...] }). Either
 * field of a W21 entry may reference it: a STRING "chain:<name>" extends the
 * named chain, "provider/model" is one inline route, or the field may be an
 * ARRAY of those steps flattened in order. A missing or unknown reference
 * resolves to [] exactly like a malformed inline entry.
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
 * defaults instead of throwing on hand-edited settings. A string entry names
 * a chain by name ("chain:<name>"), or one "provider/model" route. An entry
 * may also be an ARRAY of steps — route pairs, "provider/model" strings,
 * and "chain:<name>" refs — flattened in order. A malformed or unknown step
 * resolves to [] for that step.
 */
export function normalizeEntry(entry: unknown, chains?: Record<string, unknown>, seen?: Set<string>): RouteCandidate[] {
  if (isRouteCandidate(entry)) return [entry];
  if (typeof entry === "string") {
    // "chain:<name>" extends another chain; "provider/model" is one route.
    if (entry.startsWith("chain:")) {

      const name = entry.slice("chain:".length);
      if (chains?.[name] === undefined) return [];
      const guard = new Set(seen ?? []);
      if (guard.has(name)) return [];
      guard.add(name);
      return normalizeEntry(chains[name], chains, guard);
    }
    const slash = entry.indexOf("/");
    if (slash > 0) {
      return [{ provider: entry.slice(0, slash), model: entry.slice(slash + 1) }];
    }
    // A bare string at the FIELD level names a chain key (W24); inside an
    // array (composition) bare names are skipped instead.
    if (chains?.[entry] !== undefined) {
      const guard = new Set(seen ?? []);
      if (guard.has(entry)) return [];
      guard.add(entry);
      return normalizeEntry(chains[entry], chains, guard);
    }
    return [];

  }
  if (typeof entry === "object" && entry !== null) {
    if (Array.isArray((entry as { routes?: unknown }).routes)) {
      return (entry as { routes: unknown[] }).routes.filter(isRouteCandidate);
    }
    // Composition: an array of steps, flattened in order. Strings inside an
    // array are either "chain:<name>" refs or "provider/model" routes; a bare
    // name is skipped (no legacy chain references inside composition).
    if (Array.isArray(entry)) {
      const out: RouteCandidate[] = [];
      for (const step of entry) {
        if (typeof step === "string") {
          if (step.startsWith("chain:")) {
            const name = step.slice("chain:".length);
            if (chains?.[name] !== undefined) {
              const guard = new Set(seen ?? []);
              if (!guard.has(name)) {
                guard.add(name);
                out.push(...normalizeEntry(chains[name], chains, guard));
              }
            }
          } else if (step.indexOf("/") > 0) {
            const slash = step.indexOf("/");
            out.push({ provider: step.slice(0, slash), model: step.slice(slash + 1) });
          }
        } else {
          out.push(...normalizeEntry(step, chains, seen));
        }
      }
      return out;
    }
  }
  return [];
}


/**
 * Resolve one named chain of a profile entry. A nested entry (W21 shape)
 * yields its own chain first, then the other named chain, then []. Either
 * field may be a STRING naming a key in `chains`; the map is passed down to
 * normalizeEntry. A legacy entry (single route or flat `routes`) yields
 * normalizeEntry(entry). This keeps see.ts and the pre-W21 settings shape
 * working unchanged.
 */
export function chainOf(entry: unknown, chainName: ChainName, chains?: Record<string, unknown>): RouteCandidate[] {
  if (typeof entry === "object" && entry !== null) {
    const obj = entry as Record<string, unknown>;
    if ("orchestrator" in obj || "subagent" in obj) {
      const own = normalizeEntry(chainName === "orchestrator" ? obj.orchestrator : obj.subagent, chains);
      if (own.length > 0) return own;
      const other = normalizeEntry(chainName === "orchestrator" ? obj.subagent : obj.orchestrator, chains);
      if (other.length > 0) return other;
      return [];
    }
  }
  return normalizeEntry(entry, chains);
}
