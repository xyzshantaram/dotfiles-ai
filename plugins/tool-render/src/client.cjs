/**
* H2+H3 — tool-render, the browser half.
*
* The seam. The keyed slot that governs tool-call render cells is
* `conversation.chat.node` with key `tool-call`, registered by
* dsh-client-ui-tool at the default priority 0 (dsh-client-ui-tool
* lib/client.js:1641). That node dispatches each atomic Tool call to the
* child keyed slot `tool.call.toolview`, declared by the same entry
* (lib/client.js:1647-1650: `children: { "tool.call.toolview": { kind:
* "keyed", scope: "session" } }`), keyed by tool name. The shipped rows sit
* at priority 0: bash (bashToolviewSample), read (readToolview), edit and
* write (fileMutationToolview).
*
* Shadowing the whole `tool-call` node at a lower priority is impossible:
* SlotCore.register() throws when a second entry declares the same child
* slot name (`slot "tool.call.toolview" is already declared`, verified by
* running the shipped SlotCore). So this bundle shadows the per-tool ROWS:
* it registers the `read`, `bash`, `edit`, and `batch_edit` keys of
* `tool.call.toolview` at priority -100. Keyed slots sort ascending by
* priority and the lowest live entry renders (dsh-client-ui-slots SlotCore:
* entries sort by `options.priority ?? 0`; `entriesOfSlot` keeps the first
* entry per key); a same key at a different priority never throws; there is
* no origin privilege for shipped entries. `batch_edit` has no shipped row
* at all, so it previously fell through to the generic JSON card.
*
* The three requirements. edit and batch_edit render a real before/after
* diff (the tool-declared `card: "diff"` views when present, else a diff
* reconstructed from the args and the conversation's own read history — the
* personal dsh-better-edit tools declare no views and their args carry only
* 3-char anchors). read output is syntax-highlighted by file extension
* through highlight.js. bash output stays plain text, styled as a
* monospace block with preserved whitespace.
*
* The mount. This file is the package's `./client` export: esbuild bundles
* it (browser, cjs) with react and the @deepseek-ai packages external —
* those resolve through the shell loader seed — and highlight.js inlined,
* because the loader table cannot resolve npm deps (the R3 pattern from the
* dsh-remote fork; a non-inlined build fails with `require("highlight.js")
* missed the module table`). The build step wraps the bundle in
* `window.__ModuleLoader__.load({ id: "tool-render", factory })`.
*/

// ---- highlight.js: core + a curated language set, INLINED by esbuild. ----
// Registered lazily (on first use) from an extension map, so the bundle
// carries only the languages that read calls can actually produce.
var hljs = require("highlight.js/lib/core");
var languageModules = {
  javascript: require("highlight.js/lib/languages/javascript"),
  typescript: require("highlight.js/lib/languages/typescript"),
  json: require("highlight.js/lib/languages/json"),
  python: require("highlight.js/lib/languages/python"),
  bash: require("highlight.js/lib/languages/bash"),
  yaml: require("highlight.js/lib/languages/yaml"),
  markdown: require("highlight.js/lib/languages/markdown"),
  css: require("highlight.js/lib/languages/css"),
  xml: require("highlight.js/lib/languages/xml"),
  sql: require("highlight.js/lib/languages/sql"),
  go: require("highlight.js/lib/languages/go"),
  rust: require("highlight.js/lib/languages/rust"),
  java: require("highlight.js/lib/languages/java"),
  c: require("highlight.js/lib/languages/c"),
  cpp: require("highlight.js/lib/languages/cpp"),
  diff: require("highlight.js/lib/languages/diff"),
};
var registeredLanguages = new Set();

function ensureLanguage(name) {
  if (!Object.prototype.hasOwnProperty.call(languageModules, name)) return;
  if (registeredLanguages.has(name)) return;
  hljs.registerLanguage(name, languageModules[name]);
  registeredLanguages.add(name);
}

