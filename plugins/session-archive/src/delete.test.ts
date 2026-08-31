/**
 * Unit tests for deleteArchivedSession and makeBatchDeleteHandler.
 *
 * These tests use the real file system inside a temp root under
 * /tmp/dsh, so the assertions check that directories really vanish
 * from disk. The fake ctx object, the fake http req/res pair, and the
 * temp-tree helpers live at the bottom of this file.
 */

import { afterAll, describe, expect, it } from "vitest";
import { deleteArchivedSession, makeBatchDeleteHandler } from "./index";

describe("deleteArchivedSession", () => {
  it("removes the directory for a normal archived id and reports ok", async () => {
    const t = await makeTree();
    const result = await deleteArchivedSession(t.ctx, "good");
    expect(result).toEqual({ id: "good", ok: true });
    expect(await exists(t.dir("good"))).toBe(false);
  });

  it("refuses a live session and leaves the directory in place", async () => {
    const t = await makeTree();
    const result = await deleteArchivedSession(t.ctx, "live");
    expect(result).toEqual({ id: "live", ok: false, error: "session is live" });
    expect(await exists(t.dir("live"))).toBe(true);
  });

  it("refuses an id that is not in archivedSessionIds", async () => {
    const t = await makeTree();
    const result = await deleteArchivedSession(t.ctx, "ghost");
    expect(result).toEqual({
      id: "ghost",
      ok: false,
      error: "not archived",
    });
  });

  it("refuses to delete when the located path does not match the id", async () => {
    const t = await makeTree();
    const result = await deleteArchivedSession(t.ctx, "mismatch");
    expect(result).toEqual({
      id: "mismatch",
      ok: false,
      error: "path mismatch; refusing to delete",
    });
    expect(await exists(t.dir("mismatch"))).toBe(true);
  });
});

describe("makeBatchDeleteHandler", () => {
  it("answers 200 with one result per id in request order", async () => {
    const t = await makeTree();
    const handler = makeBatchDeleteHandler(t.ctx);
    const { res, body } = makeRes();
    await handler(makeReq({ ids: ["good", "live", "ghost", "lost"] }), res);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(body()) as {
      ok: boolean;
      results: Array<{ id: string; ok: boolean; error?: string }>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.results).toEqual([
      { id: "good", ok: true },
      { id: "live", ok: false, error: "session is live" },
      { id: "ghost", ok: false, error: "not archived" },
      { id: "lost", ok: false, error: "not found" },
    ]);
    expect(await exists(t.dir("good"))).toBe(false);
    expect(await exists(t.dir("live"))).toBe(true);
    expect(await exists(t.dir("mismatch"))).toBe(true);
  });

  it("answers 400 for ids that are not an array of strings", async () => {
    const t = await makeTree();
    const handler = makeBatchDeleteHandler(t.ctx);
    for (const ids of ["good", [], ["good", 42]]) {
      const { res, body } = makeRes();
      await handler(makeReq({ ids }), res);
      expect(res.statusCode).toBe(400);
      const parsed = JSON.parse(body()) as { ok: boolean };
      expect(parsed.ok).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Test fixtures.                                                     */
/* ------------------------------------------------------------------ */

import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

interface FakeCtx {
  get(name: string): unknown | undefined;
  logger: {
    debug(): void;
    info(): void;
    warn(): void;
    error(): void;
  };
}

interface Tree {
  root: string;
  ctx: FakeCtx;
  dir(id: string): string;
}

let sharedRoot: string | null = null;

async function makeTree(): Promise<Tree> {
  if (sharedRoot === null) {
    const base = join(tmpdir(), "dsh");
    await mkdir(base, { recursive: true });
    sharedRoot = await mkdtemp(join(base, "session-archive-test-"));
  }
  const runRoot = await mkdtemp(join(sharedRoot, "run-"));
  for (const id of ["good", "live", "mismatch"]) {
    await mkdir(join(runRoot, id), { recursive: true });
    await writeFile(join(runRoot, id, "session.log"), "log data\n");
  }
  return mkTree(runRoot);
}

function mkTree(root: string): Tree {
  const dir = (id: string) => join(root, id);
  const sessionIds = ["good", "live", "mismatch"];
  const locate = (header: { id: string }) => {
    if (!sessionIds.includes(header.id)) return undefined;
    // "mismatch" locates under a directory not named by its id, so the
    // path-mismatch guard fires.
    const path =
      header.id === "mismatch"
        ? join(root, "other", "session.log")
        : join(dir(header.id), "session.log");
    return { path };
  };
  const list = async () => sessionIds.map((id) => ({ id, createdAt: 0 }));
  const ctx: FakeCtx = {
    get(name: string) {
      if (name === "sessionPersistence") {
        return { list, locate };
      }
      if (name === "workspaceRegistry") {
        return { archivedSessionIds: ["good", "live", "mismatch", "lost"] };
      }
      if (name === "sessions") {
        return {
          get: (id: string) => (id === "live" ? { id } : undefined),
        };
      }
      return undefined;
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };
  return { root, ctx, dir };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function makeReq(body: unknown): {
  headers: Record<string, string>;
  [Symbol.asyncIterator](): AsyncIterator<Buffer>;
} {
  const chunk = Buffer.from(JSON.stringify(body));
  return {
    headers: { "content-type": "application/json" },
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        next() {
          if (done) return Promise.resolve({ value: undefined, done: true });
          done = true;
          return Promise.resolve({ value: chunk, done: false });
        },
      };
    },
  };
}

function makeRes(): {
  res: {
    statusCode: number;
    setHeader(k: string, v: string): void;
    end(b?: string): void;
  };
  body(): string;
} {
  let out = "";
  const res = {
    statusCode: 0,
    setHeader() {},
    end(b?: string) {
      out = b ?? "";
    },
  };
  return { res, body: () => out };
}

afterAll(async () => {
  if (sharedRoot !== null) {
    const r = sharedRoot;
    sharedRoot = null;
    await rm(r, { recursive: true, force: true });
  }
});
