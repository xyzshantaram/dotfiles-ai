// plugins/ask-interrupt.ts
import z from "@deepseek-ai/schemastery";
var name = "ask-interrupt";
var inject = ["tools"];
var Config = z.object({});
var ASK_CANCELLED_CODE = "ASK_CANCELLED";
var ASK_USER_QUESTION_TOOL = "ask_user_question";
function apply(ctx, config) {
  void config;
  ctx.on("tools/post-execute", async (exec, result, next) => {
    const outcome = await next();
    if (exec.name !== ASK_USER_QUESTION_TOOL) return outcome;
    const failed = result;
    if (!failed.isError) {
      ctx.logger.info("ask_user_question resolved");
      return outcome;
    }
    if (failed.error?.info?.code !== ASK_CANCELLED_CODE) return outcome;
    const agent = exec.agent;
    if (agent === void 0) return outcome;
    ctx.logger.info("ask_user_question cancelled by user");
    agent.cancel("user-dismissed-question", { keepInbox: true });
    return outcome;
  });
}
export {
  Config,
  apply,
  inject,
  name
};