/** File extension -> highlight.js language name. */
var EXTENSION_LANGUAGE = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
  json: "json", jsonc: "json", jsonl: "json",
  py: "python", pyi: "python",
  sh: "bash", bash: "bash", zsh: "bash",
  yaml: "yaml", yml: "yaml",
  md: "markdown", markdown: "markdown",
  css: "css",
  html: "xml", htm: "xml", xml: "xml", svg: "xml",
  sql: "sql",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c", h: "c",
  cpp: "cpp", cc: "cpp", hpp: "cpp", hh: "cpp",
  diff: "diff", patch: "diff",
  ini: "ini", cfg: "ini"
};

// ---- Platform modules: resolved by the shell loader seed at runtime. ----
var React = require("react");
var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var createElement = React.createElement;
var useState = React.useState;
var DiffBlock = primitives.DiffBlock;
var StateDot = primitives.StateDot;
var IconBrowseOutline16 = primitives.IconBrowseOutline16;
var IconEditOutline16 = primitives.IconEditOutline16;
var IconApiOutline14 = primitives.IconApiOutline14;
var IconChevronDownOutline14 = primitives.IconChevronDownOutline14;
var IconInspectOutline12 = primitives.IconInspectOutline12;

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "tool-render";

// ---- One stylesheet for this bundle (house pattern: data-plugin-css guard). ----
var STYLE_TAG_ID = "tool-render/client.module.css";
var CSS_TEXT = [
  ".tool-render-row{align-items:center;min-width:0;height:24px;display:flex;position:relative;overflow:hidden}",
  ".tool-render-row[data-expandable]{cursor:pointer}",
  ".tool-render-leading{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;margin-right:6px;display:inline-flex}",
  ".tool-render-chevron{color:var(--dsw-alias-label-secondary)}",
  ".tool-render-title{color:var(--dsw-alias-label-secondary);flex:none;font-size:14px;line-height:24px}",
  ".tool-render-sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}",
  ".tool-render-summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;font-size:14px;line-height:24px;overflow:hidden}",
  ".tool-render-summary[tool-render-error]{color:var(--dsw-alias-state-error-primary)}",
  ".tool-render-path{color:var(--dsw-alias-label-secondary);cursor:pointer}",
  ".tool-render-path:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}",
  ".tool-render-body{flex-direction:column;display:flex}",
  ".tool-render-io{flex-direction:column;display:flex}",
  ".tool-render-command{font-family:var(--ds-font-family-code);white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-tertiary);margin:4px 0 0 4px;padding:2px 0;font-size:13px;line-height:20px}",
  ".tool-render-output{box-sizing:border-box;background:var(--dsw-alias-markdown-code-block);font-family:var(--ds-font-family-code);white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);border-radius:12px;margin:4px 0 4px 4px;padding:12px 16px;font-size:13px;line-height:22px;max-height:280px;overflow-y:auto}",
  ".tool-render-output[tool-render-error]{color:var(--dsw-alias-state-error-primary)}",
  ".tool-render-code{box-sizing:border-box;background:var(--dsw-alias-markdown-code-block);font-family:var(--ds-font-family-code);white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);border-radius:12px;margin:4px 0 4px 4px;padding:12px 16px;font-size:13px;line-height:22px;max-height:400px;overflow-y:auto}",
  ".tool-render-code code.hljs{background:transparent;padding:0;font-family:inherit;font-size:inherit;line-height:inherit;white-space:inherit;display:block}",
  ".tool-render-code .hljs-comment,.tool-render-code .hljs-quote{color:#8b949e;font-style:italic}",
  ".tool-render-code .hljs-keyword,.tool-render-code .hljs-selector-tag,.tool-render-code .hljs-literal,.tool-render-code .hljs-section{color:#ff7b72}",
  ".tool-render-code .hljs-string,.tool-render-code .hljs-regexp,.tool-render-code .hljs-meta .hljs-string{color:#a5d6ff}",
  ".tool-render-code .hljs-title,.tool-render-code .hljs-title.function_,.tool-render-code .hljs-title.class_,.tool-render-code .hljs-params{color:#d2a8ff}",
  ".tool-render-code .hljs-number,.tool-render-code .hljs-symbol,.tool-render-code .hljs-bullet{color:#79c0ff}",
  ".tool-render-code .hljs-attr,.tool-render-code .hljs-attribute,.tool-render-code .hljs-variable,.tool-render-code .hljs-template-variable{color:#ffa657}",
  ".tool-render-code .hljs-name,.tool-render-code .hljs-tag,.tool-render-code .hljs-built_in,.tool-render-code .hljs-type{color:#7ee787}",
  ".tool-render-code .hljs-deletion{color:#ffa198}",
  ".tool-render-code .hljs-addition{color:#aff5b4}",
  ".tool-render-diff{margin:4px 0 4px 4px}",
  ".tool-render-inspect{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;border-radius:999px;align-self:flex-start;align-items:center;gap:4px;margin:4px 0 2px 4px;padding:2px 8px;font-size:11px;line-height:16px;transition:opacity .1s;display:inline-flex}",
  ".tool-render-card:hover .tool-render-inspect,.tool-render-inspect:focus-visible{opacity:1}",
  ".tool-render-inspect:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}"
].join("");
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG_ID) + "]") === null) {
  var tag = document.createElement("style");
  tag.dataset.plugin = PLUGIN_NAME;
  tag.dataset.pluginCss = STYLE_TAG_ID;
  tag.textContent = CSS_TEXT;
  document.head.appendChild(tag);
}

