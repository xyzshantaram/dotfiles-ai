/**
 * bash-diagram — a read-only dataflow diagram model for bash tool-call rows.
 *
 * Ticket #149 (v1). SCOPE: a single, non-backgrounded statement that is either
 * a multi-stage pipeline of plain commands or one command carrying redirects.
 * Everything else (control flow, && chains, subshells, command substitution,
 * backgrounding) returns null and the row renders exactly as it does today.
 *
 * Ticket #160 (v2). SCOPE: a multi-statement script (statements separated by
 * `;` or newline) draws as an ORDERED SEQUENCE of statement groups. Each
 * group reuses v1's stage/arrow machinery where it applies: a multi-stage
 * pipeline of plain commands, a command carrying redirects, or — new in v2 —
 * a single plain command as one block (the `echo` between two pipelines in
 * the motivating script must not sink the whole diagram). A statement v1
 * would refuse (AndOr, subshell, compound, ...) renders as its VERBATIM
 * slice inside the sequence, never as stages and arrows.
 *
 * WHY A SEQUENCE IS HONEST WHERE &&-AS-ARROW WOULD NOT BE (#149's reasoning,
 * kept): the AST models syntax, not dataflow. A pipe carries bytes; `&&`
 * carries only a decision, so drawing both as arrows would claim a dataflow
 * that does not exist. A `;`/newline sequence claims nothing but order —
 * "these ran in order" — which is true and drawable. The sequence separator
 * therefore MUST NOT look like a pipe (see the client: vertical "then ↓"
 * between stacked statement rows, never the horizontal `|`/`→` glyph), and
 * `&&`/`||` groups carry an explicit conditional marker rather than being
 * silently lumped with `;`. A backgrounded statement (`&`) voids even the
 * ordering claim (it runs concurrently), so any `background === true`
 * degrades the WHOLE script to text, exactly as in v1.
 *
 * CLIENT PARSE ONLY. This module imports `parse` from "unbash" and nothing
 * else — @cad0p/unbash-walker MUST NOT enter the client bundle (it imports
 * node:path and reads process.env; an esbuild browser build of it fails).
 * The ~30 lines of statement-level walking this needs live here instead,
 * mirroring bash-guard's host-side containsPipeline without copying its
 * import. bash-guard runs on the HOST; this runs in the BROWSER.
 *
 * OWN OFFSETS ONLY. The host parses with a nested unbash 3.0.0 while the
 * client bundles 4.0.10, and the two disagree on real offsets (heredoc
 * target pos/end is 0/0 in v3, correct in v4). Every slice below comes from
 * THIS module's own parse of the command string — offsets arriving over
 * presentationMeta or any other host channel are never trusted for slicing.
 *
 * FIDELITY IS SLICE CONCATENATION, NOT print(). unbash's printer normalises
 * source (`<<EOF` prints back as `<< EOF`), so it cannot prove exactness.
 * The invariant, checked by reconstructBashDiagram/verifyBashDiagram and
 * covered by tests: drawn-node slices + verbatim gap slices reproduce the
 * command byte for byte. Gaps (whitespace, operators, `!`, `time`) belong to
 * no node and are recorded explicitly.
 *
 * NO SESSION STATE. Parsing happens here, memoised by command string in a
 * bounded module-level Map (null = parse failure / over-cap / not drawable,
 * cached too). The AST never enters session state or any projection: #133
 * measured 238KB of projection bloat from the opposite choice, and the
 * ticket benchmarked parsing at ~26-48us — React DOM work, not parsing, is
 * the cost, so per-row memoisation plus a bounded distinct-command cache is
 * the whole performance story.
 */

import { parse } from "unbash";

/** Stated size cap: commands above this degrade to today's text rendering. */
export const BASH_DIAGRAM_MAX_COMMAND = 20000;

/** Distinct-command memo cap: evict the oldest entry past this many. */
const BASH_DIAGRAM_CACHE_LIMIT = 200;

/** One pipe arrow between two drawn stages. `gap` is the verbatim source
 *  text between the stage spans (whitespace plus the operator itself); it is
 *  consumed INTO the arrow, typed by `operator`. */
export interface BashDiagramArrow {
  operator: "|" | "|&";
  gap: string;
}

/** A redirect endpoint on a stage block. `slice` is the verbatim redirect
 *  source (`> out.txt`, `2>&1`, `<<EOF`); fd duplication is shown as written,
 *  never flattened into a plain file arrow. Heredocs carry their carved body
 *  for the collapsed disclosure; everything else has heredoc null. */
export interface BashDiagramRedirect {
  slice: string;
  operator: string;
  heredoc: {
    body: string;
    delimiter: string;
    lines: number;
  } | null;
}

/** One drawn stage block. `slice` is the verbatim stage source [pos,end);
 *  `words` is display text only (slice minus redirect spans, whitespace
 *  collapsed). `exitCode` is set by attributePipeStages, never at build. */
export interface BashDiagramStage {
  slice: string;
  words: string;
  redirects: BashDiagramRedirect[];
  exitCode: number | undefined;
  /** v3 (#162): parsed-argument chips cut from `slice`; undefined when the
   *  parse refused (fail closed) — the row renders plain text then. */
  args: BashStageArgs | undefined;
}

/** The trailing region [statementEnd, command.length), partitioned exactly:
 *  gap pieces stay verbatim; each heredoc piece is the carved body plus its
 *  delimiter line plus the newline that terminated that line ("" when the
 *  delimiter line ends the command). Concatenating every piece in order
 *  reproduces the trailing region byte for byte. */
export type BashDiagramTrailing =
  | { kind: "gap"; text: string }
  | { kind: "heredoc"; body: string; delimiterLine: string; newline: string };

export interface BashDiagram {
  kind: "pipeline" | "command";
  /** `!` prefix: changes what the exit code means, rendered as a badge. */
  negated: boolean;
  /** `time` prefix: likewise rendered, never dropped. */
  timed: boolean;
  /** Verbatim source before the first stage (`! `/`time `/indent/comments). */
  leadingGap: string;
  stages: BashDiagramStage[];
  /** Length stages.length - 1 for pipelines, empty for single commands. */
  arrows: BashDiagramArrow[];
  trailing: BashDiagramTrailing[];
}

function isHeredocOperator(op: string): boolean {
  return op === "<<" || op === "<<-";
}

function countNewlines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}

interface HeredocCarve {
  body: string;
  delimiterLine: string;
  newline: string;
}

/**
 * Carve heredoc bodies out of the trailing region. Bodies serialize in
 * redirect source order: after the newline that ends the command line, each
 * `<<`/`<<-` body runs until its delimiter line, in the order the operators
 * appear. Returns null when the bodies cannot be accounted for exactly
 * (missing body region, unterminated body) — the caller degrades to text
 * rendering.
 */
