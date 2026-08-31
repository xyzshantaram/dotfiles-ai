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
 * it registers the `read`, `bash`, `edit`, `write`, `undo_edit`,
 * `undo_last_edit`, `todo_write`, and `ask_user_question` keys of
 * `tool.call.toolview` at priority -100. Keyed slots sort ascending by
 * priority and the lowest live entry renders (dsh-client-ui-slots SlotCore:
 * entries sort by `options.priority ?? 0`; `entriesOfSlot` keeps the first
 * entry per key); a same key at a different priority never throws; there is
 * no origin privilege for shipped entries. `batch_edit` rows stopped being
 * rendered here when dsh-better-edit 0.6.0 removed the tool; historical
 * batch_edit blocks fall through to the generic JSON card.
 * todo_write and ask_user_question shadow shipped rows (dsh-client-ui-tool
 * client.js: todoToolview key "todo_write", askQuestionToolview key
 * "ask_user_question", both priority 0) whose expanded card is the generic
 * IN/OUT JSON dump.
 *
 * The requirements. edit and write render real before/after diffs. They use
 * the tool-declared `card: "diff"` views
 * when present, else a diff reconstructed from the args and the
 * conversation's own read history — the personal dsh-better-edit tools
 * declare no views and their args carry only 3-char anchors. write
 * rebuilds the before text from read history and shows a per-line diff
 * with syntax highlighting, or only the new content when no prior read
 * exists. read output is syntax-highlighted by file extension through
 * highlight.js. bash output stays plain text, styled as a monospace
 * block with preserved whitespace.
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
import hljs from "highlight.js/lib/core";
import { injectStyle, mergeCss, escapeHtml } from "../../shared/client-util";
import localCss from "./client.module.css";
import jsGrammar from "highlight.js/lib/languages/javascript";
import tsGrammar from "highlight.js/lib/languages/typescript";
import jsonGrammar from "highlight.js/lib/languages/json";
import pyGrammar from "highlight.js/lib/languages/python";
import bashGrammar from "highlight.js/lib/languages/bash";
import yamlGrammar from "highlight.js/lib/languages/yaml";
import mdGrammar from "highlight.js/lib/languages/markdown";
import cssGrammar from "highlight.js/lib/languages/css";
import xmlGrammar from "highlight.js/lib/languages/xml";
import sqlGrammar from "highlight.js/lib/languages/sql";
import goGrammar from "highlight.js/lib/languages/go";
import rustGrammar from "highlight.js/lib/languages/rust";
import javaGrammar from "highlight.js/lib/languages/java";
import cGrammar from "highlight.js/lib/languages/c";
import cppGrammar from "highlight.js/lib/languages/cpp";
import diffGrammar from "highlight.js/lib/languages/diff";
var languageModules = {
  javascript: jsGrammar,
  typescript: tsGrammar,
  json: jsonGrammar,
  python: pyGrammar,
  bash: bashGrammar,
  yaml: yamlGrammar,
  markdown: mdGrammar,
  css: cssGrammar,
  xml: xmlGrammar,
  html: xmlGrammar /* xml grammar covers html */,
  sql: sqlGrammar,
  go: goGrammar,
  rust: rustGrammar,
  java: javaGrammar,
  c: cGrammar,
  cpp: cppGrammar,
  diff: diffGrammar,
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
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  json: "json",
  jsonc: "json",
  jsonl: "json",
  py: "python",
  pyi: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  hh: "cpp",
  diff: "diff",
  patch: "diff",
};

// ---- Platform modules: resolved by the shell loader seed at runtime. ----
import react from "react";
import * as primitives from "@deepseek-ai/dsh-client-ui-primitives";
var useState = react.useState;
var StateDot = primitives.StateDot;
var IconBrowseOutline16 = primitives.IconBrowseOutline16;
var IconEditOutline16 = primitives.IconEditOutline16;
var IconApiOutline14 = primitives.IconApiOutline14;
var IconChevronDownOutline14 = primitives.IconChevronDownOutline14;
var IconInspectOutline12 = primitives.IconInspectOutline12;
var IconChecklistOutline14 = primitives.IconChecklistOutline14;
var IconQuestionOutline14 = primitives.IconQuestionOutline14;
var IconAgentPresetOutline16 = primitives.IconAgentPresetOutline16;
var MarkdownText = primitives.MarkdownText;

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "tool-render";

// ---- One stylesheet for this bundle (house pattern: data-plugin-css guard). ----
var STYLE_TAG_ID = "tool-render/client.module.css";
// ---- highlight.js github-dark theme, embedded as text. ----------------
// The loader table cannot resolve a sidecar CSS file, so the theme ships
// inside the bundle like the plugin CSS below. The token colors replace
// the hand-rolled palette this bundle used to carry.
var HLJS_THEME_CSS = [
  "pre code.hljs{display:block;overflow-x:auto;padding:1em}",
  "code.hljs{padding:0.1875rem 0.3125rem}",
  ".hljs{color:#c9d1d9;background:#0d1117}",
  ".hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}",
  ".hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}",
  ".hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-variable,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id{color:#79c0ff}",
  ".hljs-regexp,.hljs-string,.hljs-meta .hljs-string{color:#a5d6ff}",
  ".hljs-built_in,.hljs-symbol{color:#ffa657}",
  ".hljs-comment,.hljs-code,.hljs-formula{color:#8b949e}",
  ".hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo{color:#7ee787}",
  ".hljs-subst{color:#c9d1d9}",
  ".hljs-section{color:#1f6feb;font-weight:bold}",
  ".hljs-bullet{color:#f2cc60}",
  ".hljs-emphasis{color:#c9d1d9;font-style:italic}",
  ".hljs-strong{color:#c9d1d9;font-weight:bold}",
  ".hljs-addition{color:#aff5b4;background-color:#033a16}",
  ".hljs-deletion{color:#ffdcd7;background-color:#67060c}",
].join("");

injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(localCss, HLJS_THEME_CSS));

