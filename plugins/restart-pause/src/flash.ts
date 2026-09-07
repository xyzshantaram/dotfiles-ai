/**
 * The restart flash: how a restart that finished while nobody was watching
 * still gets announced.
 *
 * THE PROBLEM. The panel can announce a restart it watched, but the useful
 * case is the one nobody watched: an ARMED restart fires later, when the
 * checks pass at idle, and by then the tab may have been reloaded or closed.
 * A note in localStorage survives that; module state does not.
 *
 * WHY IT IS SERVER-VERIFIED rather than optimistic. A note saying "a restart
 * was requested" is not evidence that one happened — an armed restart may
 * still be waiting for the checks to pass, and a plain page refresh would then
 * pop a toast for a restart that never occurred. So the note records WHEN the
 * request was made, and it is only honoured once the host reports a process
 * that started AFTER that moment. The claim is checked against real state
 * instead of assumed, which is the same rule the health probe follows.
 *
 * The TTL bounds the other direction: a machine suspended for a week should
 * not greet its owner with news about last Tuesday.
 */

/** The subset of the Storage API this module needs, so tests need no DOM. */
export interface FlashStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const FLASH_KEY = "restart-pause.flash";

/** Beyond this, a pending flash is stale and dropped unannounced. */
export const FLASH_TTL_MS = 24 * 60 * 60 * 1000;

export interface Flash {
  /** Epoch ms at which the restart was requested. */
  readonly requestedAt: number;
  /** Whether it was armed for later rather than run immediately. */
  readonly armed: boolean;
}

/** Record that a restart was requested. Storage failures are not worth failing over. */
export function writeFlash(store: FlashStore, flash: Flash): void {
  try {
    store.setItem(FLASH_KEY, JSON.stringify(flash));
  } catch {
    // Private-mode storage, a full quota: the restart still matters more.
  }
}

export function clearFlash(store: FlashStore): void {
  try {
    store.removeItem(FLASH_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Read a well-formed flash, or null. Malformed content is cleared, not thrown. */
export function readFlash(store: FlashStore): Flash | null {
  let raw: string | null;
  try {
    raw = store.getItem(FLASH_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") {
      clearFlash(store);
      return null;
    }
    const candidate = parsed as Partial<Flash>;
    if (typeof candidate.requestedAt !== "number" || !Number.isFinite(candidate.requestedAt)) {
      clearFlash(store);
      return null;
    }
    return { requestedAt: candidate.requestedAt, armed: candidate.armed === true };
  } catch {
    clearFlash(store);
    return null;
  }
}

export type FlashOutcome =
  /** No pending flash, or nothing to say yet. */
  | { kind: "none" }
  /** The restart happened: announce it. The flash has been cleared. */
  | { kind: "restarted"; armed: boolean }
  /** Still waiting for an armed restart to fire; the flash is kept. */
  | { kind: "pending"; armed: boolean };

/**
 * Decide what to announce at boot, and clear the flash once it is spent.
 *
 * @param store - where the flash lives.
 * @param processStartedAt - epoch ms at which the CURRENT host process began.
 * @param now - epoch ms, injected for tests.
 */
export function takeFlash(store: FlashStore, processStartedAt: number, now: number): FlashOutcome {
  const flash = readFlash(store);
  if (flash === null) return { kind: "none" };

  if (now - flash.requestedAt > FLASH_TTL_MS) {
    clearFlash(store);
    return { kind: "none" };
  }

  // The process we are talking to began after the request: it is a new one.
  if (processStartedAt > flash.requestedAt) {
    clearFlash(store);
    return { kind: "restarted", armed: flash.armed };
  }

  // Same process as when the request was made. An armed restart is still
  // waiting for its moment; an immediate one was refused or failed, and the
  // panel already said so, so the flash is dropped rather than kept forever.
  if (!flash.armed) {
    clearFlash(store);
    return { kind: "none" };
  }
  return { kind: "pending", armed: true };
}
