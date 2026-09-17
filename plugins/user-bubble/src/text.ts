// Pure text model for the user message bubble (#125, #148).
//
// Three independent transforms, deliberately kept apart because they fail for
// different reasons and are tested separately:
//
//   splitReferences()      — decide what becomes a chip. Fixes the bug where
//                            a pasted path was decorated as a SKILL.
//   hardBreakOutsideFences() — decide where a typed newline survives markdown
//                            paragraph folding, WITHOUT touching code.
//   encodeRefsForMarkdown()  — put the chips INSIDE one markdown flow (#148).
//                            A single MarkdownText over the whole body keeps
//                            text and chips in one paragraph; the chips ride
//                            as markdown links because a link is the only
//                            attribute-carrying inline element markdown offers.
//
// React-free so vitest reaches all three without a browser.

/**
 * WHICH KEYS THIS PLUGIN TAKES OVER (#125). The shipped conversation package
 * registers `user` (client.js:9668) and `steering` (:9673) to the SAME
 * component, UserMessageNodeView, so covering only one leaves half the
 * transcript broken. The list lives in the pure model so the registration
 * list is pinned by unit tests rather than read from the shipped client at
 * runtime.
 */
export const CHAT_NODE_KEYS: readonly string[] = ["user", "steering"];

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
 * THE PATH FIX (#125) AND ITS RETIREMENT (#148).
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
 * #125 added a negative lookahead refusing a slash token followed by more
 * path-ish characters, and wrote down the accepted limitation: a bare
 * `/notaskill` still chipped, because shape alone cannot tell `/tmp` from
 * `/compact`. The owner has now seen exactly that and rejected it (#148).
 *
 * LEXICON VERDICT (#148, criterion 1): NOT REACHABLE from a
 * `conversation.chat.node` entry, established from the installed bundles
 * rather than assumed. The lexicon is handed exclusively through the
 * `conversation.composer.bar` entry's inject hooks compartment
 * (dsh-client-ui-conversation/lib/client.js:10048-10052,
 * `hooks: { notices, lexicon, menuLauncher }`, consumed by InputBar at
 * :3490), while chat.node entries receive only the `turnData` hook
 * (:9774-9779) plus seven owner props — selectedCallId, cwd, openFile,
 * inspectCall, forkAt, renderMessageImages, fileMentions — and the node
 * itself (ChatNodeSeat, :5382-5407). No lexicon, no useLexicon, no
 * sessionId, so the entry cannot even address WHICH session's lexicon to
 * read (the per-session controller needs a session-scope actx,
 * dsh-client-ui-input-trigger/lib/client.js:673-692). The shipped bubble
 * documents the same boundary: "minus the lexicon: sent tokens were
 * validated at compose time, so shape alone decorates" (:5176-5177). Two
 * further strikes against reaching around it: the "/" lexicon holds skill
 * names ONLY (the command source registers no lexicon hook,
 * dsh-client-ui-commands/lib/client.js:522-532), so even a reachable
 * lexicon could not validate /compact; and the lexicon is a LIVE hot-source
 * roll while transcript rows are history — validating the past against the
 * present gives wrong answers across time.
 *
 * So the lookahead is DELETED (per #125's own instruction: two classifiers
 * that can disagree are the defect #130 removed elsewhere) and slash
 * tokens are validated against REAL names instead: the host half serves
 * the registered skill and command names at
 * GET /user-bubble/slash-names (see ./index.ts), and a slash token chips
 * if and only if its name is in that set. Unknown names — /tmp, /etc,
 * /notaskill, and any slash token seen before the names load — stay plain
 * text, which is the safe direction: declining a chip never corrupts
 * anything, while a false chip reinterprets the user's words.
 *
 * KNOWN APPROXIMATION, stated rather than hidden: the served names are the
 * GLOBAL views (skills.list({cwd?}), commands global layer). Per-agent
 * shadows — a command or preset-layer skill shadowing a global for one
 * agent — resolve per session in the composer but are invisible to a
 * transcript renderer that was never given a session address. A missed
 * session-scoped name renders plain, never wrong.
 */
const REFERENCE_RE = /(^|\s)(\/[\w-]+|@"[^"\n]+"|@[^\s]+)/gu;

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
 * @param slashNames - REAL skill and command names WITHOUT the leading
 *   slash, served by our host half (GET /user-bubble/slash-names). A slash
 *   token chips if and only if its name is in this set. When the set is
 *   absent (names not loaded yet) or empty, NO slash token chips: unknown
 *   is plain text, the safe direction. `@` references need no list — they
 *   carry their own evidence (file/folder/session).
 */
export function splitReferences(
  text: unknown,
  sessionLabels: ReadonlySet<string> = new Set(),
  slashNames: ReadonlySet<string> = new Set(),
): UserSegment[] {
  if (typeof text !== "string" || text === "") return [];
  const out: UserSegment[] = [];
  let cursor = 0;
  REFERENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REFERENCE_RE.exec(text)) !== null) {
    const lead = match[1];
    const label = match[2];
    // A slash token is a claim about the world, and the world is the
    // served name list — never shape. Anything unlisted stays text, so
    // /tmp, /etc and /notaskill are plain while /compact chips.
    if (label.startsWith("/") && !slashNames.has(label.slice(1))) {
      continue;
    }
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

/**
 * THE SINGLE-FLOW FIX (#148, defect B).
 *
 * The bubble used to map each segment to either a block-level MarkdownText
 * or an inline chip span, so text/chip/text rendered as block, span, block
 * and every chip cost a line break. The fix renders the WHOLE body through
 * ONE MarkdownText — a single text flow — with the chips encoded inside the
 * markdown source as links: a link is the only attribute-carrying INLINE
 * element markdown offers, so the chip stays in the paragraph instead of
 * breaking it. The client styles `a[href^="#ub-ref/"]` as the chip (same
 * visuals, non-interactive) and keeps the copy buffer on the RAW body, so
 * what you copy never contains the encoding.
 *
 * A reference that falls inside CODE stays literal, because encoding it
 * would write link syntax into what markdown renders verbatim — pasted code
 * must come out byte-identical. Three code shapes are protected: fenced
 * blocks (the exact fence walk hardBreakOutsideFences uses), same-line
 * backtick pairs (inline code spans), and 4-space-indented lines (the same
 * deliberate approximation the hard-break transform uses). Anything the
 * protection misses errs toward literal, never toward a false chip.
 */
export const CHIP_LINK_PREFIX = "#ub-ref/";

/** What the chip shows, mirroring the shipped displayLabel. */
export function chipDisplayText(segment: Extract<UserSegment, { kind: "ref" }>): string {
  const label = segment.label;
  if (segment.refKind === "session") return label.slice(1);
  if (segment.refKind === "skill") return label;
  // @-file/folder: the shipped chip shows the basename only.
  return (
    label
      .slice(1)
      .replace(/^"|"$/g, "")
      .split(/[\\/]/)
      .filter(Boolean)
      .at(-1) ?? label.slice(1)
  );
}

/** Escape markdown link-text metacharacters in a chip label. */
function escapeLinkText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/** Escape a double-quoted markdown link title. Labels never contain \n. */
function escapeLinkTitle(title: string): string {
  return title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Encode one validated reference as an inline markdown chip link.
 * The destination is an opaque hook for our stylesheet (never navigated:
 * the client makes these links non-interactive); the title preserves the
 * full label for the tooltip the shipped chip carried.
 */
export function encodeRefChip(segment: Extract<UserSegment, { kind: "ref" }>): string {
  const text = escapeLinkText(chipDisplayText(segment));
  // Angle-bracket destination: labels may contain spaces and parens
  // (@"my file (1).ts"), which the bare form cannot carry. The leading
  // trigger char is replaced by the chip kind ("/a" and "@a" would
  // otherwise collide), and the remainder is percent-encoded, so the hook
  // carries no raw markdown metacharacters.
  const dest =
    "<" + CHIP_LINK_PREFIX + segment.refKind + "/" + encodeURIComponent(segment.label.slice(1)) + ">";
  const title = escapeLinkTitle(segment.label);
  return `[${text}](${dest} "${title}")`;
}

/** A half-open character range [start, end) of body text. */
interface CharRange {
  start: number;
  end: number;
}

/** Same-line backtick-pair spans (inline code), as offsets within the line. */
function inlineCodeSpans(line: string): CharRange[] {
  const out: CharRange[] = [];
  // Equal-length runs pair like CommonMark backtick strings; an unclosed
  // run is literal text (no span), so refs on such a line still encode.
  const re = /(`+)([^`]*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    // An empty span (``) is literal text, not code.
    if (match[0].length > match[1].length * 2) {
      out.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return out;
}

/**
 * Character ranges of body text where references must stay literal:
 * fenced blocks (through the closing fence, or to end of body when
 * unterminated), inline code spans, and 4-space-indented lines.
 */
function protectedRanges(body: string): CharRange[] {
  const ranges: CharRange[] = [];
  const lines = body.split("\n");
  let offset = 0;
  let fence: { marker: string; char: string } | null = null;
  let fenceStart = 0;
  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const fenceMatch = FENCE_RE.exec(line);
    if (fence === null) {
      if (fenceMatch !== null) {
        fence = { marker: fenceMatch[1], char: fenceMatch[1][0] };
        fenceStart = lineStart;
      } else if (/^ {4,}\S/.test(line)) {
        ranges.push({ start: lineStart, end: lineEnd });
      } else {
        for (const span of inlineCodeSpans(line)) {
          ranges.push({ start: lineStart + span.start, end: lineStart + span.end });
        }
      }
    } else {
      const closes =
        fenceMatch !== null &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.marker.length &&
        line.slice(fenceMatch[0].length).trim() === "";
      if (closes) {
        ranges.push({ start: fenceStart, end: lineEnd });
        fence = null;
      }
    }
    offset = lineEnd + 1;
  }
  if (fence !== null) ranges.push({ start: fenceStart, end: body.length });
  return ranges;
}

/**
 * Render segments as ONE markdown source: text verbatim, validated
 * references as chip links, except inside code where references stay
 * literal. `segments` must be splitReferences(body) — the walk relies on
 * the joinSegments round-trip to track offsets, and foreign segments would
 * misalign the code protection.
 */
export function encodeRefsForMarkdown(body: string, segments: readonly UserSegment[]): string {
  if (typeof body !== "string" || body === "") return "";
  const prot = protectedRanges(body);
  const isProtected = (start: number, end: number): boolean =>
    prot.some((range) => start < range.end && end > range.start);
  let out = "";
  let cursor = 0;
  for (const segment of segments) {
    if (segment.kind === "text") {
      out += segment.text;
      cursor += segment.text.length;
      continue;
    }
    const start = cursor;
    const end = cursor + segment.raw.length;
    out += isProtected(start, end) ? segment.raw : encodeRefChip(segment);
    cursor = end;
  }
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
