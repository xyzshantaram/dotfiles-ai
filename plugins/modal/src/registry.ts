/**
 * The modal registry: everything about the `modal` runtime plugin that is
 * testable without a DOM.
 *
 * The plugin itself (client.tsx) mounts one container into `shell.overlay`
 * and publishes it at `window.__dshModal__`, mirroring `plugins/toast`. This
 * module holds the three pieces a test can drive in plain node:
 *
 *   1. VERSION NEGOTIATION (`resolveModalApi`) — the shape check a caller
 *      runs against the published global before trusting it.
 *   2. THE REGISTRY (`createModalRegistry`) — the open/close/subscribe store
 *      the container renders. Plain module state behind a factory (not a
 *      singleton) so tests get isolated instances; client.tsx owns the one
 *      live instance.
 *   3. AVAILABILITY REPORTING (`openModal` / `closeModal` / `modalAvailable`)
 *      — the guarded cross-bundle entry points. The future
 *      `plugins/shared/modal-client.ts` is a thin wrapper over these three
 *      against the live global; it is not created in this ticket.
 *
 * THE LOAD-BEARING INVERSION — the single most important design decision in
 * this ticket, stated deliberately. Toast's rule is "a notification is never
 * load-bearing" (shared/toast-client.ts): its wrapper swallows failure and
 * degrades to a no-op, so a caller can ignore the result. A MODAL IS
 * LOAD-BEARING here: composer-approvals answers approvals through it, and if
 * opening silently does nothing a human cannot answer and an agent stays
 * blocked forever. So these wrappers REPORT unavailability instead of
 * pretending the modal opened: `openModal` returns `{ opened: false, ... }`
 * with a reason the caller MUST handle (fall back to an inline render, a
 * toast naming the failure, or an explicit error — never silence), and
 * `closeModal` returns false rather than no-opping. They still NEVER throw:
 * reporting is a return value, not an exception.
 *
 * SIZES. The request carries `size` spelled exactly as the shared
 * component's `PluginModalSize` (imported as a type only, so this module
 * loads with no DOM, no CSS, and no React). Folding onto the two standard
 * sizes stays in the component (`standardSize` in plugin-modal.tsx): the
 * registry passes the value through untouched, so there is exactly one
 * place that decides what a size means.
 *
 * BODIES ARE OPAQUE HERE. `title`, `body` and `actions` cross bundle
 * boundaries as `unknown` payloads the container hands back to the shared
 * `<PluginModal>` for rendering. Today's two consumers render rich,
 * interactive content (job-viewer's output box, the approvals rows), so a
 * text-only schema cannot serve them; the container renders whatever node
 * the caller stored. The cost is documented on the container: a body that
 * needs a context its own tree provides loses it, because it renders in the
 * host's tree. Data-only callers (a title plus text) work unchanged.
 */

import type { PluginModalSize } from "../../shared/plugin-modal";

/** Versions of the published `window.__dshModal__` API this module drives. */
export const MODAL_API_VERSION = 1;

/** What a caller stores when it opens a modal. Bodies are opaque (see above). */
export interface ModalOpenRequest {
  /** Header title node. */
  readonly title: unknown;
  /** Body node, rendered inside the panel's scrollable area. */
  readonly body: unknown;
  /** Optional action buttons, rendered into the shared right-aligned row. */
  readonly actions?: unknown;
  /** One of the two standard sizes. Defaults to "full" at render time. */
  readonly size?: PluginModalSize;
  /** Called after the modal closes (Escape, mask click, close button). */
  readonly onClose?: () => void;
}

/** A stored request with its id. What subscribers (the container) render. */
export interface ModalRecord extends ModalOpenRequest {
  readonly id: string;
}

export type ModalListener = (open: readonly ModalRecord[]) => void;