// ---- Post-render highlighting pass for raw <pre><code> blocks. ---------
// The render path already highlights every block it creates and marks the
// element data-highlighted so this pass never re-runs on it. The observer
// catches blocks that OTHER renderers mount inside a tool card after the
// row renders (markdown in a result view, future views). It stays inside
// .tool-render-card, honors hljs's own data-highlighted guard, skips
// elements that already hold child spans, and auto-detects only small
// snippets: blind auto-detection on large plain output is slow and misreads
// (verified: ~500ms on a 116KB listing).
var HLJS_SCOPE_SELECTOR = ".tool-render-card pre code";
function hljsPassEligible(el) {
  if (el.dataset.highlighted) return false;
  if (el.children && el.children.length > 0) return false;
  var cls = typeof el.className === "string" ? el.className : "";
  var m = /(?:^|\s)language-([A-Za-z0-9_-]+)/.exec(cls);
  if (m !== null) return hljs.getLanguage(m[1].toLowerCase()) !== undefined;
  return (el.textContent || "").length <= 4096;
}
function runHljsPass(root) {
  var blocks;
  try {
    blocks = root.querySelectorAll(HLJS_SCOPE_SELECTOR);
  } catch (error) {
    return;
  }
  for (var i = 0; i < blocks.length; i++) {
    var el = blocks[i];
    if (!hljsPassEligible(el)) continue;
    try {
      hljs.highlightElement(el);
    } catch (error) {
      /* a bad grammar must not take the card down */
    }
  }
}
function ensureHljsPass() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  if (typeof window !== "undefined" && window.__toolRenderHljsPass) return;
  if (typeof window !== "undefined") window.__toolRenderHljsPass = true;
  runHljsPass(document);
  var observer = new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var added = mutations[m].addedNodes;
      if (!added || added.length === 0) continue;
      for (var i = 0; i < added.length; i++) {
        var node = added[i] as HTMLElement;
        if (!node || node.nodeType !== 1) continue;
        if (typeof node.matches === "function" && node.matches(HLJS_SCOPE_SELECTOR)) {
          if (hljsPassEligible(node)) {
            try {
              hljs.highlightElement(node);
            } catch (error) {
              /* keep going */
            }
          }
          continue;
        }
        if (typeof node.querySelectorAll === "function") {
          var blocks = node.querySelectorAll(HLJS_SCOPE_SELECTOR);
          for (var b = 0; b < blocks.length; b++) {
            var el = blocks[b] as HTMLElement;
            if (!hljsPassEligible(el)) continue;
            try {
              hljs.highlightElement(el);
            } catch (error) {
              /* keep going */
            }
          }
        }
      }
    }
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
}
ensureHljsPass();

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
    ? block.call && typeof block.call.argsRaw === "string"
      ? block.call.argsRaw
      : ""
    : block !== null && typeof block === "object" && typeof block.argsRaw === "string"
      ? block.argsRaw
      : "";
}

function callNameOf(block) {
  return doneOf(block)
    ? block.call && typeof block.call.name === "string"
      ? block.call.name
      : ""
    : block !== null && typeof block === "object" && typeof block.name === "string"
      ? block.name
      : "";
}

function rowStateOf(block) {
  if (block === null || typeof block !== "object" || !doneOf(block)) return "running";
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
  return parts.join("\n");
}

// A settled failed block usually carries its message in content[].text
// ("Error: " + message), but several error shapes keep the real message in
// block.error.message instead: sandbox denials, manifest edit restrictions,
// hashline/stale-anchor failures, write failures, batch edits. Fall back to
// error.message, then the error code, when content carries no text.
function errorTextOf(block) {
  if (!doneOf(block)) return null;
  var text = resultTextOf(block); // joins content[].text items
  if (text !== null && text !== "") return text;
  if (block.error && block.error.message) return String(block.error.message);
  if (block.error && block.error.code) return String(block.error.code);
  return null;
}

function firstLine(text) {
  var at = text.indexOf("\n");
  return at === -1 ? text : text.slice(0, at);
}

// Error summaries prefer a line that names the failure (a bracketed token
// like [E_RANGE_STALE] or [sandbox: ...]) over the first line, which may
// be an unhelpful wrapper such as "Error: ".
var ERROR_TOKEN_RE = /\[(?:E_|exit code:|sandbox:)/;
function firstLineOfError(text) {
  if (typeof text !== "string" || text === "") return text;
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    if (ERROR_TOKEN_RE.test(lines[i])) return lines[i];
  }
  return firstLine(text);
}

// Bash sandbox denials and failed commands surface as SUCCESSFUL blocks
// (isError false): the text body carries "[sandbox: file access denied
// under <mode> mode]" and/or "[exit code: N]". Elevate those settled rows
// to the error state so the error tint, dot, and uncondensed body apply.
// Running rows keep their own state.
var BASH_ERROR_MARKERS = /\[sandbox: file access denied under|\[exit code: [1-9]/;
function bashErrorState(state, output) {
  if (state === "running") return state;
  if (typeof output !== "string" || output === "") return state;
  return BASH_ERROR_MARKERS.test(output) ? "error" : state;
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

var ANSI_RE =
  /\x1B(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\)|\([A-Z0-9]|\)[A-Z0-9])|[\r\u0008]/g;
function stripAnsi(text) {
  return String(text).replace(ANSI_RE, "");
}

// ---- Render-time de-indent for code content displays. ----
// Strip the common leading whitespace from a snippet. The minimum indent
// comes from the non-empty lines; all-whitespace lines collapse to empty.
// The line count never changes, so callers keep their line numbers. This
// is display-only: stored block data is never rewritten. A leading
// tab counts as one indent unit, same as one space.
function deIndent(text) {
  if (typeof text !== "string" || text === "") return text;
  var expanded = text.replace(/\t/g, "    ");
  var lines = expanded.split("\n");
  var min = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    var count = 0;
    while (count < lines[i].length && lines[i].charAt(count) === " ") count++;
    if (min === -1 || count < min) min = count;
  }
  if (min <= 0) return expanded;
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    out.push(lines[i].trim() === "" ? "" : lines[i].slice(min));
  }
  return out.join("\n");
}

// ---- hashline row parsing (the personal dsh-better-edit read format). ----
// A served row is `HASH│content` with HASH in [A-Za-z0-9]{3}
// (hashline/alphabet.js: HASH_LEN = 3; ALPH base62; HASH_SEP = "│").
var HASH_ROW_RE = /^([A-Za-z0-9]{3})│/;
// ---- Read line metadata and numbering. ----
// dsh-better-edit's read records the requested start as the `offset` arg
// (1-indexed) on the block and appends a `[Showing lines X-Y of Z]` hint
// to partial reads. A plain read carries neither; rows then number
// sequentially from 1.
function readStartLine(args, output) {
  if (
    args !== null &&
    typeof args === "object" &&
    typeof args.offset === "number" &&
    Number.isInteger(args.offset) &&
    args.offset >= 1
  ) {
    return args.offset;
  }
  var lines = String(output).split("\n");
  if (lines.length > 0 && HASH_ROW_RE.test(lines[0])) {
    var m = /\[Showing lines (\d+)-(\d+) of \d+/.exec(String(output));
    if (m !== null) return parseInt(m[1], 10);
  }
  return 1;
}

// Split a read result into display rows with line numbers. A hashline read
// prefixes every served row with a 3-char anchor; hint and warning lines
// are not file content and carry no number. A plain read numbers every
// line. `startLine` comes from readStartLine.
function numberedReadRows(output, startLine) {
  var lines = String(output).split("\n");
  var hashline = lines.length > 0 && HASH_ROW_RE.test(lines[0]);
  var rows = [];
  var next = startLine;
  for (var i = 0; i < lines.length; i++) {
    if (hashline && HASH_ROW_RE.test(lines[i])) {
      rows.push({ number: next, text: lines[i].slice(4) });
      next++;
    } else if (hashline) {
      rows.push({ number: null, text: lines[i] });
    } else {
      rows.push({ number: next, text: lines[i] });
      next++;
    }
  }
  // De-indent numbered rows at render time. Numbered rows are file
  // content and get leveled; unnumbered rows (hints, warnings) stay as
  // served. deIndent keeps the line count, so numbers still match.
  var content = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].number !== null) content.push(rows[i].text);
  }
  var leveled = deIndent(content.join("\n")).split("\n");
  var at = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].number !== null) rows[i].text = leveled[at++];
  }
  return rows;
}

