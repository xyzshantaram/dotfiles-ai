// plugins/tool-render/src/index.ts
import { createReadStream } from "node:fs";
import { extname } from "node:path";
var IMAGE_EXTENSIONS = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
var name = "tool-render";
var inject = ["webServer"];
function apply(ctx) {
  return ctx.webServer.register({
    kind: "prefix",
    path: "/tool-render/image",
    async handler(req, res) {
      const reply = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "127.0.0.1"));
      const filePath = url.searchParams.get("path");
      if (req.method !== "GET" || filePath === null || filePath === "")
        return reply(400, { error: "expected a GET request with a ?path= file path" });
      const contentType = IMAGE_EXTENSIONS[extname(filePath).toLowerCase()];
      if (contentType === void 0)
        return reply(400, { error: "not a recognized image extension" });
      const headers = { "content-type": contentType, "cache-control": "no-store" };
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
    }
  });
}
export {
  apply,
  inject,
  name
};
