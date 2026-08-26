// plugins/log-exporter.ts
var name = "log-exporter";
function apply(ctx) {
  ctx.logger.exporter({
    colors: 0,
    // cordis skips an exporter call whose message level exceeds
    // `levels.default` (falling back to 1 = error+info only if unset). Set
    // it to the most verbose level (debug=3) so every ctx.logger.* call
    // reaches this exporter, matching the "no filtering" intent below.
    levels: { default: 3 },
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
