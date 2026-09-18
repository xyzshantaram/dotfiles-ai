// One value per browser session.
//
// The toolkit hands every request a session id, taken from the
// wizard-sid cookie. Module level state in a wizard module is shared by
// every browser that talks to one server, so two windows mix their
// answers. A store keyed by session id keeps them apart.
//
// The cap bounds memory on a long lived server. The map keeps insertion
// order, so the first key is the least recently used one.

export interface SessionStore<T> {
  /** The value for one session. It is created on first use. */
  for(sessionId: string): T;
  /** Forget one session, for a reset or a test. */
  drop(sessionId: string): void;
  /** How many sessions the store holds right now. */
  size(): number;
}

// Session id for a call that carries no context. Older step functions
// take no context argument, and tests call helpers directly, so both
// land on one shared value instead of throwing.
export const DEFAULT_SESSION = "default";

/** Read the session id from an optional wizard context. */
export function sidOf(ctx?: { sessionId?: string }): string {
  const id = ctx?.sessionId ?? "";
  return id === "" ? DEFAULT_SESSION : id;
}

/** Build a store that makes one value per session, up to a cap. */
export function sessionStore<T>(make: () => T, cap = 50): SessionStore<T> {
  const values = new Map<string, T>();
  return {
    for(sessionId: string): T {
      const held = values.get(sessionId);
      if (held !== undefined) {
        // Delete then set moves the key to the end, so the first key
        // stays the least recently used one.
        values.delete(sessionId);
        values.set(sessionId, held);
        return held;
      }
      const made = make();
      values.set(sessionId, made);
      while (values.size > cap) {
        const oldest = values.keys().next().value;
        if (oldest === undefined) break;
        values.delete(oldest);
      }
      return made;
    },
    drop(sessionId: string): void {
      values.delete(sessionId);
    },
    size(): number {
      return values.size;
    },
  };
}