// Reduce a stored read's text to its file lines so the write diff compares
// content against content. Anchors and non-row lines (pagination hints,
// warnings, notes) are dropped. `start` is the first kept line's real
// number, or 1 when the read carried no range.
function cleanReadTextForDiff(text) {
  var lines = String(text).split("\n");
  if (lines.length === 0 || !HASH_ROW_RE.test(lines[0])) {
    return { content: text, start: readStartLine(null, text) };
  }
  var kept = [];
  for (var i = 0; i < lines.length; i++) {
    if (HASH_ROW_RE.test(lines[i])) kept.push(lines[i].slice(4));
  }
  return { content: kept.join("\n"), start: readStartLine(null, text) };
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
  // Error rows show their error body unconditionally below the row, so
  // they never need the expand toggle. Non-error rows keep the shipped
  // expand behavior.
  var interactive = options.expandable === true && options.state !== "error";
  var open = options.expanded === true && interactive;
  var leading;
  if (open) {
    leading = <IconChevronDownOutline14 className="tool-render-chevron" />;
  } else if (options.state === "error") {
    leading = <StateDot state="error" />;
  } else if (options.state === "stopped") {
    leading = <StateDot state="warning" />;
  } else {
    leading = options.icon;
  }
  var summary;
  if (options.path !== undefined && options.path !== null && options.onOpenFile !== undefined) {
    summary = (
      <span
        className="tool-render-path"
        role="link"
        tabIndex={0}
        title={options.path}
        onClick={function (event) {
          event.stopPropagation();
          options.onOpenFile(options.path);
        }}
        onKeyDown={function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            options.onOpenFile(options.path);
          }
        }}
      >
        {options.summary}
      </span>
    );
  } else {
    summary = (
      <span
        className="tool-render-summary"
        tool-render-error={options.errorSummary !== undefined || undefined}
      >
        {options.errorSummary !== undefined ? options.errorSummary : options.summary}
      </span>
    );
  }
  return (
    <div className="tool-render-card">
      <div
        className="tool-render-row"
        data-state={options.state}
        data-expandable={interactive || undefined}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={interactive ? open : undefined}
        onClick={interactive ? options.onToggle : undefined}
        onKeyDown={
          interactive
            ? function (event) {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  options.onToggle();
                }
              }
            : undefined
        }
      >
        <span className="tool-render-leading">{leading}</span>
        <span className="tool-render-title">{options.title}</span>
        <span className="tool-render-sep" aria-hidden={true} />
        {summary}
      </div>
      {open === true || (options.state === "error" && options.body !== null) ? (
        <div className="tool-render-body">
          {options.body}
          {options.inspect !== undefined ? (
            <button type="button" className="tool-render-inspect" onClick={options.inspect}>
              <IconInspectOutline12 />
              {" Inspect"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
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
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary =
    state === "error" && errorText !== null && errorText !== ""
      ? firstLineOfError(errorText)
      : undefined;
  var summary = path !== undefined ? relativizeToCwd(firstLine(path), props.cwd) : "Read";
  var body = null;
  if (output !== null && output !== "") {
    if (state === "error") {
      body = (
        <pre className="tool-render-output" tool-render-error={true}>
          {output}
        </pre>
      );
    } else {
      var rows = numberedReadRows(output, readStartLine(args, output));
      var language = languageFor(path !== undefined ? path : "");
      body = <div className="tool-render-code">{readLineRows(rows, language)}</div>;
    }
  }
  return toolRenderRow({
    icon: <IconBrowseOutline16 size={14} />,
    title: "Read",
    summary: summary,
    path: path,
    onOpenFile: props.openFile,
    state: state,
    expandable: body !== null,
    expanded: expanded,
    onToggle: function () {
      setExpanded(!expanded);
    },
    body: body,
    errorSummary: errorSummary,
    inspect: props.inspect,
  });
}

// ---- Bash row (R3): highlighted command line, plain text output block. ----
function BashRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var argsObj = parseArgs(argsRawOf(block));
  var command = argsObj !== null ? pickString(argsObj, ["command"]) : undefined;
  var description = argsObj !== null ? pickString(argsObj, ["description"]) : undefined;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = bashErrorState(rowStateOf(block), output);
  var errorSummary =
    state === "error" && errorText !== null && errorText !== ""
      ? firstLineOfError(errorText)
      : undefined;
  var summary =
    description !== undefined && description !== ""
      ? firstLine(description)
      : command !== undefined
        ? firstLine(command)
        : "Bash";
  var body = null;
  if (command !== undefined || (output !== null && output !== "")) {
    var inner = [];
    if (command !== undefined) {
      var commandHtml = highlightCode(command, "bash");
      inner.push(
        <div className="tool-render-command">
          {"$ "}
          <code
            className="hljs"
            data-highlighted="yes"
            dangerouslySetInnerHTML={{ __html: commandHtml }}
          />
        </div>,
      );
    }
    if (output !== null && output !== "") {
      inner.push(
        <pre className="tool-render-output" tool-render-error={state === "error" || undefined}>
          {stripAnsi(output)}
        </pre>,
      );
    }
    body = <div className="tool-render-io">{inner}</div>;
  }
  return toolRenderRow({
    icon: <IconApiOutline14 size={14} />,
    title: "Bash",
    summary: summary,
    state: state,
    expandable: body !== null,
    expanded: expanded,
    onToggle: function () {
      setExpanded(!expanded);
    },
    body: body,
    errorSummary: errorSummary,
    inspect: props.inspect,
  });
}

// ---- edit row (R1): a real before/after diff block. ----
// Prefer the tool-declared `card: "diff"` views (callView while running,
// resultView once settled). dsh-better-edit declares no views and its args
// carry only 3-char anchors, so for those we reconstruct the before text
// from the conversation's own read history: the latest settled read of the
// same path holds `HASH│content` rows, and the anchors select the removed
// range. The after text is the args' replacement_text. The removed range's
// first line number comes from the read's own start (its offset arg or the
// `[Showing lines X-Y of Z]` hint), so the diff's old-side gutter shows
// real file lines instead of a 1-based recount.
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
  if (block === null || typeof block !== "object") return null;
  if (!doneOf(block)) {
    var call =
      block.callView !== undefined && block.callView !== null && block.callView.card === "diff"
        ? block.callView
        : null;
    var callDiffs = call === null ? null : narrowDiffs(call.diffs);
    return callDiffs === null ? null : { diffs: callDiffs };
  }
  var result =
    block.resultView !== undefined && block.resultView !== null && block.resultView.card === "diff"
      ? block.resultView
      : null;
  var resultDiffs = result === null ? null : narrowDiffs(result.diffs);
  return resultDiffs === null ? null : { diffs: resultDiffs };
}

function matchesPath(a, b, cwd) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  var strip = function (p) {
    return p.replace(/[/\\]+$/, "");
  };
  if (strip(a) === strip(b)) return true;
  if (typeof cwd !== "string" || cwd === "") return false;
  // The model can pass the same file as absolute or repo-relative.
  // Relativize both sides against cwd, then join either side to cwd.
  var root = cwd.replace(/[/\\]+$/, "");
  var relA = relativizeToCwd(a, root);
  var relB = relativizeToCwd(b, root);
  if (strip(relA) === strip(relB)) return true;
  var joinedA = /^[/\\]/.test(a) ? a : root + "/" + a;
  var joinedB = /^[/\\]/.test(b) ? b : root + "/" + b;
  return strip(joinedA) === strip(joinedB);
}

function readsOf(snapshot, path, beforeTime, cwd) {
  var nodes = snapshot && snapshot.chat && snapshot.chat.nodes;
  if (nodes === undefined || nodes === null || typeof nodes.values !== "function") return [];
  var iter = nodes.values();
  if (iter === null || iter === undefined) return [];
  var entries;
  if (typeof iter.next === "function") {
    entries = [];
    for (var entry = iter.next(); entry.done !== true; entry = iter.next())
      entries.push(entry.value);
  } else {
    entries = Array.isArray(iter) ? iter : [];
  }
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var node = entries[i];
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
    if (readPath === undefined || !matchesPath(readPath, path, cwd)) continue;
    var text = resultTextOf(block);
    if (text === null || text === "") continue;
    out.push({ time: time, text: text, args: args });
  }
  out.sort(function (a, b) {
    return b.time - a.time;
  });
  return out;
}

