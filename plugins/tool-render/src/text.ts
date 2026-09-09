// Pure text helpers for tool-render. This module holds Cordis-free and
// React-free string utilities, so a unit test can import them without a
// browser or a plugin host.

// ---- Render-time de-indent for code content displays. ----
// Strip the common leading whitespace from a snippet. The minimum indent
// comes from the non-empty lines; all-whitespace lines collapse to empty.
// The line count never changes, so callers keep their line numbers. This
// is display-only: stored block data is never rewritten. A leading
// tab counts as one indent unit, same as one space.
export function deIndent(text) {
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
export var HASH_ROW_RE = /^([A-Za-z0-9]{3})│/;
// ---- builtin read envelope detection. ----
// The builtin `read` wraps content as `<path>..</path>`, `<type>file</type>`,
// `<content>`, numbered `N: text` lines, a blank line, one footer, and
// `</content>` (@deepseek-ai/dsh-tool-fs README).
export function isBuiltinReadEnvelope(lines) {
  return lines.length > 0 && /^<path>/.test(lines[0]) && lines.indexOf("<content>") !== -1;
}
// ---- Read line metadata and numbering. ----
// dsh-better-edit's read records the requested start as the `offset` arg
// (1-indexed) on the block and appends a `[Showing lines X-Y of Z]` hint
// to partial reads. A plain read carries neither; rows then number
// sequentially from 1.
export function readStartLine(args, output) {
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
  // The builtin read appends `(Showing lines X-Y of Z. ...)` or
  // `(Output capped. Showing lines X-Y. ...)` for partial reads.
  var b = /\(Showing lines (\d+)-\d+/.exec(String(output));
  if (b !== null) return parseInt(b[1], 10);
  return 1;
}

// Split a read result into display rows with line numbers. A hashline read
// prefixes every served row with a 3-char anchor; hint and warning lines
// are not file content and carry no number. A plain read numbers every
// line. `startLine` comes from readStartLine.
export function numberedReadRows(output, startLine) {
  var lines = String(output).split("\n");
  var hashline = lines.length > 0 && HASH_ROW_RE.test(lines[0]);
  // The builtin read wraps content in <path>/<type>/<content> envelope lines
  // and prefixes each content line with `N: `. Keep the tool's own numbers.
  var builtin = !hashline && isBuiltinReadEnvelope(lines);
  var rows = [];
  var next = startLine;
  for (var i = 0; i < lines.length; i++) {
    if (hashline && HASH_ROW_RE.test(lines[i])) {
      rows.push({ number: next, text: lines[i].slice(4) });
      next++;
    } else if (hashline) {
      rows.push({ number: null, text: lines[i] });
    } else if (builtin) {
      if (
        i === 0 ||
        /^<type>/.test(lines[i]) ||
        lines[i] === "<content>" ||
        lines[i] === "</content>"
      ) {
        continue;
      }
      var bm = /^(\d+): ?/.exec(lines[i]);
      if (bm !== null) {
        rows.push({ number: parseInt(bm[1], 10), text: lines[i].slice(bm[0].length) });
      } else {
        rows.push({ number: null, text: lines[i] });
      }
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
export function cleanReadTextForDiff(text) {
  var lines = String(text).split("\n");
  // The builtin read wraps its content in an envelope and prefixes each line
  // with `N: `. Strip both, and drop the blank separator and the footer, so
  // the diff compares file content against file content.
  var builtin = isBuiltinReadEnvelope(lines);
  if (builtin) {
    var bkept = [];
    var inContent = false;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === "<content>") {
        inContent = true;
        continue;
      }
      if (!inContent || lines[i] === "</content>") continue;
      var bm = /^(\d+): ?/.exec(lines[i]);
      if (bm !== null) bkept.push(lines[i].slice(bm[0].length));
    }
    return { content: bkept.join("\n"), start: readStartLine(null, text) };
  }
  if (lines.length === 0 || !HASH_ROW_RE.test(lines[0])) {
    return { content: text, start: readStartLine(null, text) };
  }
  var kept = [];
  for (var i = 0; i < lines.length; i++) {
    if (HASH_ROW_RE.test(lines[i])) kept.push(lines[i].slice(4));
  }
  return { content: kept.join("\n"), start: readStartLine(null, text) };
}

// ---- <skill_content> parsing (dsh-skill's renderSkillContent format). ----
// Exact template (dsh-skill/lib/index.js:57-70): OPEN tag with a name
// attribute, <skill_resources>...</skill_resources>, a blank line,
// <skill_instructions>...</skill_instructions>, CLOSE tag, each on its own
// line. name is HTML-attribute-escaped (&, ", <) by the producer.
var SKILL_CONTENT_RE =
  /^<skill_content name="([^"]*)">\n<skill_resources>\n([\s\S]*?)\n<\/skill_resources>\n\n<skill_instructions>\n([\s\S]*?)\n<\/skill_instructions>\n<\/skill_content>$/;

function unescapeAttr(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

/** Parse one <skill_content> block. Returns null when text is not that exact shape. */
export function parseSkillContent(text) {
  if (typeof text !== "string") return null;
  var m = SKILL_CONTENT_RE.exec(text.trim());
  if (m === null) return null;
  return { name: unescapeAttr(m[1]), resourceHint: m[2], instructions: m[3] };
}

// ---- <system-reminder> framing (dsh-agent-instructions/lib/index.js:110-263). ----
// Exact join: [OPEN, body, CLOSE].join("\n"), so OPEN and CLOSE each sit on
// their own line around the body. The body escapes a literal closing tag as
// "<\/system-reminder>" (backslash before the slash), so that escaped form
// never matches this regex and safely renders as inert text within a
// reminder's own body.
var SYSTEM_REMINDER_RE = /<system-reminder>\n([\s\S]*?)\n<\/system-reminder>/g;

/**
 * Split text into plain and system-reminder segments, in order.
 * Each segment is { reminder: boolean, text: string }. Preserves every
 * character of the input across the returned segments; nothing is dropped,
 * only re-grouped so a renderer can frame reminder text differently.
 */
export function splitSystemReminders(text) {
  if (typeof text !== "string" || text === "") return [];
  var segments = [];
  var lastEnd = 0;
  var re = new RegExp(SYSTEM_REMINDER_RE.source, "g");
  var m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastEnd) segments.push({ reminder: false, text: text.slice(lastEnd, m.index) });
    segments.push({ reminder: true, text: m[1] });
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < text.length) segments.push({ reminder: false, text: text.slice(lastEnd) });
  return segments;
}

