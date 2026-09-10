// Pure text model for the user message bubble (#125).
//
// Two independent transforms, deliberately kept apart because they fail for
// different reasons and are tested separately:
//
//   splitReferences()      — decide what becomes a chip. Fixes the bug where
//                            a pasted path was decorated as a SKILL.
//   hardBreakOutsideFences() — decide where a typed newline survives markdown
//                            paragraph folding, WITHOUT touching code.
//
// React-free so vitest reaches both without a browser.

/** One piece of a user message body. */
export type UserSegment =
  | { kind: "text"; text: string }
  | { kind: "ref"; raw: string; label: string; refKind: RefKind };

/**
 * What a chip claims to be.
 *
 * `skill` is the honest name for "a slash token we could not classify". The
 * shipped renderer reached the same value by accident — `referenceKind ??
 * "skill"` (dsh-client-ui-conversation/lib/client.js:5219) — and that
 * accident is this ticket: an unclassified token is not evidence of a skill.
 * We keep the label because the owner chose to keep slash chips, but the
 * uncertainty is named here rather than hidden behind a `??`.
 */
export type RefKind = "session" | "file" | "skill";

/**
 * THE PATH FIX (#125).
 *
 * The shipped pattern is
 *
 *     /(^|\s)(\/[\w-]+|@"[^"\n]+"|@[^\s]+)/gu
 *
 * and `[\w-]` EXCLUDES `/`. That is precisely why `/home/sid/.dsh` chipped
 * as `/home`: the slash alternative stopped at the second slash, and the
 * remainder then failed the `(^|\s)` anchor, so a path was rendered as a
 * skill reference.
 *
 * The negative lookahead below refuses a slash token that is followed by
 * more path-ish characters, so `/home/...`, `/etc/passwd` and `/a.b` never
 * chip while a bare `/compact` still does.
 *
 * ACCEPTED LIMITATION, stated rather than hidden: without the composer
 * lexicon (the ReadonlyMap<'/'|'@', names> that validated the token at
 * compose time) a bare `/notaskill` STILL chips. The lexicon lives in the
 * composer-bar inject and the input-trigger stores, not in this slot's owner
 * props. If it turns out reachable from a chat.node entry, prefer it and
 * DELETE this lookahead rather than keeping both — two classifiers that can
 * disagree is the defect #130 spent a day removing elsewhere.
 */
const REFERENCE_RE = /(^|\s)(\/[\w-]+(?![\w\-/.])|@"[^"\n]+"|@[^\s]+)/gu;

/** Classify a matched token. Only `@` forms carry real evidence. */
function refKindOf(label: string, sessionLabels: ReadonlySet<string>): RefKind {
  if (sessionLabels.has(label)) return "session";
  return label.startsWith("@") ? "file" : "skill";
}

/**
 * Split a user message body into text and reference segments.
 *
 * Separators are preserved: the whitespace that ANCHORED a match stays in
 * the preceding text segment, so re-joining every segment's raw text
 * reproduces the input exactly. That property is tested, because a
 * tokenizer that quietly eats a newline would reintroduce the collapse this
 * ticket also fixes.
 *
 * @param text - the raw message text.
 * @param sessionLabels - labels the runtime already validated as sessions
 *   (node.data.referenceLabels). Only these are trusted as `session`; nothing
 *   here guesses one.
 */
export function splitReferences(
  text: unknown,
  sessionLabels: ReadonlySet<string> = new Set(),
): UserSegment[] {
  if (typeof text !== "string" || text === "") return [];
  const out: UserSegment[] = [];
  let cursor = 0;
  REFERENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REFERENCE_RE.exec(text)) !== null) {
    const lead = match[1];
    const label = match[2];
    const tokenStart = match.index + lead.length;
    // The anchoring whitespace belongs to the TEXT, not the chip.
    if (tokenStart > cursor) out.push({ kind: "text", text: text.slice(cursor, tokenStart) });
    out.push({ kind: "ref", raw: label, label: label, refKind: refKindOf(label, sessionLabels) });
    cursor = tokenStart + label.length;
  }
  if (cursor < text.length) out.push({ kind: "text", text: text.slice(cursor) });
  return out;
}

/** Re-join segments. Exists so the round-trip property can be asserted. */
export function joinSegments(segments: readonly UserSegment[]): string {
  let out = "";
  for (const segment of segments) out += segment.kind === "text" ? segment.text : segment.raw;
  return out;
}

/** A fenced block opener: up to three spaces, then 3+ backticks or tildes. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * THE NEWLINE TWEAK (#125), and the exclusion that makes it safe.
 *
 * Markdown folds a single newline into the previous line, so a message typed
 * across several lines arrives as one paragraph. The owner asked for typed
 * line breaks to survive: a single newline becomes a HARD BREAK (two trailing
 * spaces, the portable spelling).
 *
 * IT MUST NOT APPLY INSIDE FENCED CODE. Inside a fence the text is already
 * literal, and appending two spaces to every line would corrupt code the user
 * PASTED — strictly worse than the folding this fixes, and invisible in a
 * diff. So the transform walks lines with fence state rather than running a
 * blanket replace, and it never touches a fence delimiter either (trailing
 * spaces on an opener would change what the fence is).
 *
 * INDENTED CODE BLOCKS: also skipped, by treating a 4-space indent as code.
 * That is an APPROXIMATION and is the deliberate choice — the same indent is
 * a list continuation in another context, where skipping merely declines to
 * add a break rather than corrupting anything. Erring toward "leave it alone"
 * is the safe direction for both readings; fenced blocks are the exactly
 * handled case.
 *
 * A line is left alone when it is blank, when the NEXT line is blank (the
 * paragraph is ending anyway, so a break would be stray whitespace), when it
 * already ends in two spaces or a backslash, or when it is the last line.
 */
export function hardBreakOutsideFences(text: unknown): string {
  if (typeof text !== "string" || text === "") return "";
  const lines = text.split("\n");
  let fence: { marker: string; char: string } | null = null;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line);
    if (fence === null) {
      if (fenceMatch !== null) {
        fence = { marker: fenceMatch[1], char: fenceMatch[1][0] };
        out.push(line);
        continue;
      }
    } else {
      // A closing fence uses the same character and is at least as long.
      const closes =
        fenceMatch !== null &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.marker.length &&
        line.slice(fenceMatch[0].length).trim() === "";
      out.push(line);
      if (closes) fence = null;
      continue;
    }
    const next = i + 1 < lines.length ? lines[i + 1] : null;
    const isLast = next === null;
    const nextBlank = next !== null && next.trim() === "";
    const alreadyBroken = /( {2}|\\)$/.test(line);
    const indentedCode = /^ {4,}\S/.test(line);
    if (line.trim() === "" || isLast || nextBlank || alreadyBroken || indentedCode) {
      out.push(line);
      continue;
    }
    out.push(line + "  ");
  }
  return out.join("\n");
}
