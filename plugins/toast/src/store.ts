/**
 * The shared toast store.
 *
 * Plain module state, not a React hook and not a context: components subscribe
 * through `subscribeToasts` and re-render on change, so nothing needs a
 * provider and a toast can be raised from code that is not in a component at
 * all — an `apply()` body, a fetch handler, a plugin that has no UI of its own.
 *
 * Ported from aidos `src/client/toast-store.ts`, which is where this design was
 * proven. Three deliberate differences, each fixing something that only shows
 * up once the stack is global rather than owned by one panel:
 *
 *   - TIMERS COME FROM `globalThis`, not `window`, so this module loads and its
 *     behaviour is testable in plain node. The aidos original calls
 *     `window.clearTimeout`, which is why its store has no unit tests.
 *   - `getToasts()` IS EXPORTED, so a container mounting late can initialise
 *     from the current list instead of an empty one. Without it, a toast raised
 *     before React mounts is stored and never rendered — which is exactly the
 *     restart case, where the toast is raised at boot.
 *   - THE DURATION IS PER-TOAST, defaulting to the shared constant, because a
 *     refusal a user must read and an "it worked" want different lifetimes.
 */

/** Toast severities. `refusal` is for a refused action, not a crash. */
export type ToastKind = "refusal" | "info" | "success";

export interface Toast {
  readonly id: string;
  readonly text: string;
  readonly kind: ToastKind;
  /** Epoch ms at which this toast auto-dismisses. */
  readonly expiresAt: number;
}

/** How long a toast stays up unless the caller says otherwise. */
export const TOAST_DURATION_MS = 6_000;

let toasts: Toast[] = [];
const listeners = new Set<(toasts: readonly Toast[]) => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Monotonic fallback when `crypto.randomUUID` is unavailable (older webviews, node). */
let idCounter = 0;

function makeToastId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  idCounter += 1;
  return "toast-" + String(idCounter) + "-" + String(Date.now());
}

function emit(): void {
  const snapshot = toasts.slice();
  for (const listener of listeners) {
    // One bad subscriber must not stop the others from updating, or a thrown
    // render leaves half the UI showing a stale list.
    try {
      listener(snapshot);
    } catch (error) {
      console.error("[toast] listener threw:", error);
    }
  }
}

function removeToast(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    globalThis.clearTimeout(timer);
    timers.delete(id);
  }
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return; // already gone: no spurious emit
  toasts = next;
  emit();
}

/** The current list. Exported so a late-mounting container starts in sync. */
export function getToasts(): readonly Toast[] {
  return toasts;
}

/**
 * Show one toast; returns its id so the caller can dismiss it early.
 * @param text - the message. Plain text: it is rendered as a text node.
 * @param kind - severity, default `info`.
 * @param durationMs - lifetime, default {@link TOAST_DURATION_MS}.
 */
export function showToast(
  text: string,
  kind: ToastKind = "info",
  durationMs: number = TOAST_DURATION_MS,
): string {
  const id = makeToastId();
  toasts = toasts.concat({ id, text, kind, expiresAt: Date.now() + durationMs });
  emit();
  timers.set(
    id,
    globalThis.setTimeout(() => {
      removeToast(id);
    }, durationMs),
  );
  return id;
}

/** Cancel one toast before it auto-dismisses. Unknown ids are a no-op. */
export function dismissToast(id: string): void {
  removeToast(id);
}

/** Subscribe to the list; returns the unsubscribe disposer. */
export function subscribeToasts(listener: (toasts: readonly Toast[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset: clears the list and every pending timer. */
export function _resetToastsForTests(): void {
  for (const timer of timers.values()) globalThis.clearTimeout(timer);
  timers.clear();
  listeners.clear();
  toasts = [];
}
