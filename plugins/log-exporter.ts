/**
 * Log exporter plugin — register a console-writing exporter on ctx.logger
 * so every ctx.logger.* call becomes visible in stdout.
 *
 * This plugin is installed first in the plugin list to ensure every other
 * plugin's ctx.logger calls are captured from their own apply() onward.
 * The exporter writes formatted lines to console.log with no filtering,
 * no colors, and graceful handling of non-string args.
 */
import type { Context } from "@deepseek-ai/cordis";

export const name = "log-exporter";

/** Map DSH_LOG_LEVEL to a cordis logger level. Default warn (2): keep
 * error/info/warn, drop debug. Accepts names (error/info/warn/debug) or a
 * 0-3 number. Add `Environment=DSH_LOG_LEVEL=debug` to dsh-web.service and
 * restart to surface debug logs for a debugging session. */
function resolveLogLevel(): number {
  const raw = process.env.DSH_LOG_LEVEL;
  if (raw === undefined || raw === "") return 2;
  const key = raw.toLowerCase();
  const byName: Record<string, number> = { error: 0, info: 1, warn: 2, debug: 3 };
  if (key in byName) return byName[key];
  const n = Number(key);
  if (!Number.isNaN(n) && n >= 0 && n <= 3) return n;
  return 2;
}

export function apply(ctx: Context): void {
  ctx.logger.exporter({
    colors: 0,
    // cordis skips an exporter call whose message level exceeds `levels.default`.
    // Default to warn (2): show error/info/warn, drop debug. Tune with the
    // DSH_LOG_LEVEL env var (error=0, info=1, warn=2, debug=3, or a number).
    // To debug, set Environment=DSH_LOG_LEVEL=debug in dsh-web.service and restart.
    levels: { default: resolveLogLevel() },
    export(message) {
      // Format args, handling non-string values gracefully
      const formattedArgs = message.args.map((arg) => {
        if (typeof arg === "string") return arg;
        return String(arg);
      });

      const line = `[${message.name}] ${message.type}: ${formattedArgs.join(" ")}`;
      console.log(line);
    },
  });
}