// ---- Small pure helpers on the projected Tool block shapes. ----
// A block is a RunningToolCall { callId, name, argsRaw, time, subCalls }
// or a settled ToolResultNode { kind: "tool-result", call: { name,
// argsRaw }, callTime, content, isError, error, callView, resultView }.
function parseArgs(raw) {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function doneOf(block) {
  return block !== null && typeof block === "object" && "kind" in block;
}

function argsRawOf(block) {
  return doneOf(block)
    ? (block.call && typeof block.call.argsRaw === "string" ? block.call.argsRaw : "")
    : (typeof block.argsRaw === "string" ? block.argsRaw : "");
}

function callNameOf(block) {
  return doneOf(block)
    ? (block.call && typeof block.call.name === "string" ? block.call.name : "")
    : (typeof block.name === "string" ? block.name : "");
}

function rowStateOf(block) {
  if (!doneOf(block)) return "running";
  if (block.error && block.error.code === "interrupted") return "stopped";
  return block.isError === true ? "error" : "ok";
}

function resultTextOf(block) {
  if (!doneOf(block)) return null;
  var parts = [];
  var content = Array.isArray(block.content) ? block.content : [];
  for (var i = 0; i < content.length; i++) {
    var item = content[i];
    if (item && item.type === "text" && typeof item.text === "string") parts.push(item.text);
    else if (item) {
      try {
        parts.push(JSON.stringify(item, null, 2));
      } catch (error) {
        /* keep going */
      }
    }
  }
  if (parts.length === 0 && block.error !== undefined && block.error !== null) {
    parts.push((block.error.name || "Error") + ": " + (block.error.code || ""));
  }
  return parts.join("\n");
}

function firstLine(text) {
  var at = text.indexOf("\n");
  return at === -1 ? text : text.slice(0, at);
}

function relativizeToCwd(text, cwd) {
  if (typeof cwd !== "string" || cwd === "" || typeof text !== "string") return text;
  var root = cwd.replace(/[/\\]+$/, "");
  if (text === root) return text;
  if (text.indexOf(root + "/") === 0) return text.slice(root.length + 1);
  if (text.indexOf(root + "\\") === 0) return text.slice(root.length + 1);
  return text;
}

function pickString(value, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = value[keys[i]];
    if (typeof v === "string" && v !== "") return v;
  }
  return undefined;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

var ANSI_RE = /\x1B(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\)|\([A-Z0-9]|\)[A-Z0-9])|[\r\u0008]/g;
function stripAnsi(text) {
  return String(text).replace(ANSI_RE, "");
}

