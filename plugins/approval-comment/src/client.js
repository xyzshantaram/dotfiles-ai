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
* The seam. The bundle is the package's `./client` export, shaped like the
* other installed client plugins (`dsh-at-file`, `dsh-better-markdown`):
* a plain `window.__ModuleLoader__.load` registration whose factory ends
* with `return module.exports`. `require` inside the factory resolves
* through the browser module table (react and the @deepseek-ai packages
* are platform modules). The host row in cordis.patch.yml keeps the loader
* entry alive so `dsh-client-modules` serves this bundle in the boot graph.
*/

window.__ModuleLoader__.load({
  id: "approval-comment",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    /** The browser module table resolves these platform modules. */
    var react = require("react");
    var _primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    var Button = _primitives.Button;
    var _runtime = require("@deepseek-ai/dsh-client-runtime/client");
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
    var CSS_TEXT = [
      ".approval-comment-root{padding:8px calc(var(--dsh-composer-side-clearance) + 16px) 12px;flex-direction:column;align-items:center;display:flex}",
      ".approval-comment-card{width:100%;max-width:var(--dsh-chat-content-width);border:1px solid var(--dsw-alias-state-warn-secondary);background:var(--dsw-specific-input-major);box-shadow:var(--dsw-shadow-lv2);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:20px;overflow:hidden}",
      ".approval-comment-strip{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-primary);align-items:center;gap:8px;padding:10px 16px;font-size:13px;line-height:18px;display:flex}",
      ".approval-comment-dot{background:var(--dsw-alias-state-warn-primary);border-radius:50%;width:8px;height:8px}",
      ".approval-comment-body{box-sizing:border-box;max-height:var(--dsh-composer-text-max-height);flex-direction:column;gap:6px;padding:12px 16px 0;display:flex;overflow-y:auto}",
      ".approval-comment-headline{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:500;line-height:24px}",
      ".approval-comment-command{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);word-break:break-all;font-size:13px;line-height:20px}",
      ".approval-comment-action-row{justify-content:flex-end;gap:8px;padding:14px 16px;display:flex}",
      ".approval-comment-reject:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-color:#0000}",
      ".approval-comment-comment-toggle{align-self:flex-start;background:none;border:0;padding:2px 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:pointer}",
      ".approval-comment-comment-toggle:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
      ".approval-comment-comment-toggle:disabled{opacity:.5;cursor:default}",
      ".approval-comment-comment-field{flex-direction:column;gap:6px;display:flex}",
      ".approval-comment-comment-input{box-sizing:border-box;width:100%;min-height:56px;resize:vertical;border:1px solid var(--dsw-alias-line-secondary);border-radius:8px;padding:8px 10px;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px}",
      ".approval-comment-comment-input:focus{outline:0;border-color:var(--dsw-alias-state-warn-secondary)}",
      ".approval-comment-comment-input:disabled{opacity:.5}",
      ".approval-comment-comment-hint{color:var(--dsw-alias-label-caption);font-size:12px;line-height:16px;margin:0}"
    ].join("");
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG_ID) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = PLUGIN_NAME;
      tag.dataset.pluginCss = STYLE_TAG_ID;
      tag.textContent = CSS_TEXT;
      document.head.appendChild(tag);
    }

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
      "comment.hint": "This comment steers the next action."
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
      "comment.hint": "该评论将指导下一步行动。"
    };

    /** Chain routing: claim the composer while an approval wait is pending. */
    function selectApproval(owner) {
      return owner.interactions.find(function (interaction) {
        return interaction.kind === "approval";
      }) || null;
    }

    /** Extract the shell command from an approval's paired running call. */
    function commandOf(call) {
      if (call === undefined) return undefined;
      try {
        var args = JSON.parse(call.argsRaw);
        return typeof args.command === "string" ? args.command : undefined;
      } catch (error) {
        return undefined;
      }
    }

    /** Read one root Tool lifecycle through the conversation snapshot index. */
    function rootToolCall(snapshot, callId) {
      var node = snapshot.chat && snapshot.chat.nodes.get(conversationContextKey("tool-call", callId));
      return node === undefined || node === null ? undefined : node.data && node.data.root;
    }

    /**
    * One best-effort steering send. This is the same wire path the composer
    * uses for a steer (`session.prompt` with mode `steer`): the message
    * enters the running agent at the nearest step boundary. The result is
    * observed, never trusted. The promise always resolves, so the caller
    * can fire it and forget it.
    */
    function buildSteerTo(sessions) {
      return function steerTo(sessionId, toolName, comment) {
        var text = "The user rejected the " + toolName + " call. Comment: " + comment + " Adjust your next action.";
        var binding = sessions.binding(sessionId);
        if (binding === undefined || binding.session === undefined) {
          console.warn("[approval-comment] steering skipped, session binding is gone", sessionId);
          return Promise.resolve(false);
        }
        return binding.session.prompt([{ type: "text", text: text }], "steer").then(
          function (result) {
            if (!result.ok) console.warn("[approval-comment] steering failed", result.error && result.error.code, result.error && result.error.message);
            return result.ok === true;
          },
          function (error) {
            console.warn("[approval-comment] steering threw", error);
            return false;
          }
        );
      };
    }

    /**
    * The card. `matched` is the approval wait the chain elected. The two
    * action buttons behave as before. The comment field is collapsed by
    * default, so a plain rejection stays one click. Enter in the field
* rejects with the comment. The answer goes first. The steer is a
* fire-and-forget promise that can never undo the rejection.
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

        var command = props.useSession(function (snapshot) {
          var callId = matched.payload.callId;
          if (callId === undefined) return undefined;
          var root = rootToolCall(snapshot, callId);
          if (root === undefined) return undefined;
          return root.callId === callId && !("kind" in root) ? commandOf(root) : undefined;
        });

        var answer = function (outcome) {
          if (answered) return;
          setAnswered(true);
          var commentText = draft.trim();
          matched.respond({
            ok: true,
            value: {
              sessionId: matched.sessionId,
              approvalId: matched.payload.approvalId,
              outcome: outcome
            }
          }).then(function (receipt) {
            if (receipt === undefined || receipt === null || !receipt.accepted) {
              throw new Error("approval response rejected: " + (receipt === undefined || receipt === null || receipt.reason === undefined ? "unknown" : receipt.reason));
            }
            if (outcome === "rejected" && commentText !== "") {
steerTo(matched.sessionId, matched.payload.toolName, commentText);
            }
          }).catch(function () {
            setAnswered(false);
          });
        };

        var onCommentKeyDown = function (event) {
          if (answered) return;
          if (event.key === "Escape") {
            setShowComment(false);
            return;
          }
          if (event.key === "Enter" && !event.shiftKey && !(event.nativeEvent && event.nativeEvent.isComposing)) {
            event.preventDefault();
            answer("rejected");
          }
        };

        return react.createElement(
          "div",
          { className: "approval-comment-root", "data-approval-key": matched.key },
          react.createElement(
            "div",
            { className: "approval-comment-card" },
            react.createElement(
              "div",
              { className: "approval-comment-strip" },
              react.createElement("span", { className: "approval-comment-dot" }),
              t("approval.waiting")
            ),
            react.createElement(
              "div",
              { className: "approval-comment-body", "data-approval-scroll": "", tabIndex: 0, role: "group", "aria-label": t("approval.detail.aria") },
              react.createElement(
                "div",
                { className: "approval-comment-headline" },
                matched.payload.reason || t("approval.escalation", { toolName: matched.payload.toolName })
              ),
              command !== undefined ? react.createElement("div", { className: "approval-comment-command" }, command) : null,
              react.createElement(
                "button",
                {
                  type: "button",
                  className: "approval-comment-comment-toggle",
                  disabled: answered,
                  "aria-expanded": showComment,
                  onClick: function () {
                    setShowComment(!showComment);
                  }
                },
                showComment ? t("comment.hide") : t("comment.toggle")
              ),
              showComment ? react.createElement(
                "div",
                { className: "approval-comment-comment-field" },
                react.createElement("textarea", {
                  className: "approval-comment-comment-input",
                  value: draft,
                  disabled: answered,
                  rows: 2,
                  autoFocus: true,
                  "aria-label": t("comment.label"),
                  placeholder: t("comment.placeholder"),
                  onChange: function (event) {
                    setDraft(event.target.value);
                  },
                  onKeyDown: onCommentKeyDown
                }),
                react.createElement("p", { className: "approval-comment-comment-hint" }, t("comment.hint"))
              ) : null
            ),
            react.createElement(
              "div",
              { className: "approval-comment-action-row" },
              react.createElement(
                Button,
                { variant: "outline", className: "approval-comment-reject", disabled: answered, onClick: function () { answer("rejected"); } },
                t("approval.reject")
              ),
              react.createElement(
                Button,
                { variant: "primary", disabled: answered, onClick: function () { answer("allowed-once"); } },
                t("approval.allowOnce")
              )
            )
          )
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
      var steerTo = buildSteerTo(ctx.sessions);
      var card = makeApprovalCommentCard(steerTo);
      ctx.effect(function () {
        return ctx.locale.register(LOCALE_NS, { en: EN, zh: ZH });
      }, "approval-comment: dictionaries");
      ctx.slots.inject("conversation.composer", function () {
        return ctx.slots.register({
          name: "conversation.composer",
          select: selectApproval,
          priority: 0,
          locale: LOCALE_NS,
          registrant: PLUGIN_NAME
        }, card);
      });
    }

    module.exports = { apply: apply, inject: inject, name: name };
    return module.exports;
  }
});