// ---- hunk extraction for a hashline batch-edit diff. ----
// Walks a stored hashline read for the row range [removeFrom, removeTo]
// (inclusive; removeTo defaults to removeFrom when omitted) and returns the
// text that range covered, so a caller can render a before/after diff for
// one edit. Returns null when the read is not hashline-anchored, or when
// either endpoint hash is not found.
// ---- raw-page HTML detection for the web_fetch row. ----
// web_fetch returns the page's raw content when it truncates. A raw page
// starts with a tag and carries at least one real element name after it, so
// a plain "<" in prose does not count. The check reads only the first 200
// characters and stays a heuristic: a false negative renders a page through
// MarkdownText, which the row already tolerates.
export function looksLikeRawHtml(text) {
  if (typeof text !== "string") return false;
  var head = text.replace(/^\s+/, "").slice(0, 200);
  if (head.charAt(0) !== "<") return false;
  return /^<[a-z][a-z0-9-]*(\s|>|\/>)/i.test(head);
}

// ---- outer code fence removal. ----
// A compaction summary arrives wrapped in one fence, usually four backticks,
// so the checkpoint's own triple-backtick blocks survive inside it.
// Rendered as markdown that whole fence becomes one code block, which is why
// the card showed a monospace wall with a copy button instead of the
// headings and lists the checkpoint actually contains. This removes only a
// fence that wraps the WHOLE text, and the closing fence must match the
// opening one, so a summary that merely starts with a code block is left
// alone.
export function stripOuterFence(text) {
  if (typeof text !== "string" || text === "") return text;
  var trimmed = text.trim();
  var match = /^(`{3,})[^\n]*\n([\s\S]*?)\n?\1$/.exec(trimmed);
  return match === null ? text : match[2];
}

// ---- manual-compaction command outcome. ----
// The manual-compaction chat node wraps { command, compaction }. `command` is
// a CommandNode -- the /compact invocation's own lifecycle -- and its
// `outcome` is the authoritative failure signal: { kind: 'success' | 'error',
// text?, sourceEventSeq? } | null. `compaction` stays null on a failure for
// the same reason it stays null while still running: nothing landed to
// summarize. A failed run must be told apart from a still-running one, or the
// card silently shows a blank "Compaction" row on a real failure. Returns the
// outcome's error text, or null when there is no error to show.
export function compactionCommandError(data) {
  if (data === null || data === undefined || typeof data !== "object") return null;
  var command = data.command;
  if (command === null || command === undefined || typeof command !== "object") return null;
  var outcome = command.outcome;
  if (outcome === null || outcome === undefined || typeof outcome !== "object") return null;
  if (outcome.kind !== "error") return null;
  return typeof outcome.text === "string" && outcome.text !== "" ? outcome.text : "compaction failed";
}

// ---- compaction chat-node shapes. ----
// The compaction card sits on conversation.chat.node, and two keys reach it
// with different data. Key "compaction" hands the summary node itself. Key
// "manual-compaction" wraps it as { command, compaction }, where compaction
// stays null while the run is still going. The summary node names itself
// with kind "compaction", so one test serves both keys.
// Returns the summary node, or null when there is none to show yet.
export function compactionSummaryNode(data) {
  if (data === null || data === undefined || typeof data !== "object") return null;
  if (data.kind === "compaction") return data;
  var wrapped = data.compaction;
  if (wrapped !== null && wrapped !== undefined && typeof wrapped === "object") {
    if (wrapped.kind === "compaction") return wrapped;
  }
  return null;
}

// ---- list_agents result parsing. ----
// The shipped tool renders one line per agent (dsh-tool-subagent-control's
// list-agents render): `<id> [<status>] — <label>` for a child, and
// `<id> [diagnostic: <reason>]` for one that could not be read. A
// `descendants` scope inserts ` parent=<id> depth=<n>` before the label.
// An empty roster renders the single line "(no subagents)".
// A line that does not match is skipped, so a future format change degrades
// to a shorter list instead of a broken card.
var AGENT_LINE_RE =
  /^(\S+)\s+\[([^\]]+)\](?:\s+parent=(\S+)\s+depth=(-?\d+))?(?:\s+—\s+([\s\S]*))?$/;

export function parseAgentLines(text) {
  if (typeof text !== "string" || text === "") return [];
  var out = [];
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === "" || line === "(no subagents)") continue;
    var m = AGENT_LINE_RE.exec(line);
    if (m === null) continue;
    var mark = m[2];
    var diagnostic = mark.indexOf("diagnostic:") === 0;
    out.push({
      id: m[1],
      status: diagnostic ? null : mark,
      reason: diagnostic ? mark.slice("diagnostic:".length).trim() : null,
      parent: m[3] !== undefined ? m[3] : null,
      depth: m[4] !== undefined ? Number(m[4]) : null,
      label: m[5] !== undefined ? m[5] : "",
    });
  }
  return out;
}

export function extractHunk(readText, removeFrom, removeTo, replacementText, startLine) {
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

// ---- bash-guard rewrite label (shared with the verdict-badge tooltip). ----
// The guard metadata carries only {rewritten: true, ran} — no reason field —
// so the short phrase must be DERIVED by comparing commands: same first
// token means an argument-level rewrite; a swapped first token means the
// binary itself changed; anything unreadable keeps the generic label. This
// is the single source for both the expanded-card rewrite block
// (client.tsx) and the collapsed-row verdict tooltip (verdict-tip.ts), so
// the two can never disagree.

/** Extract the first token (command name) from a bash command string. */
export function firstTokenOf(cmdStr) {
  if (typeof cmdStr !== "string" || cmdStr === "") return "";
  var trimmed = cmdStr.trim();
  var match = /^[^\s]+/.exec(trimmed);
  return match ? match[0] : "";
}

/**
 * Label for the guard rewrite block pair by comparing commands. meta carries
 * only {rewritten: true, ran} — no reason field — so precision must be
 * derived: same first token means an argument-level rewrite; a swapped
 * first token means the binary itself changed; anything unreadable keeps
 * the generic label.
 */
export function guardRewriteLabel(originalCmd, rewrittenCmd) {
  var origToken = firstTokenOf(originalCmd);
  var rewriteToken = firstTokenOf(rewrittenCmd);
  if (origToken === "" || rewriteToken === "") return "ran instead";
  if (origToken === rewriteToken) return "rewrote arguments to";
  return "translated to " + rewriteToken;
}

// ---- bash-guard rewrite banner (the nested-call fallback marker). ----
// The banner bash-guard's ranMessage prints once it has ALREADY run a
// replacement: the marker, a blank separator line, then two-space-indented
// command lines, ended by the first unindented non-empty line ("Why:").
// The real banner is ALWAYS the last thing in the output — bash-guard
// appends it after the tool runs — so the search starts from the END: a
// command whose own output embeds the marker mid-text (a transcript, a grep
// over session logs) must not shadow the trailing real banner, and a
// first-occurrence search did exactly that.
// False positives remain possible and are undecidable from text alone: a
// BashRow whose output reproduces a VERBATIM banner block (cat over a
// session log) parses as a rewrite. presentationMeta, when the call has it,
// is authoritative and never reaches this parser; the text path exists for
// nested calls, which never get meta.
export const GUARD_REWRITE_MARKER = "bash-guard: ran this instead:";

export function guardRewriteFromText(text) {
  if (typeof text !== "string") return null;
  var at = text.lastIndexOf(GUARD_REWRITE_MARKER);
  if (at === -1) return null;
  var lines = text.slice(at + GUARD_REWRITE_MARKER.length).split("\n");
  var ran = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === "") continue; // the banner's blank separator lines
    if (line.slice(0, 2) === "  ") {
      ran.push(line.slice(2));
      continue;
    }
    break; // "Why:" — the first unindented non-empty line ends the block
  }
  if (ran.length === 0) return null;
  var command = ran.join("\n").trim();
  if (command.length === 0) return null;
  return { ran: command };
}

// ---- Bash error state: data first, anchored text only as a fallback. ----
// The rule this section applies, stated once so every reader sees it:
// derive state from DATA, never from a rendering of that data. A bracketed
// marker (`[exit code: 1]`, `[sandbox: ...]`) is prose the harness prints;
// the exit code and the sandbox denial flag on the result are the facts the
// marker was rendered FROM. Scanning the whole output for marker prose
// misreads any command whose output merely QUOTES it (grepping the
// harness's own source, catting a log), painting successful calls as
// failures. The structured facts decide whenever they are present; the text
// scan below serves only rows whose facts are genuinely absent (nested calls
// never get presentationMeta, old sessions predate the fields), and even
// then it reads only the trailing marker block the renderers append — never
// the middle of a dump.
export var ERROR_TOKEN_RE = /\[(?:E_|exit code:|sandbox:)/;

// One harness marker line: a bracketed token at the START of the line. The
// renderers append these as trailing notices, so the upward scan below
// stops at the first body line. `exit codes:` (the named pipe-stage list)
// is a marker line but never a headline: ERROR_TOKEN_RE does not match it,
// so a failed pipe is still headlined by its `[exit code: N]` line.
export var TRAILING_MARKER_LINE_RE = /^\[(?:E_|exit code:|exit codes:|sandbox:|timed out|killed by signal:)/;

function trailingMarkerLines(text) {
  var lines = text.split("\n");
  var out = [];
  for (var i = lines.length - 1; i >= 0; i--) {
    if (!TRAILING_MARKER_LINE_RE.test(lines[i])) break;
    out.unshift(lines[i]);
  }
  return out;
}

// Error summaries prefer a line that names the failure over the first line,
// which may be an unhelpful wrapper such as "Error: ". Only the trailing
// marker block is consulted: a matching line in the middle of a dump is
// quoted data, not the reason the call failed.
export function firstLineOfError(text) {
  if (typeof text !== "string" || text === "") return text;
  var markers = trailingMarkerLines(text);
  for (var i = 0; i < markers.length; i++) {
    if (ERROR_TOKEN_RE.test(markers[i])) return markers[i];
  }
  var at = text.indexOf("\n");
  return at === -1 ? text : text.slice(0, at);
}

// Markers that still fail a row through the text fallback. Anchored by the
// caller: each candidate line is one of the trailing marker lines, so a
// quoted marker in the middle of the output can never match.
export var BASH_ERROR_MARKERS = /\[sandbox: file access denied under|\[exit code: [1-9]/;

// Elevate a settled bash row to the error state. The structured facts
// (presentationMeta: exitCode, denied) decide whenever they are present: a
// clean fact set keeps the row settled even when its output quotes marker
// prose. Without facts, the anchored trailing markers decide — the same
// notices the renderers append, read back only where they are appended.
export function bashErrorState(state, output, meta) {
  if (state === "running") return state;
  if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    if (meta.denied === true) return "error";
    if (typeof meta.exitCode === "number" && meta.exitCode !== 0) return "error";
    if (typeof meta.exitCode === "number" || typeof meta.denied === "boolean") {
      return state;
    }
    // Meta exists but carries no facts (old sessions, background starts):
    // fall through to the anchored text check below.
  }
  if (typeof output !== "string" || output === "") return state;
  var lines = output.split("\n");
  for (var i = lines.length - 1; i >= 0; i--) {
    if (!TRAILING_MARKER_LINE_RE.test(lines[i])) break;
    if (BASH_ERROR_MARKERS.test(lines[i])) return "error";
  }
  return state;
}
