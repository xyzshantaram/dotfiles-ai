// Data-node schema for the desktop wizard toolkit.
// This file has no imports, so desktop/ can move to another repo.
// Builders make one node each. Validation returns error strings.

export type TreeState = "done" | "todo" | "current" | "skipped";

export const TREE_STATES: TreeState[] = ["done", "todo", "current", "skipped"];

export interface OptionWithHint {
  value: string;
  label?: string;
  hint?: string;
}

export type WizardOption = string | OptionWithHint;

export interface MenuNode {
  kind: "menu";
  label: string;
  options: WizardOption[];
  name?: string;
  error?: string;
}

export interface TreeRow {
  text: string;
  state: TreeState;
}

export interface TreeNode {
  kind: "tree";
  label: string;
  rows: TreeRow[];
  error?: string;
}

export interface ProgressNode {
  kind: "progress";
  label: string;
  assigned: number;
  skipped: number;
  left: number;
  error?: string;
}

export interface RadioNode {
  kind: "radio";
  label: string;
  name: string;
  options: WizardOption[];
  picked?: string;
  hint?: string;
  error?: string;
}

export interface CheckboxNode {
  kind: "checkbox";
  label: string;
  name: string;
  options: WizardOption[];
  ticked: string[];
  // Show bulk tick controls when true.
  bulk?: boolean;
  error?: string;
}

export interface TextEntryNode {
  kind: "text";
  label: string;
  name: string;
  value?: string;
  hint?: string;
  run?: ActionRun;
  error?: string;
}

export interface NumberEntryNode {
  kind: "number";
  label: string;
  name: string;
  value?: number;
  error?: string;
}

export interface TextareaNode {
  kind: "textarea";
  label: string;
  name: string;
  value?: string;
  rows?: number;
  error?: string;
}

export interface ButtonItem {
  label: string;
  action: string;
  primary?: boolean;
}

export interface MarkdownNode {
  kind: "markdown";
  text: string;
  error?: string;
}

export interface StagesNode {
  kind: "stages";
  label: string;
  stages: string[];
  current: number;
  error?: string;
}

export interface SpoilerNode {
  kind: "spoiler";
  label: string;
  nodes: Node[];
  error?: string;
}

export interface TabItem {
  label: string;
  nodes: Node[];
}

export interface TabsNode {
  kind: "tabs";
  tabs: TabItem[];
  selected?: number;
  error?: string;
}

export type ActionRun = "now" | "onConfirm";

export interface ActionNode {
  kind: "action";
  label: string;
  id: string;
  command: string[];
  run?: ActionRun;
  live?: boolean;
  error?: string;
  confirm?: string;
  output?: string;
}

// A check field posts the row index as its value. An unchecked box
// posts nothing, so a fixed value would shift later rows when the app
// zips arrays by index. The app reads it by building a set from the
// posted values, then testing the row index against that set.
export interface RepeatingField {
  kind: "text" | "number" | "check";
  label: string;
  name: string;
}

export interface RepeatingNode {
  kind: "repeating";
  label: string;
  name: string;
  fields: RepeatingField[];
  rows?: Record<string, string>[];
  error?: string;
}

export interface CopyableNode {
  kind: "copyable";
  label: string;
  name: string;
  text: string;
  // Fixed width text, such as an aligned report. Renders monospace.
  mono?: boolean;
  // Visible line count. Defaults to 4, which suits a short message.
  rows?: number;
  error?: string;
}

export interface AnswersEntry {
  name: string;
  values: string[];
}

export interface AnswersNode {
  kind: "answers";
  label: string;
  entries: AnswersEntry[];
  error?: string;
}

export interface TableColumn {
  heading: string;
  align?: "left" | "right" | "center";
}

export interface TableNode {
  kind: "table";
  label: string;
  columns: TableColumn[];
  rows: string[][];
}

// Hold one app component mount point.
// Carry the element id plus optional data.
export interface MountNode {
  kind: "mount";
  id: string;
  label?: string;
  data?: unknown;
}

export type Node =
  | MenuNode
  | TreeNode
  | ProgressNode
  | RadioNode
  | CheckboxNode
  | TextEntryNode
  | NumberEntryNode
  | TextareaNode
  | MarkdownNode
  | StagesNode
  | SpoilerNode
  | TabsNode
  | ActionNode
  | AnswersNode
  | TableNode
  | RepeatingNode
  | CopyableNode
  | MountNode;