function carveHeredocs(
  command: string,
  statementEnd: number,
  heredocs: { operator: string; delimiter: string }[],
): HeredocCarve[] | null {
  const firstNewline = command.indexOf("\n", statementEnd);
  if (firstNewline === -1) return null;
  let cursor = firstNewline + 1;
  const carved: HeredocCarve[] = [];
  for (const h of heredocs) {
    if (typeof h.delimiter !== "string") return null;
    const bodyStart = cursor;
    let found = false;
    while (cursor <= command.length) {
      const eol = command.indexOf("\n", cursor);
      const lineEnd = eol === -1 ? command.length : eol;
      let line = command.slice(cursor, lineEnd);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const compared = h.operator === "<<-" ? line.replace(/^\t+/, "") : line;
      if (compared === h.delimiter) {
        carved.push({
          body: command.slice(bodyStart, cursor),
          delimiterLine: command.slice(cursor, lineEnd),
          newline: eol === -1 ? "" : "\n",
        });
        cursor = eol === -1 ? command.length : eol + 1;
        found = true;
        break;
      }
      if (eol === -1) break;
      cursor = eol + 1;
    }
    if (!found) return null;
  }
  return carved;
}

/**
 * Classify one statement's inner node into the drawable shapes. Returns null
 * for everything v1 falls back to text on (AndOr, Subshell, BraceGroup, If,
 * For, While, Case, Function, Coproc, TestCommand, ArithmeticCommand, ...):
 * scope says control flow falls back to text, never a partial diagram of one
 * branch. Shared by v1 (single statement) and v2 (each sequence member).
 */
interface ClassifiedInner {
  kind: "pipeline" | "command";
  negated: boolean;
  timed: boolean;
  rawStages: any[];
  operators: any[];
}

function classifyInner(inner: any): ClassifiedInner | null {
  if (inner === null || typeof inner !== "object") return null;
  if (inner.type === "Pipeline") {
    if (!Array.isArray(inner.commands) || inner.commands.length === 0) return null;
    // A single-stage pipeline (`! ls`, `time ls`) unwraps to the command
    // path below: without redirects it stays text in v1, with redirects it
    // draws carrying its badges. Only multi-stage pipelines draw as pipelines.
    if (inner.commands.length === 1) {
      const only = inner.commands[0];
      if (only === null || typeof only !== "object" || only.type !== "Command") return null;
      return {
        kind: "command",
        negated: inner.negated === true,
        timed: inner.time === true,
        rawStages: [only],
        operators: [],
      };
    }
    if (!inner.commands.every((s: any) => s !== null && typeof s === "object" && s.type === "Command")) {
      return null;
    }
    const rawStages = inner.commands;
    const operators = Array.isArray(inner.operators) ? inner.operators : [];
    if (operators.length !== rawStages.length - 1) return null;
    for (const op of operators) {
      if (op !== "|" && op !== "|&") return null;
    }
    return {
      kind: "pipeline",
      negated: inner.negated === true,
      timed: inner.time === true,
      rawStages,
      operators,
    };
  }
  if (inner.type === "Command") {
    return { kind: "command", negated: false, timed: false, rawStages: [inner], operators: [] };
  }
  return null;
}

/**
 * Attribute statement-level redirects defensively onto the stage lists.
 * Statement-level redirects are vanishingly rare for Command/Pipeline inners
 * (probes always found them on the inner node): the single stage, or the
 * last pipeline stage, owns them.
 */
function attributeStatementRedirects(statement: any, rawStages: any[]): any[][] {
  const statementRedirects: any[] = Array.isArray(statement.redirects) ? statement.redirects : [];
  const lists: any[][] = rawStages.map((s) => (Array.isArray(s.redirects) ? s.redirects.slice() : []));
  for (const r of statementRedirects) {
    lists[lists.length - 1].push(r);
  }
  return lists;
}

/**
 * One heredoc body to carve, with its owner for attribution. `redirectPos`
 * is the redirect's source offset (null when the node carries none): v1
 * sorts by it, v2 additionally requires every operator to sit on the last
 * statement's line (see buildSequenceDiagram).
 */
interface HeredocSpec {
  operator: string;
  delimiter: string;
  redirectPos: number | null;
  stage: number;
  index: number;
}

function collectHeredocSpecs(stageRedirectLists: any[][]): { specs: HeredocSpec[]; usable: boolean } {
  const specs: HeredocSpec[] = [];
  let usable = true;
  stageRedirectLists.forEach((list, stage) => {
    list.forEach((r, index) => {
      if (r === null || typeof r !== "object" || typeof r.operator !== "string") return;
      if (!isHeredocOperator(r.operator)) return;
      // A heredoc operator with no usable delimiter target cannot have its
      // body attributed, so the whole diagram degrades to text.
      if (r.target === null || typeof r.target !== "object" || typeof r.target.value !== "string") {
        usable = false;
        return;
      }
      specs.push({
        operator: r.operator,
        delimiter: r.target.value,
        redirectPos: typeof r.pos === "number" ? r.pos : null,
        stage,
        index,
      });
    });
  });
  if (!usable) return { specs: [], usable: false };
  // Sort into source order for body attribution (bodies serialize in the
  // order the << operators appear). Redirect lists are already ordered, and
  // stages are ordered, so this is a no-op in practice — belt and braces.
  specs.sort((a, b) => (a.redirectPos ?? 0) - (b.redirectPos ?? 0));
  return { specs, usable: true };
}

/**
 * Partition the trailing region [statementEnd, command.length) exactly: gap
 * pieces stay verbatim; each heredoc piece is the carved body plus its
 * delimiter line plus the newline that terminated that line ("" when the
 * delimiter line ends the command). Returns null when the bodies cannot be
 * accounted for exactly — the caller degrades to text rendering.
 */
function buildTrailing(
  command: string,
  statementEnd: number,
  specs: HeredocSpec[],
): { trailing: BashDiagramTrailing[]; carves: HeredocCarve[] } | null {
  const trailing: BashDiagramTrailing[] = [];
  if (specs.length > 0) {
    const carved = carveHeredocs(
      command,
      statementEnd,
      specs.map((h) => ({ operator: h.operator, delimiter: h.delimiter })),
    );
    if (carved === null || carved.length !== specs.length) return null;
    // Partition the trailing region: pre gap, then interleaved bodies.
    const firstNewline = command.indexOf("\n", statementEnd);
    let cursor = firstNewline + 1;
    trailing.push({ kind: "gap", text: command.slice(statementEnd, cursor) });
    for (const c of carved) {
      trailing.push({ kind: "heredoc", body: c.body, delimiterLine: c.delimiterLine, newline: c.newline });
      cursor += c.body.length + c.delimiterLine.length + c.newline.length;
    }
    trailing.push({ kind: "gap", text: command.slice(cursor) });
    return { trailing, carves: carved };
  }
  trailing.push({ kind: "gap", text: command.slice(statementEnd) });
  return { trailing, carves: [] };
}

/**
 * Build the drawn stage blocks for one statement: `slice` is the verbatim
 * stage source, `words` display text only (slice minus redirect spans,
 * whitespace collapsed), redirects verbatim with carved heredoc bodies
 * attached from `heredocByKey` ("stage:index").
 */
