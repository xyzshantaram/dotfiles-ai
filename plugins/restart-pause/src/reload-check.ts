/**
 * Deciding whether the process actually came back, from a sequence of probes.
 *
 * Kept free of the network and the DOM so the decision can be tested without
 * restarting anything -- which matters here more than usual, because the live
 * test of a restart plugin ends the session running it.
 *
 * WHY A PROBE AT ALL, when dsh already reconnects. `dsh-client-connection`
 * reconnects on its own with exponential backoff and reports a `reconnecting`
 * state, so nothing here is needed to RESTORE the session. What the websocket
 * cannot tell you is the difference between "came back" and "is crash-looping":
 * dsh-web.service runs under `Restart=always` with `RestartSec=5`, so a process
 * that dies on a bad config is restarted forever and the socket keeps
 * half-connecting. That is the likeliest failure right after the config change
 * a restart was requested for, so it is the one thing worth checking.
 *
 * THE TWO TRAPS, both of which produce a confident wrong answer:
 *
 *  1. Probing too early sees the OLD process still listening and declares
 *     success before the restart happened. So an "up" is only believed after a
 *     "down" has been observed.
 *  2. Probing a flapping process eventually catches it up and declares success.
 *     So "up" is only final after it has held for a settle window, and a SECOND
 *     outage is reported as flapping immediately rather than waited out.
 */

/** One probe: did the origin answer as healthy, and when. */
export interface Probe {
  /** True when the health request returned a success status. */
  readonly ok: boolean;
  /** Monotonic-ish timestamp in milliseconds. */
  readonly at: number;
}

export type ReloadVerdict =
  /** No probe has been decisive yet. */
  | { readonly kind: "waiting"; readonly sawDown: boolean }
  /** Went down, came back, and stayed up for the settle window. */
  | { readonly kind: "back"; readonly downMs: number }
  /** Came back and went down again: the new process is not staying up. */
  | { readonly kind: "flapping"; readonly downCount: number }
  /** The deadline passed without a decision. */
  | { readonly kind: "timeout"; readonly sawDown: boolean; readonly waitedMs: number };

export interface ReloadCheckOptions {
  /** How long an "up" must hold before it is believed. */
  readonly settleMs: number;
  /** How long to wait in total before giving up. */
  readonly timeoutMs: number;
}

/**
 * Folds probes into a verdict.
 *
 * Deliberately a pure function of the whole sequence rather than a stateful
 * poller: the caller owns the timer, and the decision can be replayed from a
 * recorded sequence in a test.
 */
export function verdictFrom(probes: readonly Probe[], opts: ReloadCheckOptions): ReloadVerdict {
  if (probes.length === 0) return { kind: "waiting", sawDown: false };

  const started = probes[0].at;
  let firstDownAt: number | undefined;
  /**
   * Distinct OUTAGES, not failed probes. A healthy restart produces exactly
   * one: the process goes away and comes back. Two means it came back and
   * died again, which is what `Restart=always` with `RestartSec=5` does to a
   * process that cannot start -- and it is the failure a restart requested
   * right after a config change is most likely to produce.
   *
   * Counting episodes rather than waiting for an "up" to settle is what lets
   * a crash loop be named while it is still looping. Waiting for a settle
   * that never comes would report it as "never came back", which is both
   * wrong and less actionable.
   */
  let outages = 0;
  let wasDown = false;
  let upSince: number | undefined;

  for (const probe of probes) {
    if (!probe.ok) {
      if (!wasDown) {
        outages += 1;
        wasDown = true;
      }
      if (firstDownAt === undefined) firstDownAt = probe.at;
      upSince = undefined;
      if (outages >= 2) return { kind: "flapping", downCount: outages };
      continue;
    }

    wasDown = false;

    // An "up" before any "down" is the OLD process still listening. It is
    // not evidence of anything, so it is ignored rather than believed.
    if (firstDownAt === undefined) continue;

    if (upSince === undefined) upSince = probe.at;
    if (probe.at - upSince >= opts.settleMs) {
      return { kind: "back", downMs: upSince - firstDownAt };
    }
  }

  const last = probes[probes.length - 1];
  const waitedMs = last.at - started;
  if (waitedMs >= opts.timeoutMs) {
    return { kind: "timeout", sawDown: firstDownAt !== undefined, waitedMs };
  }
  return { kind: "waiting", sawDown: firstDownAt !== undefined };
}

/** A sentence for the UI. The verdict carries the facts; this carries the tone. */
export function describeVerdict(verdict: ReloadVerdict): string {
  switch (verdict.kind) {
    case "back":
      return `dsh is back (down for ${Math.round(verdict.downMs / 1000)}s).`;
    case "flapping":
      return `dsh came back and went down again (${verdict.downCount} outages). Your change may have broken startup -- check the service log.`;
    case "timeout":
      return verdict.sawDown
        ? `dsh went down and has not come back after ${Math.round(verdict.waitedMs / 1000)}s. Check the service log.`
        : `No restart was observed after ${Math.round(verdict.waitedMs / 1000)}s. The restart command may not have run.`;
    case "waiting":
      return verdict.sawDown
        ? "dsh is down, waiting for it to come back..."
        : "Waiting for dsh to go down...";
  }
}
