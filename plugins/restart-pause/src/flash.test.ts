import { beforeEach, describe, expect, it } from "vitest";

import { FLASH_KEY, FLASH_TTL_MS, readFlash, takeFlash, writeFlash } from "./flash";

function memoryStore(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(FLASH_KEY, initial);
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("restart flash", () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    store = memoryStore();
  });

  it("round-trips a flash", () => {
    writeFlash(store, { requestedAt: 1000, armed: true });
    expect(readFlash(store)).toEqual({ requestedAt: 1000, armed: true });
  });

  it("reports none when nothing was requested", () => {
    expect(takeFlash(store, 5000, 6000)).toEqual({ kind: "none" });
  });

  it("announces a restart once the host process is newer than the request", () => {
    writeFlash(store, { requestedAt: 1000, armed: false });
    expect(takeFlash(store, 2000, 3000)).toEqual({ kind: "restarted", armed: false });
    // Spent: a second read must not announce it again.
    expect(takeFlash(store, 2000, 3000)).toEqual({ kind: "none" });
  });

  it("keeps an ARMED flash pending while the same process is still running", () => {
    // The armed restart has not fired yet; a page refresh must not claim it did.
    writeFlash(store, { requestedAt: 1000, armed: true });
    expect(takeFlash(store, 500, 2000)).toEqual({ kind: "pending", armed: true });
    expect(readFlash(store)).not.toBeNull();
    // Later, the restart fires and the new process is newer than the request.
    expect(takeFlash(store, 4000, 5000)).toEqual({ kind: "restarted", armed: true });
  });

  it("drops an IMMEDIATE flash when the process never restarted", () => {
    // A refused or failed restart: the panel already reported it.
    writeFlash(store, { requestedAt: 1000, armed: false });
    expect(takeFlash(store, 500, 2000)).toEqual({ kind: "none" });
    expect(readFlash(store)).toBeNull();
  });

  it("treats the boot boundary as strictly newer", () => {
    writeFlash(store, { requestedAt: 1000, armed: true });
    // Equal timestamps are the same process, not a restart.
    expect(takeFlash(store, 1000, 1500)).toEqual({ kind: "pending", armed: true });
  });

  it("drops a flash older than the TTL without announcing it", () => {
    writeFlash(store, { requestedAt: 1000, armed: true });
    expect(takeFlash(store, 9_000_000, 1000 + FLASH_TTL_MS + 1)).toEqual({ kind: "none" });
    expect(readFlash(store)).toBeNull();
  });

  it("clears malformed content instead of throwing", () => {
    const bad = memoryStore("{not json");
    expect(readFlash(bad)).toBeNull();
    expect(bad.map.has(FLASH_KEY)).toBe(false);

    const wrongShape = memoryStore(JSON.stringify({ requestedAt: "soon" }));
    expect(readFlash(wrongShape)).toBeNull();
    expect(wrongShape.map.has(FLASH_KEY)).toBe(false);
  });

  it("survives a storage that throws on every operation", () => {
    const hostile = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
    };
    expect(() => writeFlash(hostile, { requestedAt: 1, armed: false })).not.toThrow();
    expect(readFlash(hostile)).toBeNull();
    expect(takeFlash(hostile, 2, 3)).toEqual({ kind: "none" });
  });
});