// ---- hashline row parsing (the personal dsh-better-edit read format). ----
// A served row is `HASH│content` with HASH in [A-Za-z0-9]{3}
// (hashline/alphabet.js: HASH_LEN = 3; ALPH base62; HASH_SEP = "│").
var HASH_ROW_RE = /^([A-Za-z0-9]{3})│/;
function stripHashRows(text) {
  return String(text).split("\n").map(function (line) {
    return HASH_ROW_RE.test(line) ? line.slice(4) : line;
  }).join("\n");
}

function extOf(path) {
  var m = /\.([A-Za-z0-9_+-]+)$/.exec(String(path || ""));
  return m === null ? "" : m[1].toLowerCase();
}

function languageFor(path) {
  var ext = extOf(path);
  return EXTENSION_LANGUAGE[ext] || null;
}

function highlightCode(text, language) {
  if (language !== null) ensureLanguage(language);
  var use = language !== null && hljs.getLanguage(language) ? language : null;
  try {
    if (use !== null) return hljs.highlight(text, { language: use }).value;
  } catch (error) {
    /* fall back to escaped text */
  }
  return escapeHtml(text);
}

// ---- Row chrome (shared look, mirrors the shipped ToolRow seating). ----
function toolRenderRow(options) {
  var open = options.expanded === true && options.expandable === true;
  var leading;
  if (open) {
    leading = createElement(IconChevronDownOutline14, { className: "tool-render-chevron" });
  } else if (options.state === "error") {
    leading = createElement(StateDot, { state: "error" });
  } else if (options.state === "stopped") {
    leading = createElement(StateDot, { state: "warning" });
  } else {
    leading = options.icon;
  }
  var summary;
  if (options.path !== undefined && options.path !== null && options.onOpenFile !== undefined) {
    summary = createElement(
      "span",
      {
        className: "tool-render-path",
        role: "link",
        tabIndex: 0,
        title: options.path,
        onClick: function (event) {
          event.stopPropagation();
          options.onOpenFile(options.path);
        },
        onKeyDown: function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            options.onOpenFile(options.path);
          }
        }
      },
      options.summary
    );
  } else {
    summary = createElement(
      "span",
      { className: "tool-render-summary", "tool-render-error": options.errorSummary !== undefined || undefined },
      options.errorSummary !== undefined ? options.errorSummary : options.summary
    );
  }
  return createElement(
    "div",
    { className: "tool-render-card" },
    createElement(
      "div",
      {
        className: "tool-render-row",
        "data-state": options.state,
        "data-expandable": options.expandable === true || undefined,
        role: options.expandable === true ? "button" : undefined,
        tabIndex: options.expandable === true ? 0 : undefined,
        "aria-expanded": options.expandable === true ? open : undefined,
        onClick: options.expandable === true ? options.onToggle : undefined,
        onKeyDown: options.expandable === true ? function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            options.onToggle();
          }
        } : undefined
      },
      createElement("span", { className: "tool-render-leading" }, leading),
      createElement("span", { className: "tool-render-title" }, options.title),
      createElement("span", { className: "tool-render-sep", "aria-hidden": true }),
      summary
    ),
    open === true
      ? createElement(
          "div",
          { className: "tool-render-body" },
          options.body,
          options.inspect !== undefined
            ? createElement(
                "button",
                { type: "button", className: "tool-render-inspect", onClick: options.inspect },
                createElement(IconInspectOutline12, {}),
                " Inspect"
              )
            : null
        )
      : null
  );
}

