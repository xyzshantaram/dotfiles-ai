/**
 * log-viewer — dsh-web server log viewer, host half.
 *
 * Owns the same-origin route the browser panel uses:
 *   - GET /log-viewer/lines — run the configured command and return its
 *     output lines (capped to the last 2000) as JSON
 *
 * The command comes from the `log-viewer` settings namespace (`command`),
 * with the composition entry and a built-in default as fallbacks. The
 * command is parsed by splitting on whitespace only and run with execFile,
 * never a shell, so pipes and quotes are not supported. Wrap a complex
 * pipeline in a script and point the command at it.
 *
 * The route registration is lazy: ctx.inject(["webServer"], ...) keeps the
 * plugin loadable when no web server mounts.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { sendJson } from "../../shared/http";
import { runLogCommand } from "./run";

/** Stable Cordis plugin name; also the client loader entry id. */
export const name = "log-viewer";

/** Route registration needs the web server. */
export const inject = ["webServer"];

/** The `log-viewer` settings namespace: the command the panel runs. */
export const Config = z.object({
  command: z.string().default("journalctl --user -u dsh-web.service -n 2000"),
});

/** The `log-viewer` settings namespace, owned by this plugin. */
const NS = settingsNamespace("log-viewer");

/** Read side of the settings service this plugin registers. */
let source: () => any = () => undefined;

/** The log lines handler. */
function makeLinesHandler(ctx: Context, config: unknown) {
  return async (_req: IncomingMessage, res: ServerResponse) => {
    const raw =
      (source() && source().command) ||
      (config as any)?.command ||
      "journalctl --user -u dsh-web.service -n 2000";
    // No shell: runLogCommand splits on whitespace and runs execFile.
    // Pipes and quotes are not supported; wrap the command in a script
    // when you need them.
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

export function apply(ctx: Context, config: unknown): void {
  // The canonical optional-settings wiring. `source` resolves the namespace
  // while a settings service exists and falls back to the composition entry
  // otherwise (DSH/dsh-agent-default-model/lib/index.js:45-50).
  installSettingsSection(ctx, NS, Config, config ?? {}, {
    setSource: (cur) => {
      source = cur as () => any;
    },
    onChange: () => {},
  });

  try {
    ctx.inject(["webServer"], (scope) => {
      const server = (scope as unknown as { webServer: { register(o: unknown): unknown } })
        .webServer;
      server.register({
        kind: "exact",
        path: "/log-viewer/lines",
        handler: makeLinesHandler(ctx, config),
      });
    });
  } catch {
    // no webServer: the panel still loads and shows a fetch error
  }
}
