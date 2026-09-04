/**
 * W8 — approval reject-with-comment.
 *
 * The card. The shipped `ApprovalPanel` is a chain entry on the
 * `conversation.composer` slot at priority 1. Chain entries are tried in
 * ascending priority order and the first non-null `select` result wins.
 * This bundle registers the same slot at priority 0 with the same select,
 * so this card wins the election and the shipped card never mounts.
 *
 * The behavior. Rejecting without a comment answers the approval as
 * `'rejected'`, exactly as before. Rejecting with a comment also answers
 * `'rejected'`, then best-effort sends one steering message through the
 * same wire the composer uses (`session.prompt` with mode `steer`). The
 * steering send is a fire-and-forget promise. Its failure never blocks or
 * cancels the rejection. The approval answer is sent first, always.
 *
 * The seam. This file is the package's `./client` source. build.mjs
 * bundles it with esbuild (browser, cjs, es2022): highlight.js inlined,
 * react and the @deepseek-ai packages external. The build step wraps the
 * bundle in the `window.__ModuleLoader__.load` facade with the loader id
 * `approval-comment`. The pending shell command renders with bash syntax
 * highlighting. The host row in cordis.patch.yml keeps the loader entry
 * alive so `dsh-client-modules` serves this bundle in the boot graph.
 */

/** highlight.js: core plus the bash grammar, INLINED by esbuild. The
 * browser module table cannot resolve npm deps, so the bundle carries
 * the grammar itself. One language keeps the bundle small. */
import hljs from "highlight.js/lib/core";
import bashGrammar from "highlight.js/lib/languages/bash";
import yamlGrammar from "highlight.js/lib/languages/yaml";
hljs.registerLanguage("bash", bashGrammar);
hljs.registerLanguage("yaml", yamlGrammar);

/** The reason payload from bash-guard is YAML. */
import { parse } from "yaml";

/** The browser module table resolves these platform modules. */
import react from "react";
import {
  injectStyle,
  mergeCss,
  escapeHtml,
  registerLocale,
  PERMISSION_OUTLINE_CSS,
  HLJS_THEME_CSS,
} from "../../shared/client-util";
import localCss from "./client.module.css";
import * as _primitives from "@deepseek-ai/dsh-client-ui-primitives";
var Button = _primitives.Button;
import * as _runtime from "@deepseek-ai/dsh-client-runtime/client";
var conversationContextKey = _runtime.conversationContextKey;

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "approval-comment";
/** Locale namespace owned by this bundle. */
var LOCALE_NS = "approval-comment";

/**
 * One stylesheet for this card. Class names use a shared prefix so they
 * cannot collide with another module's CSS. The style tag pattern mirrors
 * the shipped modules (`data-plugin-css` guard, one tag per bundle).
 */
var STYLE_TAG_ID = "approval-comment/ApprovalComment.module.css";
injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(localCss));
/** Shared permission outline tokens. The id matches the other injectors, so only one tag exists. */
injectStyle(PLUGIN_NAME, "dsh-permission-outline", PERMISSION_OUTLINE_CSS);
/** Shared highlight.js token colors. The id matches tool-render's injector, so only one tag exists. */
injectStyle(PLUGIN_NAME, "dsh-hljs-theme", HLJS_THEME_CSS);

/** English dictionary for this card. Approval strings match the shipped text. */
var EN = {
  "approval.waiting": "Waiting for approval",
  "approval.detail.aria": "Approval details",
  "approval.escalation": "Tool {toolName} requests privileged execution",
  "approval.reject": "Reject",
  "approval.allowOnce": "Allow once",
  "comment.toggle": "Add comment",
  "comment.hide": "Hide comment",
  "comment.label": "Comment for the agent",
  "comment.placeholder": "Optional comment for the agent",
  "comment.hint": "This comment steers the next action.",
};

/** Chinese dictionary. Approval strings match the shipped text. */
var ZH = {
  "approval.waiting": "等待审批",
  "approval.detail.aria": "审批详情",
  "approval.escalation": "工具 {toolName} 请求越权执行",
  "approval.reject": "拒绝",
  "approval.allowOnce": "允许一次",
  "comment.toggle": "添加评论",
  "comment.hide": "收起评论",
  "comment.label": "给智能体的评论",
  "comment.placeholder": "给智能体的可选评论",
  "comment.hint": "该评论将指导下一步行动。",
};

