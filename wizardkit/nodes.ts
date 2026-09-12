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
  error?: string;
}

export interface CheckboxNode {
  kind: "checkbox";
  label: string;
  name: string;
  options: WizardOption[];
  ticked: string[];
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

export type ButtonsLayout = "right" | "split";

export interface ButtonsNode {
  kind: "buttons";
  buttons: ButtonItem[];
  label?: string;
  layout?: ButtonsLayout;
  error?: string;
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

export interface RepeatingField {
  kind: "text" | "number";
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

export type Node =
  | MenuNode
  | TreeNode
  | ProgressNode
  | RadioNode
  | CheckboxNode
  | TextEntryNode
  | NumberEntryNode
  | TextareaNode
  | ButtonsNode
  | MarkdownNode
  | StagesNode
  | SpoilerNode
  | TabsNode
  | ActionNode
  | AnswersNode
  | TableNode
  | RepeatingNode
  | CopyableNode;

export interface Step {
  id: string;
  title: string;
  nodes: Node[];
  note?: string;
}

// Session context for one browser. The toolkit passes one per request.
export interface WizardCtx {
  sessionId: string;
}

// True when value is a plain object.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// True when value is text with at least one non-space char.
function isTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
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
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
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
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
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
  if (!isTitle(node.label)) errors.push(tag + ": label must be non-blank");
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

function validateButtons(node: ButtonsNode, tag: string): string[] {
  const errors: string[] = [];
  if (node.label !== undefined && typeof node.label !== "string") {
    errors.push(tag + ": label must be text");
  }
  if (
    node.layout !== undefined &&
    node.layout !== "right" &&
    node.layout !== "split"
  ) {
    errors.push(tag + ": layout must be right or split");
  }
  if (!Array.isArray(node.buttons) || node.buttons.length === 0) {
    errors.push(tag + ": buttons must hold at least one button");
    return errors;
  }
  node.buttons.forEach((button, i) => {
    if (!isRecord(button) || !isTitle(button.label)) {
      errors.push(tag + ": button " + i + " must have a label");
    }
    if (!isRecord(button) || !isTitle(button.action)) {
      errors.push(tag + ": button " + i + " must have an action id");
    }
    if (
      isRecord(button) &&
      button.primary !== undefined &&
      typeof button.primary !== "boolean"
    ) {
      errors.push(tag + ": button " + i + " primary must be true or false");
    }
  });
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
    case "buttons":
      return validateButtons(item as ButtonsNode, tag);
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
      (field.kind !== "text" && field.kind !== "number")
    ) {
      errors.push(at + ": kind must be text or number");
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
): RadioNode {
  return omitUndefined({ kind: "radio", label, name, options, picked });
}

export function checkbox(
  label: string,
  name: string,
  options: WizardOption[],
  ticked: string[] = [],
): CheckboxNode {
  return { kind: "checkbox", label, name, options, ticked };
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

export function buttons(
  buttons: ButtonItem[],
  label?: string,
  layout: ButtonsLayout = "right",
): ButtonsNode {
  return omitUndefined({ kind: "buttons", buttons, label, layout });
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
): CopyableNode {
  return { kind: "copyable", label, name, text };
}

export interface NavOptions {
  back?: boolean | string;
  next?: string;
  done?: string;
  goto?: string;
  extra?: ButtonItem[];
}

// Standard button row, so no author writes it by hand. back is true
// for the label Back or a string for a custom label. next, done, and
// goto pick the forward button: a next or done label, or a jump to a
// step id labelled Next. extra buttons sit between back and forward.
// The row uses the split layout with a primary forward button.
export function nav(opts: NavOptions): ButtonsNode {
  const forward = [opts.next, opts.done, opts.goto].filter(
    (item) => item !== undefined,
  );
  if (forward.length !== 1) {
    throw new Error("nav: exactly one of next, done, or goto must be set");
  }
  if (opts.back !== undefined && opts.back !== true && !isTitle(opts.back)) {
    throw new Error("nav: back must be true or a non-blank label");
  }
  if (opts.next !== undefined && !isTitle(opts.next)) {
    throw new Error("nav: next label must be non-blank");
  }
  if (opts.done !== undefined && !isTitle(opts.done)) {
    throw new Error("nav: done label must be non-blank");
  }
  if (opts.goto !== undefined && !isTitle(opts.goto)) {
    throw new Error("nav: goto step id must be non-blank");
  }
  const list: ButtonItem[] = [];
  if (opts.back === true) {
    list.push({ label: "Back", action: "back" });
  } else if (typeof opts.back === "string") {
    list.push({ label: opts.back, action: "back" });
  }
  if (opts.extra !== undefined) list.push(...opts.extra);
  if (opts.next !== undefined) {
    list.push({ label: opts.next, action: "next", primary: true });
  } else if (opts.done !== undefined) {
    list.push({ label: opts.done, action: "done", primary: true });
  } else {
    list.push({
      label: "Next",
      action: "goto:" + (opts.goto as string),
      primary: true,
    });
  }
  return buttons(list, undefined, "split");
}

export function step(
  id: string,
  title: string,
  nodes: Node[],
  note?: string,
): Step {
  return omitUndefined({ id, title, nodes, note });
}
