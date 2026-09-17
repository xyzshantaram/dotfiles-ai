// Pure derivations for the run_code shadow row (#152, Part B). Cordis-free
// and React-free, so a unit test can import this module without a browser
// or a plugin host.
//
// WHAT IS REIMPLEMENTED HERE (and what will drift). The card is upstream's
// (dsh-client-ui-tool): these three functions mirror the pure row-model
// derivation its GenericToolCard runs for the `code` variant —
// toolRowModel's summary/body/output for run_code, i.e. deriveSummary's
// `description` preference, deriveBody's `code`-field branch, and the
// resultText content flattening (text blocks verbatim joined with "\n",
// non-text blocks as pretty JSON, empty content on a failed call falling
// back to the structured `name: code` line). If upstream changes that
// flattening, only exotic run_code content diverges: the host pre-renders
// a run_code result to a single text block (logs plus the returned value,
// or the NO_OUTPUT sentinel when both are absent), so the copy only ever
// matters for content shapes the host never emits today.
//
// WHAT IS NOT REIMPLEMENTED. The nested subtool rows the owner likes are
// owned by upstream's ToolCallTree, not by the toolview: ToolCall renders
// the keyed `tool.call.toolview` row and then its `children` — the
// `.subCalls` container of per-child ToolCallBranches — as SIBLINGS. A
// `run_code` shadow replaces only the atomic row; every nested dispatch
// keeps rendering through the tree exactly as today. Nothing about that
// path is copied here and there is nothing to keep in sync.
//
// TRUNCATION RULE. The hoisted output keeps today's collapsed-row rule:
// upstream's OUT section scrolls internally past 150px (.ioSection
// max-height:150px; overflow-y:auto); the shadow's OUT block carries the
// same cap in client.module.css (.tool-render-code-out-text). No
// line-clamp, no elision: the full text stays in the DOM and scrolls.

// The host's output render for a program with neither logs nor a return
// value (dsh-tools createRunCodeTool output.render). It is information-free,
// so the shadow treats it as empty and renders no output row at all.
export var RUN_CODE_NO_OUTPUT = "(run_code completed with no output)";

function parseArgs(raw) {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function firstLine(text) {
  var at = String(text).indexOf("\n");
  return at === -1 ? String(text) : String(text).slice(0, at);
}

// Collapsed-row summary for a run_code call. Mirrors upstream deriveSummary
// for the code variant (SUMMARY_KEYS.code is ["description"], first line),
// including its generic fallback (first non-empty string value, else the
// raw args' first line). A call with no usable summary reads "Code" rather
// than an empty row.
export function runCodeSummary(argsRaw) {
  var parsed = parseArgs(argsRaw);
  if (parsed !== null && typeof parsed === "object") {
    var description = parsed.description;
    if (typeof description === "string" && description !== "") return firstLine(description);
    for (var key of Object.keys(parsed)) {
      var value = parsed[key];
      if (typeof value === "string" && value !== "") return firstLine(value);
    }
  }
  var raw = firstLine(typeof argsRaw === "string" ? argsRaw : "");
  return raw !== "" ? raw : "Code";
}

// The program text behind the 'Code' disclosure. Mirrors upstream
// deriveBody's code branch (the `code` field when present, else the whole
// args as pretty JSON, else the raw args string), or null when there is no
// args text at all. Null means the row is not expandable.
export function runCodeBodyText(argsRaw) {
  if (typeof argsRaw !== "string" || argsRaw === "") return null;
  var parsed = parseArgs(argsRaw);
  if (parsed === undefined) return argsRaw;
  if (parsed !== null && typeof parsed === "object") {
    var code = parsed.code;
    if (typeof code === "string" && code !== "") return code;
  }
  if (parsed === null) return argsRaw;
  return JSON.stringify(parsed, null, 2);
}

// Flatten settled result content the way upstream resultText does: text
// blocks verbatim, anything else as pretty JSON, joined with newlines; a
// failed call with no content falls back to the structured `name: code`
// line so the failure still reads.
function flattenResultText(content, isError, error) {
  var parts = [];
  var blocks = Array.isArray(content) ? content : [];
  for (var i = 0; i < blocks.length; i++) {
    var item = blocks[i];
    if (
      item !== null &&
      typeof item === "object" &&
      item.type === "text" &&
      typeof item.text === "string"
    ) {
      parts.push(item.text);
    } else if (item !== null && item !== undefined) {
      try {
        parts.push(JSON.stringify(item, null, 2));
      } catch (error) {
        /* keep going */
      }
    }
  }
  if (parts.length === 0 && error !== undefined && error !== null) {
    // Upstream-exact fallback: a failed call with no content reads the
    // structured `name: code` line. Unreachable for run_code in practice
    // (the host always renders at least the NO_OUTPUT sentinel), kept for
    // fidelity so the mirror cannot silently diverge.
    parts.push(String(error.name) + ": " + String(error.code));
  }
  return parts.join("\n");
}

// The always-visible program result (logs plus the returned value), or null
// when there is nothing worth showing. A running call has no result yet.
// The host's NO_OUTPUT sentinel and blank-only text are information-free:
// they render nothing, never an empty labelled row. Errors are NOT
// special-cased away — the failure text IS the result — but a blank error
// still renders nothing.
export function runCodeOutputText(content, isError, error) {
  var text = flattenResultText(content, isError, error);
  if (text === "") return null;
  if (text === RUN_CODE_NO_OUTPUT) return null;
  if (text.trim() === "") return null;
  return text;
}