function latestReadText(snapshot, path, beforeTime, cwd) {
  var reads = readsOf(snapshot, path, beforeTime, cwd);
  return reads.length === 0 ? null : reads[0].text;
}

function extractHunk(readText, removeFrom, removeTo, replacementText, startLine) {
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
    if (rows[k].hash === removeFrom) {
      from = k;
      break;
    }
  }
  if (from === -1) return null;
  var to = from;
  if (typeof removeTo === "string" && removeTo !== "") {
    // An explicit removeTo that matches no row is not a one-line hunk.
    // Return null so the caller keeps the add-only fallback instead of
    // showing a silently truncated range.
    to = -1;
    for (var j = from; j < rows.length; j++) {
      if (rows[j].hash === removeTo) {
        to = j;
        break;
      }
    }
    if (to === -1) return null;
  }
  var before = [];
  for (var n = from; n <= to; n++) before.push(rows[n].content);
  var base =
    typeof startLine === "number" && startLine >= 1 ? startLine : readStartLine(null, readText);
  return {
    before: before.join("\n"),
    after: typeof replacementText === "string" ? replacementText : "",
    oldStart: base + from,
  };
}

// ---- Line diff (LCS over lines) for the write row body. ----
// Returns one op per line: "same", "del", or "add". A line matches only
// on exact equality. The table is n by m, fine for file-sized inputs.
function splitLines(text) {
  return typeof text === "string" && text !== "" ? text.split("\n") : [];
}

function diffLines(oldText, newText) {
  var a = splitLines(oldText);
  var b = splitLines(newText);
  var n = a.length;
  var m = b.length;
  var dp = [];
  for (var i = 0; i <= n; i++) {
    dp.push(new Array(m + 1));
    dp[i][m] = 0;
  }
  for (var j = 0; j <= m; j++) dp[n][j] = 0;
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  var ops = [];
  var i = 0;
  var j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: a[i] });
      i++;
    } else {
      ops.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "del", text: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ type: "add", text: b[j] });
    j++;
  }
  return ops;
}
/**
 * Arg-shaped edit requests across the edit contracts.
 *
 * dsh-better-edit 0.6.0 sends {path: string|null, edits: [[remove_from,
 * remove_to, replacement_text], ...]} — tuple edits with a top-level path,
 * where file_path is accepted as a path alias. The path may be null (infer
 * from anchors); such requests cannot be matched against read history, so
 * they yield no request and the row falls back to the generic body.
 */
function collectEditRequests(args) {
  var out = [];
  if (typeof args !== "object" || args === null) return out;
  // Built-in edit: file_path + old/new strings.
  if (
    typeof args.file_path === "string" &&
    args.file_path !== "" &&
    typeof args.old_string === "string"
  ) {
    out.push({
      path: args.file_path,
      oldText: args.old_string,
      newText: typeof args.new_string === "string" ? args.new_string : "",
    });
  }
  // dsh-better-edit < 0.6 single-edit shape: path + flat anchors.
  if (typeof args.path === "string" && args.path !== "" && typeof args.remove_from === "string") {
    out.push({
      path: args.path,
      oldText: null,
      newText: typeof args.replacement_text === "string" ? args.replacement_text : "",
      removeFrom: args.remove_from,
      removeTo: typeof args.remove_to === "string" ? args.remove_to : undefined,
    });
  }
  // dsh-better-edit >= 0.6: tuple edits against one top-level path.
  var editPath =
    typeof args.path === "string" && args.path !== ""
      ? args.path
      : typeof args.file_path === "string" && args.file_path !== ""
        ? args.file_path
        : undefined;
  if (editPath !== undefined && Array.isArray(args.edits)) {
    for (var i = 0; i < args.edits.length; i++) {
      var item = args.edits[i];
      if (
        !Array.isArray(item) ||
        item.length !== 3 ||
        typeof item[0] !== "string" ||
        typeof item[1] !== "string" ||
        typeof item[2] !== "string"
      )
        continue;
      out.push({
        path: editPath,
        oldText: null,
        newText: item[2],
        removeFrom: item[0],
        removeTo: item[1] === "" ? undefined : item[1],
      });
    }
  }
  return out;
}

function resolveEditDiffs(block, requests, useSession, cwd) {
  // A settled node can carry callTime null when the reducer saw the result
  // without the start event. A non-numeric bound means any history read
  // could postdate the edit. Take the latest settled read of the matched
  // path with no time filter. extractHunk still guards staleness: a
  // post-edit read yields different anchors, the lookup misses, and the
  // hunk falls back safely.
  var running = !doneOf(block);
  var beforeTime = running
    ? block.time
    : typeof block.callTime === "number"
      ? block.callTime
      : undefined;
  var filter = typeof beforeTime === "number" ? beforeTime : undefined;
  var out = [];
  for (var i = 0; i < requests.length; i++) {
    var req = requests[i];
    var oldText = req.oldText;
    var oldStart;
    if (oldText === null && useSession !== undefined) {
      var recovered = useSession(function (snapshot) {
        var reads = readsOf(snapshot, req.path, filter, cwd);
        for (var r = 0; r < reads.length; r++) {
          var hunk = extractHunk(
            reads[r].text,
            req.removeFrom,
            req.removeTo,
            req.newText,
            readStartLine(reads[r].args, reads[r].text),
          );
          if (hunk !== null) return hunk;
        }
        return null;
      });
      if (recovered !== null) {
        oldText = recovered.before;
        oldStart = recovered.oldStart;
      }
    }
    out.push({ path: req.path, oldText: oldText, newText: req.newText, startOld: oldStart });
  }
  return out;
}

