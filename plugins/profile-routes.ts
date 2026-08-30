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
 *
 * A route row with a blank provider or a blank model is dropped during
 * normalization, because the agent loop rejects a proposal with an empty
 * route.
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
/** Minimal cordis Context surface used for optional route-decision logging. */
interface RouteCtx {
  logger?: {
    error(msg: string): void;
    warn(msg: string): void;
    info(msg: string): void;
    debug(msg: string): void;
  };
}

function isRouteCandidate(value: unknown): value is RouteCandidate {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { provider?: unknown }).provider === "string" &&
    (value as { provider: string }).provider.length > 0 &&
    typeof (value as { model?: unknown }).model === "string" &&
    (value as { model: string }).model.length > 0
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
  ctx?: RouteCtx,
): RouteCandidate[] {
  if (isRouteCandidate(entry)) return [entry];
  if (typeof entry === "string") {
    // "chain:<name>" extends another chain; "provider/model" is one route.
    if (entry.startsWith("chain:")) {
      const name = entry.slice("chain:".length);
      if (chains?.[name] === undefined) {
        ctx?.logger?.debug(`unknown chain reference: ${name}`);
        return [];
      }
      const guard = new Set(seen ?? []);
      if (guard.has(name)) {
        ctx?.logger?.debug(`circular chain reference: ${name}`);
        return [];
      }
      guard.add(name);
      return normalizeEntry(chains[name], chains, guard, ctx);
    }
    const slash = entry.indexOf("/");
    if (slash > 0) {
      return [{ provider: entry.slice(0, slash), model: entry.slice(slash + 1) }];
    }
    // A bare string names a chain key (W24), at the field level or inside a
    // composition array.
    if (chains?.[entry] !== undefined) {
      const guard = new Set(seen ?? []);
      if (guard.has(entry)) {
        ctx?.logger?.debug(`circular chain reference: ${entry}`);
        return [];
      }
      guard.add(entry);
      return normalizeEntry(chains[entry], chains, guard, ctx);
    }
    ctx?.logger?.debug(`unknown chain reference: ${entry}`);
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
                out.push(...normalizeEntry(chains[name], chains, guard, ctx));
              }
            }
          } else if (chains?.[step] !== undefined) {
            const guard = new Set(seen ?? []);
            if (!guard.has(step)) {
              guard.add(step);
              out.push(...normalizeEntry(chains[step], chains, guard, ctx));
            }
          } else if (step.indexOf("/") > 0) {
            const slash = step.indexOf("/");
            out.push({ provider: step.slice(0, slash), model: step.slice(slash + 1) });
          }
        } else {
          out.push(...normalizeEntry(step, chains, seen, ctx));
        }
      }
      return out;
    }
  }
  ctx?.logger?.debug("profile entry resolved to empty chain");
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
  ctx?: RouteCtx,
): RouteCandidate[] {
  if (typeof entry === "object" && entry !== null) {
    const obj = entry as Record<string, unknown>;
    if ("orchestrator" in obj || "subagent" in obj) {
      const own = normalizeEntry(
        chainName === "orchestrator" ? obj.orchestrator : obj.subagent,
        chains,
        undefined,
        ctx,
      );
      if (own.length > 0) {
        ctx?.logger?.info(`chain resolved: ${chainName} -> ${own[0].provider}/${own[0].model}`);
        return own;
      }
      const otherName = chainName === "orchestrator" ? "subagent" : "orchestrator";
      const other = normalizeEntry(
        chainName === "orchestrator" ? obj.subagent : obj.orchestrator,
        chains,
        undefined,
        ctx,
      );
      if (other.length > 0) {
        ctx?.logger?.warn(`fallback: ${chainName} chain empty, using ${otherName} chain`);
        return other;
      }
      ctx?.logger?.debug(`no routes in entry for ${chainName} chain`);
      return [];
    }
  }
  const resolved = normalizeEntry(entry, chains, undefined, ctx);
  if (resolved.length > 0) {
    ctx?.logger?.info(
      `chain resolved: ${chainName} -> ${resolved[0].provider}/${resolved[0].model}`,
    );
  } else {
    ctx?.logger?.debug(`no routes for ${chainName} chain`);
  }
  return resolved;
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
  ctx?: RouteCtx,
): RouteCandidate | undefined {
  if (typeof entry === "object" && entry !== null) {
    const obj = entry as Record<string, unknown>;
    if ("orchestrator" in obj || "subagent" in obj) {
      return entryHead(obj.orchestrator, chains, ctx) ?? entryHead(obj.subagent, chains, ctx);
    }
  }
  const head = normalizeEntry(entry, chains, undefined, ctx)[0];
  if (head !== undefined) {
    ctx?.logger?.info(`route head: ${head.provider}/${head.model}`);
  } else {
    ctx?.logger?.debug("no route head resolved");
  }
  return head;
}

/**
 * True when two route lists are identical: same length, same provider,
 * model, and reasoning effort in the same order.
 * its Array.isArray guards.
 */
export function routesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = (a as RouteCandidate[])[i];
    const right = (b as RouteCandidate[])[i];
    if (
      left.provider !== right.provider ||
      left.model !== right.model ||
      left.reasoningEffort !== right.reasoningEffort
    )
      return false;
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
