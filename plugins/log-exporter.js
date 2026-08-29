// plugins/log-exporter.ts
var name = "log-exporter";
function resolveLogLevel() {
  const raw = process.env.DSH_LOG_LEVEL;
  if (raw === void 0 || raw === "") return 2;
  const key = raw.toLowerCase();
  const byName = { error: 0, info: 1, warn: 2, debug: 3 };
  if (key in byName) return byName[key];
  const n = Number(key);
  if (!Number.isNaN(n) && n >= 0 && n <= 3) return n;
  return 2;
}
function apply(ctx) {
  ctx.logger.exporter({
    colors: 0,
    // cordis skips an exporter call whose message level exceeds `levels.default`.
    // Default to warn (2): show error/info/warn, drop debug. Tune with the
    // DSH_LOG_LEVEL env var (error=0, info=1, warn=2, debug=3, or a number).
    // To debug, set Environment=DSH_LOG_LEVEL=debug in dsh-web.service and restart.
    levels: { default: resolveLogLevel() },
    export(message) {
      const formattedArgs = message.args.map((arg) => {
        if (typeof arg === "string") return arg;
        return String(arg);
      });
      const line = `[${message.name}] ${message.type}: ${formattedArgs.join(" ")}`;
      console.log(line);
    }
  });
}
export {
  apply,
  name
};
