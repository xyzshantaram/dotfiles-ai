// Host half of the durable todos plugin.
// Registers the mirror projection and warms its snapshot so the panel renders
// right after a reopen instead of waiting for the next todo write.
import type { Context } from "@deepseek-ai/cordis";
import type { Session } from "@deepseek-ai/dsh-session";
import { durableTodosProjection } from "./projection.js";

const name = "durable-todos";

/** Repeat warms that cover a session log which is still loading. */
const REWARM_DELAYS_MS = [300, 1500];

function apply(ctx: Context): void {
  ctx.inject(["sessionProjections"], (scope: Context) => {
    const dispose = scope.sessionProjections.register(durableTodosProjection);
    scope.effect(() => dispose);

    // Own the re-warm timers. The context timer service is not part of the
    // typed surface here, so this plugin holds its own handles and clears any
    // pending one on disposal.
    const timers = new Set<ReturnType<typeof setTimeout>>();
    scope.effect(() => () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    });

    // A warm failure must never break session startup, so every call is
    // guarded and the error is dropped.
    const warm = (session: Session): void => {
      try {
        scope.sessionProjections.snapshot(session);
      } catch {
        // ignored on purpose
      }
    };

    const warmNowAndLater = (session: Session): void => {
      warm(session);
      for (const delay of REWARM_DELAYS_MS) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          warm(session);
        }, delay);
        timers.add(timer);
      }
    };

    // The listeners bind to the injected scope, not the outer context. Cordis
    // disposes them with the service, so a service remount cannot leave a
    // second copy of each listener behind.
    scope.on("session/created", warmNowAndLater);
    scope.on("agent/session-start", (payload) => {
      warmNowAndLater(payload.agent.session);
    });
  });
}

export { apply, name };
