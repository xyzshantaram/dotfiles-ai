/**
 * Pure quote model for the quote-selection plugin (#155).
 *
 * Everything in here is DOM-free on purpose: this repo has no jsdom harness
 * (vitest runs plain node), so the selection geometry, the Range walk and the
 * composer write all live in client.tsx, while every decision they implement
 * lives here and is unit-tested in ./quote.test.ts.
 *
 * The one deliberate twin in this file is `appendToDraft`: its contract is
 * identical to durable-todos' local `appendToDraft`
 * (plugins/durable-todos/src/client.tsx) — APPEND, never replace, so a
 * half-typed draft survives quoting. It is copied rather than imported
 * because durable-todos' client bundle carries its panel, projection and
 * styles; importing it would drag all three into this bundle. The copy is
 * pinned by ./chrome.test.ts, which fails if either side drifts.
 */

/** Append text to the existing draft with a blank line between them, or
 * return it bare when the draft is empty. Trailing whitespace on the
 * existing draft is dropped first so repeated quotes do not pile up blank
 * lines. Quoting twice therefore appends a second block: the first quote is
 * already part of `existing` when the second lands. */
export function appendToDraft(existing: string, addition: string): string {
  const trimmed = existing.replace(/\s+$/, "");
  return trimmed.length === 0 ? addition : trimmed + "\n\n" + addition;
}

/**
 * Minimal structural selection model. The client walks `range.cloneContents()`
 * into this shape (see domToQuoteNodes in ./client.tsx); the join below then
 * decides where paragraph boundaries fall. `Range.toString()` cannot do that:
 * browsers join block elements with a single newline, so quoting across a
 * paragraph boundary would collapse two paragraphs into one soft-wrapped line.
 */
export type QuoteNode =
  | { kind: "text"; text: string }
  | { kind: "break" }
  | { kind: "block"; children: QuoteNode[] }
  | { kind: "inline"; children: QuoteNode[] };

/** Drop blank lines at both ends and collapse runs of 3+ newlines to a
 * paragraph break. Interior single newlines (from <br>) and blank lines
 * (from block boundaries) survive byte-for-byte, indentation included. A
 * whitespace-only input normalizes to "" so the button never arms on it. */
export function normalizeQuoteText(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end).join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Join a walked selection fragment back to quotable text: inline content
 * concatenates, <br> is a lone newline, and every block boundary is a blank
 * line, so a multi-paragraph selection stays multi-paragraph. */
export function quoteNodesToText(nodes: QuoteNode[]): string {
  const parts: string[] = [];
  const walk = (items: QuoteNode[]): void => {
    for (const node of items) {
      if (node.kind === "text") parts.push(node.text);
      else if (node.kind === "break") parts.push("\n");
      else if (node.kind === "block") {
        walk(node.children);
        parts.push("\n\n");
      } else walk(node.children);
    }
  };
  walk(nodes);
  return normalizeQuoteText(parts.join(""));
}

/** True when the selection holds quotable text rather than bare whitespace.
 * The button never arms on an empty or whitespace-only selection. */
export function isQuotableText(raw: string): boolean {
  return normalizeQuoteText(raw).length > 0;
}

/**
 * Render selected text as a markdown blockquote. Every line gets its `> `
 * prefix and blank lines become a bare `>`, so the quote keeps the
 * selection's own paragraph breaks.
 *
 * A lone newline inside the quote renders as a soft break in markdown; that
 * is accepted (<br>-derived breaks go soft — recorded, not hidden). Block
 * boundaries arrive as blank lines and stay real paragraph breaks.
 *
 * `fenced` is true when the selection sits inside a <pre>: the lines are
 * wrapped in a fenced block inside the quote, so quoted code still renders
 * as a code block instead of collapsing to quoted prose.
 */
export function toBlockquote(raw: string, fenced: boolean): string {
  const text = normalizeQuoteText(raw);
  if (text === "") return "";
  const lines = text.split("\n").map((line) => (line.trim() === "" ? ">" : "> " + line));
  if (fenced) return ["> ```", ...lines, "> ```"].join("\n");
  return lines.join("\n");
}

/**
 * The containment predicate: the button arms only inside an assistant row.
 *
 * WHY THIS HOOK. The shipped conversation view wraps every chat node in a
 * row stamped `data-chat-flow-kind="<kind>"` (verified in the installed
 * dsh-client-ui-conversation lib/client.js ChatView flowItem: the row carries
 * data-chat-anchor-key, data-chat-flow-key and data-chat-flow-kind set to the
 * routed node's kind). It is a ship-stamped, stable attribute rather than a
 * hashed CSS class that turns over every build.
 *
 * ACCURACY NOTE, because the first version of this comment overstated it: the
 * ship does NOT read this attribute back. Its scroll and paging code keys on
 * data-chat-anchor-key and data-conversation-scroll; data-chat-flow-kind has
 * exactly one occurrence in the bundle, the write. So it is a stable public
 * hook, not a load-bearing contract the ship would notice breaking. Still the
 * best key available here — but do not lean on it as if the ship guarded it. The repo's own user/steering bubble takeover only shadows
 * the `user` and `steering` keys, so assistant rows keep kind "assistant"
 * with or without that plugin — the test never names a bubble class and
 * cannot break when bubble markup is restyled. Selections in the composer, a
 * modal, an input, or the sidebar have no such ancestor row at all, so they
 * fail closed without an exclusion list to maintain.
 *
 * Tool-call cards (kind "tool-call") deliberately do NOT arm the button: the
 * ticket scopes quoting to assistant messages, and widening is a one-line
 * change here if the owner ever wants it.
 */
export function isAssistantFlowKind(kind: string | null | undefined): boolean {
  return kind === "assistant";
}