function buildStageModels(
  command: string,
  rawStages: any[],
  stageRedirectLists: any[][],
  heredocByKey: Map<string, HeredocCarve>,
): BashDiagramStage[] {
  return rawStages.map((s, stageIdx) => {
    const list = stageRedirectLists[stageIdx];
    const spans: { start: number; end: number }[] = [];
    for (const r of list) {
      if (r === null || typeof r !== "object") continue;
      if (typeof r.pos !== "number" || typeof r.end !== "number") continue;
      const start = Math.max(s.pos, Math.min(r.pos, s.end));
      const end = Math.max(s.pos, Math.min(r.end, s.end));
      if (end > start) spans.push({ start, end });
    }
    spans.sort((a, b) => a.start - b.start);
    let words = "";
    let cursor = s.pos;
    for (const span of spans) {
      if (span.start > cursor) words += command.slice(cursor, span.start) + " ";
      cursor = Math.max(cursor, span.end);
    }
    if (s.end > cursor) words += command.slice(cursor, s.end);
    words = words.split(/\s+/).filter((w) => w.length > 0).join(" ");

    const redirects: BashDiagramRedirect[] = list.map((r, index) => {
      const slice =
        r !== null &&
        typeof r === "object" &&
        typeof r.pos === "number" &&
        typeof r.end === "number" &&
        r.pos >= 0 &&
        r.end <= command.length &&
        r.end >= r.pos
          ? command.slice(r.pos, r.end)
          : "";
      const operator = r !== null && typeof r === "object" && typeof r.operator === "string" ? r.operator : "";
      const carve = heredocByKey.get(stageIdx + ":" + index);
      return {
        slice,
        operator,
        heredoc:
          carve === undefined
            ? null
            : {
                body: carve.body,
                delimiter: carve.delimiterLine,
                lines: countNewlines(carve.body),
              },
      };
    });

    return {
      slice: command.slice(s.pos, s.end),
      words,
      redirects,
      exitCode: undefined,
      args: parseStageArgs(command, s),
    };
  });
}

function buildDiagram(command: string): BashDiagram | null {
  if (typeof command !== "string" || command === "") return null;
  if (command.length > BASH_DIAGRAM_MAX_COMMAND) return null;
  let script: any;
  try {
    script = parse(command);
  } catch {
    return null;
  }
  if (script === null || typeof script !== "object") return null;
  if (Array.isArray(script.errors) && script.errors.length > 0) return null;
  if (!Array.isArray(script.commands) || script.commands.length !== 1) return null;
  const statement = script.commands[0];
  if (statement === null || typeof statement !== "object") return null;
  if (statement.background === true) return null;

  const classified = classifyInner(statement.command);
  if (classified === null) {
    // AndOr, Subshell, BraceGroup, If, For, While, Case, Function, Coproc,
    // TestCommand, ArithmeticCommand, ... — scope says control flow falls
    // back to text, never a partial diagram of one branch.
    return null;
  }
  const { kind, negated, timed, rawStages, operators } = classified;

  const stageRedirectLists = attributeStatementRedirects(statement, rawStages);

  if (kind === "command") {
    const hasRedirects = stageRedirectLists[0].length > 0;
    if (!hasRedirects) return null; // a single simple command stays text.
  }

  // Span sanity: stages in source order, non-overlapping, inside the command.
  for (const s of rawStages) {
    if (
      typeof s.pos !== "number" ||
      typeof s.end !== "number" ||
      s.pos < 0 ||
      s.end > command.length ||
      s.pos > s.end
    ) {
      return null;
    }
  }
  for (let i = 0; i + 1 < rawStages.length; i++) {
    if (rawStages[i].end > rawStages[i + 1].pos) return null;
  }
  if (typeof statement.end !== "number" || statement.end < rawStages[rawStages.length - 1].end) {
    return null;
  }
  const statementEnd = Math.min(statement.end, command.length);

  const leadingGap = command.slice(0, rawStages[0].pos);

  const arrows: BashDiagramArrow[] = [];
  for (let i = 0; i + 1 < rawStages.length; i++) {
    arrows.push({
      operator: operators[i],
      gap: command.slice(rawStages[i].end, rawStages[i + 1].pos),
    });
  }

  // Heredoc bodies live in the trailing region, in redirect source order.
  const { specs: heredocSpecs, usable: heredocsUsable } = collectHeredocSpecs(stageRedirectLists);
  if (!heredocsUsable) return null;

  const trailed = buildTrailing(command, statementEnd, heredocSpecs);
  if (trailed === null) return null;
  const trailing = trailed.trailing;
  const heredocByKey = new Map<string, HeredocCarve>();
  heredocSpecs.forEach((h, i) => {
    heredocByKey.set(h.stage + ":" + h.index, trailed.carves[i]);
  });

  const stages = buildStageModels(command, rawStages, stageRedirectLists, heredocByKey);

  return { kind, negated, timed, leadingGap, stages, arrows, trailing };
}

const diagramCache = new Map<string, BashDiagram | null>();

/**
 * Memoised entry point: parse + trigger predicate + model build, once per
 * distinct command string. Returns null when the command renders as text.
 */
export function getBashDiagram(command: string): BashDiagram | null {
  if (diagramCache.has(command)) return diagramCache.get(command) ?? null;
  const built = buildDiagram(command);
  if (diagramCache.size >= BASH_DIAGRAM_CACHE_LIMIT) {
    const oldest = diagramCache.keys().next();
    if (!oldest.done) diagramCache.delete(oldest.value);
  }
  diagramCache.set(command, built);
  return built;
}

/** Test hook: drop all memoised entries. */
export function clearBashDiagramCache(): void {
  diagramCache.clear();
}

/**
 * Reproduce the command from the model's slices. The fidelity invariant is
 * `reconstructBashDiagram(command, getBashDiagram(command)) === command`
 * for every non-null model — drawn-node slices interleaved with the verbatim
 * gaps that belong to no node.
 */
export function reconstructBashDiagram(command: string, model: BashDiagram): string {
  void command;
  let out = model.leadingGap;
  for (let i = 0; i < model.stages.length; i++) {
    out += model.stages[i].slice;
    if (i < model.arrows.length) out += model.arrows[i].gap;
  }
  for (const t of model.trailing) {
    if (t.kind === "gap") out += t.text;
    else out += t.body + t.delimiterLine + t.newline;
  }
  return out;
}

/** True exactly when the model reproduces the command byte for byte. */
export function verifyBashDiagram(command: string, model: BashDiagram): boolean {
  return reconstructBashDiagram(command, model) === command;
}

/**
 * Attribute per-stage exit codes from `block.meta.pipeStages` onto a COPY of
 * the model (the cached base is never mutated: meta differs per row).
 *
 * Shown only when pipeStages is an array whose length matches the drawn
 * stages AND every entry carries a non-empty `name`. Name absence IS the
 * #142 disqualification signal: bash-guard emits bare {exitCode} entries
 * plus a "final pipeline only" note when it cannot attribute codes, and a
 * backgrounded call carries no pipeStages key at all. Any doubt hides every
 * per-stage code rather than inventing an attribution.
 */
export function attributePipeStages(model: BashDiagram, pipeStages: unknown): BashDiagram {
  const stages = model.stages.map((s) => ({
    slice: s.slice,
    words: s.words,
    redirects: s.redirects,
    exitCode: undefined as number | undefined,
    args: s.args,
  }));
  if (Array.isArray(pipeStages) && pipeStages.length === stages.length) {
    let ok = true;
    const codes: number[] = [];
    for (const entry of pipeStages) {
      if (
        entry === null ||
        typeof entry !== "object" ||
        typeof (entry as { name?: unknown }).name !== "string" ||
        ((entry as { name?: unknown }).name as string).length === 0 ||
        !Number.isInteger((entry as { exitCode?: unknown }).exitCode)
      ) {
        ok = false;
        break;
      }
      codes.push((entry as { exitCode: number }).exitCode);
    }
    if (ok) {
      for (let i = 0; i < stages.length; i++) stages[i].exitCode = codes[i];
    }
  }
  return {
    kind: model.kind,
    negated: model.negated,
    timed: model.timed,
    leadingGap: model.leadingGap,
    stages,
    arrows: model.arrows,
    trailing: model.trailing,
  };
}

