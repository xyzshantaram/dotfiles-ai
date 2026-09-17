/**
 * bash-diagram — a read-only dataflow diagram model for bash tool-call rows.
 *
 * Ticket #149. SCOPE: a single, non-backgrounded statement that is either a
 * multi-stage pipeline of plain commands or one command carrying redirects.
 * Everything else (control flow, && chains, subshells, command substitution,
 * backgrounding) returns null and the row renders exactly as it does today.
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

  const inner = statement.command;
  if (inner === null || typeof inner !== "object") return null;

  let kind: "pipeline" | "command";
  let negated = false;
  let timed = false;
  let rawStages: any[];
  let operators: any[];
  if (inner.type === "Pipeline") {
    if (!Array.isArray(inner.commands) || inner.commands.length === 0) return null;
    // A single-stage pipeline (`! ls`, `time ls`) unwraps to the command
    // path below: without redirects it stays text, with redirects it draws
    // carrying its badges. Only multi-stage pipelines draw as pipelines.
    if (inner.commands.length === 1) {
      const only = inner.commands[0];
      if (only === null || typeof only !== "object" || only.type !== "Command") return null;
      kind = "command";
      negated = inner.negated === true;
      timed = inner.time === true;
      rawStages = [only];
      operators = [];
    } else {
      if (!inner.commands.every((s: any) => s !== null && typeof s === "object" && s.type === "Command")) {
        return null;
      }
      kind = "pipeline";
      negated = inner.negated === true;
      timed = inner.time === true;
      rawStages = inner.commands;
      operators = Array.isArray(inner.operators) ? inner.operators : [];
      if (operators.length !== rawStages.length - 1) return null;
      for (const op of operators) {
        if (op !== "|" && op !== "|&") return null;
      }
    }
  } else if (inner.type === "Command") {
    kind = "command";
    rawStages = [inner];
    operators = [];
  } else {
    // AndOr, Subshell, BraceGroup, If, For, While, Case, Function, Coproc,
    // TestCommand, ArithmeticCommand, ... — scope says control flow falls
    // back to text, never a partial diagram of one branch.
    return null;
  }

  // Statement-level redirects are vanishingly rare for Command/Pipeline
  // inners (probes always found them on the inner node), but attribute them
  // defensively: the single stage, or the last pipeline stage.
  const statementRedirects: any[] =
    Array.isArray(statement.redirects) ? statement.redirects : [];
  const stageRedirectLists: any[][] = rawStages.map((s) =>
    Array.isArray(s.redirects) ? s.redirects.slice() : [],
  );
  for (const r of statementRedirects) {
    stageRedirectLists[stageRedirectLists.length - 1].push(r);
  }

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
  const heredocRedirects: { operator: string; delimiter: string; stage: number; index: number }[] = [];
  let heredocsUsable = true;
  stageRedirectLists.forEach((list, stage) => {
    list.forEach((r, index) => {
      if (r === null || typeof r !== "object" || typeof r.operator !== "string") return;
      if (!isHeredocOperator(r.operator)) return;
      // A heredoc operator with no usable delimiter target cannot have its
      // body attributed, so the whole diagram degrades to text.
      if (r.target === null || typeof r.target !== "object" || typeof r.target.value !== "string") {
        heredocsUsable = false;
        return;
      }
      heredocRedirects.push({ operator: r.operator, delimiter: r.target.value, stage, index });
    });
  });
  if (!heredocsUsable) return null;
  // Sort into source order for body attribution (bodies serialize in the
  // order the << operators appear). Redirect lists are already ordered, and
  // stages are ordered, so this is a no-op in practice — belt and braces.
  heredocRedirects.sort((a, b) => {
    const ra = stageRedirectLists[a.stage][a.index];
    const rb = stageRedirectLists[b.stage][b.index];
    return (typeof ra.pos === "number" ? ra.pos : 0) - (typeof rb.pos === "number" ? rb.pos : 0);
  });

  const trailing: BashDiagramTrailing[] = [];
  const heredocByKey = new Map<string, HeredocCarve>();
  if (heredocRedirects.length > 0) {
    const carved = carveHeredocs(
      command,
      statementEnd,
      heredocRedirects.map((h) => ({ operator: h.operator, delimiter: h.delimiter })),
    );
    if (carved === null || carved.length !== heredocRedirects.length) return null;
    // Partition the trailing region: pre gap, then interleaved bodies.
    const firstNewline = command.indexOf("\n", statementEnd);
    let cursor = firstNewline + 1;
    trailing.push({ kind: "gap", text: command.slice(statementEnd, cursor) });
    heredocRedirects.forEach((h, i) => {
      const c = carved[i];
      trailing.push({ kind: "heredoc", body: c.body, delimiterLine: c.delimiterLine, newline: c.newline });
      heredocByKey.set(h.stage + ":" + h.index, c);
      cursor += c.body.length + c.delimiterLine.length + c.newline.length;
    });
    trailing.push({ kind: "gap", text: command.slice(cursor) });
  } else {
    trailing.push({ kind: "gap", text: command.slice(statementEnd) });
  }

  const stages: BashDiagramStage[] = rawStages.map((s, stageIdx) => {
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
    };
  });

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
