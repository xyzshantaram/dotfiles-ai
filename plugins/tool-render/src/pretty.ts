// Pure helpers for the compaction prettyView payload. Like text.ts, this
// module holds Cordis-free and React-free functions, so a unit test can
// import them without a browser or a plugin host.
//
// The compaction fork emits prettyView onto `compaction/summary` event
// data. The shape is trusted at the top level; the guards here only keep
// a malformed or missing payload from taking the row down.

/** Loose structural guard for one prettyView. Checks the fields the card
 * reads: version, span, items, tail, and stats. Item shapes are checked
 * again in prettyRows, one item at a time.
 */
export function isPrettyView(value) {
  if (value === null || typeof value !== "object") return false;
  if (value.version !== 1) return false;
  var span = value.span;
  if (span === null || typeof span !== "object") return false;
  if (typeof span.minSeq !== "number" || typeof span.maxSeq !== "number") return false;
  if (!Array.isArray(value.items)) return false;
  var stats = value.stats;
  if (stats === null || typeof stats !== "object") return false;
  if (typeof stats.droppedResultTokens !== "number") return false;
  if (typeof stats.erroredCalls !== "number") return false;
  if (typeof stats.hiddenCalls !== "number") return false;
  if (value.tail !== null && value.tail !== undefined) {
    var tail = value.tail;
    if (typeof tail !== "object") return false;
    if (typeof tail.count !== "number" || typeof tail.tokens !== "number") return false;
    if (typeof tail.fromSeq !== "number") return false;
  }
  return true;
}

/**
 * One display row for the expanded card. checkpoint items drop out here,
 * so the renderer never sees them.
 */
export function prettyRows(view) {
  if (!isPrettyView(view)) return [];
  var out = [];
  var items = Array.isArray(view.items) ? view.items : [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item === null || typeof item !== "object") continue;
    if (item.type === "message") {
      if (typeof item.text !== "string") continue;
      var role = item.role === "user" || item.role === "assistant" || item.role === "system"
        ? item.role
        : "system";
      out.push({ kind: "message", seq: item.seq, role: role, text: item.text });
    } else if (item.type === "toolStrip") {
      if (typeof item.tool !== "string" || typeof item.count !== "number") continue;
      out.push({ kind: "toolStrip", seq: item.seq, tool: item.tool, count: item.count });
    } else if (item.type === "elided") {
      if (typeof item.note !== "string") continue;
      out.push({ kind: "elided", seq: item.seq, note: item.note });
    } else if (item.type === "media") {
      if (typeof item.label !== "string") continue;
      out.push({ kind: "media", seq: item.seq, label: item.label });
    }
    // checkpoint: ignored on purpose, per the card spec.
  }
  return out;
}

/** The collapsed label counts message rows only. */
export function countMessageRows(rows) {
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].kind === "message") count++;
  }
  return count;
}