function allHunksNull(diffs) {
  for (var i = 0; i < diffs.length; i++) {
    if (diffs[i].oldText !== null) return false;
  }
  return true;
}

function diffFallbackBody(diffs, language) {
  // A fallback hunk has no old text. When the after text is empty too,
  // the edit is a pure deletion with nothing to show, so the note says
  // so instead of claiming the before text is missing. Both branches
  // render one inline stream, never the paired side-by-side layout.
  var onlyDels = true;
  for (var i = 0; i < diffs.length; i++) {
    if (typeof diffs[i].newText === "string" && diffs[i].newText !== "") {
      onlyDels = false;
      break;
    }
  }
  var children = [
    <div className="tool-render-fallback-note">
      {onlyDels ? "After text unavailable" : "Before text unavailable"}
    </div>,
  ];
  var lines = [];
  var numbers = [];
  for (var i = 0; i < diffs.length; i++) {
    var d = diffs[i];
    var text = onlyDels
      ? deIndent(typeof d.oldText === "string" ? d.oldText : "")
      : deIndent(typeof d.newText === "string" ? d.newText : "");
    var parts = splitLines(text);
    var startBase = typeof d.startOld === "number" ? d.startOld : 1;
    for (var j = 0; j < parts.length; j++) {
      lines.push(parts[j]);
      // Added lines number from the file position when one is known
      // (recovered from read history), else sequentially from 1.
      // Deleted lines have no known position, so they keep an empty gutter.
      numbers.push(onlyDels ? null : startBase + j);
    }
  }
  var width = gutterWidthCh(numbers);
  for (var i = 0; i < lines.length; i++) {
    children.push(diffLineRow(onlyDels ? "del" : "add", lines[i], numbers[i], width, language));
  }
  return <div className="tool-render-diff-fallback">{children}</div>;
}

// ---- Effective cwd for diff reconstruction. ----
// The tool.call.toolview owner props carry no `cwd` field. The shipped rows
// resolve cwd from the sessions list snapshot (dsh-client-ui-tool BashRow:
// `useSessions((list) => list.byId[sessionId]?.cwd)`). standardProps
// synthesizes useSessions for every session-scope slot and sets sessionId
// on the props. Read the row's own session first, then the list current.
// A missing snapshot falls back to a `cwd` prop, then to undefined, which
// degrades matchesPath to exact strip-trailing-slash equality.
// The sessions snapshot exposes no workspace root (SessionSummary carries
// `cwd` only), so a cwd-join against a workspace root would guess at an
// unknown shape. We do not add one.
function resolveEffectiveCwd(props) {
  if (typeof props.useSessions === "function") {
    try {
      var cwd = props.useSessions(function (list) {
        if (list === null || typeof list !== "object") return undefined;
        var id =
          typeof props.sessionId === "string" && props.sessionId !== ""
            ? props.sessionId
            : typeof list.current === "string"
              ? list.current
              : undefined;
        if (id === undefined) return undefined;
        var row = list.byId === undefined || list.byId === null ? undefined : list.byId[id];
        if (row === undefined || row === null) return undefined;
        return row.cwd;
      });
      if (typeof cwd === "string" && cwd !== "") return cwd;
    } catch (error) {
      /* a throwing snapshot hook must not take the row down */
    }
  }
  if (typeof props.cwd === "string" && props.cwd !== "") return props.cwd;
  return undefined;
}

function makeEditRow(toolTitle) {
  return function EditToolRow(props) {
    var expandedState = useState(false);
    var expanded = expandedState[0];
    var setExpanded = expandedState[1];
    var block = props.block;
    if (block === null || typeof block !== "object") {
      return toolRenderRow({
        icon: <IconEditOutline16 size={14} />,
        title: toolTitle,
        summary: toolTitle,
        state: "ok",
        expandable: false,
        expanded: false,
        onToggle: function () {},
        body: null,
        inspect: props.inspect,
      });
    }
    var done = doneOf(block);
    var args = parseArgs(argsRawOf(block));
    var argsObject = args !== null ? args : {};
    var effectiveCwd = resolveEffectiveCwd(props);
    var wire = wireDiffs(block);
    var diffs = null;
    try {
      if (wire !== null) {
        diffs = wire.diffs;
      } else {
        var requests = collectEditRequests(argsObject);
        var resolved = resolveEditDiffs(block, requests, props.useSession, effectiveCwd);
        if (resolved.length > 0) diffs = resolved;
      }
    } catch (error) {
      diffs = null;
    }
    var output = done ? resultTextOf(block) : null;
    var errorText = done ? errorTextOf(block) : null;
    var state = rowStateOf(block);
    var errorSummary =
      state === "error" && errorText !== null && errorText !== ""
        ? firstLineOfError(errorText)
        : undefined;
    var summaryPath = pickString(argsObject, ["path", "file_path"]);
    var summary =
      summaryPath !== undefined ? relativizeToCwd(firstLine(summaryPath), effectiveCwd) : toolTitle;
    var body = null;
    if (state !== "error" && diffs !== null && diffs.length > 0) {
      if (wire === null && done && state === "ok" && allHunksNull(diffs)) {
        body = diffFallbackBody(diffs, languageFor(summaryPath !== undefined ? summaryPath : ""));
      } else {
        body = editDiffBody(diffs);
      }
    } else if (output !== null && output !== "") {
      body = (
        <pre className="tool-render-output" tool-render-error={state === "error" || undefined}>
          {output}
        </pre>
      );
    }
    return toolRenderRow({
      icon: <IconEditOutline16 size={14} />,
      title: toolTitle,
      summary: summary,
      path: summaryPath,
      onOpenFile: props.openFile,
      state: state,
      expandable: body !== null,
      expanded: expanded,
      onToggle: function () {
        setExpanded(!expanded);
      },
      body: body,
      errorSummary: errorSummary,
      inspect: props.inspect,
    });
  };
}

var EditRow = makeEditRow("Edit");
var UndoEditRow = makeEditRow("Undo edit");

// ---- Line-number gutter. ----
// One number per content line, right-aligned in a column of uniform width
// (ch units track the monospace digit width). Numbers come from real file
// positions when known, else sequentially within the block. Rows without a
// position (hints, added lines) get an empty cell.
function gutterWidthCh(numbers) {
  var max = 1;
  for (var i = 0; i < numbers.length; i++) {
    if (numbers[i] === null || numbers[i] === undefined) continue;
    var len = String(numbers[i]).length;
    if (len > max) max = len;
  }
  return max + 2 + "ch";
}

function gutterSpan(number, width) {
  return (
    <span className="tool-render-gutter" aria-hidden={true} style={{ width: width }}>
      {number === null || number === undefined ? "" : String(number)}
    </span>
  );
}

