/**
 * #65 — the composer-takeover neutralizer.
 *
 * `conversation.composer` is the host's composer TAKEOVER chain: whenever any
 * entry's select matches, ConversationRoot hides the whole default composer
 * (input bar, tool row, and the input dock itself) behind
 * `<div data-chain-overlay-fallback="conversation.composer" style="display:none">`
 * and mounts the winner beside it. The takeover is the seat, not the
 * component: ANY card registered there leaves the composer unusable, and the
 * shipped `ApprovalPanel` registers there for every tool approval.
 *
 * So this bundle still ENTERS that election — with an empty marker that
 * outranks the shipped panel — and then hands the composer back through a
 * stylesheet override scoped by `:has()` to our own marker (see
 * client.module.css). Answering happens elsewhere and nowhere near this seat:
 * the answer bar lives on the tool call card (tool-render's
 * ToolRenderApprovalBar, #8/#48), with the composer-approvals indicator (#7)
 * as the jump-to surface. An earlier revision of this fix mounted a duplicate
 * answer card in `conversation.input.dock` directly above the composer; the
 * owner rejected the duplicate surface, so this plugin now draws no card UI
 * of its own. What it DOES leave on screen is signal: the marker carries
 * which approval kinds are pending, and client.module.css turns that into
 * concentric rings on the composer seat — yellow for a sandbox escalation,
 * blue for a bash-guard rewrite, with a reserved white slot for #38's
 * question ring.
 *
 * Another takeover kind (a pending user question) still hides the composer
 * exactly as the host intends — that contract belongs to #38.
 *
 * The seam. This file is the package's `./client` source. build.mjs bundles
 * it with esbuild (browser, cjs, es2022): react and the @deepseek-ai packages
 * external. The build wraps the bundle in the `window.__ModuleLoader__.load`
 * facade with the loader id `approval-comment`. The host row in
 * cordis.patch.yml keeps the loader entry alive so `dsh-client-modules`
 * serves this bundle in the boot graph.
 */

/** The browser module table resolves these platform modules. */
import react from "react";
import { parse } from "yaml";
import {
  injectStyle,
  mergeCss,
  PERMISSION_OUTLINE_CSS,
  HLJS_THEME_CSS,
} from "../../shared/client-util";
import localCss from "./client.module.css";

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "approval-comment";

/**
 * One stylesheet for this bundle. The style tag pattern mirrors the shipped
 * modules (`data-plugin-css` guard, one tag per bundle).
 */
var STYLE_TAG_ID = "approval-comment/ApprovalComment.module.css";
injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(localCss));
/** Shared permission outline tokens. The id matches the other injectors, so only one tag exists. */
injectStyle(PLUGIN_NAME, "dsh-permission-outline", PERMISSION_OUTLINE_CSS);
/** Shared highlight.js token colors. The id matches tool-render's injector, so only one tag exists. */
injectStyle(PLUGIN_NAME, "dsh-hljs-theme", HLJS_THEME_CSS);

/** Whether an approval's reason was raised by bash-guard. Verbatim twin of
 * tool-render's ./guard classifier (bundles cannot cross-import): the shape
 * the guard actually emits is plain text starting with "bash-guard:"; the
 * YAML payload with a string `summary` stays accepted for forward
 * compatibility. A YAML parse alone is not a test — the plain text parses
 * as YAML too — so each shape gets its own branch. */
function isBashGuardReason(reason) {
  if (typeof reason !== "string") return false;
  if (reason.indexOf("bash-guard:") === 0) return true;
  var parsed;
  try {
    parsed = parse(reason);
  } catch (error) {
    return false;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  return typeof parsed.summary === "string";
}

/** Chain routing: claim the composer takeover while an approval wait is
 * pending, and classify WHY it was asked. The elector input carries the
 * session's pending interactions; each approval's payload.reason says
 * whether bash-guard raised it (a rewrite or command-rule ask) or whether
 * the sandbox escalated. The classification rides to the component as the
 * chain's `matched` value and drives the composer's pending-state rings in
 * client.module.css. */
function selectApproval(owner) {
  var any = false;
  var escalated = false;
  var rewrite = false;
  var list = (owner && owner.interactions) || [];
  for (var i = 0; i < list.length; i++) {
    var interaction = list[i];
    if (!interaction || interaction.kind !== "approval") continue;
    any = true;
    var reason =
      interaction.payload !== null && typeof interaction.payload === "object"
        ? interaction.payload.reason
        : undefined;
    if (isBashGuardReason(reason)) rewrite = true;
    else escalated = true;
  }
  if (!any) return null;
  return { escalated: escalated, rewrite: rewrite };
}

/**
 * The composer-chain occupant: an empty marker, and deliberately nothing else.
 *
 * Its whole job is to WIN the takeover election so the shipped `ApprovalPanel`
 * never mounts, while drawing no UI of its own. The marker is a real DOM node
 * because the stylesheet keys the composer-restoring override off it
 * (`[data-chain-overlay-fallback]:has(~ .approval-comment-shadow)`), which is
 * what scopes that override to this bundle's elections. `display: none` on the
 * marker itself does not affect selector matching, so the node costs no layout.
 *
 * Keeping this component free of state and hooks is load-bearing: the host
 * wraps each elected entry in an error boundary, and a crash here would drop
 * the marker and hide the composer again. It reads exactly one prop — the
 * elector's `matched` classification — to tag the marker with which kinds of
 * approval are pending, which is what the composer's ring stylesheet keys
 * off. There is no second seat anymore: answering lives on the tool call
 * card in tool-render.
 */
function ComposerShadow(props) {
  var matched = (props && props.matched) || {};
  return (
    <div
      className="approval-comment-shadow"
      data-approval-shadow=""
      aria-hidden={true}
      data-escalated={matched.escalated === true ? "" : undefined}
      data-rewrite={matched.rewrite === true ? "" : undefined}
    />
  );
}

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots"];

/**
 * Plugin body: register the chain shadow that keeps the shipped panel from
 * taking the composer over. That is the whole plugin.
 */
function apply(ctx) {
  console.debug("[approval-comment] apply: registering composer shadow");
  ctx.slots.inject("conversation.composer", function () {
    return ctx.slots.register(
      {
        name: "conversation.composer",
        select: selectApproval,
        priority: 0,
        registrant: PLUGIN_NAME,
      },
      ComposerShadow,
    );
  });
}

export { apply, inject, name };