// ---- #160 (v2): multi-statement scripts as an ordered sequence. ----
//
// A `;`/newline-separated script draws as a SEQUENCE of statement groups.
// The sequence claims order only ("these ran in order"), never dataflow, so
// it stays inside #149's honesty boundary: pipes keep their horizontal
// `|`/`→` arrows *within* a group, while the boundary *between* groups is a
// vertical "then ↓" marker that shares no glyph with any pipe (see the
// client). `&&`/`||` statements are NOT silently lumped with `;`: they render
// as verbatim text groups carrying an explicit conditional marker. A
// backgrounded statement degrades the whole script to text — `&` runs
// concurrently, so even the ordering claim would be false.

/**
 * One drawn statement group: v1's stage/arrow machinery, plus the verbatim
 * `groupGap` between the last stage's end and the statement's end (usually
 * "" — trailing comments before a `;` belong to the SEPARATOR, not the
 * statement, per unbash's spans).
 */
export interface BashSequenceUnit {
  kind: "pipeline" | "command";
  negated: boolean;
  timed: boolean;
  leadingGap: string;
  stages: BashDiagramStage[];
  arrows: BashDiagramArrow[];
  groupGap: string;
  /** v3 (#162): this row's RIGHT TO RUN, named on the row itself — never on
   *  a chain's base row (#162 criterion 2b). null = unconditional. */
  conditional: BashSequenceConditional | null;
}

/** How an `&&`/`||` text group may run: unconditionally is never the answer,
 *  so the marker names the condition instead of implying order-only. */
export type BashSequenceConditional = "&&" | "||" | "mixed";

/**
 * The model ONE SEQUENCE UNIT hands to the command diagram — THE RENDER SEAM,
 * and the ONLY one. Both branches of the sequence renderer call this: the
 * plain-statement branch and the chain-row branch. Neither builds the view's
 * object by hand.
 *
 * Why it is a named function at all, in two parts, because the first fix was
 * itself incomplete:
 *
 * 1. The #162 review found the chain branch built this object inline and
 *    silently omitted `conditional`. The unit model was correct
 *    (`[null, "&&", "&&"]`, pinned by passing tests) while the GUI drew three
 *    bare rows: MODEL-TRUE AND SCREEN-FALSE. Nothing could redden, because
 *    every test asserted the model and none asserted what the model handed to
 *    the view.
 * 2. The re-review then found the repair was PARTIAL — the sibling
 *    plain-statement branch still had its own inline literal, also omitting
 *    `conditional`. That one is harmless TODAY only because
 *    prepareStatementUnit hard-codes `conditional: null`, so `undefined` and
 *    `null` reach the render gate alike. That is an accident of the current
 *    data, not a guarantee, and it left the defect CLASS intact one branch
 *    over. Two hand-built copies of one object is the class; a single builder
 *    is the fix.
 *
 * `conditional` rides through unchanged: the base row's null is the whole
 * point of criterion 2b — a marker on the base would state something false,
 * since the base runs unconditionally.
 */
export function sequenceUnitDiagramModel(row: BashSequenceUnit): {
  kind: BashSequenceUnit["kind"];
  negated: boolean;
  timed: boolean;
  leadingGap: string;
  stages: BashDiagramStage[];
  arrows: BashDiagramArrow[];
  conditional: BashSequenceConditional | null;
  trailing: { kind: "gap"; text: string }[];
} {
  return {
    kind: row.kind,
    negated: row.negated,
    timed: row.timed,
    leadingGap: row.leadingGap,
    stages: row.stages,
    arrows: row.arrows,
    conditional: row.conditional,
    trailing: row.groupGap === "" ? [] : [{ kind: "gap", text: row.groupGap }],
  };
}

/**
 * One drawn `&&`/`||` CHAIN inside a statement (#162 criterion 2b): rows
 * stack exactly like sequence members, and each dependent row (i>0) carries
 * ITS OWN condition (`operators[i-1]`) as prominent text at the top of its
 * own panel. The BASE row (i=0) carries no marker of any kind: it runs
 * unconditionally, and the group-level badge v2 painted across the whole
 * chain said something false about it.
 */
export interface BashSequenceChainGroup {
  kind: "chain";
  /** Verbatim source before the first row's operand. */
  leadingGap: string;
  rows: BashSequenceUnit[];
  /** The operator between each row pair; every entry is "&&" or "||". */
  operators: ("&&" | "||")[];
  /** Verbatim source between row spans; length is rows.length - 1. */
  separators: string[];
}

export type BashSequenceStatement =
  | { kind: "diagram"; unit: BashSequenceUnit }
  | { kind: "chain"; chain: BashSequenceChainGroup }
  | { kind: "text"; slice: string; conditional: BashSequenceConditional | null };

export interface BashSequenceDiagram {
  kind: "sequence";
  /** Verbatim source before the first statement (indent, leading comments). */
  leadingGap: string;
  statements: BashSequenceStatement[];
  /** Verbatim source between statement spans (`;`, newlines, comments);
   *  length is always statements.length - 1. */
  separators: string[];
  /** The trailing region after the last statement, partitioned exactly as in
   *  v1 (heredoc bodies live here, in redirect source order). */
  trailing: BashDiagramTrailing[];
}

/**
 * True when any heredoc redirect (`<<`/`<<-` with a target) hides anywhere
 * in the subtree. Recorded per TEXT group (see buildSequenceDiagram): a text
 * group cannot own carved bodies, so its bodies ride verbatim in the
 * separators/trailing gaps — which is exact only while no DIAGRAM group
 * carves bodies of its own (bodies serialize in global operator order, so
 * coexisting carves and verbatim bodies could interleave ambiguously).
 */
function subtreeHasHeredoc(node: any): boolean {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) {
    for (const el of node) {
      if (subtreeHasHeredoc(el)) return true;
    }
    return false;
  }
  if ((node.operator === "<<" || node.operator === "<<-") && "target" in node) return true;
  for (const key of Object.keys(node)) {
    if (subtreeHasHeredoc(node[key])) return true;
  }
  return false;
}

/** Name the condition an AndOr statement carries; null for anything else.
 *  v3: only REFUSED AndOr chains reach this (a draw-able chain renders as a
 *  chain group with per-row markers instead), so the field lives on text
 *  groups for structural description only — the client renders no badge
 *  from it (#162 criterion 2: chrome down, only the exceptional case
 *  labelled). */
function conditionalOf(inner: any): BashSequenceConditional | null {
  if (inner === null || typeof inner !== "object" || inner.type !== "AndOr") return null;
  const seen = new Set<string>();
  const ops = Array.isArray(inner.operators) ? inner.operators : [];
  for (const op of ops) {
    if (op === "&&" || op === "||") seen.add(op);
    else seen.add("other");
  }
  if (seen.size === 1) {
    if (seen.has("&&")) return "&&";
    if (seen.has("||")) return "||";
  }
  return "mixed";
}

