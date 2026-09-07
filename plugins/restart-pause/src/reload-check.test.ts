import { describe, expect, it } from "vitest";
import { describeVerdict, verdictFrom, type Probe } from "./reload-check";

const OPTS = { settleMs: 1000, timeoutMs: 60_000 };

/** Build a probe sequence tersely: "u" is up, "d" is down, one per `step` ms. */
function probes(pattern: string, step = 500): Probe[] {
  return [...pattern].map((c, i) => ({ ok: c === "u", at: i * step }));
}

describe("verdictFrom", () => {
  it("is waiting with no probes at all", () => {
    expect(verdictFrom([], OPTS)).toEqual({ kind: "waiting", sawDown: false });
  });

  it("NEVER believes an up that was never preceded by a down", () => {
    // The trap: the old process is still listening, so the very first probes
    // succeed. Believing them declares victory before the restart happened.
    const verdict = verdictFrom(probes("uuuuuuuu"), OPTS);
    expect(verdict).toEqual({ kind: "waiting", sawDown: false });
  });

  it("reports back once an up has held for the settle window", () => {
    // down at 0, up from 500, settled by 1500.
    expect(verdictFrom(probes("duuu"), OPTS)).toEqual({ kind: "back", downMs: 500 });
  });

  it("ignores the leading up from the old process when measuring downtime", () => {
    // u(0) d(500) u(1000) u(1500) u(2000): downtime is 1000-500, not 1000-0.
    expect(verdictFrom(probes("uduuu"), OPTS)).toEqual({ kind: "back", downMs: 500 });
  });

  it("does not call it back while the up is still inside the settle window", () => {
    // down at 0, single up at 500: only 0ms of uptime so far.
    expect(verdictFrom(probes("du"), OPTS)).toEqual({ kind: "waiting", sawDown: true });
  });

  it("treats the settle boundary as reached, not exceeded", () => {
    // Exactly settleMs of uptime (100 -> 1100) must count as settled.
    const seq: Probe[] = [
      { ok: false, at: 0 },
      { ok: true, at: 100 },
      { ok: true, at: 1100 },
    ];
    expect(verdictFrom(seq, OPTS)).toEqual({ kind: "back", downMs: 100 });
  });

  it("does not settle one millisecond early", () => {
    const seq: Probe[] = [
      { ok: false, at: 0 },
      { ok: true, at: 100 },
      { ok: true, at: 1099 },
    ];
    expect(verdictFrom(seq, OPTS)).toEqual({ kind: "waiting", sawDown: true });
  });

  it("counts one long outage as ONE outage, not many", () => {
    // Five consecutive failures are one restart, not a crash loop.
    expect(verdictFrom(probes("ddddduuu"), OPTS)).toEqual({ kind: "back", downMs: 2500 });
  });

  it("reports flapping on a SECOND outage, without waiting for a settle", () => {
    // Came back, then died again: Restart=always will do this forever.
    expect(verdictFrom(probes("duud"), OPTS)).toEqual({ kind: "flapping", downCount: 2 });
  });

  it("reports flapping even when each up is too brief to ever settle", () => {
    // The case that would otherwise hang until timeout and be misreported
    // as "never came back".
    expect(verdictFrom(probes("dudud"), OPTS)).toEqual({ kind: "flapping", downCount: 2 });
  });

  it("times out having seen a down: it went away and did not return", () => {
    const seq: Probe[] = [
      { ok: true, at: 0 },
      { ok: false, at: 1000 },
      { ok: false, at: 61_000 },
    ];
    expect(verdictFrom(seq, OPTS)).toEqual({ kind: "timeout", sawDown: true, waitedMs: 61_000 });
  });

  it("times out having seen NO down: the restart command never ran", () => {
    // Distinct from the above, and the distinction is the whole point: this
    // is a broken restart command, not a broken dsh.
    const seq: Probe[] = [
      { ok: true, at: 0 },
      { ok: true, at: 61_000 },
    ];
    expect(verdictFrom(seq, OPTS)).toEqual({ kind: "timeout", sawDown: false, waitedMs: 61_000 });
  });

  it("does not time out one probe before the deadline", () => {
    const seq: Probe[] = [
      { ok: true, at: 0 },
      { ok: false, at: 59_999 },
    ];
    expect(verdictFrom(seq, OPTS)).toEqual({ kind: "waiting", sawDown: true });
  });
});

describe("describeVerdict", () => {
  it("distinguishes a broken restart command from a broken dsh", () => {
    const noDown = describeVerdict({ kind: "timeout", sawDown: false, waitedMs: 60_000 });
    const wentDown = describeVerdict({ kind: "timeout", sawDown: true, waitedMs: 60_000 });
    expect(noDown).toMatch(/restart command/i);
    expect(wentDown).toMatch(/not come back/i);
    expect(noDown).not.toEqual(wentDown);
  });

  it("names the crash loop rather than reporting a generic failure", () => {
    const text = describeVerdict({ kind: "flapping", downCount: 3 });
    expect(text).toMatch(/went down again/i);
    expect(text).toMatch(/startup/i);
  });

  it("reports how long dsh was actually down", () => {
    expect(describeVerdict({ kind: "back", downMs: 8200 })).toMatch(/8s/);
  });
});
