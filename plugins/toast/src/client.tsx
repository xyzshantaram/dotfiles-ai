/**
 * toast — one toast stack for the whole app (client half).
 *
 * WHY IT IS ITS OWN PLUGIN. The design is aidos's, and it works; what it
 * cannot do is serve anyone else. Its container mounts inside the board view
 * (`local-ticket-view.tsx`), so a toast raised while the user is on another
 * tab renders nowhere, and no other package can reach `showToast` at all,
 * because client bundles cannot import each other. Hoisting the stack into
 * `shell.overlay` and publishing one global makes it a surface every plugin
 * shares instead of a feature one panel owns.
 *
 * WHERE IT MOUNTS. `shell.overlay` is declared by `dsh-client-ui-layout` as
 * `{ kind: "list", scope: "root" }` — a root-scoped additive slot rendered in
 * the frame's own overlay layer, above every column and outside any session.
 * A list slot means we add an entry; nothing already there is replaced.
 *
 * THE SEAM: `window.__dshToast__`.
 *
 * The only way a separate bundle (aidos) can hook in, since imports do not
 * cross bundles. It is versioned so a caller can feature-detect a shape rather
 * than assume one, and callers must tolerate its absence: this plugin may not
 * be installed, and a missing toast must never break the feature that wanted
 * one. `plugins/shared/toast-client.ts` is that safe caller for plugins in
 * this repository; aidos does the same three-line check against the global.
 */
import react from "react";

import { injectStyle } from "../../shared/client-util";
import localCss from "./client.module.css";
import {
  type Toast,
  type ToastKind,
  dismissToast,
  getToasts,
  showToast,
  subscribeToasts,
} from "./store";

const PLUGIN_NAME = "toast";
const STYLE_TAG_ID = "dsh-toast-styles";

/** The published global. Bump `version` only for a breaking shape change. */
const TOAST_API_VERSION = 1;

var inject = ["slots"];
var name = PLUGIN_NAME;

/**
 * The stack. Initial state is the CURRENT list rather than an empty one: a
 * toast can be raised before this ever mounts — the restart flash is raised
 * during apply() — and starting empty would drop it until the next unrelated
 * toast happened to force a re-render.
 */
function ToastStack() {
  const [toasts, setToasts] = react.useState(getToasts() as readonly Toast[]);

  react.useEffect(function () {
    // Re-read on mount as well as subscribing: a toast raised between the
    // initial state and this effect would otherwise be missed.
    setToasts(getToasts());
    return subscribeToasts(setToasts);
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="dsh-toast-stack">
      {toasts.map(function (toast) {
        // The row is inlined rather than a component so `key` lands on a plain
        // element: a typed component's props do not carry `key`, and adding one
        // to satisfy the compiler would document a prop React never delivers.
        return (
          <div
            key={toast.id}
            className={"dsh-toast dsh-toast-" + toast.kind}
            role="status"
            aria-live="polite"
          >
            <span className="dsh-toast-text">{toast.text}</span>
            <button
              className="dsh-toast-dismiss"
              aria-label="Dismiss notification"
              onClick={function () {
                dismissToast(toast.id);
              }}
            >
              {"\u00d7"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface ToastApi {
  version: number;
  show(text: string, kind?: ToastKind, durationMs?: number): string;
  dismiss(id: string): void;
  subscribe(listener: (toasts: readonly Toast[]) => void): () => void;
}

function apply(ctx: any) {
  ctx.effect(function () {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, localCss);
  }, "toast: styles");

  // Publish the cross-bundle seam, and take it down with the plugin so a
  // stopped plugin does not leave a global pointing at a dead store.
  ctx.effect(function () {
    const api: ToastApi = {
      version: TOAST_API_VERSION,
      show: showToast,
      dismiss: dismissToast,
      subscribe: subscribeToasts,
    };
    (globalThis as any).__dshToast__ = api;
    return function () {
      if ((globalThis as any).__dshToast__ === api) {
        delete (globalThis as any).__dshToast__;
      }
    };
  }, "toast: window.__dshToast__");

  ctx.slots.inject("shell.overlay", function () {
    return ctx.slots.register({ name: "shell.overlay", id: PLUGIN_NAME }, ToastStack);
  });
}

export { apply, inject, name };