/** Chain routing: claim the composer while an approval wait is pending. */
function selectApproval(owner) {
  return (
    owner.interactions.find(function (interaction) {
      return interaction.kind === "approval";
    }) || null
  );
}

/** Extract the shell command from an approval's paired running call. */
function commandOf(call) {
  if (call === undefined) return undefined;
  try {
    var args = JSON.parse(call.argsRaw);
    return typeof args.command === "string" ? args.command : undefined;
  } catch (error) {
    console.warn("[approval-comment] commandOf: failed to parse call.argsRaw", error);
    return undefined;
  }
}

/**
 * Read one root Tool lifecycle through the conversation snapshot index.
 * Always returns `undefined` for "not present" -- callers rely on that, not
 * on `null`. `node.data.root` can itself be `null` (a transient state before
 * the tool call's root lifecycle node is populated); normalize that here so
 * a stray `"kind" in root` at a call site never sees `null` and throws.
 */
function rootToolCall(snapshot, callId) {
  var node = snapshot.chat && snapshot.chat.nodes.get(conversationContextKey("tool-call", callId));
  if (node === undefined || node === null) return undefined;
  var root = node.data && node.data.root;
  if (root === undefined) return undefined;
  if (root === null) {
    console.debug("[approval-comment] rootToolCall: node.data.root is null", callId);
    return undefined;
  }
  return root;
}

/** Highlight one command line as bash. Returns HTML, never throws. */
function highlightCommand(command) {
  try {
    return hljs.highlight(command, { language: "bash" }).value;
  } catch (error) {
    /* fall back to escaped text */
    return escapeHtml(command);
  }
}

/** Highlight one YAML text. Returns HTML, never throws. */
function highlightYaml(text) {
  try {
    return hljs.highlight(text, { language: "yaml" }).value;
  } catch (error) {
    /* fall back to escaped text */
    return escapeHtml(text);
  }
}

/**
 * Decide whether a reason is a bash-guard structured payload. It is ours only
 * when the reason parses as YAML AND the result is a plain object with a
 * string `summary`. Anything else -- plain prose, a parse failure, another
 * source -- is not ours and the caller renders the raw reason.
 */
function parseGuardReason(reason) {
  if (typeof reason !== "string") return null;
  var result;
  try {
    result = parse(reason);
  } catch (error) {
    return null;
  }
  if (result === null || typeof result !== "object" || Array.isArray(result)) return null;
  if (typeof result.summary !== "string") return null;
  return result;
}

/**
 * One best-effort steering send carrying the user's comment verbatim. This is
 * the same wire the composer uses for a steer (`session.prompt` with mode
 * `steer`), so the message enters the running agent at the nearest step
 * boundary. Nothing is added around the comment: the agent reads what the user
 * wrote, not a generated instruction. The result is observed, never trusted.
 * The promise always resolves, so the caller can fire it and forget it.
 */
function buildSteerTo(sessions) {
  return function steerTo(sessionId, comment) {
    var binding = sessions.binding(sessionId);
    if (binding === undefined || binding.session === undefined) {
      console.warn("[approval-comment] steering skipped, session binding is gone", sessionId);
      return Promise.resolve(false);
    }
    return binding.session.prompt([{ type: "text", text: comment }], "steer").then(
      function (result) {
        if (!result.ok)
          console.warn(
            "[approval-comment] steering failed",
            result.error && result.error.code,
            result.error && result.error.message,
          );
        return result.ok === true;
      },
      function (error) {
        console.warn("[approval-comment] steering threw", error);
        return false;
      },
    );
  };
}

/**
 * The card. `matched` is the approval wait the chain elected. The two
 * action buttons behave as before. The comment field is collapsed by
 * default, so a plain rejection stays one click. Enter in the field
 * rejects with the comment. The steer goes first, so it reaches the agent
 * while the turn is still running. It is fire-and-forget and can never undo
 * the rejection.
 */