function readLineRows(rows, language) {
  var numbers = [];
  for (var i = 0; i < rows.length; i++) numbers.push(rows[i].number);
  var width = gutterWidthCh(numbers);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    out.push(
      <div className="tool-render-code-row">
        {gutterSpan(rows[i].number, width)}
        <code
          className="tool-render-line-cell hljs"
          data-highlighted="yes"
          dangerouslySetInnerHTML={{ __html: highlightCode(rows[i].text, language) }}
        />
      </div>,
    );
  }
  return out;
}

function diffLineRow(type, text, number, width, language) {
  return (
    <div className={"tool-render-diff-row" + (type === "same" ? "" : " tool-render-line-" + type)}>
      {diffMarker(type === "same" ? null : type)}
      {gutterSpan(number, width)}
      <code
        className="tool-render-line-cell hljs"
        data-highlighted="yes"
        dangerouslySetInnerHTML={{ __html: highlightCode(text, language) }}
      />
    </div>
  );
}

// Diff body for edit rows: a side-by-side before/after
// layout, one row per LCS-aligned pair of old/new lines. Changed lines
// carry -/+ markers with orange/blue tints; unchanged context fills both
// columns. The container reuses the write-diff block styling.
function alignDiffOps(ops, startOld) {
  var rows = [];
  var oldNum = typeof startOld === "number" ? startOld : 1;
  var newNum = typeof startOld === "number" ? startOld : 1;
  var i = 0;
  while (i < ops.length) {
    var op = ops[i];
    if (op.type === "same") {
      rows.push({
        left: { text: op.text, kind: "same" },
        right: { text: op.text, kind: "same" },
        oldNum: oldNum++,
        newNum: newNum++,
      });
      i++;
      continue;
    }
    var dels = [];
    var adds = [];
    while (i < ops.length && ops[i].type !== "same") {
      if (ops[i].type === "del") dels.push(ops[i].text);
      else adds.push(ops[i].text);
      i++;
    }
    var n = Math.max(dels.length, adds.length);
    for (var k = 0; k < n; k++) {
      rows.push({
        left: dels[k] === undefined ? null : { text: dels[k], kind: "del" },
        right: adds[k] === undefined ? null : { text: adds[k], kind: "add" },
        oldNum: dels[k] === undefined ? null : oldNum++,
        newNum: adds[k] === undefined ? null : newNum++,
      });
    }
  }
  return rows;
}

function diffMarker(kind) {
  return (
    <span
      className={
        "tool-render-diff-marker" + (kind === null ? "" : " tool-render-diff-marker-" + kind)
      }
      aria-hidden={true}
    >
      {kind === "del" ? "-" : kind === "add" ? "+" : ""}
    </span>
  );
}

function diffCell(kind, text, number, width, language) {
  return (
    <div className={"tool-render-diff-cell" + (kind === "same" ? "" : " tool-render-line-" + kind)}>
      {diffMarker(kind === "same" ? null : kind)}
      {gutterSpan(number, width)}
      <code
        className="tool-render-line-cell hljs"
        data-highlighted="yes"
        dangerouslySetInnerHTML={{ __html: highlightCode(text, language) }}
      />
    </div>
  );
}

function diffPairRow(row, leftWidth, rightWidth, language) {
  var left =
    row.left === null ? (
      <div className="tool-render-diff-cell">
        {diffMarker(null)}
        {gutterSpan(null, leftWidth)}
      </div>
    ) : (
      diffCell(row.left.kind, row.left.text, row.oldNum, leftWidth, language)
    );
  var right =
    row.right === null ? (
      <div className="tool-render-diff-cell">
        {diffMarker(null)}
        {gutterSpan(null, rightWidth)}
      </div>
    ) : (
      diffCell(row.right.kind, row.right.text, row.newNum, rightWidth, language)
    );
  return (
    <div className="tool-render-diff-pair">
      {left}
      {right}
    </div>
  );
}

function editDiffBody(diffs) {
  var children = [];
  var previousPath = null;
  for (var i = 0; i < diffs.length; i++) {
    var file = diffs[i];
    var filePath = typeof file.path === "string" ? file.path : "";
    var language = languageFor(filePath);
    if (filePath !== previousPath) {
      children.push(<div className="tool-render-diff-path">{filePath}</div>);
      previousPath = filePath;
    } else {
      children.push(
        <div className="tool-render-diff-sep" aria-hidden={true}>
          {"⋯"}
        </div>,
      );
    }
    var oldText = deIndent(typeof file.oldText === "string" ? file.oldText : "");
    var newText = deIndent(typeof file.newText === "string" ? file.newText : "");
    var ops = diffLines(oldText, newText);
    // Only a hunk with both del and add ops needs the paired side-by-side
    // layout. A pure addition or pure deletion renders as one inline
    // stream; an unchanged hunk renders as plain same rows. writeBody
    // makes the same call.
    var hasDel = false;
    var hasAdd = false;
    for (var o = 0; o < ops.length; o++) {
      if (ops[o].type === "del") hasDel = true;
      else if (ops[o].type === "add") hasAdd = true;
      if (hasDel && hasAdd) break;
    }
    if (hasDel && hasAdd) {
      var rows = alignDiffOps(ops, typeof file.startOld === "number" ? file.startOld : 1);
      var leftNumbers = [];
      var rightNumbers = [];
      for (var r = 0; r < rows.length; r++) {
        leftNumbers.push(rows[r].oldNum);
        rightNumbers.push(rows[r].newNum);
      }
      var leftWidth = gutterWidthCh(leftNumbers);
      var rightWidth = gutterWidthCh(rightNumbers);
      for (var r = 0; r < rows.length; r++) {
        children.push(diffPairRow(rows[r], leftWidth, rightWidth, language));
      }
    } else {
      var type = hasDel ? "del" : hasAdd ? "add" : "same";
      var text = hasDel ? oldText : hasAdd ? newText : oldText;
      var parts = splitLines(text);
      // Single-sided hunks (only adds or only dels) number from the file
      // position when one is known: deleted lines sit at file.startOld, and
      // lines replacing a removed range start at that same position. With no
      // position (wire diffs) fall back to sequential numbering from 1 so the
      // gutter always shows a number.
      var startBase = typeof file.startOld === "number" ? file.startOld : 1;
      var numbers = [];
      for (var l = 0; l < parts.length; l++) numbers.push(startBase + l);
      var width = gutterWidthCh(numbers);
      for (var l = 0; l < parts.length; l++) {
        children.push(diffLineRow(type, parts[l], numbers[l], width, language));
      }
    }
  }
  return <div className="tool-render-write-diff">{children}</div>;
}

// ---- Write row: before/after line diff with syntax highlighting. ----
// Args are { file_path, content }. The before text comes from the
// conversation's own read history, exactly like the edit reconstruction.
// A real before text yields a per-line diff. A blind write shows only
// the new content, fully highlighted, with a muted note above it.