// ---- Read row (R2): path chrome + highlighted file content. ----
function ReadRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs(argsRawOf(block));
  var path = args !== null ? pickString(args, ["path", "file_path"]) : undefined;
  var output = done ? resultTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && output !== null && output !== "" ? firstLine(output) : undefined;
  var summary = path !== undefined ? relativizeToCwd(firstLine(path), props.cwd) : "Read";
  var body = null;
  if (output !== null && output !== "") {
    if (state === "error") {
      body = createElement("pre", { className: "tool-render-output", "tool-render-error": true }, output);
    } else {
      var code = stripHashRows(output);
      var language = languageFor(path !== undefined ? path : "");
      var html = highlightCode(code, language);
      body = createElement(
        "pre",
        { className: "tool-render-code" },
        createElement("code", { className: "hljs", dangerouslySetInnerHTML: { __html: html } })
      );
    }
  }
  return toolRenderRow({
    icon: createElement(IconBrowseOutline16, { size: 14 }),
    title: "Read",
    summary: summary,
    path: path,
    onOpenFile: props.openFile,
    state: state,
    expandable: body !== null,
    expanded: expanded,
    onToggle: function () { setExpanded(!expanded); },
    body: body,
    errorSummary: errorSummary,
    inspect: props.inspect
  });
}

// ---- Bash row (R3): plain text output, monospace block, kept whitespace. ----
function BashRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs(argsRawOf(block));
  var command = args !== null ? pickString(args, ["command", "description"]) : undefined;
  var output = done ? resultTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary = state === "error" && output !== null && output !== "" ? firstLine(output) : undefined;
  var summary = command !== undefined ? firstLine(command) : "Bash";
  var body = null;
  if (command !== undefined || (output !== null && output !== "")) {
    var inner = [];
    if (command !== undefined) {
      inner.push(createElement("div", { className: "tool-render-command" }, "$ " + command));
    }
    if (output !== null && output !== "") {
      inner.push(
        createElement(
          "pre",
          { className: "tool-render-output", "tool-render-error": state === "error" || undefined },
          stripAnsi(output)
        )
      );
    }
    body = createElement("div", { className: "tool-render-io" }, inner);
  }
  return toolRenderRow({
    icon: createElement(IconApiOutline14, { size: 14 }),
    title: "Bash",
    summary: summary,
    state: state,
    expandable: body !== null,
    expanded: expanded,
    onToggle: function () { setExpanded(!expanded); },
    body: body,
    errorSummary: errorSummary,
    inspect: props.inspect
  });
}

// ---- edit/batch_edit rows (R1): a real before/after diff block. ----
// Prefer the tool-declared `card: "diff"` views (callView while running,
// resultView once settled). dsh-better-edit declares no views and its args
// carry only 3-char anchors, so for those we reconstruct the before text
// from the conversation's own read history: the latest settled read of the
// same path holds `HASH│content` rows, and the anchors select the removed
// range. The after text is the args' replacement_text.
function narrowDiffs(diffs) {
  if (!Array.isArray(diffs) || diffs.length === 0) return null;
  var out = [];
  for (var i = 0; i < diffs.length; i++) {
    var hunk = diffs[i];
    if (typeof hunk !== "object" || hunk === null) return null;
    if (typeof hunk.path !== "string") return null;
    if (hunk.oldText !== null && typeof hunk.oldText !== "string") return null;
    if (typeof hunk.newText !== "string") return null;
    out.push({ path: hunk.path, oldText: hunk.oldText, newText: hunk.newText });
  }
  return out;
}

function wireDiffs(block) {
  if (!doneOf(block)) {
    var call = block.callView !== undefined && block.callView !== null && block.callView.card === "diff" ? block.callView : null;
    var callDiffs = call === null ? null : narrowDiffs(call.diffs);
    return callDiffs === null ? null : { diffs: callDiffs };
  }
  var result = block.resultView !== undefined && block.resultView !== null && block.resultView.card === "diff" ? block.resultView : null;
  var resultDiffs = result === null ? null : narrowDiffs(result.diffs);
  return resultDiffs === null ? null : { diffs: resultDiffs };
}

function pathEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a === b) return true;
  // Full-path identity only, modulo trailing separators. A basename match
  // would confuse two open files with the same name in different
  // directories; a miss yields null and the card falls back to add-only.
  var strip = function (p) { return p.replace(/[/\\]+$/, ""); };
  return strip(a) === strip(b);
}