// ---- #162 (v3): parsed arguments as POSITIONED SLICES, fail closed. ----

/** One argument chip. `slice` is the verbatim stage source [pos,end) of the
 *  token it names — never a re-serialisation of unbash's parsed value, so
 *  quoting, escaping and spacing ride exactly as typed (#162 criterion 3).
 *  `role` is display structure only. */
export interface BashStageArg {
  slice: string;
  role: "flag" | "value" | "positional" | "subcommand";
}

/** Parsed-argument list attached to a stage. `stageSlice` is the verbatim
 *  stage span the chips belong to; the client asserts chips slice INSIDE
 *  that span. Absent = the parse refused; the row renders exactly as
 *  v1/v2 did and claims nothing (#162 criterion 4: fail closed). */
export interface BashStageArgs {
  stageSlice: string;
  args: BashStageArg[];
}

/**
 * Per-command profiles (#162 criterion 4). CROSS-TOKEN value binding is
 * claimed ONLY through these tables: `--long value` / `-x value` without a
 * table entry renders both tokens unbound, because without per-command
 * knowledge the next token is equally likely positional. `--long=value`
 * binds by itself (same token, self-evident), with or without a profile.
 * A command with no profile gets the generic treatment: flag pose for
 * `-`-prefixed tokens, positional otherwise, no binding, no subcommand.
 */
const ARG_PROFILES: Record<string, { valueFlags?: string[]; subcommands?: Record<string, { valueFlags?: string[] }> }> = {
  rg: { valueFlags: ["-e", "-C", "-A", "-B", "--context", "--after-context", "--before-context", "-m", "--max-count", "--type", "--replace", "--max-filesize", "--glob", "-g"] },
  ls: { valueFlags: ["-w", "--block-size", "--width", "--context", "--sort", "--format"] },
  node: { valueFlags: ["-e", "-p", "--eval", "--print", "--max-old-space-size", "--stack-size", "--input-type"] },
  git: {
    valueFlags: ["-C", "-c", "--git-dir", "--work-tree", "--exec-path", "--namespace"],
    subcommands: {
      commit: { valueFlags: ["-m", "-F", "--author", "--date", "-C", "--message"] },
      merge: { valueFlags: ["-m", "-F", "-X"] },
      log: { valueFlags: ["-n", "--since", "--until", "--before", "--after", "--format", "--pretty", "-L", "-S", "-G", "-C", "--grep", "--author", "--max-count"] },
    },
  },
};

/** Subcommand vocabularies. Only the FIRST non-bound, non-flag word matching
 *  a table entry is claimed; every other token stays positional. A command
 *  with no table (rg, ls, node, …) gets no subcommand claim. */
const ARG_SUBCOMMANDS: Record<string, Set<string>> = {
  git: new Set([
    "add", "am", "archive", "bisect", "blame", "branch", "bundle", "checkout", "cherry-pick",
    "clean", "clone", "commit", "config", "describe", "diff", "fetch", "format-patch", "gc",
    "grep", "init", "log", "ls-files", "merge", "mv", "notes", "pull", "push", "rebase",
    "remote", "reset", "restore", "revert", "rm", "show", "stash", "status", "submodule",
    "switch", "tag", "worktree",
  ]),
};

/** One argument walk for a stage: the words of the stage's Command node in
 *  order, name first. `value` is unbash's UNQUOTED display value; `pos`/`end`
 *  are the SOURCE spans the chips are cut from (the quotes ride verbatim). */
interface ArgWord {
  value: string;
  pos: number;
  end: number;
}

/**
 * Parse one stage's arguments into positioned slices, or refuse. Gates, in
 * order: the stage node must be a plain `Command` with `name` + `suffix`
 * words; every word must carry numeric pos/end inside the command; the head
 * must not itself be flag-shaped. Failures return undefined — the caller
 * renders the stage as plain text with nothing claimed.
 *
 * Three passes, in this order, so nothing claims on knowledge that arrives
 * later: (1) bind flag→next-token pairs with PROFILE-LEVEL certainty, (2)
 * find the subcommand among tokens those binds did not consume, (3) re-run
 * the binds with the subcommand's own list added, recheck the subcommand,
 * (4) emit chips in source order. The two-phase rebind is what lets
 * `git log --since X` bind via log's table while `git -C path log` also
 * binds `-C path` before `log` is ever found.
 */
export function parseStageArgs(command: string, stageNode: any): BashStageArgs | undefined {
  if (stageNode === null || typeof stageNode !== "object" || stageNode.type !== "Command") return undefined;
  const stagePos = stageNode.pos;
  const stageEnd = stageNode.end;
  if (typeof stagePos !== "number" || typeof stageEnd !== "number") return undefined;
  const name = stageNode.name;
  if (name === null || typeof name !== "object" || typeof name.value !== "string" ||
      typeof name.pos !== "number" || typeof name.end !== "number") return undefined;
  if (name.value === "" || name.value.startsWith("-")) return undefined; // not a plain command head
  // Env assignments (FOO=1 BAR=x ls …) live in `prefix`, which the chip walk
  // does not cover; silently dropping them from the DISPLAY would contradict
  // the diagram's own fidelity claim, so a prefixed stage refuses the parse
  // and renders its plain words.
  if (Array.isArray(stageNode.prefix) && stageNode.prefix.length > 0) return undefined;
  const suffix = Array.isArray(stageNode.suffix) ? stageNode.suffix : [];
  const words: ArgWord[] = [{ value: (name as ArgWord).value, pos: name.pos, end: name.end }];
  for (const w of suffix) {
    if (w === null || typeof w !== "object") return undefined;
    if (typeof w.value !== "string" || typeof w.pos !== "number" || typeof w.end !== "number" ||
        w.pos < 0 || w.end > command.length || w.end < w.pos) {
      return undefined;
    }
    words.push({ value: w.value, pos: w.pos, end: w.end });
  }

  const profile = ARG_PROFILES[name.value];
  const subTbl = ARG_SUBCOMMANDS[name.value];
  const baseFlags = new Set(profile?.valueFlags ?? []);
  const bound = new Map<number, number>(); // value-token index -> its flag's index

  /** Bind flag->next-token pairs where the table is certain: the next token
   *  must be a plain word (not a flag, not empty) and must not be bound. */
  function bind(effective: Set<string>): void {
    for (let i = 1; i < words.length; i++) {
      const v = words[i].value;
      if (!v.startsWith("-") || v === "-" || v === "--") continue;
      if (v.startsWith("--") && v.includes("=")) continue; // inline form binds itself
      if (effective.has(v) && i + 1 < words.length && !bound.has(i + 1) &&
          words[i + 1].value !== "" && !words[i + 1].value.startsWith("-")) {
        bound.set(i + 1, i);
        i++; // the value rides with its flag
      }
    }
  }

  function findSubcommand(): number {
    for (let i = 1; i < words.length; i++) {
      if (bound.has(i)) continue;
      const v = words[i].value;
      if (v === "" || v.startsWith("-")) continue;
      if (subTbl !== undefined && subTbl.has(v)) return i;
    }
    return -1;
  }

  bind(baseFlags);
  let subIndex = findSubcommand();
  if (subIndex >= 0) {
    // The subcommand's own table extends the profile's: rebind once.
    const subFlags = profile?.subcommands?.[words[subIndex].value]?.valueFlags ?? [];
    bound.clear();
    bind(new Set([...baseFlags, ...subFlags]));
    subIndex = findSubcommand();
  }
  const effective = new Set(baseFlags);
  if (subIndex >= 0) {
    for (const f of profile?.subcommands?.[words[subIndex].value]?.valueFlags ?? []) effective.add(f);
  }

  // Emit chips in source order.
  const args: BashStageArg[] = [];
  args.push({ slice: command.slice(words[0].pos, words[0].end), role: "flag" });
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const v = w.value;
    const slice = command.slice(w.pos, w.end);
    if (v.startsWith("-") && v !== "-" && v !== "--") {
      if (v.startsWith("--") && v.includes("=")) {
        args.push({ slice, role: "flag" }); // inline --long=value
        continue;
      }
      if (bound.get(i + 1) === i) {
        // This flag's next token was bound in the prebind pass (the table
        // is certain): emit the pair in source order.
        args.push({ slice, role: "flag" });
        args.push({ slice: command.slice(words[i + 1].pos, words[i + 1].end), role: "value" });
        i++;
        continue;
      }
      // Flag pose claims nothing else when the table does not declare the
      // value: the next token stays threshold-independent, NOT a value.
      args.push({ slice, role: "flag" });
      continue;
    }
    if (bound.has(i)) continue; // rode with its flag above
    if (i === subIndex) { args.push({ slice, role: "subcommand" }); continue; }
    args.push({ slice, role: "positional" });
  }
  return { stageSlice: command.slice(stagePos, stageEnd), args };
}