// A step condition. Takes the answers map and returns true when the
// step applies. A step with no condition always applies.
export type StepWhen = (answers: Map<string, string[]>) => boolean;

export interface Step {
  id: string;
  title: string;
  nodes: Node[];
  note?: string;
  when?: StepWhen;
  onEnter?: StepOnEnter;
  nav?: StepNav;
  onLeave?: StepOnLeave;
}

// Session context for one browser. The toolkit passes one per request.
export interface WizardCtx {
  sessionId: string;
}

// One saved app session for the footer strip. id names the session.
// label shows one short line. at holds an ISO timestamp.
export interface DraftEntry {
  id: string;
  label: string;
  at: string;
  hint?: string;
}

// Arrival hook for one step. It takes the answers map plus the wizard
// context. It may return a promise. The wizard runs it once when a
// move lands on the step, before the step renders.
export type StepOnEnter = (
  answers: Map<string, string[]>,
  ctx: WizardCtx,
) => void | Promise<void>;

// Name one direction that leaves a step.
export type LeaveDir = "back" | "next" | "done" | "goto";

// Hold errors or a jump from one nav handler.
export interface NavOutcome {
  errors?: string[];
  goto?: string;
}

// Run one nav button handler. Take the answers map plus the posted
// fields plus the wizard context.
export type NavHandler = (
  answers: Map<string, string[]>,
  fields: Record<string, string[]>,
  ctx: WizardCtx,
) => void | NavOutcome | Promise<void | NavOutcome>;

// Name one forward button label plus its handler.
export interface NavButton {
  label: string;
  run?: NavHandler;
}

// Name one custom action plus its handler.
export interface NavAction {
  id: string;
  label: string;
  run?: NavHandler;
}

// Declare one step footer bar. Back takes no handler, because Back
// can never be blocked. The bar holds one forward button at most.
export interface StepNav {
  back?: boolean | string;
  next?: string | NavButton;
  done?: string | NavButton;
  goto?: { step: string; label: string; run?: NavHandler };
  actions?: NavAction[];
}

// Run one leave hook before a move. Take the direction plus the
// answers map plus the wizard context.
export type StepOnLeave = (
  dir: LeaveDir,
  answers: Map<string, string[]>,
  ctx: WizardCtx,
) => void | Promise<void>;

// True when value is a plain object.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// True when value is text with at least one non-space char.
function isTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// An input label may be the empty string, which means the node draws no
// heading of its own. A screen that asks one question in its own step
// heading would otherwise state that question twice. Whitespace only is
// still a mistake rather than an intent, so it stays an error.
function isLabel(value: unknown): value is string {
  return typeof value === "string" && (value === "" || value.trim().length > 0);
}

// Value of a plain string or {value, hint} option.
export function optionValue(option: WizardOption): string {
  return typeof option === "string" ? option : option.value;
}

// Drop keys whose value is undefined, so builders emit lean nodes.
function omitUndefined<T extends object>(node: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

// True when value is a plain label or a {value, hint} pair.
function isOptionItem(value: unknown): value is WizardOption {
  if (isTitle(value)) return true;
  if (!isRecord(value)) return false;
  if (!isTitle(value.value)) return false;
  return value.hint === undefined || typeof value.hint === "string";
}

// True when value is a list with at least one plain or hinted option.
function isOptions(value: unknown): value is WizardOption[] {
  return Array.isArray(value) && value.length > 0 && value.every(isOptionItem);
}

// True when value is a list with at least one non-blank string.
function isOptionList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isTitle(item))
  );
}

// True when value is a whole number at zero or above.
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// True when value is a valid run mode.
function isValidRun(value: unknown): value is ActionRun {
  return value === "now" || value === "onConfirm";
}

