/**
 * Safe caller for the `modal` plugin's published global.
 *
 * Client bundles cannot import each other, so the app-wide modal host is
 * reached through `window.__dshModal__` rather than an import — importing
 * `shared/plugin-modal` would bundle a private copy of the component and its
 * stylesheet into every consumer, which is exactly the duplication the modal
 * plugin (#93) exists to remove. Every call site would otherwise repeat the
 * same feature-detect, and the one that forgets it throws a TypeError in a
 * browser where the modal plugin is not installed.
 *
 * THE RULE THIS ENCODES — NOT toast's rule. A notification is never
 * load-bearing, so `toast-client` swallows failure and degrades to a no-op.
 * A MODAL IS LOAD-BEARING: composer-approvals answers approvals through it,
 * and if opening silently did nothing a human cannot answer and an agent
 * stays blocked forever. So this wrapper REPORTS unavailability instead of
 * pretending the modal opened: `openModal` returns `{ opened: false, reason }`
 * with a reason the caller MUST handle (fall back to an inline render, a
 * toast naming the failure, or an explicit error — never silence), and
 * `closeModal` returns false rather than no-opping. Like toast, it still
 * NEVER throws: reporting is a return value, not an exception.
 *
 * THE VERSION CHECK IS A SHAPE CHECK, not politeness: an absent host reads
 * as unavailable, a future breaking `version` bump reads as absent rather
 * than calling a method whose meaning changed underneath the caller, and the
 * global is RE-READ ON EVERY CALL, so a host that appears (or is torn down)
 * between calls is seen by the next call — never cached.
 *
 * This file mirrors `plugins/modal/src/registry.ts`'s guarded entry points
 * (`openModal` / `closeModal` / `modalAvailable` there) structurally rather
 * than importing them: importing across the plugin boundary would pull the
 * registry — and through it the plugin's source tree — into every consumer
 * bundle, and the registry's own doc names this file as the thin wrapper
 * over exactly those three. `MODAL_API_VERSION` here MUST stay in lockstep
 * with the registry's; registry.test.ts pins the two together.
 */

/** Versions of the published `window.__dshModal__` API this module drives. */
export const MODAL_API_VERSION = 1;

/** One of the two standard sizes; folded at render time by the shared component. */
export type ModalClientSize = "full" | "compact" | "default";

/** What a caller opens. Bodies are opaque nodes rendered by the host container. */
export interface ModalClientRequest {
  /** Header title node. */
  readonly title: unknown;
  /** Body node, rendered inside the panel's scrollable area. */
  readonly body: unknown;
  /** Optional action buttons, rendered into the shared right-aligned row. */
  readonly actions?: unknown;
  /** One of the two standard sizes. Defaults to "full" at render time. */
  readonly size?: ModalClientSize;
  /** Called after the modal closes (Escape, mask click, close button). */
  readonly onClose?: () => void;
}

export type ModalOpenResult =
  | { opened: true; id: string; reason?: undefined }
  | { opened: false; id: null; reason: string };

/** The shape published by plugins/modal. Kept structural: no import. */
interface ModalApi {
  version: number;
  open(request: ModalClientRequest): string;
  close(id: string): boolean;
  subscribe(listener: (open: readonly unknown[]) => void): () => void;
}

/**
 * Read the live published global and resolve it to a usable API, or null.
 * Re-read per call — this is the only place the global is touched.
 */
function api(): ModalApi | null {
  const found = (globalThis as { __dshModal__?: unknown }).__dshModal__;
  if (found === null || typeof found !== "object") return null;
  const candidate = found as Partial<ModalApi>;
  if (candidate.version !== MODAL_API_VERSION) return null;
  if (typeof candidate.open !== "function" || typeof candidate.close !== "function") {
    return null;
  }
  if (typeof candidate.subscribe !== "function") return null;
  return candidate as ModalApi;
}

/** Whether a modal opened right now would actually render. */
export function modalAvailable(): boolean {
  return api() !== null;
}

/**
 * Guarded cross-bundle open. NEVER throws; REPORTS instead (see the
 * load-bearing rule above). A caller that gets `opened: false` must handle
 * it — fall back, notify, or fail loudly — because its modal is not on
 * screen and on a load-bearing path nobody else will say so.
 */
export function openModal(request: ModalClientRequest): ModalOpenResult {
  const found = api();
  if (found === null) {
    return { opened: false, id: null, reason: "modal-unavailable" };
  }
  try {
    return { opened: true, id: found.open(request) };
  } catch (error) {
    // A broken host must not take down its caller — but unlike toast, the
    // failure is returned, not swallowed.
    console.error("[modal-client] open threw:", error);
    return { opened: false, id: null, reason: "modal-threw" };
  }
}

/**
 * Guarded cross-bundle close. False means "not closed": the host is absent,
 * the call threw, or the id was unknown. Accepts null so a caller can pass
 * `openModal()`'s id straight back — a null id closes nothing and reports it.
 */
export function closeModal(id: string | null): boolean {
  if (id === null) return false;
  const found = api();
  if (found === null) return false;
  try {
    return found.close(id);
  } catch (error) {
    console.error("[modal-client] close threw:", error);
    return false;
  }
}
