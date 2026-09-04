// Host half of the H2+H3 tool-render client plugin.
//
// The cards live in the browser. This half owns one small route that serves
// image bytes by local file path. A later ticket will point the read_image
// and see cards at this route.
import { createReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname } from "node:path";

/**
 * The only extensions this route serves. The map is copied from the
 * `read_image` tool, so the route accepts exactly what that tool can produce.
 */
const IMAGE_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Minimal structural view of the DSH web server service, so this file does
// not depend on the cordis Context type exposing it.
interface WebServerHost {
  register(route: {
    kind: "prefix";
    path: string;
    handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>;
  }): () => void;
}

interface HostContext {
  webServer: WebServerHost;
}

/** Stable Cordis plugin name. */
const name = "tool-render";
const inject = ["webServer"];

function apply(ctx: HostContext): () => void {
  return ctx.webServer.register({
    kind: "prefix",
    path: "/tool-render/image",
    async handler(req, res) {
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "127.0.0.1"));
      const filePath = url.searchParams.get("path");
      if (req.method !== "GET" || filePath === null || filePath === "")
        return reply(400, { error: "expected a GET request with a ?path= file path" });

      const contentType = IMAGE_EXTENSIONS[extname(filePath).toLowerCase()];
      if (contentType === undefined)
        return reply(400, { error: "not a recognized image extension" });

      // Screenshots can change between requests, so the browser must not
      // cache this response.
      const headers = { "content-type": contentType, "cache-control": "no-store" };

      // Stream the bytes. Do not write the 200 head first: a missing or
      // unreadable file raises a stream error, and this order keeps that
      // error a clean 404.
      const stream = createReadStream(filePath);
      stream.on("open", () => {
        res.writeHead(200, headers);
        stream.pipe(res);
      });
      stream.on("error", () => {
        if (res.headersSent) {
          res.end();
          return;
        }
        reply(404, { error: "not found" });
      });
    },
  });
}

export { apply, inject, name };