// Shared prologue for menu, radio, plus checkbox. Checks label, then
// the required name when asked, then the options list. ok is false
// when the options list fails, so callers can stop before option checks.
function validateOptionsPrologue(
  node: { label: string; name?: string; options: WizardOption[] },
  tag: string,
  requiredName: boolean,
): { errors: string[]; ok: boolean } {
  const errors: string[] = [];
  if (!isLabel(node.label)) {
    errors.push(tag + ": label must be non-blank, or empty for no heading");
  }
  if (requiredName) {
    if (!isTitle(node.name)) errors.push(tag + ": name must be non-blank");
  } else if (node.name !== undefined && !isTitle(node.name)) {
    errors.push(tag + ": name must be non-blank when present");
  }
  const ok = isOptions(node.options);
  if (!ok) errors.push(tag + ": options must hold at least one label");
  return { errors, ok };
}

function validateMenu(node: MenuNode, tag: string): string[] {
  return validateOptionsPrologue(node, tag, false).errors;
}

function validateTree(node: TreeNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
  if (!Array.isArray(node.rows) || node.rows.length === 0) {
    errors.push(tag + ": rows must hold at least one row");
    return errors;
  }
  node.rows.forEach((row, i) => {
    if (!isRecord(row) || !isTitle(row.text)) {
      errors.push(tag + ": row " + i + " must have text");
    }
    if (!isRecord(row) || !TREE_STATES.includes(row.state as TreeState)) {
      errors.push(
        tag +
          ": row " +
          i +
          " state must be done, todo, " +
          "current, or skipped",
      );
    }
  });
  return errors;
}

function validateProgress(node: ProgressNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
  if (!isCount(node.assigned)) {
    errors.push(tag + ": assigned must be a whole number at zero or above");
  }
  if (!isCount(node.skipped)) {
    errors.push(tag + ": skipped must be a whole number at zero or above");
  }
  if (!isCount(node.left)) {
    errors.push(tag + ": left must be a whole number at zero or above");
  }
  return errors;
}

function validateRadio(node: RadioNode, tag: string): string[] {
  const { errors, ok } = validateOptionsPrologue(node, tag, true);
  if (!ok) return errors;
  if (node.hint !== undefined && typeof node.hint !== "string") {
    errors.push(tag + ": hint must be text");
  }
  if (
    node.picked !== undefined &&
    !node.options.some((option) => optionValue(option) === node.picked)
  ) {
    errors.push(tag + ": picked must be one of the options");
  }
  return errors;
}

function validateCheckbox(node: CheckboxNode, tag: string): string[] {
  const { errors, ok } = validateOptionsPrologue(node, tag, true);
  if (node.bulk !== undefined && typeof node.bulk !== "boolean") {
    errors.push(tag + ": bulk must be true or false");
  }
  if (!ok) return errors;
  if (!Array.isArray(node.ticked)) {
    errors.push(tag + ": ticked must be a list");
    return errors;
  }
  node.ticked.forEach((item) => {
    if (!node.options.some((option) => optionValue(option) === item)) {
      errors.push(tag + ": ticked item " + item + " is not an option");
    }
  });
  return errors;
}

function validateTextEntry(node: TextEntryNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isLabel(node.label)) {
    errors.push(tag + ": label must be non-blank, or empty for no heading");
  }
  if (!isTitle(node.name)) errors.push(tag + ": name must be non-blank");
  if (node.value !== undefined && typeof node.value !== "string") {
    errors.push(tag + ": value must be text");
  }
  if (node.hint !== undefined && typeof node.hint !== "string") {
    errors.push(tag + ": hint must be text");
  }
  if (node.run !== undefined && !isValidRun(node.run)) {
    errors.push(tag + ": run must be now or onConfirm");
  }
  return errors;
}

function validateNumberEntry(node: NumberEntryNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isLabel(node.label)) {
    errors.push(tag + ": label must be non-blank, or empty for no heading");
  }
  if (!isTitle(node.name)) errors.push(tag + ": name must be non-blank");
  if (
    node.value !== undefined &&
    (typeof node.value !== "number" || !Number.isFinite(node.value))
  ) {
    errors.push(tag + ": value must be a finite number");
  }
  return errors;
}

function validateTextarea(node: TextareaNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isLabel(node.label)) {
    errors.push(tag + ": label must be non-blank, or empty for no heading");
  }
  if (!isTitle(node.name)) errors.push(tag + ": name must be non-blank");
  if (node.value !== undefined && typeof node.value !== "string") {
    errors.push(tag + ": value must be text");
  }
  if (
    node.rows !== undefined &&
    (!Number.isInteger(node.rows) || node.rows <= 0)
  ) {
    errors.push(tag + ": rows must be a positive whole number");
  }
  return errors;
}

