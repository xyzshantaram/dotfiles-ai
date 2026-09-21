import { afterEach, describe, expect, it, vi } from "vitest";

import { toast } from "./toast-client";

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
    expect(toast("hello")).toBeNull();
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
    expect(toast("hello")).toBeNull();
  });

  it("refuses a global that is the wrong shape", () => {
    install({ version: 1, show: "not a function", dismiss: vi.fn() });
    expect(toast("hello")).toBeNull();
    install("nonsense");
    expect(toast("hello")).toBeNull();
    install(null);
    expect(toast("hello")).toBeNull();
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
});
