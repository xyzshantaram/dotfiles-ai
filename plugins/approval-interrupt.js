// plugins/approval-interrupt.ts
import z from "@deepseek-ai/schemastery";
var name = "approval-interrupt";
var Config = z.object({});
var APPROVAL_PLUGIN = "user-approval";
function isApprovalNotice(message) {
  const source = message?.source;
  if (source === void 0 || source === null) return false;
  return source.kind === "plugin" && source.plugin === APPROVAL_PLUGIN;
}
function apply(ctx, config) {
  void config;
  ctx.on(
    "agent/pre-step",
    async (_payload, next) => {
      const decision = await next();
      if (decision.kind !== "enter") return decision;
      const kept = decision.messages.filter((message) => !isApprovalNotice(message));
      if (kept.length === decision.messages.length) return decision;
      ctx.logger.info(
        `dropped ${decision.messages.length - kept.length} user-approval notice(s)`
      );
      if (kept.length === 0) return { kind: "reject" };
      return { kind: "enter", messages: kept };
    },
    { prepend: true }
  );
}
export {
  Config,
  apply,
  name
};