function validateMarkdown(node: MarkdownNode, tag: string): string[] {
  if (!isTitle(node.text)) return [tag + ": text must be non-blank"];
  return [];
}

function validateAction(node: ActionNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
  if (!isTitle(node.id)) errors.push(tag + ": id must be non-blank");
  if (!isOptionList(node.command)) {
    errors.push(tag + ": command must hold at least one part");
  } else {
    let badMarker = false;
    for (const entry of node.command) {
      const markers = entry.match(/\{([^{}]*)\}/g) ?? [];
      for (const marker of markers) {
        const inner = marker.slice(1, -1);
        if (inner.trim().length === 0) {
          errors.push(tag + ": command marker must name a field");
          badMarker = true;
          break;
        }
      }
      if (badMarker) break;
    }
  }
  if (node.confirm !== undefined && !isTitle(node.confirm)) {
    errors.push(tag + ": confirm must be a non-blank string");
  }
  if (node.run !== undefined && !isValidRun(node.run)) {
    errors.push(tag + ": run must be now or onConfirm");
  }
  if (node.live !== undefined && typeof node.live !== "boolean") {
    errors.push(tag + ": live must be true or false");
  }
  return errors;
}

function validateAnswers(node: AnswersNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
  if (!Array.isArray(node.entries) || node.entries.length === 0) {
    errors.push(tag + ": entries must hold at least one entry");
    return errors;
  }
  node.entries.forEach((entry, i) => {
    if (!isRecord(entry) || !isTitle(entry.name)) {
      errors.push(tag + ": entry " + i + " must have a name");
    }
    if (
      !isRecord(entry) ||
      !Array.isArray(entry.values) ||
      !entry.values.every((value) => typeof value === "string")
    ) {
      errors.push(tag + ": entry " + i + " values must be a text list");
    }
  });
  return errors;
}

function validateTable(node: TableNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
  if (!Array.isArray(node.columns) || node.columns.length === 0) {
    errors.push(tag + ": columns must hold at least one entry");
    return errors;
  }
  node.columns.forEach((column, i) => {
    if (!isRecord(column) || !isTitle(column.heading)) {
      errors.push(tag + ": column " + i + " must have a heading");
    }
  });
  if (!Array.isArray(node.rows)) {
    errors.push(tag + ": rows must be a list of text lists");
    return errors;
  }
  node.rows.forEach((row, i) => {
    if (
      !Array.isArray(row) ||
      !row.every((cell) => typeof cell === "string") ||
      row.length !== node.columns.length
    ) {
      errors.push(tag + ": row " + i + " must hold one cell per column");
    }
  });
  return errors;
}

// Check one mount node. Name mount in every error.
// Require a non-blank id. Require a non-blank label when present.
function validateMount(node: MountNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isTitle(node.id)) errors.push(tag + ": id must be non-blank");
  if (node.label !== undefined && !isTitle(node.label)) {
    errors.push(tag + ": label must be non-blank when present");
  }
  if (node.data !== undefined) {
    try {
      const text = JSON.stringify(node.data);
      if (text === undefined) errors.push(tag + ": data must survive JSON.stringify");
    } catch {
      errors.push(tag + ": data must survive JSON.stringify");
    }
  }
  return errors;
}

function validateStages(node: StagesNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
  if (
    !Array.isArray(node.stages) ||
    node.stages.length < 2 ||
    !node.stages.every(isTitle)
  ) {
    errors.push(tag + ": stages must hold at least two names");
    return errors;
  }
  if (
    !Number.isInteger(node.current) ||
    node.current < 0 ||
    node.current >= node.stages.length
  ) {
    errors.push(tag + ": current must point inside the stages list");
  }
  return errors;
}

function validateSpoiler(
  node: SpoilerNode,
  tag: string,
  path: string,
): string[] {
  const errors: string[] = [];
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
  if (!Array.isArray(node.nodes) || node.nodes.length === 0) {
    errors.push(tag + ": nodes must hold at least one child");
    return errors;
  }
  node.nodes.forEach((child, j) => {
    errors.push(...validateNodeAt(child, path + ">" + j));
  });
  return errors;
}

