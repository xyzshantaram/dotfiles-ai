/**
 * W7 — ask-interrupt: turn a dismissed `ask_user_question` into a stopped
 * turn instead of a tool error the model plows through.
 *
 * The problem. `@deepseek-ai/dsh-tool-ask-user` calls
 * `ctx.userQuestions.ask(request)`. When the human dismisses the pending
 * question, `@deepseek-ai/dsh-user-questions` rejects that promise with
 * `UserQuestionError("the user cancelled ask_user_question", "ASK_CANCELLED")`
 * (dsh-user-questions/lib/index.js:3786 — verified against the installed
 * package source at
 * ~/.local/share/pnpm/store/v11/links/@deepseek-ai/dsh-user-questions/0.1.0-rc.7/
 * .../lib/index.js). The tool's `execute` has no try/catch, so the rejection
 * propagates out of the tool body as a thrown error. The dsh-tools pipeline
 * (dsh-tools/lib/index.js:2501-2510, `errorInfo()`) converts any thrown
 * `HarnessError` into a failed `ToolExecutionResult` whose
 * `error.info = { name: error.name, code: error.code }`. Because
 * `UserQuestionError` extends `HarnessError` and sets `this.name =
 * "UserQuestionError"` in its own constructor, the failed result for a
 * dismissed question carries exactly
 * `{ isError: true, error: { info: { name: "UserQuestionError", code: "ASK_CANCELLED" } } }`.
 * The model sees this as an ordinary tool error and keeps working.
 *
 * The fix. Hook `tools/post-execute`, the observe/replace waterfall that
 * runs after a tool result is final (dsh-tools/README.md:59; call site
 * dsh-tools/lib/index.js:3367,
 * `ctx.waterfall(scopeTarget(this, exec.agent), "tools/post-execute", exec,
 * result, ...)`). Filter to `exec.name === "ask_user_question"` and
 * `result.isError && result.error.info?.code === "ASK_CANCELLED"`. On a
 * match, call `exec.agent.cancel('user-dismissed-question', { keepInbox:
 * true })` — the real, verified signature from dsh-agent/README.md
 * ("Agent interface" section): `agent.cancel(cause, options?)` cancels the
 * active driver and, unless `options.keepInbox`, durably cancels all pending
 * inbox work. `keepInbox: true` preserves queued followup and steering
 * messages so a dismissed question stops the run, not the session (the same
 * README section documents `keepInbox` as the exact opt-out of the default
 * full inbox cancellation). This plugin passes the result through unchanged
 * (`{ kind: 'accept' }`, the waterfall default): the model-facing content
 * still reads `Error: the user cancelled ask_user_question`, but the driver
 * is already cancelled by the time that content would otherwise prompt
 * another step.
 *
 * Why `tools/post-execute` and not `tools/pre-execute` or a `guard`: the
 * cancellation only exists after the real call fails; nothing here can or
 * should stop the call from happening. Why not wrap the tool itself: the
 * shipped `ask_user_question` registration is owned by
 * `@deepseek-ai/dsh-tool-ask-user` and this plugin does not replace it,
 * following the same non-invasive observation style as
 * `plugins/skill-gate.ts`'s `tools/post-execute` listener for the `skill`
 * tool.
 *
 * `exec.agent` can be `undefined` for an agentless/programmatic tool call
 * (dsh-tools/lib/index.js:2815, `if (exec.agent === void 0) return void
 * 0`). This plugin is a no-op in that case — there is nothing to cancel.
 *
 * Mount on the HOST plane (web profile cordis.patch.yml or personal bundle
 * patch), so every session in every preset is covered:
 *
 *   - id: ask-interrupt
 *     name: /path/to/plugins/ask-interrupt.js
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import type { AgentCancelCause } from '@deepseek-ai/dsh-agent'

export const name = 'ask-interrupt'

export const inject = ['tools']

export const Config = z.object({})

type AskInterruptConfig = Record<string, never>

const ASK_CANCELLED_CODE = 'ASK_CANCELLED'
const ASK_USER_QUESTION_TOOL = 'ask_user_question'

/** Shape of the one field this plugin reads off a failed ToolExecutionResult. */
interface FailedResultInfo {
  isError?: boolean
  error?: { info?: { code?: string } }
}

export function apply(ctx: Context, config: AskInterruptConfig): void {
  void config

  ctx.on('tools/post-execute', async (exec, result, next) => {
    // Observe only: never rewrite the outcome the model sees. The pass-through
    // calls next() so the waterfall's own default (`{ kind: 'accept' }`) or a
    // later listener's decision still applies.
    const outcome = await next()

    if (exec.name !== ASK_USER_QUESTION_TOOL) return outcome

    const failed = result as FailedResultInfo
    if (!failed.isError) return outcome
    if (failed.error?.info?.code !== ASK_CANCELLED_CODE) return outcome

    const agent = exec.agent
    if (agent === undefined) return outcome // agentless call: nothing to cancel

    agent.cancel('user-dismissed-question' as unknown as AgentCancelCause, { keepInbox: true })

    return outcome
  })
}
