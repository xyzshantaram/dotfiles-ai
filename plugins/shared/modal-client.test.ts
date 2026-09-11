import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { closeModal, modalAvailable, openModal } from "./modal-client";

const g = globalThis as { __dshModal__?: unknown };

function install(api: unknown): void {
  g.__dshModal__ = api;
}

function makeApi(overrides: Record<string, unknown> = {}): unknown {
  return { version: 1, open: () => "id-1", close: () => true, subscribe: () => () => {}, ...overrides };
}

afterEach(() => {
  delete g.__dshModal__;
  vi.restoreAllMocks();
});

describe("modal-client", () => {
  it("reports unavailable and never throws when the host is not loaded", () => {
    expect(modalAvailable()).toBe(false);
    expect(openModal({ title: "t", body: "b" })).toEqual({
      opened: false,
      id: null,
      reason: "modal-unavailable",
    });
    expect(() => closeModal("anything")).not.toThrow();
    expect(closeModal("anything")).toBe(false);
  });

  it("forwards the request to the published api and returns its id", () => {
    const open = vi.fn(() => "id-1");
    install(makeApi({ open }));
    const opened = openModal({ title: "Job output", body: "x", size: "full" });
    expect(opened).toEqual({ opened: true, id: "id-1", reason: undefined });
    expect(open).toHaveBeenCalledWith({ title: "Job output", body: "x", size: "full" });
  });

  it("re-reads the global on every call, so a late host is seen", () => {
    expect(modalAvailable()).toBe(false);
    install(makeApi());
    // Same module state, no cache: the host appeared between calls.
    expect(modalAvailable()).toBe(true);
    expect(openModal({ title: "t", body: "b" }).opened).toBe(true);
    delete g.__dshModal__;
    expect(modalAvailable()).toBe(false);
  });

  it("refuses an api whose version it does not know", () => {
    install(makeApi({ version: 2 }));
    expect(modalAvailable()).toBe(false);
    expect(openModal({ title: "t", body: "b" }).opened).toBe(false);
  });

  it("refuses a global that is the wrong shape", () => {
    install(makeApi({ subscribe: undefined }));
    expect(modalAvailable()).toBe(false);
    install(makeApi({ open: "not a function" }));
    expect(modalAvailable()).toBe(false);
    install("nonsense");
    expect(modalAvailable()).toBe(false);
    install(null);
    expect(modalAvailable()).toBe(false);
  });

  it("reports a throwing open instead of throwing, so a broken host cannot break its caller", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    install(
      makeApi({
        open: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(openModal({ title: "t", body: "b" })).toEqual({
      opened: false,
      id: null,
      reason: "modal-threw",
    });
  });

  it("accepts a null id so a caller can pass openModal()'s id straight back", () => {
    const close = vi.fn(() => true);
    install(makeApi({ close }));
    expect(closeModal(null)).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(closeModal("id-1")).toBe(true);
    expect(close).toHaveBeenCalledWith("id-1");
  });

  it("reports a throwing close as not-closed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    install(
      makeApi({
        close: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(() => closeModal("id-1")).not.toThrow();
    expect(closeModal("id-1")).toBe(false);
  });
});

/**
 * THE ONE-BUNDLE PROOF (#140).
 *
 * The whole point of the modal plugin is that the shared component and its
 * stylesheet ship ONCE. This is asserted over the BUILD OUTPUTS, not the
 * sources: sources cannot lie about what a bundler inlines. `node build.mjs`
 * must run before this suite, exactly as the lib-reading pins in
 * plugin-modal.test.ts assume.
 */
describe("modal-client: one-bundle proof over the build outputs", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const readLib = (name: string) => readFileSync(join(here, "..", name, "lib", "client.js"), "utf8");
  const bundles = ["modal", "job-viewer", "composer-approvals"];

  it('"plugin-modal-panel" ships in exactly ONE bundle: the modal host\'s own', () => {
    const withPanel = bundles.filter((bundle) => readLib(bundle).includes("plugin-modal-panel"));
    expect(withPanel).toEqual(["modal"]);
  });

  it("the consumer bundles go through the published global instead", () => {
    // The wrapper's feature-detect is the seam: if a consumer bundle reads
    // __dshModal__, it reached the modal without bundling a copy of it.
    for (const bundle of ["job-viewer", "composer-approvals"]) {
      expect(readLib(bundle), bundle).toContain("__dshModal__");
    }
  });
});
