import { describe, expect, it } from "vitest";
import { JobBufferStore } from "./buffer";

describe("JobBufferStore", () => {
  it("accumulates deltas in call order", () => {
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 1000 });
    store.append("j1", "a");
    store.append("j1", "b");
    store.append("j1", "c");
    expect(store.get("j1")?.text).toBe("abc");
    expect(store.get("j1")?.truncated).toBe(false);
  });

  it("append with an empty delta still tracks the job", () => {
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 1000 });
    store.append("j1", "");
    expect(store.get("j1")).toEqual({ text: "", truncated: false });
  });

  it("caps to the newest bytes and stays truncated", () => {
    const store = new JobBufferStore({ maxBytes: 10, retentionMs: 1000 });
    store.append("j1", "0123456789");
    store.append("j1", "abcdefgh");
    const entry = store.get("j1");
    expect(entry?.truncated).toBe(true);
    expect(Buffer.byteLength(entry?.text ?? "", "utf8")).toBeLessThanOrEqual(10);
    // The survivor must be a suffix of everything written.
    const written = "0123456789abcdefgh";
    expect(written.endsWith(entry?.text ?? "")).toBe(true);
    // More appends under the cap never reset the flag.
    store.append("j1", "x");
    expect(store.get("j1")?.truncated).toBe(true);
  });

  it("keeps a finished job until retention passes, then evicts it", () => {
    let t = 0;
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 5000 }, () => t);
    store.append("j1", "hello");
    store.markFinished("j1", 1000);
    expect(store.sweep(4999)).toEqual([]);
    expect(store.get("j1")?.text).toBe("hello");
    const evicted = store.sweep(6000);
    expect(evicted).toContain("j1");
    expect(store.get("j1")).toBeUndefined();
  });

  it("markFinished defaults to the injected clock", () => {
    let t = 1000;
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 500 }, () => t);
    store.markFinished("j1");
    t = 1600;
    expect(store.sweep()).toContain("j1");
  });

  it("never evicts a running job, no matter the clock", () => {
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 500 });
    store.append("j1", "still going");
    expect(store.sweep(Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(store.get("j1")?.text).toBe("still going");
  });

  it("markFinished twice keeps the first timestamp", () => {
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 500 });
    store.markFinished("j1", 1000);
    store.markFinished("j1", 2000);
    const evicted = store.sweep(1600);
    expect(evicted).toContain("j1");
    expect(store.get("j1")).toBeUndefined();
  });

  it("markFinished creates an entry when none exists", () => {
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 1000 });
    store.markFinished("j1", 100);
    expect(store.get("j1")).toEqual({ text: "", truncated: false, finishedAt: 100 });
  });

  it("setSnapshot creates an entry when none exists", () => {
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 1000 });
    store.setSnapshot("j1", { id: "j1", kind: "agent", label: "run", status: "running", startedAt: 5 });
    expect(store.get("j1")).toEqual({
      text: "",
      truncated: false,
      snapshot: { id: "j1", kind: "agent", label: "run", status: "running", startedAt: 5 },
    });
  });

  it("setSnapshot twice keeps the latest snapshot", () => {
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 1000 });
    store.setSnapshot("j1", { id: "j1", kind: "agent", label: "run", status: "running", startedAt: 5 });
    const latest = { id: "j1", kind: "agent", label: "run", status: "completed" as const, startedAt: 5, finishedAt: 10 };
    store.setSnapshot("j1", latest);
    expect(store.get("j1")?.snapshot).toEqual(latest);
  });

  it("setSnapshot leaves text, truncated, and finishedAt alone", () => {
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 1000 });
    store.append("j1", "hello");
    store.markFinished("j1", 100);
    store.setSnapshot("j1", { id: "j1", kind: "agent", label: "run", status: "running", startedAt: 5 });
    const entry = store.get("j1");
    expect(entry?.text).toBe("hello");
    expect(entry?.truncated).toBe(false);
    expect(entry?.finishedAt).toBe(100);
    expect(entry?.snapshot?.status).toBe("running");
  });

  it("get never mutates or consumes the entry", () => {
    const store = new JobBufferStore({ maxBytes: 100, retentionMs: 1000 });
    store.append("j1", "abc");
    const first = store.get("j1");
    const second = store.get("j1");
    expect(first).toEqual(second);
    expect(store.get("j1")?.text).toBe("abc");
  });
});