function makeApprovalCommentCard(steerTo) {
  return function ApprovalCommentCard(props) {
    var matched = props.matched;
    var t = props.t;
    var answeredState = react.useState(false);
    var answered = answeredState[0];
    var setAnswered = answeredState[1];
    var commentState = react.useState(false);
    var showComment = commentState[0];
    var setShowComment = commentState[1];
    var draftState = react.useState("");
    var draft = draftState[0];
    var setDraft = draftState[1];
    var wroteExpandedState = react.useState(false);
    var wroteExpanded = wroteExpandedState[0];
    var setWroteExpanded = wroteExpandedState[1];
    var wroteOverflowsState = react.useState(false);
    var wroteOverflows = wroteOverflowsState[0];
    var setWroteOverflows = wroteOverflowsState[1];
    var wroteRef = react.useRef(null);

    react.useEffect(
      function () {
        console.debug("[approval-comment] card mounted for approval", matched.key);
        return function () {
          console.debug("[approval-comment] card unmounted for approval", matched.key);
        };
      },
      [matched.key],
    );

    var command = props.useSession(function (snapshot) {
      var callId = matched.payload.callId;
      if (callId === undefined) return undefined;
      var root = rootToolCall(snapshot, callId);
      if (root === undefined) return undefined;
      return root.callId === callId && !("kind" in root) ? commandOf(root) : undefined;
    });

    var answer = function (outcome) {
      if (answered) return;
      console.debug("[approval-comment] answer:", outcome);
      setAnswered(true);
      var commentText = draft.trim();
      // The steer goes out BEFORE the rejection is answered, while the turn is
      // still running, so it rides the next step boundary. Sending it after the
      // rejection resolved let the turn end first, and the steer then started a
      // fresh turn, so the agent appeared to stop and then restart.
      if (outcome === "rejected" && commentText !== "") {
        steerTo(matched.sessionId, commentText);
      }
      matched
        .respond({
          ok: true,
          value: {
            sessionId: matched.sessionId,
            approvalId: matched.payload.approvalId,
            outcome: outcome,
          },
        })
        .then(function (receipt) {
          if (receipt === undefined || receipt === null || !receipt.accepted) {
            throw new Error(
              "approval response rejected: " +
                (receipt === undefined || receipt === null || receipt.reason === undefined
                  ? "unknown"
                  : receipt.reason),
            );
          }
          console.debug("[approval-comment] answered", matched.key, outcome);
        })
        .catch(function (error) {
          console.warn("[approval-comment] answer failed", matched.key, outcome, error);
          setAnswered(false);
        });
    };

    var onCommentKeyDown = function (event) {
      if (answered) return;
      if (event.key === "Escape") {
        setShowComment(false);
        return;
      }
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !(event.nativeEvent && event.nativeEvent.isComposing)
      ) {
        event.preventDefault();
        answer("rejected");
      }
    };

    // bash-guard names itself at the head of its reason. When the reason is
    // its YAML payload, `runs` replaces the `$ <command>` block from
    // args.command, so that block is suppressed to avoid showing the
    // command twice.
    var guardReason = parseGuardReason(matched.payload.reason);

    // The mutation keys are optional. An older host omits them, so treat any
    // non-`true` `mutating` as absent and keep only the string entries of
    // `changes`.
    var mutating = guardReason !== null && guardReason.mutating === true;
    var changes =
      guardReason !== null && Array.isArray(guardReason.changes)
        ? guardReason.changes.filter(function (entry) {
            return typeof entry === "string";
          })
        : [];
    var wroteText =
      guardReason !== null && typeof guardReason.wrote === "string" ? guardReason.wrote : null;

    // Measure the clamped `wrote` block while the clamp is applied. Run
    // before paint so the overflow flag never flashes an unclamped block.
    react.useLayoutEffect(
      function () {
        if (wroteExpanded) return;
        var element = wroteRef.current;
        if (element === null) return;
        setWroteOverflows(element.scrollHeight > element.clientHeight + 1);
      },
      [wroteText, wroteExpanded],
    );

    return (
      <div className="approval-comment-root" data-approval-key={matched.key}>
        <div className="approval-comment-card" data-source={guardReason ? "bash-guard" : undefined}>
          <div className="approval-comment-strip">
            <span className="approval-comment-dot" />
            {t("approval.waiting")}
          </div>
          <div
            className="approval-comment-body"
            data-approval-scroll=""
            tabIndex={0}
            role="group"
            aria-label={t("approval.detail.aria")}
          >
            {guardReason ? (
              <>
                <div className="approval-comment-headline approval-comment-headline-one-line">
                  {guardReason.summary}
                </div>
                {mutating ? <div className="approval-comment-warn">changes files</div> : null}
                {mutating && changes.length > 0 ? (
                  <ul className="approval-comment-warn-list">
                    {changes.map(function (entry, index) {
                      return (
                        <li key={index} className="approval-comment-warn-item">
                          {entry}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {wroteText !== null ? (
                  <div className="approval-comment-block">
                    <div className="approval-comment-block-label">wrote</div>
                    <pre
                      ref={wroteRef}
                      className={
                        "approval-comment-code approval-comment-code-wrap" +
                        (wroteExpanded ? "" : " approval-comment-code-clamp")
                      }
                      tabIndex={0}
                    >
                      <code
                        className="hljs"
                        dangerouslySetInnerHTML={{
                          __html: highlightCommand(wroteText),
                        }}
                      />
                    </pre>
                    {wroteOverflows ? (
                      <button
                        type="button"
                        className="approval-comment-show-more"
                        aria-expanded={wroteExpanded}
                        onClick={function () {
                          setWroteExpanded(!wroteExpanded);
                        }}
                      >
                        {wroteExpanded ? "show less" : "show more"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {typeof guardReason.runs === "string" ? (
                  <div className="approval-comment-block">
                    <div className="approval-comment-block-label">runs instead</div>
                    <pre
                      className="approval-comment-code approval-comment-code-wrap approval-comment-code-scroll"
                      tabIndex={0}
                    >
                      <code
                        className="hljs"
                        dangerouslySetInnerHTML={{
                          __html: highlightCommand(guardReason.runs),
                        }}
                      />
                    </pre>
                  </div>
                ) : null}
                {typeof guardReason.why === "string" ? (
                  <details className="approval-comment-why">
                    <summary className="approval-comment-why-toggle">why</summary>
                    <p className="approval-comment-prose">{guardReason.why}</p>
                  </details>
                ) : null}
                {typeof guardReason.justification === "string" ? (
                  <p className="approval-comment-prose">{guardReason.justification}</p>
                ) : null}
              </>
            ) : (
              <>
                <div className="approval-comment-headline approval-comment-headline-raw">
                  {matched.payload.reason ||
                    t("approval.escalation", { toolName: matched.payload.toolName })}
                </div>
                {command !== undefined ? (
                  <div className="approval-comment-command">
                    {"$ "}
                    <code
                      className="hljs"
                      dangerouslySetInnerHTML={{ __html: highlightCommand(command) }}
                    />
                  </div>
                ) : null}
              </>
            )}
            <button
              type="button"
              className="approval-comment-comment-toggle"
              disabled={answered}
              aria-expanded={showComment}
              onClick={function () {
                setShowComment(!showComment);
              }}
            >
              {showComment ? t("comment.hide") : t("comment.toggle")}
            </button>
            {showComment ? (
              <div className="approval-comment-comment-field">
                <textarea
                  className="approval-comment-comment-input"
                  value={draft}
                  disabled={answered}
                  rows={2}
                  autoFocus={true}
                  aria-label={t("comment.label")}
                  placeholder={t("comment.placeholder")}
                  onChange={function (event) {
                    setDraft(event.target.value);
                  }}
                  onKeyDown={onCommentKeyDown}
                />
                <p className="approval-comment-comment-hint">{t("comment.hint")}</p>
              </div>
            ) : null}
          </div>
          <div className="approval-comment-action-row">
            <Button
              variant="outline"
              className="approval-comment-reject"
              disabled={answered}
              onClick={function () {
                answer("rejected");
              }}
            >
              {t("approval.reject")}
            </Button>
            <Button
              variant="primary"
              disabled={answered}
              onClick={function () {
                answer("allowed-once");
              }}
            >
              {t("approval.allowOnce")}
            </Button>
          </div>
        </div>
      </div>
    );
  };
}

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots", "sessions", "locale"];

/**
 * Plugin body: register the chain entry after the composer slot is
 * declared, and register the dictionary for this card's locale seat.
 */
function apply(ctx) {
  console.debug("[approval-comment] apply: registering composer slot");
  var steerTo = buildSteerTo(ctx.sessions);
  var card = makeApprovalCommentCard(steerTo);
  ctx.effect(function () {
    return registerLocale(ctx, LOCALE_NS, EN, ZH);
  }, "approval-comment: dictionaries");
  ctx.slots.inject("conversation.composer", function () {
    return ctx.slots.register(
      {
        name: "conversation.composer",
        select: selectApproval,
        priority: 0,
        locale: LOCALE_NS,
        registrant: PLUGIN_NAME,
      },
      card,
    );
  });
}

export { apply, inject, name };