/** The open/close/subscribe store behind the container. */
export interface ModalRegistry {
  /** Store a request and return its id. Throws on a non-object request. */
  open(request: ModalOpenRequest): string;
  /** Remove one modal. Returns false for an unknown id. */
  close(id: string): boolean;
  /** The current list, oldest first. */
  getOpen(): readonly ModalRecord[];
  /** Subscribe to the list; returns the unsubscribe disposer. */
  subscribe(listener: ModalListener): () => void;
}

/** Monotonic fallback when `crypto.randomUUID` is unavailable. */
let idCounter = 0;

function makeModalId(): string {
  const c = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof c.crypto?.randomUUID === "function") return c.crypto.randomUUID();
  idCounter += 1;
  return "modal-" + String(idCounter) + "-" + String(Date.now());
}

/** A fresh, isolated registry. The live one lives in client.tsx. */
export function createModalRegistry(): ModalRegistry {
  let open: ModalRecord[] = [];
  const listeners = new Set<ModalListener>();

  function emit(): void {
    const snapshot = open.slice();
    for (const listener of listeners) {
      // One bad subscriber must not stop the others, or a thrown render
      // leaves the container showing a stale list on a load-bearing path.
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[modal] listener threw:", error);
      }
    }
  }

  return {
    open(request: ModalOpenRequest): string {
      if (request === null || typeof request !== "object") {
        throw new TypeError("[modal] open() needs a request object");
      }
      const id = makeModalId();
      open = open.concat({ ...request, id });
      emit();
      return id;
    },
    close(id: string): boolean {
      const next = open.filter((record) => record.id !== id);
      if (next.length === open.length) return false; // unknown id: report, don't pretend
      open = next;
      emit();
      return true;
    },
    getOpen(): readonly ModalRecord[] {
      return open.slice();
    },
    subscribe(listener: ModalListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The shape published at `window.__dshModal__`. Kept structural: no import. */
export interface ModalApi {
  version: number;
  open(request: ModalOpenRequest): string;
  close(id: string): boolean;
  subscribe(listener: ModalListener): () => void;
}

/**
 * Version negotiation: resolve an unknown global value to a usable API, or
 * null. Mirrors shared/toast-client.ts:32-39 exactly — an object, the
 * supported version, the expected functions — so a future breaking change
 * that bumps `version` reads as "absent" rather than calling a method whose
 * meaning changed underneath the caller.
 */
export function resolveModalApi(candidate: unknown): ModalApi | null {
  if (candidate === null || typeof candidate !== "object") return null;
  const api = candidate as Partial<ModalApi>;
  if (api.version !== MODAL_API_VERSION) return null;
  if (typeof api.open !== "function" || typeof api.close !== "function") return null;
  if (typeof api.subscribe !== "function") return null;
  return api as ModalApi;
}

/** Read the live published global. Null unless a compatible host is loaded. */
export function readModalGlobal(): ModalApi | null {
  return resolveModalApi((globalThis as { __dshModal__?: unknown }).__dshModal__);
}

/** Whether an open right now would actually render. */
export function modalAvailable(): boolean {
  return readModalGlobal() !== null;
}

export type ModalOpenResult =
  | { opened: true; id: string; reason?: undefined }
  | { opened: false; id: null; reason: string };

/**
 * Guarded cross-bundle open. NEVER throws; REPORTS instead (see the
 * load-bearing inversion above). A caller that gets `opened: false` must
 * handle it — fall back, notify, or fail loudly — because its modal is not
 * on screen and on a load-bearing path nobody else will say so.
 */
export function openModal(request: ModalOpenRequest): ModalOpenResult {
  const api = readModalGlobal();
  if (api === null) {
    return { opened: false, id: null, reason: "modal-unavailable" };
  }
  try {
    return { opened: true, id: api.open(request) };
  } catch (error) {
    // A broken host must not take down its caller — but unlike toast, the
    // failure is returned, not swallowed.
    console.error("[modal] open threw:", error);
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
  const api = readModalGlobal();
  if (api === null) return false;
  try {
    return api.close(id);
  } catch (error) {
    console.error("[modal] close threw:", error);
    return false;
  }
}