function latestReadText(snapshot, path, beforeTime) {
  var nodes = snapshot && snapshot.chat && snapshot.chat.nodes;
  if (nodes === undefined || nodes === null || typeof nodes.values !== "function") return null;
  var best = null;
  var iter = nodes.values();
  for (var entry = iter.next(); entry.done !== true; entry = iter.next()) {
    var node = entry.value;
    if (node === undefined || node === null || node.kind !== "tool-call") continue;
    var block = node.data !== undefined && node.data !== null ? node.data.root : undefined;
    if (block === undefined || block === null) continue;
    if (callNameOf(block) !== "read") continue;
    if (doneOf(block) !== true || block.isError === true) continue;
    var time = typeof block.time === "number" ? block.time : undefined;
    if (time === undefined) continue;
    if (typeof beforeTime === "number" && time >= beforeTime) continue;
    var args = parseArgs(argsRawOf(block));
    if (args === null) continue;
    var readPath = pickString(args, ["path", "file_path"]);
    if (readPath === undefined || !pathEquals(readPath, path)) continue;
    var text = resultTextOf(block);
    if (text === null || text === "") continue;
    if (best === null || time > best.time) best = { time: time, text: text };
  }
  return best === null ? null : best.text;
}

function extractHunk(readText, removeFrom, removeTo, replacementText) {
  if (typeof readText !== "string" || readText === "") return null;
  var rows = [];
  var lines = readText.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var m = HASH_ROW_RE.exec(lines[i]);
    if (m !== null) rows.push({ hash: m[1], content: lines[i].slice(4) });
  }
  if (rows.length === 0) return null;
  var from = -1;
  for (var k = 0; k < rows.length; k++) {
    if (rows[k].hash === removeFrom) { from = k; break; }
  }
  if (from === -1) return null;
  var to = from;
  if (typeof removeTo === "string" && removeTo !== "") {
    // An explicit removeTo that matches no row is not a one-line hunk.
    // Return null so the caller keeps the add-only fallback instead of
    // showing a silently truncated range.
    to = -1;
    for (var j = from; j < rows.length; j++) {
      if (rows[j].hash === removeTo) { to = j; break; }
    }
    if (to === -1) return null;
  }
  var before = [];
  for (var n = from; n <= to; n++) before.push(rows[n].content);
  return { before: before.join("\n"), after: typeof replacementText === "string" ? replacementText : "" };
}

/** Arg-shaped edit requests across the edit and batch_edit contracts. */
function collectEditRequests(args) {
  var out = [];
  if (typeof args !== "object" || args === null) return out;
  if (typeof args.file_path === "string" && args.file_path !== "") {
    out.push({
      path: args.file_path,
      oldText: typeof args.old_string === "string" ? args.old_string : null,
      newText: typeof args.new_string === "string" ? args.new_string : ""
    });
  }
  if (typeof args.path === "string" && args.path !== "" && typeof args.remove_from === "string") {
    out.push({
      path: args.path,
      oldText: null,
      newText: typeof args.replacement_text === "string" ? args.replacement_text : "",
      removeFrom: args.remove_from,
      removeTo: typeof args.remove_to === "string" ? args.remove_to : undefined
    });
  }
  if (Array.isArray(args.edits)) {
    for (var i = 0; i < args.edits.length; i++) {
      var item = args.edits[i];
      if (typeof item !== "object" || item === null) continue;
      var itemPath = typeof item.path === "string" && item.path !== "" ? item.path : undefined;
      if (itemPath === undefined) continue;
      if (typeof item.remove_from === "string") {
        out.push({
          path: itemPath,
          oldText: null,
          newText: typeof item.replacement_text === "string" ? item.replacement_text : "",
          removeFrom: item.remove_from,
          removeTo: typeof item.remove_to === "string" ? item.remove_to : undefined
        });
      } else if (typeof item.old_string === "string") {
        out.push({
          path: itemPath,
          oldText: item.old_string,
          newText: typeof item.new_string === "string" ? item.new_string : ""
        });
      }
    }
  }
  return out;
}

