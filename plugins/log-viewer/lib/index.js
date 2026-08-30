// plugins/log-viewer/src/index.ts
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

// plugins/shared/http.ts
var DEFAULT_MAX_BODY_BYTES = 64 * 1024;
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

// plugins/log-viewer/src/run.ts
import { execFile } from "node:child_process";
function runLogCommand(raw) {
  const parts = String(raw).trim().split(/\s+/);
  const argv0 = parts[0];
  const args = parts.slice(1);
  return new Promise((resolve) => {
    execFile(argv0, args, { maxBuffer: 16 * 1024 * 1024, timeout: 1e4 }, (err, stdout) => {
      if (err) {
        resolve({
          ok: false,
          lines: [],
          truncated: false,
          error: String(err.stderr || err.message)
        });
        return;
      }
      const lines = String(stdout).split("\n");
      const wasTruncated = lines.length > 2e3;
      resolve({
        ok: true,
        lines: wasTruncated ? lines.slice(-2e3) : lines,
        truncated: wasTruncated
      });
    });
  });
}

// plugins/log-viewer/src/index.ts
var name = "log-viewer";
var inject = ["webServer"];
var Config = z.object({
  command: z.string().default("journalctl --user -u dsh-web.service -n 2000")
});
var NS = settingsNamespace("log-viewer");
var source = () => void 0;
function makeLinesHandler(ctx, config) {
  return async (_req, res) => {
    const raw = source() && source().command || config?.command || "journalctl --user -u dsh-web.service -n 2000";
    const result = await runLogCommand(raw);
    if (!result.ok) {
      sendJson(res, 200, { ok: false, error: result.error ?? "" });
      ctx.logger.warn("log-viewer command failed: " + raw);
      return;
    }
    sendJson(res, 200, { ok: true, lines: result.lines, truncated: result.truncated });
    ctx.logger.info("log-viewer served " + result.lines.length + " lines for: " + raw);
  };
}
function apply(ctx, config) {
  installSettingsSection(ctx, NS, Config, config ?? {}, {
    setSource: (cur) => {
      source = cur;
    },
    onChange: () => {
    }
  });
  try {
    ctx.inject(["webServer"], (scope) => {
      const server = scope.webServer;
      server.register({
        kind: "exact",
        path: "/log-viewer/lines",
        handler: makeLinesHandler(ctx, config)
      });
    });
  } catch {
  }
}
export {
  Config,
  apply,
  inject,
  name
};
