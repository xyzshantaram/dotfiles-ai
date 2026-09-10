/**
 * The modal registry's contract, and the pins that keep the shell plugin safe.
 *
 * The first three describes run in plain node with no DOM: the registry is
 * isolated per instance, the version check refuses what it does not know,
 * and the guarded entry points REPORT failure (the load-bearing inversion —
 * `{ opened: false, reason }` / `false`) instead of throwing or pretending.
 *
 * The last describe is source-level drift tests in the style of
 * shared/plugin-modal.test.ts: the boot risk on this plugin is
 * all-or-nothing (the web boot throws "N entries did not activate" if a
 * shell entry pends, taking the whole page down), so the no-hard-deps shape,
 * the global's disposal, the single-source component, and the install/build
 * ordering are pinned here rather than trusted to review.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MODAL_API_VERSION,
  type ModalApi,
  type ModalOpenRequest,
  closeModal,
  createModalRegistry,
  modalAvailable,
  openModal,
  readModalGlobal,
  resolveModalApi,
} from "./registry";

const here = dirname(fileURLToPath(import.meta.url));
const plugins = join(here, "..", "..");
const root = join(plugins, "..");
const read = (relative: string) => readFileSync(join(plugins, relative), "utf8");

const g = globalThis as { __dshModal__?: unknown };

function install(api: unknown): void {
  g.__dshModal__ = api;
}

afterEach(() => {
  delete g.__dshModal__;
  vi.restoreAllMocks();
});

const request = (over: Partial<ModalOpenRequest> = {}): ModalOpenRequest => ({
  title: "t",
  body: "b",
  ...over,
});

describe("modal registry", () => {
  it("opens return unique ids and list oldest first", () => {
    const registry = createModalRegistry();
    const first = registry.open(request({ title: "one" }));
    const second = registry.open(request({ title: "two" }));
    expect(second).not.toBe(first);
    expect(registry.getOpen().map((r) => r.title)).toEqual(["one", "two"]);
  });

  it("passes size through untouched: folding is the component's job", () => {
    const registry = createModalRegistry();
    registry.open(request({ size: "compact" }));
    registry.open(request({ size: "default" }));
    registry.open(request());
    expect(registry.getOpen().map((r) => r.size)).toEqual(["compact", "default", undefined]);
  });

  it("closes by id and reports unknown ids instead of pretending", () => {
    const registry = createModalRegistry();
    const id = registry.open(request());
    expect(registry.close("no-such-modal")).toBe(false);
    expect(registry.getOpen()).toHaveLength(1);
    expect(registry.close(id)).toBe(true);
    expect(registry.getOpen()).toHaveLength(0);
    expect(registry.close(id)).toBe(false);
  });

  it("notifies subscribers and honours unsubscribe", () => {
    const registry = createModalRegistry();
    const seen: string[][] = [];
    const stop = registry.subscribe((list) => seen.push(list.map((r) => r.id)));
    const id = registry.open(request());
    registry.close(id);
    stop();
    registry.open(request());
    expect(seen).toHaveLength(2);
  });

  it("a throwing listener cannot break the other subscribers", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const registry = createModalRegistry();
    registry.subscribe(() => {
      throw new Error("boom");
    });
    const seen: number[] = [];
    registry.subscribe((list) => seen.push(list.length));
    registry.open(request());
    expect(seen).toEqual([1]);
  });

  it("refuses a non-object request loudly, so the guarded open can report it", () => {
    const registry = createModalRegistry();
    expect(() => registry.open(null as unknown as ModalOpenRequest)).toThrow(TypeError);
  });

  it("instances are isolated", () => {
    const first = createModalRegistry();
    const second = createModalRegistry();
    first.open(request());
    expect(second.getOpen()).toHaveLength(0);
  });
});

describe("modal version negotiation", () => {
  const good = (): ModalApi => {
    const registry = createModalRegistry();
    return {
      version: MODAL_API_VERSION,
      open: (r) => registry.open(r),
      close: (id) => registry.close(id),
      subscribe: (l) => registry.subscribe(l),
    };
  };

  it("accepts the supported version with all three functions", () => {
    const api = good();
    expect(resolveModalApi(api)).toBe(api);
  });

  it("refuses an api whose version it does not know", () => {
    const api = { ...good(), version: MODAL_API_VERSION + 1 };
    expect(resolveModalApi(api)).toBeNull();
  });

  it("refuses a global that is the wrong shape", () => {
    expect(resolveModalApi(null)).toBeNull();
    expect(resolveModalApi("nonsense")).toBeNull();
    expect(resolveModalApi({ version: MODAL_API_VERSION })).toBeNull();
    const api = good() as unknown as Record<string, unknown>;
    for (const fn of ["open", "close", "subscribe"]) {
      const broken = { ...api, [fn]: "not a function" };
      expect(resolveModalApi(broken), fn).toBeNull();
    }
  });
});

describe("modal availability reporting: the load-bearing inversion", () => {
  it("reports unavailable and never throws when the plugin is not loaded", () => {
    expect(modalAvailable()).toBe(false);
    expect(readModalGlobal()).toBeNull();
    const result = openModal(request());
    expect(result.opened).toBe(false);
    if (!result.opened) expect(result.reason).toBe("modal-unavailable");
    expect(closeModal("anything")).toBe(false);
    expect(closeModal(null)).toBe(false);
  });

  it("treats a version it does not know as absent", () => {
    const registry = createModalRegistry();
    install({
      version: MODAL_API_VERSION + 1,
      open: (r: ModalOpenRequest) => registry.open(r),
      close: (id: string) => registry.close(id),
      subscribe: registry.subscribe,
    });
    expect(modalAvailable()).toBe(false);
    expect(openModal(request()).opened).toBe(false);
  });

  it("opens through the published api and closes by id", () => {
    const registry = createModalRegistry();
    install({
      version: MODAL_API_VERSION,
      open: (r: ModalOpenRequest) => registry.open(r),
      close: (id: string) => registry.close(id),
      subscribe: registry.subscribe,
    });
    expect(modalAvailable()).toBe(true);
    const result = openModal(request({ title: "approval?" }));
    expect(result.opened).toBe(true);
    if (result.opened) {
      expect(typeof result.id).toBe("string");
      expect(registry.getOpen().map((r) => r.title)).toEqual(["approval?"]);
      expect(closeModal(result.id)).toBe(true);
    }
    expect(closeModal("unknown-id")).toBe(false);
  });

  it("reports a throwing open instead of swallowing it, and still never throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    install({
      version: MODAL_API_VERSION,
      open: () => {
        throw new Error("boom");
      },
      close: () => true,
      subscribe: () => () => {},
    });
    const result = openModal(request());
    expect(result.opened).toBe(false);
    if (!result.opened) expect(result.reason).toBe("modal-threw");
  });

  it("reports a throwing close as not-closed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    install({
      version: MODAL_API_VERSION,
      open: () => "id-1",
      close: () => {
        throw new Error("boom");
      },
      subscribe: () => () => {},
    });
    expect(closeModal("id-1")).toBe(false);
  });
});

describe("modal shell plugin: boot-risk and single-source pins", () => {
  /**
   * Source with its comments removed. Several assertions below must read
   * the CODE, not prose that mentions a name in passing (this file's own
   * comments do that constantly).
   */
  function code(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  }

  const client = read("modal/src/client.tsx");
  const hostCss = read("modal/src/client.module.css");
  const syncSh = readFileSync(join(root, "sync.sh"), "utf8");
  const buildMjs = readFileSync(join(root, "build.mjs"), "utf8");

  it("the plugin has no hard dependencies beyond static modules", () => {
    // A fiber that injects a not-yet-provided service pends, and the web
    // boot throws when ANY entry is not active — so a hard dep here would
    // take the whole page down, not merely the modal. Exactly ["slots"].
    expect(code(client)).toContain('var inject = ["slots"];');
  });

  it("the plugin publishes the versioned global and removes it on unload", () => {
    expect(code(client)).toContain("(globalThis as any).__dshModal__ = api;");
    // Toast deletes its global when the fiber goes; the modal must too, or
    // a stopped plugin leaves a global pointing at a dead registry.
    expect(code(client)).toContain("delete (globalThis as any).__dshModal__;");
    expect(code(client)).toContain("version: MODAL_API_VERSION,");
  });

  it("the plugin mounts one container into shell.overlay", () => {
    expect(code(client)).toContain('ctx.slots.inject("shell.overlay"');
    expect(code(client)).toContain('id: PLUGIN_NAME');
  });

  it("the plugin renders the shared component; it does not fork it", () => {
    expect(code(client)).toContain('from "../../shared/plugin-modal"');
    // The fork smell is re-declared markup or styling: the panel/mask
    // strings and the sizing attribute belong to the shared component.
    for (const fork of ["plugin-modal-panel", "plugin-modal-mask", "data-size"]) {
      expect(code(client), fork).not.toContain(fork);
    }
    // And the host stylesheet owns no plugin-modal-* rule of its own.
    expect(code(hostCss)).not.toMatch(/\.plugin-modal-/);
  });

  it("sync.sh installs the modal before any consumer, with toast's discipline", () => {
    const at = (needle: string) => {
      const i = syncSh.indexOf(needle);
      expect(i, "not found: " + needle).toBeGreaterThan(-1);
      return i;
    };
    const toast = at('pnpm_ins "$HERE/plugins/toast"');
    const modal = at('pnpm_ins "$HERE/plugins/modal"');
    const approvals = at('pnpm_ins "$HERE/plugins/composer-approvals"');
    const viewer = at('pnpm_ins "$HERE/plugins/job-viewer"');
    expect(modal).toBeGreaterThan(toast);
    expect(modal).toBeLessThan(approvals);
    expect(modal).toBeLessThan(viewer);
    expect(syncSh).toContain('"modal"');
  });

  it("build.mjs builds the modal before its consumers", () => {
    const at = (needle: string) => {
      const i = buildMjs.indexOf(needle);
      expect(i, "not found: " + needle).toBeGreaterThan(-1);
      return i;
    };
    const modalHost = at("plugins/modal/src/index.ts");
    const modalClient = at("plugins/modal/src/client.tsx");
    expect(modalHost).toBeLessThan(at("plugins/composer-approvals/src/index.ts"));
    expect(modalClient).toBeLessThan(at("plugins/composer-approvals/src/client.tsx"));
    expect(modalHost).toBeLessThan(at("plugins/job-viewer/src/index.ts"));
  });
});