function validateTabs(node: TabsNode, tag: string, path: string): string[] {
  const errors: string[] = [];
  if (!Array.isArray(node.tabs) || node.tabs.length === 0) {
    errors.push(tag + ": tabs must hold at least one tab");
    return errors;
  }
  if (node.selected !== undefined) {
    if (
      !Number.isInteger(node.selected) ||
      node.selected < 0 ||
      node.selected >= node.tabs.length
    ) {
      errors.push(
        tag + ": selected " + String(node.selected) +
          " must point inside the tabs list",
      );
    }
  }
  node.tabs.forEach((tab, j) => {
    const tabTag = tag + " tab " + j;
    if (!isRecord(tab) || !isTitle(tab.label)) {
      errors.push(tabTag + ": label must be non-blank");
    }
    const kids: unknown = isRecord(tab) ? tab.nodes : undefined;
    if (!Array.isArray(kids) || kids.length === 0) {
      errors.push(tabTag + ": nodes must hold at least one child");
      return;
    }
    kids.forEach((child: unknown, k: number) => {
      errors.push(...validateNodeAt(child, path + ">" + j + ":" + k));
    });
  });
  return errors;
}

// Check one node. Return error strings. Never throw.
function validateNodeAt(node: unknown, path: string): string[] {
  if (!isRecord(node) || typeof node.kind !== "string") {
    return [path + " must be an object with a kind string"];
  }
  const tag = path + " (" + node.kind + ")";
  const item = node as unknown;
  switch (node.kind) {
    case "menu":
      return validateMenu(item as MenuNode, tag);
    case "tree":
      return validateTree(item as TreeNode, tag);
    case "progress":
      return validateProgress(item as ProgressNode, tag);
    case "radio":
      return validateRadio(item as RadioNode, tag);
    case "checkbox":
      return validateCheckbox(item as CheckboxNode, tag);
    case "text":
      return validateTextEntry(item as TextEntryNode, tag);
    case "number":
      return validateNumberEntry(item as NumberEntryNode, tag);
    case "textarea":
      return validateTextarea(item as TextareaNode, tag);
    case "markdown":
      return validateMarkdown(item as MarkdownNode, tag);
    case "stages":
      return validateStages(item as StagesNode, tag);
    case "spoiler":
      return validateSpoiler(item as SpoilerNode, tag, path);
    case "tabs":
      return validateTabs(item as TabsNode, tag, path);
    case "action":
      return validateAction(item as ActionNode, tag);
    case "answers":
      return validateAnswers(item as AnswersNode, tag);
    case "table":
      return validateTable(item as TableNode, tag);
    case "repeating":
      return validateRepeating(item as RepeatingNode, tag);
    case "copyable":
      return validateCopyable(item as CopyableNode, tag);
    case "mount":
      return validateMount(item as MountNode, tag);
    default:
      return [path + " has unknown kind " + node.kind];
  }
}

function validateRepeating(node: RepeatingNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
  if (!isTitle(node.name)) errors.push(tag + ": name must be non-blank");
  if (!Array.isArray(node.fields) || node.fields.length === 0) {
    errors.push(tag + ": fields must hold at least one entry");
    return errors;
  }
  for (const field of node.fields) {
    const at = tag + " field " + String(field?.name);
    if (
      !isRecord(field) ||
      (field.kind !== "text" && field.kind !== "number" &&
        field.kind !== "check")
    ) {
      errors.push(at + ": kind must be text, number, or check");
      continue;
    }
    if (!isTitle(field.label)) errors.push(at + ": label must be non-blank");
    if (!isTitle(field.name)) errors.push(at + ": name must be non-blank");
  }
  if (node.rows !== undefined) {
    if (!Array.isArray(node.rows)) {
      errors.push(tag + ": rows must be a list of records");
      return errors;
    }
    const names = new Set(node.fields.filter(isRecord).map((field) => field.name));
    node.rows.forEach((row, i) => {
      const at = tag + " row " + i;
      if (!isRecord(row)) {
        errors.push(at + ": row must be an object");
        return;
      }
      for (const [key, value] of Object.entries(row)) {
        if (!names.has(key)) {
          errors.push(at + ": names unknown field " + key);
        } else if (typeof value !== "string") {
          errors.push(at + ": field " + key + " must be text");
        }
      }
    });
  }
  return errors;
}

