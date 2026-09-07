import { afterEach, describe, expect, it, vi } from "vitest";

import { dismissToast, toast, toastAvailable } from "./toast-client";

const g = globalThis as { __dshToast__?: unknown };

function install(api: unknown): void {
  g.__dshToast__ = api;
}

afterEach(() => {
  delete g.__dshToast__;
  vi.restoreAllMocks();
});

describe("toast-client", () => {
  it("reports unavailable and no-ops when the plugin is not loaded", () => {
    expect(toastAvailable()).toBe(false);
    expect(toast("hello")).toBeNull();
    expect(() => dismissToast("anything")).not.toThrow();
  });

  it("forwards text, kind and duration to the published api", () => {
    const show = vi.fn(() => "id-1");
    install({ version: 1, show, dismiss: vi.fn() });
    expect(toast("hello", "refusal", 1000)).toBe("id-1");
    expect(show).toHaveBeenCalledWith("hello", "refusal", 1000);
  });

  it("defaults the kind to info", () => {
    const show = vi.fn(() => "id-1");
    install({ version: 1, show, dismiss: vi.fn() });
    toast("hello");
    expect(show).toHaveBeenCalledWith("hello", "info", undefined);
  });

  it("refuses an api whose version it does not know", () => {
    install({ version: 2, show: vi.fn(() => "x"), dismiss: vi.fn() });
    expect(toastAvailable()).toBe(false);
    expect(toast("hello")).toBeNull();
  });

  it("refuses a global that is the wrong shape", () => {
    install({ version: 1, show: "not a function", dismiss: vi.fn() });
    expect(toastAvailable()).toBe(false);
    install("nonsense");
    expect(toastAvailable()).toBe(false);
    install(null);
    expect(toastAvailable()).toBe(false);
  });

  it("swallows a throwing show, so a broken stack cannot break its caller", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    install({
      version: 1,
      show: () => {
        throw new Error("boom");
      },
      dismiss: vi.fn(),
    });
    expect(toast("hello")).toBeNull();
  });

  it("accepts a null id so a caller can pass toast()'s result straight back", () => {
    const dismiss = vi.fn();
    install({ version: 1, show: vi.fn(() => "id-1"), dismiss });
    dismissToast(null);
    expect(dismiss).not.toHaveBeenCalled();
    dismissToast(toast("hello"));
    expect(dismiss).toHaveBeenCalledWith("id-1");
  });

  it("swallows a throwing dismiss", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    install({
      version: 1,
      show: vi.fn(() => "id-1"),
      dismiss: () => {
        throw new Error("boom");
      },
    });
    expect(() => dismissToast("id-1")).not.toThrow();
  });
});
