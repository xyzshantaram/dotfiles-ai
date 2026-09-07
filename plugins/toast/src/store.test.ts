import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TOAST_DURATION_MS,
  _resetToastsForTests,
  dismissToast,
  getToasts,
  showToast,
  subscribeToasts,
} from "./store";

describe("toast store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetToastsForTests();
  });
  afterEach(() => {
    _resetToastsForTests();
    vi.useRealTimers();
  });

  it("delivers a new toast to subscribers", () => {
    const seen: string[][] = [];
    subscribeToasts((list) => seen.push(list.map((t) => t.text)));
    showToast("hello");
    expect(seen).toEqual([["hello"]]);
  });

  it("defaults to the info kind", () => {
    showToast("hello");
    expect(getToasts()[0].kind).toBe("info");
  });

  it("keeps a toast raised before anything subscribed, so a late mount sees it", () => {
    // The restart case: the flash is raised during apply(), before React mounts.
    showToast("dsh restarted", "success");
    const seen: string[][] = [];
    subscribeToasts((list) => seen.push(list.map((t) => t.text)));
    expect(seen).toEqual([]); // subscribing does not replay
    expect(getToasts().map((t) => t.text)).toEqual(["dsh restarted"]); // but the list holds it
  });

  it("stacks newest last", () => {
    showToast("first");
    showToast("second");
    expect(getToasts().map((t) => t.text)).toEqual(["first", "second"]);
  });

  it("auto-dismisses after the default duration", () => {
    showToast("hello");
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getToasts()).toHaveLength(0);
  });

  it("honours a per-toast duration", () => {
    showToast("brief", "info", 1000);
    vi.advanceTimersByTime(1000);
    expect(getToasts()).toHaveLength(0);
  });

  it("dismisses early and cancels the pending timer", () => {
    const seen: number[] = [];
    subscribeToasts((list) => seen.push(list.length));
    const id = showToast("hello");
    dismissToast(id);
    expect(getToasts()).toHaveLength(0);
    vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
    // show, dismiss. The expiry timer must not fire a third, empty emit.
    expect(seen).toEqual([1, 0]);
  });

  it("ignores an unknown id without emitting", () => {
    const seen: number[] = [];
    showToast("hello");
    subscribeToasts((list) => seen.push(list.length));
    dismissToast("no-such-toast");
    expect(seen).toEqual([]);
    expect(getToasts()).toHaveLength(1);
  });

  it("stops delivering after unsubscribe", () => {
    const seen: number[] = [];
    const off = subscribeToasts((list) => seen.push(list.length));
    showToast("one");
    off();
    showToast("two");
    expect(seen).toEqual([1]);
  });

  it("keeps updating other subscribers when one throws", () => {
    const seen: number[] = [];
    subscribeToasts(() => {
      throw new Error("bad subscriber");
    });
    subscribeToasts((list) => seen.push(list.length));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    showToast("hello");
    spy.mockRestore();
    expect(seen).toEqual([1]);
  });

  it("dismisses each toast on its own schedule", () => {
    showToast("short", "info", 1000);
    showToast("long", "info", 5000);
    vi.advanceTimersByTime(1000);
    expect(getToasts().map((t) => t.text)).toEqual(["long"]);
    vi.advanceTimersByTime(4000);
    expect(getToasts()).toHaveLength(0);
  });
});