function validateCopyable(node: CopyableNode, tag: string): string[] {
  const errors: string[] = [];
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
  if (!isTitle(node.name)) errors.push(tag + ": name must be non-blank");
  if (typeof node.text !== "string") errors.push(tag + ": text must be text");
  if (node.mono !== undefined && typeof node.mono !== "boolean") {
    errors.push(tag + ": mono must be true or false");
  }
  if (node.rows !== undefined && (typeof node.rows !== "number" || node.rows < 1)) {
    errors.push(tag + ": rows must be a positive number");
  }
  return errors;
}

// True when the step applies to these answers. A missing condition
// always applies. A throwing condition also applies, so a broken
// predicate never hides a screen. Never throws.
export function stepApplies(
  step: Step,
  answers: Map<string, string[]>,
): boolean {
  if (typeof step.when !== "function") return true;
  try {
    return step.when(answers) !== false;
  } catch {
    return true;
  }
}

// Check one forward button. A string needs non-blank text. An
// object needs a non-blank label plus a function run when set. The
// goto form also needs a non-blank step. Never throws.
function validateNavForward(
  value: unknown,
  tag: string,
  name: string,
  needsStep: boolean,
): string[] {
  if (value === undefined) return [];
  if (isTitle(value)) return [];
  if (!isRecord(value)) {
    return [tag + ": " + name + " must be a label or an object"];
  }
  const at = tag + ": " + name;
  const errors: string[] = [];
  const item = value as { label?: unknown; run?: unknown; step?: unknown };
  if (!isTitle(item.label)) errors.push(at + " label must be non-blank");
  if (item.run !== undefined && typeof item.run !== "function") {
    errors.push(at + " run must be a function");
  }
  if (needsStep && !isTitle(item.step)) {
    errors.push(at + " step must be non-blank");
  }
  return errors;
}

// Check the custom action list. Each entry needs a non-blank id plus
// a non-blank label plus a function run when set. Ids stay unique.
function validateNavActions(value: unknown, tag: string): string[] {
  if (!Array.isArray(value)) return [tag + ": actions must be a list"];
  const errors: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, i) => {
    const at = tag + ": action " + i;
    if (!isRecord(entry)) {
      errors.push(at + " must be an object");
      return;
    }
    const item = entry as { id?: unknown; label?: unknown; run?: unknown };
    if (!isTitle(item.id)) {
      errors.push(at + " id must be non-blank");
    } else {
      if (seen.has(item.id)) errors.push(at + " id " + item.id + " repeats");
      seen.add(item.id);
    }
    if (!isTitle(item.label)) errors.push(at + " label must be non-blank");
    if (item.run !== undefined && typeof item.run !== "function") {
      errors.push(at + " run must be a function");
    }
  });
  return errors;
}

// Check one step footer bar. Every error names the tag nav.
function validateStepNav(nav: unknown): string[] {
  const tag = "nav";
  if (!isRecord(nav)) return [tag + ": nav must be an object"];
  const errors: string[] = [];
  const item = nav as {
    back?: unknown;
    next?: unknown;
    done?: unknown;
    goto?: unknown;
    actions?: unknown;
  };
  if (
    item.back !== undefined &&
    typeof item.back !== "boolean" &&
    !isTitle(item.back)
  ) {
    errors.push(tag + ": back must be a boolean or a non-blank label");
  }
  errors.push(...validateNavForward(item.next, tag, "next", false));
  errors.push(...validateNavForward(item.done, tag, "done", false));
  errors.push(...validateNavForward(item.goto, tag, "goto", true));
  const forward = [item.next, item.done, item.goto].filter(
    (entry) => entry !== undefined,
  );
  if (forward.length > 1) {
    errors.push(tag + ": only one of next, done, or goto may be present");
  }
  if (item.actions !== undefined) {
    errors.push(...validateNavActions(item.actions, tag));
  }
  return errors;
}

