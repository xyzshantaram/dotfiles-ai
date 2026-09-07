/**
 * Safe caller for the `toast` plugin's published global.
 *
 * Client bundles cannot import each other, so the toast stack is reached
 * through `window.__dshToast__` rather than an import. Every call site would
 * otherwise repeat the same feature-detect, and the one that forgets it throws
 * a TypeError in a browser where the toast plugin is not installed.
 *
 * THE RULE THIS ENCODES: a notification is never load-bearing. If the stack is
 * absent, the caller's own work must still succeed, so every function here
 * degrades to a no-op and reports what it did rather than throwing. `toast()`
 * returning null means "not shown", which a caller may log and otherwise
 * ignore.
 *
 * The version check is a shape check, not politeness: a future breaking change
 * bumps `version`, and this returns false rather than calling a method whose
 * meaning changed underneath it.
 */

export type ToastKind = "refusal" | "info" | "success";

/** The shape published by plugins/toast. Kept structural: no import. */
interface ToastApi {
  version: number;
  show(text: string, kind?: ToastKind, durationMs?: number): string;
  dismiss(id: string): void;
}

/** Versions of the published API this module knows how to drive. */
const SUPPORTED_VERSION = 1;

function api(): ToastApi | null {
  const found = (globalThis as { __dshToast__?: unknown }).__dshToast__;
  if (found === null || typeof found !== "object") return null;
  const candidate = found as Partial<ToastApi>;
  if (candidate.version !== SUPPORTED_VERSION) return null;
  if (typeof candidate.show !== "function" || typeof candidate.dismiss !== "function") return null;
  return candidate as ToastApi;
}

/** Whether a toast raised right now would actually be shown. */
export function toastAvailable(): boolean {
  return api() !== null;
}

/**
 * Raise one toast.
 * @returns its id, or null when no toast stack is loaded or the call threw.
 */
export function toast(text: string, kind: ToastKind = "info", durationMs?: number): string | null {
  const found = api();
  if (found === null) return null;
  try {
    return found.show(text, kind, durationMs);
  } catch (error) {
    // A broken toast stack must not take down its caller.
    console.error("[toast-client] show threw:", error);
    return null;
  }
}

/** Dismiss a toast early. Accepts null so a caller can pass `toast()`'s result straight back. */
export function dismissToast(id: string | null): void {
  if (id === null) return;
  const found = api();
  if (found === null) return;
  try {
    found.dismiss(id);
  } catch (error) {
    console.error("[toast-client] dismiss threw:", error);
  }
}
