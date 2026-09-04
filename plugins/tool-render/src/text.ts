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
