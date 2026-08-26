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

export function apply(ctx: Context): void {
  ctx.logger.exporter({
    colors: 0,
    // cordis skips an exporter call whose message level exceeds
    // `levels.default` (falling back to 1 = error+info only if unset). Set
    // it to the most verbose level (debug=3) so every ctx.logger.* call
    // reaches this exporter, matching the "no filtering" intent below.
    levels: { default: 3 },
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