function resolveEditDiffs(block, requests, useSession) {
  // A settled node can carry callTime: null (the reducer saw the result
  // without the start event), and latestReadText disables its filter on a
  // non-number bound. An unknown start time means any history read could
  // postdate the edit, so reconstruction runs only with a numeric bound;
  // otherwise oldText stays null and the card renders add-only.
  var running = !doneOf(block);
  var beforeTime = running
    ? block.time
    : (typeof block.callTime === "number" ? block.callTime : undefined);
  var out = [];
  for (var i = 0; i < requests.length; i++) {
    var req = requests[i];
    var oldText = req.oldText;
    if (oldText === null && typeof beforeTime === "number" && useSession !== undefined) {
      var readText = useSession(function (snapshot) {
        return latestReadText(snapshot, req.path, beforeTime);
      });
      if (readText !== null) {
        var hunk = extractHunk(readText, req.removeFrom, req.removeTo, req.newText);
        if (hunk !== null) oldText = hunk.before;
      }
    }
    out.push({ path: req.path, oldText: oldText, newText: req.newText });
  }
  return out;
}

function makeEditRow(toolTitle) {
  return function EditToolRow(props) {
    var expandedState = useState(false);
    var expanded = expandedState[0];
    var setExpanded = expandedState[1];
    var block = props.block;
    var done = doneOf(block);
    var args = parseArgs(argsRawOf(block));
    var argsObject = args !== null ? args : {};
    var wire = wireDiffs(block);
    var diffs;
    if (wire !== null) {
      diffs = wire.diffs;
    } else {
      var requests = collectEditRequests(argsObject);
      diffs = resolveEditDiffs(block, requests, props.useSession);
      if (diffs.length === 0) diffs = null;
    }
    var output = done ? resultTextOf(block) : null;
    var state = rowStateOf(block);
    var errorSummary = state === "error" && output !== null && output !== "" ? firstLine(output) : undefined;
    var summaryPath = pickString(argsObject, ["path", "file_path"]);
    var summary = summaryPath !== undefined ? relativizeToCwd(firstLine(summaryPath), props.cwd) : toolTitle;
    var body = null;
    if (diffs !== null && diffs.length > 0) {
      body = createElement(DiffBlock, { diffs: diffs, className: "tool-render-diff" });
    } else if (output !== null && output !== "") {
      body = createElement("pre", { className: "tool-render-output", "tool-render-error": state === "error" || undefined }, output);
    }
    return toolRenderRow({
      icon: createElement(IconEditOutline16, { size: 14 }),
      title: toolTitle,
      summary: summary,
      path: summaryPath,
      onOpenFile: props.openFile,
      state: state,
      expandable: body !== null,
      expanded: expanded,
      onToggle: function () { setExpanded(!expanded); },
      body: body,
      errorSummary: errorSummary,
      inspect: props.inspect
    });
  };
}

var EditRow = makeEditRow("Edit");
var BatchEditRow = makeEditRow("Batch edit");

// ---- Cordis plugin face. ----
var inject = ["slots"];

function apply(ctx) {
  ctx.slots.inject("tool.call.toolview", function* () {
    yield ctx.slots.register({
      name: "tool.call.toolview",
      key: "read",
      priority: -100
    }, ReadRow);
    yield ctx.slots.register({
      name: "tool.call.toolview",
      key: "bash",
      priority: -100
    }, BashRow);
    yield ctx.slots.register({
      name: "tool.call.toolview",
      key: "edit",
      priority: -100
    }, EditRow);
    yield ctx.slots.register({
      name: "tool.call.toolview",
      key: "batch_edit",
      priority: -100
    }, BatchEditRow);
  });
}

module.exports = { apply: apply, inject: inject, name: PLUGIN_NAME };