interface PendingUnit {
  /** Key under which this unit's heredoc bodies are attributed: the plain
   *  statement index, or `<si>:r<row>` for a chain row. */
  owner: string;
  unit: BashSequenceUnit;
  rawStages: any[];
  lists: any[][];
  specs: HeredocSpec[];
}

/**
 * Build one statement's drawable unit (v1's stage/arrow machinery) from an
 * already-classified inner. Shared by the plain `diagram` path and the v3
 * chain path (whose operands are inner Command/Pipeline nodes of an
 * outerSpan statement). Returns null on any span the classifier cannot
 * swear to — the caller refuses that statement, never guesses.
 */
function prepareStatementUnit(command: string, st: any, classified: ClassifiedInner): PendingUnit | null {
  const { kind, negated, timed, rawStages, operators } = classified;
  for (const s of rawStages) {
    if (
      typeof s.pos !== "number" ||
      typeof s.end !== "number" ||
      s.pos < 0 ||
      s.end > command.length ||
      s.pos > s.end
    ) {
      return null;
    }
  }
  for (let i = 0; i + 1 < rawStages.length; i++) {
    if (rawStages[i].end > rawStages[i + 1].pos) return null;
  }
  if (rawStages[0].pos < st.pos || rawStages[rawStages.length - 1].end > st.end) return null;
  const stmtEnd = Math.min(st.end, command.length);
  const lists = attributeStatementRedirects(st, rawStages);
  const unit: BashSequenceUnit = {
    kind,
    negated,
    timed,
    leadingGap: command.slice(st.pos, rawStages[0].pos),
    stages: [],
    arrows: [],
    groupGap: command.slice(rawStages[rawStages.length - 1].end, stmtEnd),
    conditional: null,
  };
  for (let i = 0; i + 1 < rawStages.length; i++) {
    unit.arrows.push({
      operator: operators[i],
      gap: command.slice(rawStages[i].end, rawStages[i + 1].pos),
    });
  }
  const { specs, usable } = collectHeredocSpecs(lists);
  if (!usable) return null;
  return { owner: "", unit, rawStages, lists, specs };
}

/**
 * Try to draw a statement whose inner is `&&`/`||` as a CHAIN group (#162
 * criterion 2b): every operand must itself classify (Pipeline/Command), no
 * operand may carry a heredoc that would make the interleave inexact (the
 * global single-line guard below still applies), and every operator must be
 * a plain `&&` or `||`. Anything else returns null and the caller falls
 * back to the verbatim text group.
 */
function buildChainGroup(command: string, st: any): { chain: BashSequenceChainGroup; rows: PendingUnit[] } | null {
  const inner = st.command;
  if (inner === null || typeof inner !== "object" || inner.type !== "AndOr") return null;
  const opsIn = Array.isArray(inner.operators) ? inner.operators : [];
  const cmdsIn = Array.isArray(inner.commands) ? inner.commands : [];
  if (cmdsIn.length < 2 || opsIn.length !== cmdsIn.length - 1) return null;
  for (const op of opsIn) {
    if (op !== "&&" && op !== "||") return null;
  }
  if (typeof st.pos !== "number" || typeof st.end !== "number") return null;
  const stmtEnd = Math.min(st.end, command.length);
  const rows: BashSequenceUnit[] = [];
  const pends: PendingUnit[] = [];
  for (let oi = 0; oi < cmdsIn.length; oi++) {
    const op = cmdsIn[oi];
    if (op === null || typeof op !== "object") return null;
    const classified = classifyInner(op);
    if (classified === null) return null;
    const pen = prepareStatementUnit(command, op, classified);
    if (pen === null) return null;
    // The dependent's leading gap is the verbatim span between the previous
    // operand's end and its own first stage — it carries the operator text.
    pen.unit.conditional = oi > 0 ? (opsIn[oi - 1] as "&&" | "||") : null;
    pen.owner = `_chain_${oi}`;
    rows.push(pen.unit);
    pends.push(pen);
  }
  // A chain operand that carries a heredoc refuses the CHAIN (not the whole
  // script): the operand statement falls back to a verbatim text group and
  // its bodies ride verbatim, exactly as #160 drew it. Only rows that can
  // be built without carving may chain-draw; the global single-line guard
  // below stays in charge of everything a drawn row can carve.
  for (const pen of pends) {
    if (pen.specs.length > 0) return null;
  }
  // Subcommand a chain statement's own redirects onto its last row, exactly
  // as the plain path does for the last stage (rare, defensive).
  const statementRedirects = Array.isArray(st.redirects) ? st.redirects : [];
  for (const r of statementRedirects) pends[pends.length - 1].lists[pends[pends.length - 1].lists.length - 1].push(r);
  // Span sanity: operands ordered inside the statement, non-overlapping.
  for (let i = 0; i < cmdsIn.length; i++) {
    const op = cmdsIn[i];
    if (typeof op.pos !== "number" || typeof op.end !== "number" || op.pos < 0 || op.end > command.length) return null;
    if (i > 0 && cmdsIn[i - 1].end > op.pos) return null;
  }
  if ((cmdsIn[0].pos as number) < st.pos || cmdsIn[cmdsIn.length - 1].end > st.end) return null;
  // The last row's groupGap extends to the STATEMENT's end so the chain
  // covers its own span exactly (statement-level redirects were appended
  // above; their spans live inside [lastStageEnd, stmtEnd] by inspection).
  const lastPen = pends[pends.length - 1];
  const lastStageEnd = lastPen.rawStages[lastPen.rawStages.length - 1].end;
  lastPen.unit.groupGap = command.slice(lastStageEnd, stmtEnd);
  const chain: BashSequenceChainGroup = {
    kind: "chain",
    leadingGap: command.slice(st.pos, cmdsIn[0].pos),
    rows,
    operators: opsIn,
    separators: [],
  };
  for (let i = 0; i + 1 < cmdsIn.length; i++) {
    chain.separators.push(command.slice(cmdsIn[i].end, cmdsIn[i + 1].pos));
  }
  return { chain, rows: pends };
}

