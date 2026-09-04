// These tests hit the image route handler through the same captured-handler
// pattern the mcp-servers callback tests use. The fake response is a real
// Writable, because createReadStream(...).pipe(res) needs one.
import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { apply } from "./index.js";

const IMAGE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

class FakeRes extends Writable {
  status = 0;
  headers: Record<string, string> = {};
  headersSent = false;
  chunks: Buffer[] = [];
  // The route writes its head and body from stream events, so the test must
  // wait for this promise before it reads the captured status.
  done: Promise<void>;
  private resolveDone!: () => void;

  constructor() {
    super();
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  writeHead(status: number, headers: Record<string, string>): void {
    this.status = status;
    this.headers = headers;
    this.headersSent = true;
  }

  override end(chunk?: unknown): this {
    if (typeof chunk === "string") this.chunks.push(Buffer.from(chunk));
    this.resolveDone();
    return this;
  }

  override _write(chunk: unknown, _enc: BufferEncoding, cb: (e?: Error | null) => void): void {
    this.chunks.push(chunk as Buffer);
    cb();
  }

  body(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

/** Register the route against a fake ctx and return the captured handler. */
function boot(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  let handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined;
  const ctx = {
    webServer: {
      register(route: { handler: typeof handler }) {
        handler = route.handler;
        return () => {};
      },
    },
    // The projection half registers through ctx.inject; the route tests
    // never invoke the callback, so a capturing no-op is enough here.
    inject(_services: string[], fn: (scope: never) => void) {
      void fn;
    },
  };
  apply(ctx as never);
  if (handler === undefined) throw new Error("no route was registered");
  return handler;
}

function hit(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  method: string,
  query: string,
): Promise<FakeRes> {
  const res = new FakeRes();
  const req = {
    method,
    url: `/tool-render/image${query}`,
    headers: { host: "127.0.0.1:3080" },
  } as unknown as IncomingMessage;
  return handler(req, res as unknown as ServerResponse)
    .then(() => res.done)
    .then(() => res);
}

describe("tool-render image route", () => {
  it("serves a .png file with the right content type and bytes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-render-"));
    const file = join(dir, "shot.png");
    writeFileSync(file, IMAGE_BYTES);
    const res = await hit(boot(), "GET", `?path=${encodeURIComponent(file)}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Buffer.concat(res.chunks).equals(IMAGE_BYTES)).toBe(true);
  });

  it("refuses a non-image extension without leaking the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-render-"));
    const file = join(dir, "notes.txt");
    const secret = "do not leak this text";
    writeFileSync(file, secret);
    const res = await hit(boot(), "GET", `?path=${encodeURIComponent(file)}`);
    expect(res.status).toBe(400);
    expect(res.body()).not.toContain(file);
    expect(res.body()).not.toContain(secret);
  });

  it("rejects a request with no path parameter", async () => {
    const res = await hit(boot(), "GET", "");
    expect(res.status).toBe(400);
  });

  it("rejects an empty path parameter", async () => {
    const res = await hit(boot(), "GET", "?path=");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a missing file and does not hang", async () => {
    const file = join(tmpdir(), "tool-render-no-such-file.png");
    const res = await hit(boot(), "GET", `?path=${encodeURIComponent(file)}`);
    expect(res.status).toBe(404);
    expect(res.body()).toContain("not found");
  }, 2000);

  it("rejects a non-GET method", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-render-"));
    const file = join(dir, "shot.png");
    writeFileSync(file, IMAGE_BYTES);
    const res = await hit(boot(), "POST", `?path=${encodeURIComponent(file)}`);
    expect(res.status).toBe(400);
  });
});