function writeBody(path, before, newText) {
  var language = languageFor(path !== undefined ? path : "");
  if (before === null || before === "") {
    return (
      <div className="tool-render-write">
        <div className="tool-render-write-note">
          {"No earlier version on record; new content below"}
        </div>
        <div className="tool-render-code">
          {readLineRows(numberedReadRows(newText, 1), language)}
        </div>
      </div>
    );
  }
  var cleaned = cleanReadTextForDiff(before);
  var ops = diffLines(deIndent(cleaned.content), deIndent(newText));
  var hasDel = false;
  var hasAdd = false;
  for (var i = 0; i < ops.length; i++) {
    if (ops[i].type === "del") hasDel = true;
    else if (ops[i].type === "add") hasAdd = true;
    if (hasDel && hasAdd) break;
  }
  var lines = [];
  if (hasDel && hasAdd) {
    var rows = alignDiffOps(ops, cleaned.start);
    var leftNumbers = [];
    var rightNumbers = [];
    for (var i = 0; i < rows.length; i++) {
      leftNumbers.push(rows[i].oldNum);
      rightNumbers.push(rows[i].newNum);
    }
    var leftWidth = gutterWidthCh(leftNumbers);
    var rightWidth = gutterWidthCh(rightNumbers);
    for (var i = 0; i < rows.length; i++) {
      lines.push(diffPairRow(rows[i], leftWidth, rightWidth, language));
    }
  } else {
    var type = hasDel ? "del" : hasAdd ? "add" : "same";
    var text = hasDel
      ? deIndent(cleaned.content)
      : hasAdd
        ? deIndent(newText)
        : deIndent(cleaned.content);
    var parts = splitLines(text);
    var startBase = typeof cleaned.start === "number" ? cleaned.start : 1;
    var numbers = [];
    for (var i = 0; i < parts.length; i++) numbers.push(startBase + i);
    var width = gutterWidthCh(numbers);
    for (var i = 0; i < parts.length; i++) {
      lines.push(diffLineRow(type, parts[i], numbers[i], width, language));
    }
  }
  return <div className="tool-render-write-diff">{lines}</div>;
}

function WriteRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs(argsRawOf(block));
  var argsObject = args !== null ? args : {};
  var effectiveCwd = resolveEffectiveCwd(props);
  var path = pickString(argsObject, ["file_path", "path"]);
  var newText = typeof argsObject.content === "string" ? argsObject.content : "";
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary =
    state === "error" && errorText !== null && errorText !== ""
      ? firstLineOfError(errorText)
      : undefined;
  var summary = path !== undefined ? relativizeToCwd(firstLine(path), effectiveCwd) : "Write";
  var before = null;
  if (path !== undefined && props.useSession !== undefined) {
    before = props.useSession(function (snapshot) {
      return latestReadText(snapshot, path, undefined, effectiveCwd);
    });
  }
  var body = null;
  if (done && state === "ok") {
    body = writeBody(path, before, newText);
  } else if (output !== null && output !== "") {
    body = (
      <pre className="tool-render-output" tool-render-error={state === "error" || undefined}>
        {output}
      </pre>
    );
  }
  return toolRenderRow({
    icon: <IconEditOutline16 size={14} />,
    title: "Write",
    summary: summary,
    path: path,
    onOpenFile: props.openFile,
    state: state,
    expandable: body !== null,
    expanded: expanded,
    onToggle: function () {
      setExpanded(!expanded);
    },
    body: body,
    errorSummary: errorSummary,
    inspect: props.inspect,
  });
}
// ---- todo_write row: one line per task, checkbox per status. ----
// The model sends the WHOLE list on every call, so the expanded body is a
// snapshot, not a delta: done items a checked box, active items an
// indeterminate dash, pending items an empty box. The collapsed summary
// keeps the shipped row's
// shape ("n/m completed" plus the first active item).

function todoItems(args) {
  if (args === null || typeof args !== "object" || !Array.isArray(args.todos)) return null;
  var out = [];
  for (var i = 0; i < args.todos.length; i++) {
    var item = args.todos[i];
    if (item === null || typeof item !== "object") return null;
    if (typeof item.content !== "string" || item.content === "") return null;
    var status =
      item.status === "in_progress" || item.status === "completed" ? item.status : "pending";
    out.push({ content: item.content, status: status });
  }
  return out;
}

function planSummary(todos) {
  var active = 0;
  var done = 0;
  for (var i = 0; i < todos.length; i++) {
    if (todos[i].status === "in_progress") active++;
    else if (todos[i].status === "completed") done++;
  }
  return { done: done, total: todos.length, active: active };
}

function planBody(todos) {
  var children = [];
  for (var i = 0; i < todos.length; i++) {
    var todo = todos[i];
    var attrs =
      todo.status === "completed"
        ? { "data-done": true }
        : todo.status === "in_progress"
          ? { "data-active": true }
          : { "data-pending": true };
    children.push(
      <div className="tool-render-plan-item" {...attrs}>
        <span className="tool-render-checkbox" aria-hidden={true} />
        <span className="tool-render-plan-content">{todo.content}</span>
      </div>,
    );
  }
  return <div className="tool-render-plan">{children}</div>;
}

function TodoRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs(argsRawOf(block));
  var todos = todoItems(args);
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary =
    state === "error" && errorText !== null && errorText !== ""
      ? firstLineOfError(errorText)
      : undefined;
  var counts = todos !== null ? planSummary(todos) : null;
  var summary;
  if (counts !== null && (done === false || state !== "error")) {
    var head = counts.done + "/" + counts.total + " completed";
    var firstActive = null;
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].status === "in_progress") {
        firstActive = todos[i].content;
        break;
      }
    }
    summary = firstActive !== null ? head + " · " + firstActive : head;
  } else {
    summary = "Todo list";
  }
  var body = null;
  if (todos !== null && output !== null && output !== "") {
    body = planBody(todos);
  }
  return toolRenderRow({
    icon: <IconChecklistOutline14 size={14} />,
    title: "Todo list",
    summary: summary,
    state: state,
    expandable: body !== null,
    expanded: expanded,
    onToggle: function () {
      setExpanded(!expanded);
    },
    body: body,
    errorSummary: errorSummary,
    inspect: props.inspect,
  });
}

// ---- ask_user_question row: questions with options and picked answers. ----
// Expanded, each question shows its prompt and its options; an option the
// user picked gets a filled marker. A free-text answer renders as an
// indented note under the question. Errors keep the plain error body.
function askQuestions(args) {
  if (args === null || typeof args !== "object" || !Array.isArray(args.questions)) return null;
  var out = [];
  for (var i = 0; i < args.questions.length; i++) {
    var q = args.questions[i];
    if (q === null || typeof q !== "object") return null;
    if (typeof q.question !== "string" || q.question === "") return null;
    var options = [];
    if (q.options !== undefined && q.options !== null) {
      if (!Array.isArray(q.options)) return null;
      for (var j = 0; j < q.options.length; j++) {
        var option = q.options[j];
        if (option === null || typeof option !== "object") return null;
        if (typeof option.label !== "string" || option.label === "") return null;
        var description =
          typeof option.description === "string" && option.description !== ""
            ? option.description
            : null;
        options.push({ label: option.label, description: description });
      }
    }
    out.push({
      id: typeof q.id === "string" ? q.id : null,
      question: q.question,
      options: options,
    });
  }
  return out;
}