function buildSequenceDiagram(command: string): BashSequenceDiagram | null {
  if (typeof command !== "string" || command === "") return null;
  if (command.length > BASH_DIAGRAM_MAX_COMMAND) return null;
  let script: any;
  try {
    script = parse(command);
  } catch {
    return null;
  }
  if (script === null || typeof script !== "object") return null;
  if (Array.isArray(script.errors) && script.errors.length > 0) return null;
  // v1 owns the single statement; empties and comment-only scripts stay text.
  if (!Array.isArray(script.commands) || script.commands.length < 2) return null;
  const statements: any[] = script.commands;
  for (const st of statements) {
    if (st === null || typeof st !== "object") return null;
    // `&` runs concurrently: even the "these ran in order" claim would be
    // false, so any backgrounded statement voids the whole sequence (v1's
    // `a | b &` and `sleep 1 & true | false` stay text exactly as before).
    if (st.background === true) return null;
  }
  // Span sanity: statements in source order, non-overlapping, inside the
  // command.
  for (let i = 0; i < statements.length; i++) {
    const st = statements[i];
    if (
      typeof st.pos !== "number" ||
      typeof st.end !== "number" ||
      st.pos < 0 ||
      st.end > command.length ||
      st.pos > st.end
    ) {
      return null;
    }
    if (i > 0 && statements[i - 1].end > st.pos) return null;
  }
  const lastEnd = Math.min(statements[statements.length - 1].end, command.length);

  // Separators are verbatim inter-statement text: `;`, whitespace, newlines,
  // comments. A `&` here would be a background split the flag above missed —
  // refuse rather than claim order across it.
  const separators: string[] = [];
  for (let i = 0; i + 1 < statements.length; i++) {
    const sep = command.slice(statements[i].end, statements[i + 1].pos);
    if (sep.includes("&")) return null;
    separators.push(sep);
  }

  const groups: BashSequenceStatement[] = [];
  const pending: PendingUnit[] = [];
  const allSpecs: (HeredocSpec & { owner: string })[] = [];
  // A text group's heredoc bodies ride verbatim in the separators/trailing
  // gaps (no carve can attribute them inside a verbatim slice). That is
  // exact only while no diagram group carves: bodies serialize in global
  // operator order, so a carve alongside verbatim bodies could attribute
  // the wrong bytes to an endpoint while still reconstructing cleanly.
  let textGroupHeredocs = false;
  for (let si = 0; si < statements.length; si++) {
    const st = statements[si];
    // #162 v3 chain-split: a statement whose inner is AndOr draws as a CHAIN
    // when every operand classifies; otherwise it falls through to the
    // verbatim text group (with conditionalOf naming the operator set).
    const innerIsAndOr = st.command !== null && typeof st.command === "object" && st.command.type === "AndOr";
    let chained: { chain: BashSequenceChainGroup; rows: PendingUnit[] } | null = null;
    if (innerIsAndOr) {
      chained = buildChainGroup(command, st);
      if (chained !== null) {
        for (const r of chained.rows) {
          for (const spec of r.specs) allSpecs.push({ ...spec, owner: `${si}:${r.owner}` });
          r.owner = `${si}:${r.owner}`;
          pending.push(r);
        }
        groups.push({ kind: "chain", chain: chained.chain });
        continue;
      }
    }
    const classified = classifyInner(st.command);
    if (classified !== null) {
      const pen = prepareStatementUnit(command, st, classified);
      if (pen === null) return null;
      pen.owner = String(si);
      for (const spec of pen.specs) allSpecs.push({ ...spec, owner: pen.owner });
      pending.push(pen);
      groups.push({ kind: "diagram", unit: pen.unit });
    } else {
      // Not drawable as stages: keep the verbatim slice so the sequence
      // never lies by omission, and mark `&&`/`||` explicitly so a reader
      // can tell "ran unconditionally" from "ran only if...". A heredoc
      // hiding here is recorded, not refused: its bodies stay verbatim in
      // the gaps, exact while no diagram group carves (see above).
      if (subtreeHasHeredoc(st)) textGroupHeredocs = true;
      groups.push({
        kind: "text",
        slice: command.slice(st.pos, Math.min(st.end, command.length)),
        conditional: conditionalOf(st.command),
      });
    }
  }

  // Heredoc bodies serialize after the command line in redirect source
  // order, so a single global carve must account for every diagram body.
  // That carve is only valid when every operator sits on the LAST
  // statement's line: an operator on an earlier line has its bodies before
  // the last line (e.g. `cat <<EOF\nbody\nEOF\nc | d`), where the carve
  // would misattribute them. Refuse those scripts instead of guessing.
  // And refuse a carve alongside verbatim text-group bodies (see above):
  // with diagram bodies carving out of the shared trailing region, a text
  // group's bodies could interleave ambiguously.
  if (allSpecs.length > 0 && textGroupHeredocs) return null;
  for (const spec of allSpecs) {
    if (spec.redirectPos === null) return null;
    if (command.slice(spec.redirectPos, lastEnd).includes("\n")) return null;
  }
  // Specs arrive in statement order with in-statement source order, but sort
  // globally anyway: bodies serialize in operator order, period.
  allSpecs.sort((a, b) => (a.redirectPos ?? 0) - (b.redirectPos ?? 0));
  const trailed = buildTrailing(command, lastEnd, allSpecs);
  if (trailed === null) return null;
  const carveByOwner = new Map<string, HeredocCarve>();
  allSpecs.forEach((h, i) => {
    carveByOwner.set(h.owner + ":" + h.stage + ":" + h.index, trailed.carves[i]);
  });
  for (const p of pending) {
    const sub = new Map<string, HeredocCarve>();
    for (const s of p.specs) {
      const carve = carveByOwner.get(p.owner + ":" + s.stage + ":" + s.index);
      if (carve !== undefined) sub.set(s.stage + ":" + s.index, carve);
    }
    p.unit.stages = buildStageModels(command, p.rawStages, p.lists, sub);
  }

  return {
    kind: "sequence",
    leadingGap: command.slice(0, statements[0].pos),
    statements: groups,
    separators,
    trailing: trailed.trailing,
  };
}

const sequenceCache = new Map<string, BashSequenceDiagram | null>();

/**
 * Memoised v2 entry point: parse + sequence predicate + model build, once
 * per distinct command string. Returns null when the command renders as
 * text — including every single-statement command, which v1 owns. Same
 * bounded-cache, nulls-cached, no-session-state contract as v1.
 */
export function getBashSequenceDiagram(command: string): BashSequenceDiagram | null {
  if (sequenceCache.has(command)) return sequenceCache.get(command) ?? null;
  const built = buildSequenceDiagram(command);
  if (sequenceCache.size >= BASH_DIAGRAM_CACHE_LIMIT) {
    const oldest = sequenceCache.keys().next();
    if (!oldest.done) sequenceCache.delete(oldest.value);
  }
  sequenceCache.set(command, built);
  return built;
}