// Check a full step. Return error strings. Never throw.
export function validateStep(step: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(step)) return ["step must be an object"];
  if (!isTitle(step.id)) errors.push("step id must be non-blank text");
  if (!isTitle(step.title)) errors.push("step title must be non-blank text");
  if (step.note !== undefined && !isTitle(step.note)) {
    errors.push("step note must be non-blank text");
  }
  if (!Array.isArray(step.nodes)) {
    errors.push("step nodes must be a list");
    return errors;
  }
  step.nodes.forEach((node, index) => {
    errors.push(...validateNodeAt(node, "node " + index));
  });
  if (step.nav !== undefined) {
    errors.push(...validateStepNav(step.nav));
  }
  return errors;
}

export function menu(
  label: string,
  options: WizardOption[],
  name?: string,
): MenuNode {
  return omitUndefined({ kind: "menu", label, options, name });
}

export function tree(label: string, rows: TreeRow[]): TreeNode {
  return { kind: "tree", label, rows };
}

export function progress(
  label: string,
  assigned: number,
  skipped: number,
  left: number,
): ProgressNode {
  return { kind: "progress", label, assigned, skipped, left };
}

export function radio(
  label: string,
  name: string,
  options: WizardOption[],
  picked?: string,
  hint?: string,
): RadioNode {
  return omitUndefined({ kind: "radio", label, name, options, picked, hint });
}

export function checkbox(
  label: string,
  name: string,
  options: WizardOption[],
  ticked: string[] = [],
  bulk = false,
): CheckboxNode {
  return omitUndefined({
    kind: "checkbox",
    label,
    name,
    options,
    ticked,
    bulk: bulk ? true : undefined,
  });
}

export function textEntry(
  label: string,
  name: string,
  value = "",
  hint = "",
): TextEntryNode {
  return { kind: "text", label, name, value, hint };
}

export function numberEntry(
  label: string,
  name: string,
  value?: number,
): NumberEntryNode {
  return omitUndefined({ kind: "number", label, name, value });
}

export function textarea(
  label: string,
  name: string,
  opts?: { value?: string; rows?: number },
): TextareaNode {
  return omitUndefined({
    kind: "textarea",
    label,
    name,
    value: opts?.value,
    rows: opts?.rows,
  });
}

export function markdown(text: string): MarkdownNode {
  return { kind: "markdown", text };
}

export function stages(
  label: string,
  stages: string[],
  current: number,
): StagesNode {
  return { kind: "stages", label, stages, current };
}

export function spoiler(label: string, nodes: Node[]): SpoilerNode {
  return { kind: "spoiler", label, nodes };
}

export function tabs(tabs: TabItem[], selected?: number): TabsNode {
  return omitUndefined({ kind: "tabs", tabs, selected });
}

export function action(
  label: string,
  id: string,
  command: string[],
  run: ActionRun = "now",
  live?: boolean,
  confirm?: string,
): ActionNode {
  const node: ActionNode = live === true
    ? run === "now"
      ? { kind: "action", label, id, command, live: true }
      : { kind: "action", label, id, command, run, live: true }
    : run === "now"
    ? { kind: "action", label, id, command }
    : { kind: "action", label, id, command, run };
  return confirm === undefined ? node : { ...node, confirm };
}

export function answers(label: string, entries: AnswersEntry[]): AnswersNode {
  return { kind: "answers", label, entries };
}

export function table(
  label: string,
  columns: TableColumn[],
  rows: string[][],
): TableNode {
  return { kind: "table", label, columns, rows };
}

// Build one mount node.
// Omit label plus data when absent.
export function mount(id: string, data?: unknown, label?: string): MountNode {
  return omitUndefined({ kind: "mount", id, data, label });
}

export function repeating(
  label: string,
  name: string,
  fields: RepeatingField[],
  rows?: Record<string, string>[],
): RepeatingNode {
  return omitUndefined({ kind: "repeating", label, name, fields, rows });
}

export function copyable(
  label: string,
  name: string,
  text: string,
  opts?: { mono?: boolean; rows?: number },
): CopyableNode {
  return omitUndefined({
    kind: "copyable",
    label,
    name,
    text,
    mono: opts?.mono,
    rows: opts?.rows,
  }) as CopyableNode;
}

export function step(
  id: string,
  title: string,
  nodes: Node[],
  note?: string,
  when?: StepWhen,
  onEnter?: StepOnEnter,
): Step {
  return omitUndefined({ id, title, nodes, note, when, onEnter });
}
