/**
 * Shared route-chain model for the `profile` settings namespace.
 *
 * Used by plugins/profiles.ts (role-tool dispatch with fallback) and
 * plugins/see.ts (namespace owner; walks the chain with retry). One data model in
 * one file so the two bundles cannot drift.
 *
 * Client bundles import from here too: plugins/profiles-client/src/client.tsx
 * pulls `entryHead`/`normalizeEntry`/`chainNameForRoutes`, and plugins/
 * subscriptions/src/client.tsx pulls `chainNameForRoutes`. esbuild inlines a
 * copy of this module into each built bundle (profiles-client/dist/client.js,
 * subscriptions/lib/client.js), so after editing this file, rebuild both
 * client bundles or the browser half keeps serving the stale copy.
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
 * with stopReason "error"). Consumers walk the chain in order, retrying the
 * next route on failure.
 */

/** One routable provider/model pair. */
export interface RouteCandidate {
  provider: string;
  model: string;
  /** Adapter-owned reasoning effort for this route; absence preserves the adapter default. */
  reasoningEffort?: string;
}

/** Shape of one work/personal entry in the `profile` namespace section. */
export type ProfileEntry =
  RouteCandidate | { routes?: RouteCandidate[] } | { orchestrator?: unknown; subagent?: unknown };

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
 * "chain:<name>" refs, and bare chain names — flattened in order. A
 * malformed or unknown step
 * resolves to [] for that step.
 */
export function normalizeEntry(
  entry: unknown,
  chains?: Record<string, unknown>,
  seen?: Set<string>,
): RouteCandidate[] {
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
    // A bare string names a chain key (W24), at the field level or inside a
    // composition array.
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
    // array are "chain:<name>" refs, a bare name keying the `chains` map
    // (same rule as at field level), or "provider/model" routes.
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
          } else if (chains?.[step] !== undefined) {
            const guard = new Set(seen ?? []);
            if (!guard.has(step)) {
              guard.add(step);
              out.push(...normalizeEntry(chains[step], chains, guard));
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
export function chainOf(
  entry: unknown,
  chainName: ChainName,
  chains?: Record<string, unknown>,
): RouteCandidate[] {
  if (typeof entry === "object" && entry !== null) {
    const obj = entry as Record<string, unknown>;
    if ("orchestrator" in obj || "subagent" in obj) {
      const own = normalizeEntry(
        chainName === "orchestrator" ? obj.orchestrator : obj.subagent,
        chains,
      );
      if (own.length > 0) return own;
      const other = normalizeEntry(
        chainName === "orchestrator" ? obj.subagent : obj.orchestrator,
        chains,
      );
      if (other.length > 0) return other;
      return [];
    }
  }
  return normalizeEntry(entry, chains);
}

/**
 * W21-aware head picker: the first route of an entry's effective chain.
 *
 * A nested entry `{ orchestrator, subagent }` picks the orchestrator chain's
 * head first, then the subagent chain's head. Any other shape (single route,
 * `{ routes }`, composition array, string ref) falls through to
 * normalizeEntry and yields its first candidate, or undefined when the
 * entry is absent or malformed.
 *
 * One intentional narrowing vs the old client copy: per W24 every named
 * chain value is a `{ routes }` shape, so a chain value that is itself
 * W21-shaped (an `{ orchestrator, subagent }` object) resolves to
 * undefined instead of recursing into it.
 */
export function entryHead(
  entry: unknown,
  chains?: Record<string, unknown>,
): RouteCandidate | undefined {
  if (typeof entry === "object" && entry !== null) {
    const obj = entry as Record<string, unknown>;
    if ("orchestrator" in obj || "subagent" in obj) {
      return entryHead(obj.orchestrator, chains) ?? entryHead(obj.subagent, chains);
    }
  }
  return normalizeEntry(entry, chains)[0];
}

/**
 * True when two route lists are identical: same length, same provider and
 * model in the same order. Ported from the profiles-client copy, including
 * its Array.isArray guards.
 */
export function routesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = (a as RouteCandidate[])[i];
    const right = (b as RouteCandidate[])[i];
    if (left.provider !== right.provider || left.model !== right.model) return false;
  }
  return true;
}

/**
 * Reverse-match a chain name from its resolved routes.
 *
 * Iterates the chain map in key order and returns the first name whose
 * normalized routes equal the given list, else undefined. Used to recover
 * the original chain name after the server resolves string refs away.
 */
export function chainNameForRoutes(
  routes: RouteCandidate[],
  chains?: Record<string, unknown>,
): string | undefined {
  if (chains === undefined || chains === null) return undefined;
  for (const name of Object.keys(chains)) {
    if (routesEqual(normalizeEntry(chains[name], chains), routes)) return name;
  }
  return undefined;
}