/** Test hook: drop all memoised sequence entries. */
export function clearBashSequenceCache(): void {
  sequenceCache.clear();
}

/**
 * Reproduce the command from the sequence model's slices. The v2 fidelity
 * invariant is `reconstructBashSequence(command,
 * getBashSequenceDiagram(command)) === command` for every non-null model:
 * drawn-stage slices plus arrow gaps plus per-unit group gaps, interleaved
 * with the verbatim separators and leading/trailing regions that belong to
 * no node. Comments between statements survive inside the separators.
 */
export function reconstructBashSequence(command: string, model: BashSequenceDiagram): string {
  void command;
  let out = model.leadingGap;
  for (let i = 0; i < model.statements.length; i++) {
    const group = model.statements[i];
    if (group.kind === "diagram") {
      out += group.unit.leadingGap;
      for (let k = 0; k < group.unit.stages.length; k++) {
        out += group.unit.stages[k].slice;
        if (k < group.unit.arrows.length) out += group.unit.arrows[k].gap;
      }
      out += group.unit.groupGap;
    } else if (group.kind === "chain") {
      out += group.chain.leadingGap;
      for (let r = 0; r < group.chain.rows.length; r++) {
        const row = group.chain.rows[r];
        out += row.leadingGap;
        for (let k = 0; k < row.stages.length; k++) {
          out += row.stages[k].slice;
          if (k < row.arrows.length) out += row.arrows[k].gap;
        }
        out += row.groupGap;
        if (r < group.chain.separators.length) out += group.chain.separators[r];
      }
    } else {
      out += group.slice;
    }
    if (i < model.separators.length) out += model.separators[i];
  }
  for (const t of model.trailing) {
    if (t.kind === "gap") out += t.text;
    else out += t.body + t.delimiterLine + t.newline;
  }
  return out;
}

/** True exactly when the sequence model reproduces the command byte for byte. */
export function verifyBashSequence(command: string, model: BashSequenceDiagram): boolean {
  return reconstructBashSequence(command, model) === command;
}

/**
 * Attribute per-stage exit codes from `block.meta.pipeStages` onto a COPY of
 * the sequence (the cached base is never mutated: meta differs per row).
 *
 * Honest ONLY on the FINAL statement group, and only through v1's matcher
 * (length matches the drawn stages AND every entry carries a non-empty
 * name): PIPESTATUS holds the LAST pipeline only, and bash-guard names
 * `finalNames` exactly when the script is a flat sequence ending in that
 * pipeline (finalPipelineNaming in plugins/bash-guard.ts) — a compound
 * script otherwise carries bare {exitCode} entries plus the "final pipeline
 * only" note, which this hides. Every non-final group, and any final TEXT
 * group, shows no codes: earlier lines were never captured, so showing none
 * is the only non-guess. A conditional (`&&`/`||`) anywhere in the script
 * disqualifies naming host-side, so conditional scripts never show codes.
 */
export function attributeSequenceStages(
  model: BashSequenceDiagram,
  pipeStages: unknown,
): BashSequenceDiagram {
  const statements = model.statements.map((group, i) => {
    // Codes only on the FINAL plain-diagram group. A final CHAIN group shows
    // none either: a conditional script disqualifies naming host-side, so
    // there is nothing to attribute without guessing (#162 keeps v2's
    // guarantee — only attributable groups ever show codes).
    if (group.kind !== "diagram" || i !== model.statements.length - 1) return group;
    const coded = attributePipeStages(
      {
        kind: group.unit.kind,
        negated: group.unit.negated,
        timed: group.unit.timed,
        leadingGap: group.unit.leadingGap,
        stages: group.unit.stages,
        arrows: group.unit.arrows,
        trailing: [],
      },
      pipeStages,
    );
    return {
      kind: "diagram" as const,
      unit: {
        kind: coded.kind,
        negated: coded.negated,
        timed: coded.timed,
        leadingGap: coded.leadingGap,
        stages: coded.stages,
        arrows: coded.arrows,
        groupGap: group.unit.groupGap,
        conditional: group.unit.conditional,
      },
    };
  });
  return {
    kind: model.kind,
    leadingGap: model.leadingGap,
    statements,
    separators: model.separators,
    trailing: model.trailing,
  };
}

// ---- #164: Graph / Command tabs on the expanded bash row. ----
//
// THE TAB SEAM, and the ONLY one. BashRow calls this ONCE per render and
// hands the SAME object to both the tab strip and the tab panel, so the two
// can never disagree about whether tabs exist or which tab leads. Two
// hand-rolled answers to those questions is the defect class #162's reviews
// kept finding (the unit model right, the screen wrong); a single builder is
// the fix, same as sequenceUnitDiagramModel.
//
// `commandText` is the ORIGINAL command string, campo a campo — never a
// re-serialisation of the model, never `reconstruct*` output, never a
// normalised form. The model slices plus gaps DO reproduce the command byte
// for byte when drawable, which is exactly why reading the Command tab off
// the model would look right while being the wrong guarantee: the day the
// model refuses a command (background jobs, unparseable input, heredoc
// chains) there IS no model to read from, and a tab that sources its text
// from two different places depending on drawability is how a diagram lies.
// The Command tab therefore carries no model of its own; the view renders
// this field and nothing else.
//
// Undrawable commands show NO tabs at all (`showTabs` false): the Command
// text renders directly, exactly as the row does today. A Graph tab with
// nothing to draw — or with an apology where the diagram should be — is an
// empty tab that looks broken, and the ticket forbids it. The rewrite pair
// (guard rewrote the command: "wrote" plus "ran") likewise shows no tabs:
// two texts and a graph do not fit a two-tab strip, and both texts stay
// visible, as today.

/** One tab of the expanded bash row. */
export type BashTabId = "graph" | "command";

export interface BashTabModel {
  /** Whether any diagram model exists for this command (v1 or v2). */
  drawable: boolean;
  /** Whether to render the tab strip. False renders the command text with
   *  no tabs — never an empty Graph tab. */
  showTabs: boolean;
  /** The selected tab before the user clicks. "graph" exactly when drawable. */
  defaultTab: BashTabId;
  /** The Command tab's text: the original command string, verbatim. Null
   *  only when the call carried no command at all. */
  commandText: string | null;
}

/**
 * THE tab seam: resolve the strip, the default, and the verbatim text in
 * one call. `rewritten` is whether the row shows the guard rewrite pair
 * (two command texts); a pair shows no tabs. Pure: no module state, so two
 * rows resolve independently — per-row tab state lives in each BashRow's
 * own useState, never here.
 */
export function resolveBashTab(command: string | undefined, rewritten: boolean): BashTabModel {
  const commandText = typeof command === "string" ? command : null;
  if (commandText === null || rewritten === true) {
    return { drawable: false, showTabs: false, defaultTab: "command", commandText };
  }
  const drawable = getBashDiagram(commandText) !== null || getBashSequenceDiagram(commandText) !== null;
  return drawable
    ? { drawable: true, showTabs: true, defaultTab: "graph", commandText }
    : { drawable: false, showTabs: false, defaultTab: "command", commandText };
}