function askAnswers(block) {
  if (!doneOf(block) || block.isError === true) return null;
  var parsed = parseArgs(resultTextOf(block) || "");
  if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.answers)) return null;
  var byId = {};
  var order = [];
  for (var i = 0; i < parsed.answers.length; i++) {
    var answer = parsed.answers[i];
    if (answer === null || typeof answer !== "object") return null;
    if (typeof answer.id !== "string") return null;
    if (byId[answer.id] === undefined) order.push(answer.id);
    var selected = Array.isArray(answer.selected) ? answer.selected : [];
    var texts = [];
    for (var j = 0; j < selected.length; j++) {
      if (typeof selected[j] === "string" && selected[j] !== "") texts.push(selected[j]);
    }
    byId[answer.id] = {
      selected: texts,
      custom: typeof answer.custom === "string" ? answer.custom : null,
    };
  }
  return { byId: byId, order: order };
}

function askBody(questions, answers) {
  var children = [];
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    var answer = answers !== null && q.id !== null ? answers.byId[q.id] : undefined;
    var picked = answer === undefined ? null : answer.selected;
    var rows = [];
    for (var j = 0; j < q.options.length; j++) {
      var option = q.options[j];
      var label = option.label;
      var isSelected = picked !== null && picked.indexOf(label) !== -1;
      rows.push(
        <div className="tool-render-option" data-selected={isSelected || undefined}>
          <span className="tool-render-option-marker" aria-hidden={true}>
            {isSelected ? "◉" : "○"}
          </span>
          <span className="tool-render-option-text">
            <span className="tool-render-option-label">{label}</span>
            {option.description !== null && option.description !== undefined ? (
              <span className="tool-render-option-description">{option.description}</span>
            ) : null}
          </span>
        </div>,
      );
    }
    if (picked !== null) {
      for (var j = 0; j < picked.length; j++) {
        var known = false;
        for (var k = 0; k < q.options.length; k++) {
          if (q.options[k].label === picked[j]) {
            known = true;
            break;
          }
        }
        if (!known) {
          rows.push(
            <div className="tool-render-option" data-selected={true}>
              <span className="tool-render-option-marker" aria-hidden={true}>
                {"◉"}
              </span>
              <span className="tool-render-option-label">{picked[j]}</span>
            </div>,
          );
        }
      }
    }
    var note = null;
    if (answer !== undefined && typeof answer.custom === "string" && answer.custom !== "") {
      note = <div className="tool-render-answer-note">{answer.custom}</div>;
    }
    children.push(
      <div className="tool-render-question">
        <div className="tool-render-question-prompt">{q.question}</div>
        {rows}
        {note}
      </div>,
    );
  }
  return <div className="tool-render-ask">{children}</div>;
}

function AskRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs(argsRawOf(block));
  var questions = askQuestions(args);
  var answers = done ? askAnswers(block) : null;
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary =
    state === "error" && errorText !== null && errorText !== ""
      ? firstLineOfError(errorText)
      : undefined;
  var summary;
  if (state === "error") {
    summary = "Ask user";
  } else if (!done) {
    var count = questions !== null ? questions.length : 0;
    summary = count === 1 ? "waiting for answer" : "waiting for " + count + " answers";
  } else if (answers !== null) {
    var answered = 0;
    for (var i = 0; i < answers.order.length; i++) {
      var a = answers.byId[answers.order[i]];
      if (a.selected.length > 0 || a.custom !== null) answered++;
    }
    summary = answered + "/" + questions.length + " answered";
  } else {
    summary = "Ask user";
  }
  var body = null;
  if (questions !== null && output !== null && output !== "" && state !== "error") {
    body = askBody(questions, answers);
  }
  return toolRenderRow({
    icon: <IconQuestionOutline14 size={14} />,
    title: "Ask user",
    summary: summary,
    state: state,
    expandable: body !== null,
    expanded: expanded,
    onToggle: function () {
      setExpanded(!expanded);
    },
    body: body,
    errorSummary: errorSummary,
    inspect: props.inspect,
  });
}

// ---- subagent row: description while collapsed, rendered prompt when open. ----
// Args are { description, prompt, run_in_background? }. The collapsed row
// shows "Parallel sub-agent" / "Sub-agent" plus the short description;
// expanded it renders the prompt through MarkdownText inside a capped,
// scrollable block. A failed call falls back to the plain error card.
function subagentPrompt(args) {
  if (args === null || typeof args !== "object") return null;
  if (typeof args.prompt !== "string" || args.prompt === "") return null;
  return args.prompt;
}

function SubagentRow(props) {
  var expandedState = useState(false);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];
  var block = props.block;
  var done = doneOf(block);
  var args = parseArgs(argsRawOf(block));
  var description = args !== null ? pickString(args, ["description"]) : undefined;
  var prompt = subagentPrompt(args);
  var output = done ? resultTextOf(block) : null;
  var errorText = done ? errorTextOf(block) : null;
  var state = rowStateOf(block);
  var errorSummary =
    state === "error" && errorText !== null && errorText !== ""
      ? firstLineOfError(errorText)
      : undefined;
  var background = args !== null && args.run_in_background === true;
  var title = background ? "Background subagent" : "Subagent";
  var summary =
    description !== undefined ? firstLine(relativizeToCwd(description, props.cwd)) : title;
  var body = null;
  if (state !== "error" && prompt !== null) {
    body = (
      <div className="tool-render-subagent-prompt">
        <MarkdownText text={prompt} />
      </div>
    );
  }
  return toolRenderRow({
    icon: <IconAgentPresetOutline16 size={14} />,
    title: title,
    summary: summary,
    state: state,
    expandable: body !== null,
    expanded: expanded,
    onToggle: function () {
      setExpanded(!expanded);
    },
    body: body,
    errorSummary: errorSummary,
    inspect: props.inspect,
  });
}

// ---- Cordis plugin face. ----
var inject = ["slots"];
var name = PLUGIN_NAME;

function apply(ctx) {
  ctx.slots.inject("tool.call.toolview", function* () {
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "read",
        priority: -100,
      },
      ReadRow,
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "bash",
        priority: -100,
      },
      BashRow,
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "edit",
        priority: -100,
      },
      EditRow,
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "write",
        priority: -100,
      },
      WriteRow,
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "undo_edit",
        priority: -100,
      },
      UndoEditRow,
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "undo_last_edit",
        priority: -100,
      },
      UndoEditRow,
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "todo_write",
        priority: -100,
      },
      TodoRow,
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "ask_user_question",
        priority: -100,
      },
      AskRow,
    );
    yield ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "subagent",
        priority: -100,
      },
      SubagentRow,
    );
  });
}

export { apply, inject, name };
