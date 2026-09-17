// Fragment renderer plus page shell for the desktop wizard toolkit.
// Nodes render as Preact components serialized by preact-render-to-
// string. Text escapes by construction; only markdown bodies and the
// page script blocks inject raw HTML. This file imports ./nodes.ts
// plus zx. zx runs shell commands for action nodes. HTMX serves
// vendored from /vendor (HTMX_CDN below), so live actions still post
// inline when the network is down.

// Pinned browser library paths. Web Awesome plus HTMX serve vendored
// from /vendor (see vendorRoot plus vendor/update.sh).
export const HTMX_CDN = "/vendor/htmx/htmx.min.js";
export const WA_LOADER = "/vendor/webawesome/webawesome.loader.js";
export const WA_THEME = "/vendor/webawesome/styles/themes/default.css";

import { $ } from "zx";
import type { ComponentChildren } from "preact";
import { renderToString } from "preact-render-to-string";
import { micromark } from "micromark";
import cssText from "./style.css" with { type: "text" };
import "./jsx-types.ts";
import { buttons, markdown, optionValue, stages, step, stepApplies } from "./nodes.ts";
import type {
  ActionNode,
  AnswersNode,
  ButtonsNode,
  CheckboxNode,
  CopyableNode,
  DraftEntry,
  LeaveDir,
  MarkdownNode,
  MenuNode,
  NavHandler,
  NavOutcome,
  Node,
  NumberEntryNode,
  ProgressNode,
  RadioNode,
  RepeatingNode,
  SpoilerNode,
  StagesNode,
  Step,
  StepNav,
  TableNode,
  TabsNode,
  TextareaNode,
  TextEntryNode,
  TreeNode,
  WizardCtx,
  WizardOption,
} from "./nodes.ts";

// Escape user text before it enters hand-built HTML. Preact escapes
// component text on its own; this stays for the raw server fragments
// plus as part of the public module surface.
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Turn a label into a safe field name.
function slug(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const clean = s.replace(/^-+|-+$/g, "");
  return clean === "" ? "field" : clean;
}

// Red error line shown under a node body when present.
function ErrorLine(props: { error?: string }) {
  if (props.error === undefined || props.error === "") return null;
  return <p class="node-error" style="color: red">{props.error}</p>;
}

// Wrap a node body with its label block.
function Shell(props: {
  kind: string;
  label: string;
  error?: string;
  children?: ComponentChildren;
}) {
  return (
    <section class={"node node-" + props.kind}>
      {props.label !== "" ? <h3>{props.label}</h3> : null}
      {props.children}
      <ErrorLine error={props.error} />
    </section>
  );
}

export interface CommandResult {
  ok: boolean;
  output: string;
}

// Run a command and capture merged stdout plus stderr. Never throws.
// ok is false on nonzero exit or spawn failure, with the error as output.
// deno-lint-ignore require-await -- callers await action output, so this keeps async.
export async function runCommand(argv: string[]): Promise<CommandResult> {
  return spawnCapture(argv, async (prog, rest) => {
    const out = await $`${prog} ${rest}`;
    return out.stdout + out.stderr;
  });
}

// Shared spawn pipeline for runCommand plus startLive. Guards the empty
// argv, splits it, runs the spawn step, then trims trailing space or
// turns an error into the output. Never throws.
async function spawnCapture(
  argv: string[],
  run: (prog: string, rest: string[]) => Promise<string>,
): Promise<CommandResult> {
  if (argv.length === 0) return { ok: false, output: "empty command" };
  try {
    const [prog = "", ...rest] = argv;
    const output = await run(prog, rest);
    return { ok: true, output: output.replace(/\s+$/, "") };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, output: msg };
  }
}

// Fill {field} markers in command entries with posted values.
// Each marker stays inside its own entry, so one entry never splits
// in two and the value never passes through a shell.
export function resolveCommandMarkers(
  command: string[],
  getValue: (name: string) => string | undefined,
): { argv: string[]; missing?: string } {
  let missing: string | undefined;
  const argv = command.map((entry) =>
    entry.replace(/\{([^{}]+)\}/g, (match, name) => {
      const raw = getValue(name);
      if (raw === undefined || raw.trim() === "") {
        if (missing === undefined) missing = name;
        return match;
      }
      return raw;
    })
  );
  if (missing !== undefined) return { argv: command, missing };
  return { argv };
}

// Render one option label with an optional muted hint line beneath it.
// A present hint always renders, whether the option shows a label or
// a value.
function OptionLabel(props: { option: WizardOption }) {
  const option = props.option;
  if (typeof option === "string") return <>{option}</>;
  const text = option.label !== undefined && option.label !== ""
    ? option.label
    : option.value;
  if (option.hint === undefined || option.hint === "") {
    return <>{text}</>;
  }
  return (
    <>
      {text}
      <small class="option-hint">{option.hint}</small>
    </>
  );
}

function MenuView(props: { node: MenuNode }) {
  const node = props.node;
  return (
    <Shell kind="menu" label={node.label} error={node.error}>
      <wa-select name={node.name ?? slug(node.label)} placeholder="Select">
        {node.options.map((option) => (
          <wa-option value={optionValue(option)}>
            <OptionLabel option={option} />
          </wa-option>
        ))}
      </wa-select>
    </Shell>
  );
}

function TreeView(props: { node: TreeNode }) {
  const node = props.node;
  return (
    <Shell kind="tree" label={node.label} error={node.error}>
      <ul class="tree-list">
        {node.rows.map((row) => (
          <li class={"tree-row is-" + row.state}>
            <small>{row.state}</small> <span class="tree-text">{row.text}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function ProgressView(props: { node: ProgressNode }) {
  const node = props.node;
  const total = node.assigned + node.skipped + node.left;
  const done = total === 0 ? 0 : Math.round((100 * node.assigned) / total);
  return (
    <Shell kind="progress" label={node.label} error={node.error}>
      <p>
        {"Assigned: "}
        <b>{node.assigned}</b>
        {" Skipped: "}
        <b>{node.skipped}</b>
        {" Left: "}
        <b>{node.left}</b>
      </p>
      <wa-progress-bar value={done} />
    </Shell>
  );
}

function RadioView(props: { node: RadioNode }) {
  const node = props.node;
  // The group is the form element (WebAwesomeFormAssociatedElement), so
  // it carries the name and the picked value. Children stay nameless;
  // the group syncs the selection down from its value.
  return (
    <Shell kind="radio" label={node.label} error={node.error}>
      <wa-radio-group name={node.name} value={node.picked ?? ""}>
        {node.options.map((option) => (
          <wa-radio value={optionValue(option)}>
            <OptionLabel option={option} />
          </wa-radio>
        ))}
      </wa-radio-group>
    </Shell>
  );
}

function CheckboxView(props: { node: CheckboxNode }) {
  const node = props.node;
  return (
    <Shell kind="checkbox" label={node.label} error={node.error}>
      <div class="check-group">
        {node.options.map((option) => {
          const value = optionValue(option);
          const checked = node.ticked.includes(value);
          return (
            <wa-checkbox name={node.name} value={value} checked={checked}>
              <OptionLabel option={option} />
            </wa-checkbox>
          );
        })}
      </div>
    </Shell>
  );
}

// Render one entry input. kind picks text or number. A text node may
// show its hint as the placeholder; a numeric value renders when set.
function EntryView(props: { node: TextEntryNode | NumberEntryNode }) {
  const node = props.node;
  const kind = node.kind === "text" ? "text" : "number";
  const value = node.value === undefined || node.value === "" ? undefined : String(node.value);
  const hint = node.kind === "text" && node.hint ? node.hint : undefined;
  return (
    <Shell kind={kind} label={node.label} error={node.error}>
      <wa-input type={kind} name={node.name} value={value} placeholder={hint} />
    </Shell>
  );
}

function TextareaView(props: { node: TextareaNode }) {
  const node = props.node;
  const value = node.value === undefined || node.value === "" ? undefined : node.value;
  const rows = node.rows ?? 3;
  return (
    <Shell kind="textarea" label={node.label} error={node.error}>
      <wa-textarea name={node.name} rows={rows} value={value} />
    </Shell>
  );
}

function ButtonsView(props: { node: ButtonsNode }) {
  const node = props.node;
  const firstPrimary = node.buttons.findIndex((item) => item.primary === true);
  const row = node.layout === "split" ? "button-row-split" : "button-row-right";
  return (
    <Shell kind="buttons" label={node.label ?? ""} error={node.error}>
      <div class={row}>
        {node.buttons.map((button, i) => (
          <wa-button
            variant={button.primary === true ? "primary" : "neutral"}
            type="submit"
            name="action"
            value={button.action}
            autofocus={button.primary === true && i === firstPrimary}
          >
            {button.label}
          </wa-button>
        ))}
      </div>
    </Shell>
  );
}

// Markdown renders through micromark. Its output is CommonMark HTML,
// so raw markup arrives escaped and javascript: URLs arrive emptied.
// The body is trusted library output, so it injects as raw HTML.
function MarkdownView(props: { node: MarkdownNode }) {
  return (
    <section class="node node-markdown">
      <wa-callout
        variant="neutral"
        dangerouslySetInnerHTML={{ __html: micromark(props.node.text) }}
      />
      <ErrorLine error={props.node.error} />
    </section>
  );
}

// The action button posting to /action, plus its output region.
// type="button" keeps the shadow-DOM submit out: HTMX owns the post,
// and there is no native submit for it to race.
// hx-include posts the step form, so a {field} marker can use typed values.
function ActionButton(props: { node: ActionNode }) {
  const id = props.node.id;
  return (
    <wa-button
      class="action-strip"
      type="button"
      hx-post="/action"
      hx-target={"#out-" + id}
      hx-swap="innerHTML"
      hx-vals={'{"id": "' + id + '"}'}
      hx-include="closest form"
    >
      {props.node.label}
      <span slot="suffix">
        <small>run</small>
      </span>
    </wa-button>
  );
}

// Polling fragment for a live job.
// hx-target="this" is load bearing. htmx inherits hx-target from
// ancestors, and this fragment lands inside the step form, which
// carries hx-target="#step". With no target of its own the first poll
// replaces the whole step: the heading, the panel and the buttons all
// vanish, and the run appears to take over the page.
function LiveTask(props: { id: string; output: string }) {
  return (
    <div
      id={"task-" + props.id}
      hx-get={"/task/" + props.id}
      hx-target="this"
      hx-trigger="every 2s"
      hx-swap="outerHTML"
    >
      <pre>{props.output}</pre>
    </div>
  );
}

// Finished output for one action. The failed mark rides inside the pre,
// the same shape a saved run shows in the panel.
function TaskOutput(props: { output: string; failed?: boolean }) {
  const mark = props.failed === true ? " (failed)" : "";
  return <pre>{props.output + mark}</pre>;
}

// Output region for an action. When output holds text it renders a pre
// inside the panel, the same shape the fragment path returns. When the
// field is absent the panel renders empty, exactly as before.
function ActionOut(props: { id: string; output?: string }) {
  if (props.output !== undefined && props.output !== "") {
    return (
      <div class="action-out" id={"out-" + props.id}>
        <pre>{props.output}</pre>
      </div>
    );
  }
  return <div class="action-out" id={"out-" + props.id} />;
}

// Hidden inline confirm: question callout, Confirm posts, Cancel restores.
// Confirm posts the step form too, so a {field} marker can use typed values.
function ConfirmBody(props: { node: ActionNode }) {
  const node = props.node;
  const id = node.id;
  const show = `document.getElementById('confirm-${id}').hidden=false`;
  const hide = `document.getElementById('confirm-${id}').hidden=true`;
  return (
    <>
      <wa-button class="action-strip" type="button" onclick={show}>
        {node.label}
        <span slot="suffix">
          <small>run</small>
        </span>
      </wa-button>
      <div class="action-confirm" id={"confirm-" + id} hidden>
        <wa-callout variant="warning">{node.confirm ?? ""}</wa-callout>
        <wa-button
          class="action-strip"
          type="button"
          hx-post="/action"
          hx-target={"#out-" + id}
          hx-swap="innerHTML"
          hx-vals={'{"id": "' + id + '"}'}
          hx-include="closest form"
        >
          Confirm
        </wa-button>
        <wa-button class="action-strip" type="button" onclick={hide}>
          Cancel
        </wa-button>
      </div>
      <ActionOut id={id} output={node.output} />
    </>
  );
}

// Render a full-width action with an optional inline confirm gate.
function ActionView(props: { node: ActionNode }) {
  const node = props.node;
  // Plain button shows the label so Shell skips the heading.
  return (
    <Shell kind="action" label={node.confirm === undefined ? "" : node.label} error={node.error}>
      {node.confirm === undefined
        ? (
          <>
            <ActionButton node={node} />
            <ActionOut id={node.id} output={node.output} />
          </>
        )
        : <ConfirmBody node={node} />}
    </Shell>
  );
}

function AnswersView(props: { node: AnswersNode }) {
  const node = props.node;
  return (
    <Shell kind="answers" label={node.label} error={node.error}>
      <dl class="answers-list">
        {node.entries.map((entry) => (
          <div class="answers-entry">
            <dt class="answers-name">{entry.name}</dt>
            <dd class="answers-values">{entry.values.join(", ")}</dd>
          </div>
        ))}
      </dl>
    </Shell>
  );
}

function TableView(props: { node: TableNode }) {
  const node = props.node;
  return (
    <Shell kind="table" label={node.label}>
      <table class="node-table">
        <thead>
          <tr>
            {node.columns.map((column) => (
              <th style={"text-align: " + (column.align ?? "left")}>
                {column.heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {node.rows.map((row) => (
            <tr>
              {row.map((cell, i) => (
                <td style={"text-align: " + (node.columns[i].align ?? "left")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}

// True when a seeded check value means ticked. Only 1, true, and on
// count. Any other value leaves the box unticked.
function isCheckTicked(raw: unknown): boolean {
  return raw === "1" || raw === "true" || raw === "on";
}

function RepeatingView(props: { node: RepeatingNode }) {
  const node = props.node;
  const seeded = node.rows ?? [];
  return (
    <Shell kind="repeating" label={node.label} error={node.error}>
      <div class="repeat-list" data-repeat={node.name}>
        {seeded.map((record, i) => (
          <div class="repeat-row" key={i}>
            {node.fields.map((field) => {
              if (field.kind === "check") {
                const checked = isCheckTicked(record[field.name]);
                return (
                  <label class="repeat-check">
                    <input
                      type="checkbox"
                      name={field.name}
                      value={String(i)}
                      checked={checked}
                    />
                    {field.label}
                  </label>
                );
              }
              const raw = record[field.name];
              const value = typeof raw === "string" && raw !== "" ? raw : undefined;
              return (
                <wa-input
                  type={field.kind}
                  name={field.name}
                  label={field.label}
                  placeholder={field.label}
                  value={value}
                />
              );
            })}
          </div>
        ))}
        <div class="repeat-row">
          {node.fields.map((field) => {
            if (field.kind === "check") {
              return (
                <label class="repeat-check">
                  <input
                    type="checkbox"
                    name={field.name}
                    value={String(seeded.length)}
                    checked={false}
                  />
                  {field.label}
                </label>
              );
            }
            return (
              <wa-input
                type={field.kind}
                name={field.name}
                label={field.label}
                placeholder={field.label}
              />
            );
          })}
        </div>
        <wa-button type="button" data-add-row>
          Add entry
        </wa-button>
      </div>
    </Shell>
  );
}

function CopyableView(props: { node: CopyableNode }) {
  const node = props.node;
  return (
    <Shell kind="copyable" label={node.label} error={node.error}>
      <div class="copyable-row" data-copyable={node.name}>
        <textarea
          class="copyable-text"
          name={node.name}
          readOnly
          rows={4}
        >
          {node.text}
        </textarea>
        <wa-button type="button" data-copy-btn>
          Copy
        </wa-button>
        <small class="copyable-done" data-copy-done hidden>
          Copied
        </small>
      </div>
    </Shell>
  );
}

function StagesView(props: { node: StagesNode }) {
  const node = props.node;
  const total = node.stages.length;
  return (
    <Shell kind="stages" label={node.label} error={node.error}>
      <div class="stages-list">
        {node.stages.map((stage, i) => (
          <button
            class={"stage-row" + (i === node.current ? " is-now" : "")}
            type="submit"
            name="action"
            value={"goto:" + i}
          >
            <small>{i + 1}/{total}</small> <span class="stage-name">{stage}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

function SpoilerView(props: { node: SpoilerNode }) {
  const node = props.node;
  return (
    <wa-details class="node node-spoiler" summary={node.label}>
      {node.nodes.map((kid, i) => <NodeView key={i} node={kid} />)}
      <ErrorLine error={node.error} />
    </wa-details>
  );
}

// Render tabs through the vendored tab-container element. First tab
// starts selected; the element owns clicks plus arrow keys. A set
// selected index marks that tab plus its panel active.
function TabsView(props: { node: TabsNode }) {
  const node = props.node;
  const selected = node.selected;
  return (
    <section class="node node-tabs">
      <wa-tab-group>
        {node.tabs.map((tab, i) => (
          <wa-tab
            slot="nav"
            panel={"tab-" + i}
            {...(selected !== undefined && i === selected ? { active: true } : {})}
          >
            {tab.label}
          </wa-tab>
        ))}
        {node.tabs.map((tab, i) => (
          <wa-tab-panel
            name={"tab-" + i}
            {...(selected !== undefined && i === selected ? { active: true } : {})}
          >
            {tab.nodes.map((kid, k) => <NodeView key={k} node={kid} />)}
          </wa-tab-panel>
        ))}
      </wa-tab-group>
      <ErrorLine error={node.error} />
    </section>
  );
}

// Render any node as a Preact element.
function NodeView(props: { node: Node }) {
  const node = props.node;
  switch (node.kind) {
    case "menu":
      return <MenuView node={node} />;
    case "tree":
      return <TreeView node={node} />;
    case "progress":
      return <ProgressView node={node} />;
    case "radio":
      return <RadioView node={node} />;
    case "checkbox":
      return <CheckboxView node={node} />;
    case "text":
    case "number":
      return <EntryView node={node} />;
    case "textarea":
      return <TextareaView node={node} />;
    case "buttons":
      return <ButtonsView node={node} />;
    case "markdown":
      return <MarkdownView node={node} />;
    case "stages":
      return <StagesView node={node} />;
    case "spoiler":
      return <SpoilerView node={node} />;
    case "tabs":
      return <TabsView node={node} />;
    case "action":
      return <ActionView node={node} />;
    case "answers":
      return <AnswersView node={node} />;
    case "table":
      return <TableView node={node} />;
    case "repeating":
      return <RepeatingView node={node} />;
    case "copyable":
      return <CopyableView node={node} />;
  }
}

// Turn any node into its HTML fragment.
export function renderNode(node: Node): string {
  return renderToString(<NodeView node={node} />);
}

// Render one step footer bar. Back opens the row, actions fill the
// middle, the forward button closes it. Each button posts its action
// with the step form.
function NavBar(props: { nav: StepNav }) {
  const nav = props.nav;
  let fwdAction = "";
  let fwdLabel = "";
  if (typeof nav.next === "string") {
    fwdAction = "next";
    fwdLabel = nav.next;
  } else if (nav.next !== undefined) {
    fwdAction = "next";
    fwdLabel = nav.next.label;
  } else if (typeof nav.done === "string") {
    fwdAction = "done";
    fwdLabel = nav.done;
  } else if (nav.done !== undefined) {
    fwdAction = "done";
    fwdLabel = nav.done.label;
  } else if (typeof nav.goto === "string") {
    fwdAction = "goto:" + nav.goto;
    fwdLabel = "Next";
  } else if (nav.goto !== undefined) {
    fwdAction = "goto:" + nav.goto.step;
    fwdLabel = nav.goto.label;
  }
  const showBack = nav.back !== undefined && nav.back !== false;
  const backLabel = nav.back === true ? "Back" : String(nav.back);
  const acts = nav.actions ?? [];
  return (
    <div class="wiz-nav">
      <div class="wiz-nav-back">
        {showBack
          ? (
            <wa-button
              variant="neutral"
              type="submit"
              name="action"
              value="back"
            >
              {backLabel}
            </wa-button>
          )
          : null}
      </div>
      <div class="wiz-nav-mid">
        {acts.map((item) => (
          <wa-button
            variant="neutral"
            type="submit"
            name="action"
            value={"act:" + item.id}
          >
            {item.label}
          </wa-button>
        ))}
      </div>
      <div class="wiz-nav-fwd">
        {fwdAction !== ""
          ? (
            <wa-button
              variant="primary"
              type="submit"
              name="action"
              value={fwdAction}
              autofocus
            >
              {fwdLabel}
            </wa-button>
          )
          : null}
      </div>
    </div>
  );
}

// Render one step as a form. It posts the step id plus answers to /step.
// The plain method plus action keep it working when HTMX is absent.
// A step holding one tabs node renders as a root tabbed view.
export function renderStepFragment(input: Step): string {
  const rootTabs = input.nodes.length === 1 &&
    input.nodes[0] !== undefined &&
    input.nodes[0].kind === "tabs";
  const cls = rootTabs ? "wiz-step is-root-tabs" : "wiz-step";
  return renderToString(
    <section class={cls} id="step">
      <h2>{input.title}</h2>
      {input.note ? <p class="wiz-step-note" style="opacity:0.65">{input.note}</p> : null}
      <form
        method="post"
        action="/step"
        hx-post="/step"
        hx-target="#step"
        hx-swap="outerHTML"
      >
        <input type="hidden" name="step" value={input.id} />
        {input.nodes.map((node, i) => <NodeView key={i} node={node} />)}
        {input.nav !== undefined ? <NavBar nav={input.nav} /> : null}
      </form>
    </section>,
  );
}

// Styles live in ./style.css, loaded as text above.

// Draft saver with no dependency. It stores field values per step,
// then offers the newest draft in the footer strip.

// Hash the wizard title to hex so each wizard keeps its own drafts.
function titleHash(title: string): string {
  let sum = 0;
  for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
  return sum.toString(16);
}

function draftJs(title: string): string {
  const KEY = "wiz-draft-" + titleHash(title);
  return (
    `(function () {\n` +
    `var KEY = ${JSON.stringify(KEY)}, VER = ${JSON.stringify(title + " v1")}, timer = null, PENDING = KEY + "-pick";\n` +
    `function frm(el) { return (el && el.form) || el || null; }\n` +
    `function sid(f) {\n` +
    `var s = f.querySelector("[name=step]"); return s ? s.value : ""; }\n` +
    `function stepTitle() {\n` +
    `var h = document.querySelector(".wiz-step h2"); return h ? h.textContent : ""; }\n` +
    `function formNow() {\n` +
    `var host = document.querySelector(".wiz-step"); return host && host.querySelector("form"); }\n` +
    `function read(form) {\n` +
    `var out = {}, els = form.querySelectorAll("input,select,textarea"), i = 0;\n` +
    `for (; i < els.length; i++) {\n` +
    `var el = els[i], t = el.type;\n` +
    `if (!el.name || t === "submit" || t === "button" || t === "hidden") continue;\n` +
    `if (t !== "checkbox" && t !== "radio") { out[el.name] = el.value; continue; }\n` +
    `if (el.checked) (out[el.name] = out[el.name] || []).push(el.value); } return out; }\n` +
    `function load() {\n` +
    `try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }\n` +
    `function stamp() {\n` +
    `var st = document.getElementById("draft-status"); if (!st) return;\n` +
    `var d = new Date(), m = ("0" + d.getMinutes()).slice(-2);\n` +
    `st.textContent = "Draft saved " + d.getHours() + ":" + m; }\n` +
    `function save(f) {\n` +
    `var d = { v: VER, step: sid(f), title: stepTitle(), at: new Date().toISOString(), fields: read(f) };\n` +
    `try { localStorage.setItem(KEY, JSON.stringify(d)); stamp(); } catch (e) {}\n` +
    `renderOffer(); }\n` +
    `function clearAll() { try { localStorage.removeItem(KEY); } catch (e) {}\n` +
    `var st = document.getElementById("draft-status"); if (st) st.textContent = "";\n` +
    `renderOffer(); }\n` +
    `function clearFor(s) { var old = load(); if (old && old.step === s) clearAll(); }\n` +
    `function fill(form, saved) {\n` +
    `var keys = Object.keys(saved.fields);\n` +
    `for (var k = 0; k < keys.length; k++) {\n` +
    `var n = keys[k], els = form.querySelectorAll('[name="' + n + '"]');\n` +
    `for (var i = 0; i < els.length; i++) {\n` +
    `var el = els[i];\n` +
    `if (el.type === "checkbox" || el.type === "radio") {\n` +
    `el.checked = saved.fields[n].indexOf(el.value) > -1; } else el.value = saved.fields[n]; } }\n` +
    `}\n` +
    `function btn(l, f) { var b = document.createElement("wa-button");\n` +
    `b.setAttribute("size", "small"); b.textContent = l;\n` +
    `b.addEventListener("click", f); return b; }\n` +
    `function foot() { return document.querySelector(".wiz-foot"); }\n` +
    `function statusEl() { return document.getElementById("draft-status"); }\n` +
    `function appEntry() {\n` +
    `var f = foot(); if (!f) return null;\n` +
    `var id = f.getAttribute("data-draft-id"), at = f.getAttribute("data-draft-at");\n` +
    `if (!id || !at) return null;\n` +
    `return { id: id, label: f.getAttribute("data-draft-label") || id, at: at }; }\n` +
    `function takeMs(at) { var ms = Date.parse(at || ""); return isNaN(ms) ? 0 : ms; }\n` +
    `function sameFields(form, saved) {\n` +
    `var now = read(form), seen = {}, k;\n` +
    `for (k in saved.fields) seen[k] = 1;\n` +
    `for (k in now) seen[k] = 1;\n` +
    `for (k in seen) { if (JSON.stringify(saved.fields[k]) !== JSON.stringify(now[k])) return false; }\n` +
    `return true; }\n` +
    `function clearOffer() {\n` +
    `var f = foot(); if (!f) return;\n` +
    `var o = f.querySelector("[data-draft-offer]"); if (o) o.remove(); }\n` +
    `function offerLine(text) {\n` +
    `var s = document.createElement("span");\n` +
    `s.className = "draft-offer-text"; s.textContent = text; return s; }\n` +
    `function renderOffer() {\n` +
    `clearOffer();\n` +
    `var f = foot(); if (!f) return;\n` +
    `var form = formNow(), saved = load(), app = appEntry();\n` +
    `var hasBrowser = !!(saved && saved.step);\n` +
    `if (hasBrowser && saved.v !== VER) hasBrowser = false;\n` +
    `if (hasBrowser && form && saved.step === sid(form) && sameFields(form, saved)) hasBrowser = false;\n` +
    `var pickBrowser = hasBrowser && (!app || takeMs(saved.at) >= takeMs(app.at));\n` +
    `if (!pickBrowser && !app) return;\n` +
    `var box = document.createElement("span");\n` +
    `box.className = "draft-offer";\n` +
    `box.setAttribute("data-draft-offer", "1");\n` +
    `if (pickBrowser) {\n` +
    `box.appendChild(offerLine("You were on " + (saved.title || saved.step) + "."));\n` +
    `box.appendChild(btn("Resume", function () { resumeBrowser(saved); }));\n` +
    `box.appendChild(btn("Discard", function () { clearAll(); }));\n` +
    `} else {\n` +
    `box.appendChild(offerLine(app.label));\n` +
    `box.appendChild(btn("Resume", function () { resumeApp(app); }));\n` +
    `}\n` +
    `var st = statusEl();\n` +
    `if (st && st.parentNode === f) f.insertBefore(box, st); else f.appendChild(box); }\n` +
    `function resumeBrowser(saved) {\n` +
    `var form = formNow(); if (!form) return;\n` +
    `try { sessionStorage.setItem(PENDING, JSON.stringify(saved)); } catch (e) {}\n` +
    `var act = form.querySelector('input[name="action"]');\n` +
    `if (!act) {\n` +
    `act = document.createElement("input");\n` +
    `act.type = "hidden"; act.name = "action"; form.appendChild(act); }\n` +
    `act.value = "goto:" + saved.step;\n` +
    `if (form.requestSubmit) form.requestSubmit(); else form.submit(); }\n` +
    `function takePending() {\n` +
    `var raw = null;\n` +
    `try { raw = sessionStorage.getItem(PENDING); } catch (e) {}\n` +
    `if (!raw) return null;\n` +
    `try { return JSON.parse(raw); } catch (e) { return null; } }\n` +
    `function dropPending() { try { sessionStorage.removeItem(PENDING); } catch (e) {} }\n` +
    `function maybeFill() {\n` +
    `var pend = takePending(); if (!pend || !pend.step) return;\n` +
    `var form = formNow(); if (!form || sid(form) !== pend.step) return;\n` +
    `if (pend.fields) fill(form, pend);\n` +
    `dropPending(); renderOffer(); }\n` +
    `function resumeApp(app) {\n` +
    `if (window.htmx && htmx.ajax) {\n` +
    `htmx.ajax("POST", "/draft-resume", { target: "#step", swap: "outerHTML", values: { id: app.id } });\n` +
    `return; }\n` +
    `var f = document.createElement("form");\n` +
    `f.method = "post"; f.action = "/draft-resume";\n` +
    `var i = document.createElement("input");\n` +
    `i.type = "hidden"; i.name = "id"; i.value = app.id;\n` +
    `f.appendChild(i); document.body.appendChild(f); f.submit(); }\n` +
    `function queue(ev) {\n` +
    `var f = frm(ev.target); if (!f) return;\n` +
    `clearTimeout(timer); timer = setTimeout(function () { save(f); }, 500); }\n` +
    `document.addEventListener("input", queue);\n` +
    `document.addEventListener("change", queue);\n` +
    `document.addEventListener("submit", function (ev) {\n` +
    `if (!window.htmx && ev.target.tagName === "FORM") clearFor(sid(ev.target));\n` +
    `});\n` +
    `document.addEventListener("htmx:afterRequest", function (ev) {\n` +
    `if (!ev.detail || !ev.detail.successful) return;\n` +
    `var f = frm(ev.detail.elt); if (f) clearFor(sid(f)); });\n` +
    `document.addEventListener("htmx:afterSwap", function (ev) {\n` +
    `var out = ev.detail && ev.detail.target;\n` +
    `if (!out || !out.classList || !out.classList.contains("action-out")) {\n` +
    `maybeFill(); renderOffer(); return; }\n` +
    `out.scrollTop = out.scrollHeight; });\n` +
    `maybeFill(); renderOffer(); })();`
  );
}

// Repeat-row helper. One delegated click handler clones the first row
// of the container and clears the copies of the cloned inputs.
const REPEAT_JS = `(function () {\n` +
  `document.addEventListener("click", function (ev) {\n` +
  `var btn = ev.target.closest("[data-add-row]");\n` +
  `if (!btn) return;\n` +
  `var list = btn.closest("[data-repeat]"); if (!list) return;\n` +
  `var row = list.querySelector(".repeat-row"); if (!row) return;\n` +
  `var copy = row.cloneNode(true);\n` +
  `var inputs = copy.querySelectorAll("wa-input, input, textarea");\n` +
  `for (var i = 0; i < inputs.length; i++) inputs[i].value = "";\n` +
  `list.insertBefore(copy, btn); }); })();`;

// Copy helper. One delegated click handler finds the textarea by its
// name inside the container, writes it to the clipboard, and shows a
// short confirmation. When the clipboard call fails or the browser
// refuses it, the text stays selected so the user can copy by hand.
const COPY_JS = `(function () {\n` +
  `document.addEventListener("click", function (ev) {\n` +
  `var btn = ev.target.closest("[data-copy-btn]");\n` +
  `if (!btn) return;\n` +
  `var box = btn.closest("[data-copyable]"); if (!box) return;\n` +
  `var field = box.querySelector("textarea"); if (!field) return;\n` +
  `function done() {\n` +
  `var note = box.querySelector("[data-copy-done]"); if (!note) return;\n` +
  `note.hidden = false;\n` +
  `setTimeout(function () { note.hidden = true; }, 2000); }\n` +
  `function fallback() { field.focus(); field.select(); }\n` +
  `var text = field.value;\n` +
  `if (navigator.clipboard && navigator.clipboard.writeText) {\n` +
  `navigator.clipboard.writeText(text).then(done, fallback); } else fallback(); }); })();`;

// Dark mode follows the system preference. Kept as a raw string so the
// page serializes it byte for byte.
const DARK_JS =
  `try{var m=matchMedia("(prefers-color-scheme: dark)");var apply=function(){document.documentElement.classList.toggle("wa-dark",m.matches)};m.addEventListener("change",apply);apply();}catch(e){}`;

// Import map for the vendored Web Awesome dependency tree. Kept as a
// raw string so the page serializes it byte for byte.
const IMPORT_MAP =
  `{"imports":{"@shoelace-style/animations":"/vendor/shoelace-style/index.js","@shoelace-style/localize":"/vendor/shoelace-localize/dist/index.js","@ctrl/tinycolor":"/vendor/tinycolor/dist/module/public_api.js","@floating-ui/dom":"/vendor/floating-ui-dom/dist/floating-ui.dom.esm.js","@floating-ui/core":"/vendor/floating-ui-core/dist/floating-ui.core.esm.js","@floating-ui/utils":"/vendor/floating-ui-utils/dist/floating-ui.utils.esm.js","@floating-ui/utils/dom":"/vendor/floating-ui-utils/dist/floating-ui.utils.dom.esm.js","@lit/context":"/vendor/lit-context/index.js","@lit/reactive-element":"/vendor/lit-reactive-element/reactive-element.js","@lit/reactive-element/":"/vendor/lit-reactive-element/","lit-element":"/vendor/lit-element/lit-element.js","lit-element/":"/vendor/lit-element/","lit-html":"/vendor/lit-html/lit-html.js","lit-html/":"/vendor/lit-html/","nanoid":"/vendor/nanoid/index.browser.js","composed-offset-position":"/vendor/composed-offset-position/dist/composed-offset-position.esm.js","lit":"/vendor/lit/index.js","lit/":"/vendor/lit/"}}`;

// Module script that points Web Awesome at the vendored base path.
const BASE_PATH_JS =
  `import{setBasePath}from"/vendor/webawesome/utilities/base-path.js";setBasePath("/vendor/webawesome/");`;

// Render a full page: WA theme plus loader, HTMX, layout CSS, shell.
// Script, style, and markdown bodies inject as raw HTML because they
// are trusted program output; Preact escapes every other text node.
// A draft entry adds resume attributes to the footer strip.
export function renderPage(
  title: string,
  fragment: string,
  draft?: DraftEntry | null,
): string {
  return "<!DOCTYPE html>\n" + renderToString(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>{title}</title>
        <script
          type="importmap"
          dangerouslySetInnerHTML={{ __html: IMPORT_MAP }}
        />
        <link rel="stylesheet" href={WA_THEME} />
        <script
          type="module"
          dangerouslySetInnerHTML={{ __html: BASE_PATH_JS }}
        />
        <script type="module" src={WA_LOADER} />
        <script src={HTMX_CDN} />
        <script dangerouslySetInnerHTML={{ __html: DARK_JS }} />
        <style dangerouslySetInnerHTML={{ __html: cssText }} />
      </head>
      <body>
        <header class="wiz-head">
          <h1>{title}</h1>
          <form
            method="post"
            action="/step"
            hx-post="/step"
            hx-target="#step"
            hx-swap="outerHTML"
          >
            <input type="hidden" name="action" value="restart" />
            <wa-button variant="text" size="small" type="submit" title="Reset wizard">
              {"\u21bb"}
            </wa-button>
          </form>
        </header>
        <main class="wiz-main" dangerouslySetInnerHTML={{ __html: fragment }} />
        <footer
          class="wiz-foot"
          data-draft-id={draft?.id}
          data-draft-label={draft?.label}
          data-draft-at={draft?.at}
        >
          <span>{title}</span>
          <small id="draft-status" />
        </footer>
        <script dangerouslySetInnerHTML={{ __html: draftJs(title) }} />
        <script dangerouslySetInnerHTML={{ __html: REPEAT_JS }} />
        <script dangerouslySetInnerHTML={{ __html: COPY_JS }} />
      </body>
    </html>,
  );
}

// Build a step from the live answers map.
export type StepFn = (answers: Map<string, string[]>, ctx?: WizardCtx) => Step;

export type { WizardCtx };

// A custom done screen. It holds a Step, or a function that takes
// the answers map and returns a Step.
export type DoneStep = Step | ((answers: Map<string, string[]>) => Step);

export interface WizardOptions {
  title: string;
  steps: Array<Step | StepFn>;
  actions?: Record<string, { command: string[] }>;
  files?: { root: string; prefix?: string };
  done?: DoneStep;
  stages?: {
    names: string[];
    stageOf: (stepId: string) => number | null;
  };
  onSubmit?: (
    fields: Record<string, string[]>,
    stepId: string,
    action: string,
    ctx: WizardCtx,
  ) =>
    | { errors?: string[]; goto?: string; insert?: Step }
    | void
    | Promise<{ errors?: string[]; goto?: string; insert?: Step } | void>;
  onDone?: (
    answers: Map<string, string[]>,
  ) =>
    | { goto?: string }
    | void
    | Promise<{ goto?: string } | void>;
  // Optional app sessions for the footer strip. list names every
  // resumable session. resume maps one id back to a step id.
  drafts?: {
    list: (ctx: WizardCtx) => DraftEntry[] | Promise<DraftEntry[]>;
    resume: (
      id: string,
      ctx: WizardCtx,
    ) => string | null | Promise<string | null>;
  };
}

// Wrap HTML with an HTML response.
function html(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Clamp an index into the step range.
function clamp(index: number, max: number): number {
  if (index < 0) return 0;
  if (index > max) return max;
  return index;
}

// Content types for the file proxy. All else serves as bytes.
const FILE_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
};

// One logged step post. at holds Date.now.
export interface WizardEvent {
  action: string;
  step: string;
  fields: Record<string, string[]>;
  at: number;
}

// Fold logged events into current answers. Later fields overwrite
// earlier ones per key, except checkbox names which append.
export function replayAnswers(
  events: WizardEvent[],
  checkboxNames: string[],
): Map<string, string[]> {
  const multi = new Set(checkboxNames);
  const out = new Map<string, string[]>();
  for (const ev of events) {
    for (const [key, values] of Object.entries(ev.fields)) {
      if (multi.has(key)) {
        const old = out.get(key) ?? [];
        old.push(...values);
        out.set(key, old);
      } else {
        out.set(key, [...values]);
      }
    }
  }
  return out;
}

// Walk a node list depth first. The visitor sees every node, including
// repeating ones. The walk descends into spoiler plus tabs children.
function walkNodes(nodes: Node[], visit: (node: Node) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.kind === "spoiler") walkNodes(node.nodes, visit);
    else if (node.kind === "tabs") {
      for (const tab of node.tabs) walkNodes(tab.nodes, visit);
    }
  }
}

// Names of text entries held back until Done, across spoiler plus tabs nests.
function heldNames(step: Step | undefined): string[] {
  const names: string[] = [];
  if (step === undefined) return names;
  walkNodes(step.nodes, (node) => {
    if (node.kind === "text" && node.run === "onConfirm") names.push(node.name);
  });
  return names;
}

// Build a request handler for a data-first wizard. GET / shows step 0.
// POST /step remembers fields then moves. POST /action runs a command.
export function createWizard(
  opts: WizardOptions,
): (req: Request) => Promise<Response> {
  // One record per browser session. Each record owns its own answers
  // log plus navigation state, so two browsers never share answers.
  interface SessionRecord {
    events: WizardEvent[];
    pending: string[];
    inserted: Array<{ after: string; step: Step }>;
    history: string[];
    lastStepId: string | undefined;
    doneStep: Step | undefined;
    touched: number;
  }
  const SESSION_COOKIE = "wizard-sid";
  const MAX_SESSIONS = 50;
  const sessions = new Map<string, SessionRecord>();
  let lastTouched: SessionRecord | undefined;
  // Serialize step posts. One in flight holds the others.
  let stepBusy = false;

  function getSession(id: string): SessionRecord {
    const hit = sessions.get(id);
    if (hit !== undefined) {
      hit.touched = Date.now();
      lastTouched = hit;
      return hit;
    }
    if (sessions.size >= MAX_SESSIONS) {
      let oldest: string | undefined;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, value] of sessions) {
        if (value.touched < oldestAt) {
          oldestAt = value.touched;
          oldest = key;
        }
      }
      if (oldest !== undefined) sessions.delete(oldest);
    }
    const fresh: SessionRecord = {
      events: [],
      pending: [],
      inserted: [],
      history: [],
      lastStepId: undefined,
      doneStep: undefined,
      touched: Date.now(),
    };
    sessions.set(id, fresh);
    lastTouched = fresh;
    return fresh;
  }

  function parseSessionId(req: Request): string | undefined {
    const header = req.headers.get("cookie");
    if (header === null || header === "") return undefined;
    for (const part of header.split(";")) {
      const at = part.indexOf("=");
      if (at < 0) continue;
      if (part.slice(0, at).trim() !== SESSION_COOKIE) continue;
      const raw = part.slice(at + 1).trim().replace(/^"|"$/g, "");
      if (raw === "") return undefined;
      try {
        const decoded = decodeURIComponent(raw);
        return decoded === "" ? undefined : decoded;
      } catch {
        return raw;
      }
    }
    return undefined;
  }

  // Checkbox names decide which fields append instead of overwrite.
  function staticCheckboxNames(): string[] {
    const names: string[] = [];
    for (const entry of opts.steps) {
      if (typeof entry !== "function") {
        walkNodes(entry.nodes, (node) => {
          if (node.kind === "checkbox") names.push(node.name);
        });
      }
    }
    return names;
  }

  const multiNames = staticCheckboxNames();

  function currentAnswersFor(state: SessionRecord): Map<string, string[]> {
    return replayAnswers(state.events, multiNames);
  }

  // Find one action node by id across spoiler plus tabs nests.
  function findAction(built: Step[], id: string): ActionNode | undefined {
    let found: ActionNode | undefined;
    for (const step of built) {
      walkNodes(step.nodes, (node) => {
        if (found === undefined && node.kind === "action" && node.id === id) {
          found = node;
        }
      });
    }
    return found;
  }

  // Build every step once per request so ids resolve to indexes.
  // Inserted steps splice in right after the step that asked for them.
  function buildAll(
    answers: Map<string, string[]>,
    ctx: WizardCtx,
    inserted: Array<{ after: string; step: Step }>,
  ): Step[] {
    const built = opts.steps.map((entry) =>
      typeof entry === "function" ? entry(answers, ctx) : entry
    );
    for (const item of inserted) {
      const at = built.findIndex((entry) => entry.id === item.after);
      built.splice(at < 0 ? built.length : at + 1, 0, item.step);
    }
    return built;
  }

  // Navigation context for one request. built holds every step in
  // order, applies holds one flag per step. Each condition runs once
  // per navigation decision, never once per node.
  interface NavContext {
    built: Step[];
    applies: boolean[];
  }

  // One flag per built step, in order. Runs every condition once
  // against the answers the wizard holds right now. Never throws.
  function applicability(
    built: Step[],
    answers: Map<string, string[]>,
  ): boolean[] {
    return built.map((entry) => stepApplies(entry, answers));
  }

  // First applying index at or after from. Returns -1 when none
  // applies, so the caller picks the fallback.
  function scanForward(
    built: Step[],
    applies: boolean[],
    from: number,
  ): number {
    for (let i = from; i < built.length; i++) {
      if (applies[i] === true) return i;
    }
    return -1;
  }

  // First applying index at or before from. Returns -1 when none
  // applies, so the caller picks the fallback.
  function scanBackward(applies: boolean[], from: number): number {
    for (let i = from; i >= 0; i--) {
      if (applies[i] === true) return i;
    }
    return -1;
  }

  // Run the arrival hook once before render. A throw never breaks
  // the render. The caller catches nothing. Never throws.
  async function runEnter(
    target: Step | undefined,
    answers: Map<string, string[]>,
    ctx: WizardCtx,
  ): Promise<void> {
    if (target === undefined) return;
    const hook = target.onEnter;
    if (typeof hook !== "function") return;
    try {
      await hook(answers, ctx);
    } catch {
      // Keep the wizard running. Render continues below.
    }
  }

  // Run the leave hook once before a move. A throw never breaks
  // the move. The caller catches nothing. Never throws.
  async function runLeave(
    target: Step | undefined,
    dir: LeaveDir,
    answers: Map<string, string[]>,
    ctx: WizardCtx,
  ): Promise<void> {
    if (target === undefined) return;
    const hook = target.onLeave;
    if (typeof hook !== "function") return;
    try {
      await hook(dir, answers, ctx);
    } catch {
      // Keep the wizard running. The move continues below.
    }
  }

  // Run one declared nav handler for a posted action. found is true
  // when a declared button owns the action, even when its handler
  // stays silent. found is false when no button owns the action, so
  // the post falls through to onSubmit.
  async function runNavButton(
    postedStep: Step,
    action: string,
    answers: Map<string, string[]>,
    fields: Record<string, string[]>,
    ctx: WizardCtx,
  ): Promise<{ found: boolean; outcome?: NavOutcome }> {
    const nav = postedStep.nav;
    if (nav === undefined) return { found: false };
    let run: NavHandler | undefined;
    if (action === "next") {
      run = typeof nav.next === "string" ? undefined : nav.next?.run;
    } else if (action === "done") {
      run = typeof nav.done === "string" ? undefined : nav.done?.run;
    } else if (action.startsWith("goto:")) {
      const target = action.slice(5);
      if (typeof nav.goto === "string") {
        if (nav.goto !== target) return { found: false };
      } else {
        if (nav.goto === undefined || nav.goto.step !== target) {
          return { found: false };
        }
        run = nav.goto.run;
      }
    } else if (action.startsWith("act:")) {
      const id = action.slice(4);
      const item = nav.actions?.find((entry) => entry.id === id);
      if (item === undefined) return { found: false };
      run = item.run;
    } else {
      return { found: false };
    }
    if (typeof run !== "function") return { found: false };
    const outcome = await run(answers, fields, ctx);
    if (outcome === undefined) return { found: true };
    return { found: true, outcome };
  }

  // Resolve a target step to its render step. Keep shared arrival work in one place.
  async function arrive(
    target: Step,
    state: SessionRecord,
    answers: Map<string, string[]>,
    ctx: WizardCtx,
    nav: NavContext,
    force = false,
  ): Promise<{ step: Step; nav: NavContext }> {
    if (typeof target.onEnter !== "function") return { step: target, nav };
    if (force === false && isArrival(target.id, state) === false) {
      return { step: target, nav };
    }
    await runEnter(target, answers, ctx);
    const fresh = buildAll(answers, ctx, state.inserted);
    const freshApplies = applicability(fresh, answers);
    const refound = fresh.find((entry) => entry.id === target.id);
    if (refound !== undefined) {
      return { step: refound, nav: { built: fresh, applies: freshApplies } };
    }
    return { step: target, nav };
  }

  // True when the move lands on a new step. The wizard compares the
  // target id against the last rendered id. A re-render keeps the
  // same id, so the hook stays silent.
  function isArrival(targetId: string, state: SessionRecord): boolean {
    return state.lastStepId !== targetId;
  }

  // Narrow a stage list to the live stage indexes. current remaps to
  // its rank among the live ones. A dead current falls to the next
  // live stage at or after it, else the last live stage.
  function narrowStages(
    names: string[],
    current: number,
    live: number[],
  ): { names: string[]; current: number } {
    const kept = live.filter((at) => at >= 0 && at < names.length);
    if (kept.length === 0 || kept.length === names.length) {
      return { names, current };
    }
    const next = live.indexOf(current) >= 0
      ? current
      : (live.find((at) => at > current) ?? live[live.length - 1] as number);
    return {
      names: kept.map((at) => names[at] as string),
      current: kept.indexOf(next),
    };
  }

  // Prepend one stages marker when the wizard names stages and the
  // step sits inside the staged flow. Builds a new node list and
  // leaves the built step untouched. When navigation context arrives,
  // stages holding no applying step drop out of the marker, so the
  // user never sees a number that counts a screen they never walk.
  // A static marker that repeats the configured names narrows the
  // same way. Without context the marker renders exactly as before.
  function withStages(entry: Step, nav?: NavContext): Step {
    const cfg = opts.stages;
    if (cfg === undefined) return entry;
    const current = cfg.stageOf(entry.id);
    if (typeof current !== "number") return entry;
    if (nav === undefined) {
      return {
        ...entry,
        nodes: [stages("Stages", cfg.names, current), ...entry.nodes],
      };
    }
    const live: number[] = [];
    // Stages with no step at all in this wizard stay: they belong to
    // a wider flow. A stage drops out only when the wizard holds its
    // steps and every one of them skips.
    for (let s = 0; s < cfg.names.length; s++) {
      let present = false;
      let kept = false;
      nav.built.forEach((item, i) => {
        if (cfg.stageOf(item.id) !== s) return;
        present = true;
        if (nav.applies[i] === true) kept = true;
      });
      if (!present || kept) live.push(s);
    }
    const head = narrowStages(cfg.names, current, live);
    const nodes = entry.nodes.map((node) => {
      if (node.kind !== "stages") return node;
      if (node.stages.length !== cfg.names.length) return node;
      if (!node.stages.every((name, i) => name === cfg.names[i])) return node;
      const narrow = narrowStages(node.stages, node.current, live);
      return stages(node.label, narrow.names, narrow.current);
    });
    return { ...entry, nodes: [stages("Stages", head.names, head.current), ...nodes] };
  }

  // Pick the newest draft entry by its timestamp. A missing or
  // broken timestamp sorts last. Returns undefined when empty.
  function newestDraft(entries: DraftEntry[]): DraftEntry | undefined {
    let best: DraftEntry | undefined;
    let bestAt = Number.NEGATIVE_INFINITY;
    for (const entry of entries) {
      const at = Date.parse(entry.at);
      const rank = Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
      if (best === undefined || rank > bestAt) {
        best = entry;
        bestAt = rank;
      }
    }
    return best;
  }

  // Read the newest app session for one request. Returns undefined
  // when the option is absent, the list is empty, or the call throws.
  async function readDraft(ctx: WizardCtx): Promise<DraftEntry | undefined> {
    if (opts.drafts === undefined) return undefined;
    try {
      const entries = await opts.drafts.list(ctx);
      if (!Array.isArray(entries)) return undefined;
      return newestDraft(entries);
    } catch {
      return undefined;
    }
  }

  // Reply with one step. A full page carries the newest app draft
  // in the footer strip. A fragment swaps the step alone.
  async function reply(
    req: Request,
    step: Step,
    state: SessionRecord,
    nav?: NavContext,
    ctx?: WizardCtx,
  ): Promise<Response> {
    state.lastStepId = step.id;
    const fragment = renderStepFragment(withStages(step, nav));
    if (req.headers.get("hx-request") === "true") return html(fragment);
    const draft = ctx === undefined ? undefined : await readDraft(ctx);
    return html(renderPage(opts.title, fragment, draft));
  }

  // Dir holding the vendored Web Awesome tree. Beside the binary in
  // a packaged app (or under APPDIR), in the checkout layouts under
  // the working dir, else beside this file (plain run, JSR cache).
  function vendorRoot(): string {
    const here = import.meta.dirname ?? ".";
    const appDir = Deno.env.get("APPDIR") ?? "";
    let cwd = "";
    try {
      cwd = Deno.cwd();
    } catch {
      // No working dir here. Fall through to the source dir.
    }
    let exec = "";
    try {
      exec = Deno.execPath().replace(/\/[^/]+$/, "");
    } catch {
      // No executable path here. Fall through to the source dir.
    }
    for (
      const dir of [
        `${appDir}/vendor`,
        `${exec}/vendor`,
        `${cwd}/vendor`,
        `${cwd}/wizardkit/vendor`,
        `${here}/vendor`,
      ]
    ) {
      try {
        if (Deno.statSync(dir).isDirectory) return dir;
      } catch {
        // Missing candidate. Try the next one.
      }
    }
    return `${here}/vendor`;
  }

  interface LiveJob {
    output: string;
    done: boolean;
    ok: boolean;
    actionId: string;
    sessionId: string;
  }

  const jobs = new Map<string, LiveJob>();

  // Set output on the action node with the given id. The walk descends
  // into spoiler plus tabs children. Returns the new node list plus
  // true when one node matched.
  function setOutputInNodes(
    nodes: Node[],
    actionId: string,
    output: string,
  ): { nodes: Node[]; found: boolean } {
    let found = false;
    const next = nodes.map((node) => {
      if (node.kind === "action" && node.id === actionId) {
        found = true;
        return { ...node, output };
      }
      if (node.kind === "spoiler") {
        const inner = setOutputInNodes(node.nodes, actionId, output);
        if (inner.found) {
          found = true;
          return { ...node, nodes: inner.nodes };
        }
        return node;
      }
      if (node.kind === "tabs") {
        let hit = false;
        const tabs = node.tabs.map((tab) => {
          const inner = setOutputInNodes(tab.nodes, actionId, output);
          if (inner.found) hit = true;
          return inner.found ? { ...tab, nodes: inner.nodes } : tab;
        });
        if (hit) {
          found = true;
          return { ...node, tabs };
        }
        return node;
      }
      return node;
    });
    return { nodes: next, found };
  }

  // Rebuild the current step and set output on one action node. Returns
  // undefined when the tracked step id is missing, no step matches, or
  // no action node matches. Never throws.
  function stepWithActionOutput(
    actionId: string,
    output: string,
    state: SessionRecord,
    ctx: WizardCtx,
  ): Step | undefined {
    try {
      if (state.lastStepId === undefined) return undefined;
      const built = buildAll(currentAnswersFor(state), ctx, state.inserted);
      const found = built.find((entry) => entry.id === state.lastStepId);
      if (found === undefined) return undefined;
      const patched = setOutputInNodes(found.nodes, actionId, output);
      if (!patched.found) return undefined;
      return { ...found, nodes: patched.nodes };
    } catch {
      return undefined;
    }
  }

  // Rebuild the current step and mark every action node finished. Used
  // when a live job is unknown or evicted, so no stored action id names
  // the panel. Returns undefined when no step or action matches.
  function stepWithFinishedAll(
    state: SessionRecord,
    ctx: WizardCtx,
  ): Step | undefined {
    try {
      if (state.lastStepId === undefined) return undefined;
      const built = buildAll(currentAnswersFor(state), ctx, state.inserted);
      const found = built.find((entry) => entry.id === state.lastStepId);
      if (found === undefined) return undefined;
      let seen = false;
      const markAll = (nodes: Node[]): Node[] =>
        nodes.map((node) => {
          if (node.kind === "action") {
            seen = true;
            return { ...node, output: "Task finished." };
          }
          if (node.kind === "spoiler") {
            return { ...node, nodes: markAll(node.nodes) };
          }
          if (node.kind === "tabs") {
            return {
              ...node,
              tabs: node.tabs.map((tab) => ({ ...tab, nodes: markAll(tab.nodes) })),
            };
          }
          return node;
        });
      const next = markAll(found.nodes);
      if (!seen) return undefined;
      return { ...found, nodes: next };
    } catch {
      return undefined;
    }
  }

  // Render a polling fragment for a live job. See LiveTask above for why
  // the target matters.
  function liveFragment(id: string, output: string): string {
    return renderToString(<LiveTask id={id} output={output} />);
  }

  // Spawn a command detached and collect chunks by job id.
  function startLive(
    command: string[],
    actionId: string,
    sessionId: string,
  ): string {
    const id = crypto.randomUUID();
    const job: LiveJob = {
      output: "",
      done: false,
      ok: true,
      actionId,
      sessionId,
    };
    jobs.set(id, job);
    void spawnCapture(command, async (prog, rest) => {
      const child = new Deno.Command(prog, {
        args: rest,
        stdout: "piped",
        stderr: "piped",
      }).spawn();
      const decoder = new TextDecoder();
      async function pump(stream: ReadableStream<Uint8Array>): Promise<void> {
        for await (const chunk of stream) {
          job.output += decoder.decode(chunk, { stream: true });
        }
      }
      await Promise.all([pump(child.stdout), pump(child.stderr)]);
      const status = await child.status;
      job.output += decoder.decode();
      job.ok = status.success;
      return job.output;
    }).then((result) => {
      job.output = result.output;
      job.ok = result.ok;
      job.done = true;
    });
    return id;
  }

  // Serve one file from a root dir. Refuse escapes, hidden
  // segments, directories, plus missing paths with a 404.
  async function serveFile(
    pathname: string,
    prefix: string,
    root: string,
  ): Promise<Response> {
    const fail = new Response("Not found", { status: 404 });
    let sub: string;
    try {
      sub = decodeURIComponent(pathname.slice(prefix.length));
    } catch {
      return fail;
    }
    const parts = sub.split("/").slice(1);
    if (parts.length === 0) return fail;
    for (const part of parts) {
      if (part === "" || part === "." || part === "..") return fail;
      if (part.startsWith(".")) return fail;
    }
    const base = root.replace(/\/+$/, "");
    let data: Uint8Array;
    try {
      data = await Deno.readFile(base + "/" + parts.join("/"));
    } catch {
      return fail;
    }
    const last = parts[parts.length - 1] ?? "";
    const dot = last.lastIndexOf(".");
    const ext = dot < 0 ? "" : last.slice(dot + 1).toLowerCase();
    const type = FILE_TYPES[ext] ?? "application/octet-stream";
    return new Response(data.buffer as ArrayBuffer, {
      headers: { "content-type": type },
    });
  }

  // The stored log lacks this post.
  // Fold the post over stored answers.
  function navAnswersFor(
    state: SessionRecord,
    fields: Record<string, string[]>,
  ): Map<string, string[]> {
    const merged = new Map(currentAnswersFor(state));
    for (const [name, values] of Object.entries(fields)) merged.set(name, values);
    return merged;
  }

  // Handle one step post. Split out so step posts serialize.
  async function handleStep(
    req: Request,
    state: SessionRecord,
    ctx: WizardCtx,
  ): Promise<Response> {
    const form = await req.formData();
    const stepId = String(form.get("step") ?? "");
    const action = String(form.get("action") ?? "next");
    // A stray button after Done re-renders the summary. A custom
    // done screen navigates like any other step, so this path
    // applies only to the default summary.
    if (
      stepId === "done" &&
      action !== "restart" &&
      action !== "done" &&
      state.doneStep &&
      opts.done === undefined
    ) {
      return reply(req, state.doneStep, state, undefined, ctx);
    }
    const fields: Record<string, string[]> = {};
    for (const [key, value] of form) {
      if (key === "step" || key === "action") continue;
      if (typeof value !== "string") continue;
      const old = fields[key] ?? [];
      old.push(value);
      fields[key] = old;
    }
    // Entries marked onConfirm stay out of the answers map
    // until Done. Hold their posted values aside here.
    const posted = buildAll(currentAnswersFor(state), ctx, state.inserted);
    const heldFields: Record<string, string[]> = {};
    for (const name of heldNames(posted.find((item) => item.id === stepId))) {
      const values = fields[name];
      if (values !== undefined) heldFields[name] = values;
      delete fields[name];
    }
    // Step that posted this form. Nav handlers plus the leave hook
    // read it below.
    const postedStep = posted.find((item) => item.id === stepId);
    // Run one declared nav handler instead of onSubmit. Back never
    // runs a handler, so it always falls through.
    let navResult: { found: boolean; outcome?: NavOutcome } = {
      found: false,
    };
    if (postedStep !== undefined && action !== "back" && action !== "restart") {
      navResult = await runNavButton(
        postedStep,
        action,
        navAnswersFor(state, fields),
        fields,
        ctx,
      );
    }
    const outcome = navResult.found
      ? undefined
      : await opts.onSubmit?.(fields, stepId, action, ctx);
    // A veto never blocks a backward move. Back plus restart still
    // call the hook above, so apps record what was typed, but the
    // errors below never reject the post here.
    const backward = action === "back" || action === "restart";
    // Errors from a nav handler re-render exactly like an onSubmit
    // veto. Nothing logs and no move runs.
    const hookErrors = navResult.found
      ? navResult.outcome?.errors
      : outcome?.errors;
    if (!backward && hookErrors !== undefined && hookErrors.length > 0) {
      // Reject the post. Nothing appends. Re-render the current step
      // with the joined errors on the first node error field.
      // Build the step again here, after the hook ran. A hook that
      // records the rejected post needs that record to reach this
      // render, or the user loses whatever they just typed.
      const vetoAnswers = currentAnswersFor(state);
      const rebuilt = buildAll(vetoAnswers, ctx, state.inserted);
      const vetoApplies = applicability(rebuilt, vetoAnswers);
      const cur = rebuilt.find((item) => item.id === stepId) ??
        posted.find((item) => item.id === stepId) ?? rebuilt[0];
      const nodes = cur.nodes.length > 0
        ? [
          { ...cur.nodes[0], error: hookErrors.join(" ") },
          ...cur.nodes.slice(1),
        ]
        : [markdown(hookErrors.join(" "))];
      return reply(req, { ...cur, nodes }, state, {
        built: rebuilt,
        applies: vetoApplies,
      }, ctx);
    }
    // A nav handler names no insert. Its goto rides the same path
    // as an onSubmit goto below.
    const hookInsert = navResult.found ? undefined : outcome?.insert;
    const hookGoto = navResult.found ? navResult.outcome?.goto : outcome?.goto;
    if (!backward && hookInsert !== undefined) {
      state.inserted.push({ after: stepId, step: hookInsert });
    }
    state.events.push({ action, step: stepId, fields, at: Date.now() });
    if (action === "restart") {
      state.events.length = 0;
      state.pending.length = 0;
      state.inserted.length = 0;
      state.history.length = 0;
      state.doneStep = undefined;
    }
    const answers = currentAnswersFor(state);
    const built = buildAll(answers, ctx, state.inserted);
    if (built.length === 0) {
      return new Response("No steps", { status: 500 });
    }
    // Leave direction for the pressed button. A custom action leaves
    // as goto only when its handler names a step.
    let leaveDir: LeaveDir | undefined;
    if (action === "back") leaveDir = "back";
    else if (action === "next") leaveDir = "next";
    else if (action === "done") leaveDir = "done";
    else if (action.startsWith("goto:")) leaveDir = "goto";
    else if (
      action.startsWith("act:") &&
      navResult.found &&
      navResult.outcome?.goto !== undefined
    ) {
      leaveDir = "goto";
    }
    if (action === "done") {
      for (const [name, values] of Object.entries(heldFields)) {
        answers.set(name, values);
      }
      await runLeave(postedStep, "done", answers, ctx);
      let total = 0;
      for (const values of answers.values()) total += values.length;
      const outNodes: Node[] = [
        markdown("## Done\n" + total + " answers recorded."),
      ];
      for (const id of state.pending) {
        const node = findAction(built, id);
        if (node === undefined) continue;
        const staged = resolveCommandMarkers(node.command, (name) => {
          const values = answers.get(name);
          if (values === undefined || values.length === 0) return undefined;
          return values.length === 1 ? values[0] : values.join(" ");
        });
        if (staged.missing !== undefined) {
          const message = "Type a value for " + staged.missing +
            " first, then press the button again.";
          outNodes.push(markdown("**" + node.label + "**\n" + message));
          continue;
        }
        const result = await runCommand(staged.argv);
        const mark = result.ok ? "" : " (failed)";
        outNodes.push(
          markdown("**" + node.label + "**\n" + result.output + mark),
        );
      }
      state.pending.length = 0;
      const target = (await opts.onDone?.(answers))?.goto;
      const doneApplies = applicability(built, answers);
      const doneNav: NavContext = { built, applies: doneApplies };
      if (target !== undefined) {
        const at = built.findIndex((entry) => entry.id === target);
        if (at >= 0) {
          // A goto naming a skipped step lands on the next applying
          // step after it. No applying step keeps the summary screen.
          const hit = scanForward(built, doneApplies, at);
          if (hit >= 0) {
            const pick = built[hit];
            if (pick !== undefined) {
              const resolvedGoto = await arrive(pick, state, answers, ctx, doneNav);
              return reply(req, resolvedGoto.step, state, resolvedGoto.nav, ctx);
            }
          }
        }
      }
      if (opts.done !== undefined) {
        let custom: Step | undefined;
        try {
          custom = typeof opts.done === "function"
            ? opts.done(answers)
            : opts.done;
        } catch {
          custom = undefined;
        }
        if (custom !== undefined) {
          if (
            typeof custom.onEnter === "function" &&
            isArrival(custom.id, state)
          ) {
            await runEnter(custom, answers, ctx);
            try {
              const again = typeof opts.done === "function"
                ? opts.done(answers)
                : opts.done;
              custom = again;
            } catch {
              // Keep the first custom step.
            }
          }
          if (custom.id !== stepId) {
            state.history.push(stepId);
            while (state.history.length > 50) state.history.shift();
          }
          state.doneStep = custom;
          return reply(req, custom, state, doneNav, ctx);
        }
      }
      state.doneStep = step("done", "Done", [
        ...outNodes,
        buttons([{ label: "Start over", action: "restart" }]),
      ]);
      return reply(req, state.doneStep, state, doneNav, ctx);
    }
    // One flag per step, in order. Every condition runs once here
    // against the posted answers, and every move below reuses it.
    const applies = applicability(built, answers);
    const nav: NavContext = { built, applies };
    // Back pops the visit path. A hook goto or insert never
    // redirects a backward move. A popped step whose condition now
    // fails keeps popping, so Back skips the same steps in reverse.
    if (action === "back") {
      while (state.history.length > 0) {
        const prev = state.history.pop() as string;
        const at = built.findIndex((entry) => entry.id === prev);
        if (at >= 0 && applies[at] === true) {
          const found = built[at];
          if (found !== undefined) {
            await runLeave(postedStep, "back", answers, ctx);
            const resolvedBack = await arrive(found, state, answers, ctx, nav);
            return reply(req, resolvedBack.step, state, resolvedBack.nav, ctx);
          }
        }
      }
      // Empty history falls through to the neighbour entry below.
    }
    let current = built.findIndex((step) => step.id === stepId);
    if (current < 0) current = 0;
    current = clamp(current, built.length - 1);
    let index = current;
    let dir: "forward" | "backward" | "stay" = "stay";
    if (action === "next") {
      index = current + 1;
      dir = "forward";
    } else if (action === "back") {
      index = current - 1;
      dir = "backward";
    } else if (action === "restart") {
      index = 0;
      dir = "forward";
    } else if (action.startsWith("goto:")) {
      dir = "forward";
      const raw = action.slice(5);
      const at = parseInt(raw, 10);
      if (!Number.isNaN(at) && String(at) === raw) {
        index = clamp(at, built.length - 1);
      } else {
        // Button targets name a step id. The built list holds steps
        // that raw entry indices cannot see, so ids stay correct.
        const found = built.findIndex((entry) => entry.id === raw);
        if (found >= 0) index = found;
      }
    }
    if (!backward && hookInsert !== undefined) {
      const at = built.findIndex((entry) => entry.id === hookInsert?.id);
      if (at >= 0) {
        index = at;
        dir = "forward";
      }
    } else if (!backward && hookGoto !== undefined) {
      const at = built.findIndex((entry) => entry.id === hookGoto);
      if (at >= 0) {
        index = at;
        dir = "forward";
      }
    }
    // Next plus goto land on the first applying step at or after the
    // target. Back lands on the first applying step at or before it.
    // A move with nowhere to go holds its place.
    if (dir === "forward") {
      const hit = scanForward(built, applies, index);
      index = hit >= 0 ? hit : current;
    } else if (dir === "backward") {
      const hit = scanBackward(applies, index);
      index = hit >= 0 ? hit : current;
    } else {
      index = clamp(index, built.length - 1);
    }
    const pick = built[clamp(index, built.length - 1)];
    if (pick === undefined) {
      return new Response("No steps", { status: 500 });
    }
    // Run the leave hook once before a real move. A re-render keeps
    // the step id, so the hook stays silent there.
    if (leaveDir !== undefined && pick.id !== stepId) {
      await runLeave(postedStep, leaveDir, answers, ctx);
    }
    const resolvedMove = await arrive(pick, state, answers, ctx, nav, action === "restart");
    const finalPick = resolvedMove.step;
    const finalNav = resolvedMove.nav;
    // Push the left step on a real forward move. Back, restart,
    // plus done never push. Unknown actions that hold the place
    // also leave the path alone.
    if (action !== "back" && action !== "restart" && action !== "done") {
      if (finalPick.id !== stepId) {
        state.history.push(stepId);
        while (state.history.length > 50) state.history.shift();
      }
    }
    return reply(req, finalPick, state, finalNav, ctx);
  }

  // Resume one app session. A step id moves there like a named
  // move. A null return re-renders the current step with one error
  // line. No drafts option answers 404. Never throws.
  async function handleDraftResume(
    req: Request,
    state: SessionRecord,
    ctx: WizardCtx,
  ): Promise<Response> {
    if (opts.drafts === undefined) {
      return new Response("Not found", { status: 404 });
    }
    const form = await req.formData();
    const id = String(form.get("id") ?? "");
    let target: string | null = null;
    try {
      target = await opts.drafts.resume(id, ctx);
    } catch {
      target = null;
    }
    const answers = currentAnswersFor(state);
    const built = buildAll(answers, ctx, state.inserted);
    if (built.length === 0) {
      return new Response("No steps", { status: 500 });
    }
    const applies = applicability(built, answers);
    const nav: NavContext = { built, applies };
    if (typeof target === "string") {
      const found = built.find((entry) => entry.id === target);
      if (found !== undefined) {
        const prev = state.lastStepId;
        if (prev !== undefined && prev !== found.id) {
          state.history.push(prev);
          while (state.history.length > 50) state.history.shift();
        }
        const resolved = await arrive(found, state, answers, ctx, nav);
        return await reply(req, resolved.step, state, resolved.nav, ctx);
      }
    }
    const cur = built.find((entry) => entry.id === state.lastStepId) ??
      built[0];
    const line = "That session could not open.";
    const nodes = cur.nodes.length > 0
      ? [
        { ...cur.nodes[0], error: line },
        ...cur.nodes.slice(1),
      ]
      : [markdown(line)];
    return await reply(req, { ...cur, nodes }, state, nav, ctx);
  }

  async function route(
    req: Request,
    sessionId: string,
    state: SessionRecord,
    ctx: WizardCtx,
  ): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.startsWith("/vendor/")) {
      return serveFile(url.pathname, "/vendor", vendorRoot());
    }
    if (req.method === "GET" && url.pathname === "/") {
      const rootAnswers = currentAnswersFor(state);
      let rootBuilt = buildAll(rootAnswers, ctx, state.inserted);
      if (rootBuilt.length === 0) return new Response("No steps", { status: 500 });
      let rootApplies = applicability(rootBuilt, rootAnswers);
      const rootHit = scanForward(rootBuilt, rootApplies, 0);
      let first = rootBuilt[rootHit >= 0 ? rootHit : 0];
      if (first === undefined) return new Response("No steps", { status: 500 });
      const resolvedRoot = await arrive(first, state, rootAnswers, ctx, {
        built: rootBuilt,
        applies: rootApplies,
      });
      first = resolvedRoot.step;
      rootBuilt = resolvedRoot.nav.built;
      rootApplies = resolvedRoot.nav.applies;
      return reply(req, first, state, {
        built: rootBuilt,
        applies: rootApplies,
      }, ctx);
    }
    if (req.method === "POST" && url.pathname === "/step") {
      // Serialize step posts. One in flight holds the others.
      while (stepBusy) await new Promise((r) => setTimeout(r, 10));
      stepBusy = true;
      try {
        return await handleStep(req, state, ctx);
      } finally {
        stepBusy = false;
      }
    }
    if (req.method === "POST" && url.pathname === "/draft-resume") {
      // Share the step lock. One in flight holds the others.
      while (stepBusy) await new Promise((r) => setTimeout(r, 10));
      stepBusy = true;
      try {
        return await handleDraftResume(req, state, ctx);
      } finally {
        stepBusy = false;
      }
    }
    if (req.method === "POST" && url.pathname === "/action") {
      const form = await req.formData();
      const id = String(form.get("id") ?? "");
      const built = buildAll(currentAnswersFor(state), ctx, state.inserted);
      const node = findAction(built, id);
      const command = node?.command ?? opts.actions?.[id]?.command;
      if (command === undefined) {
        return html(
          renderPage(opts.title, renderToString(<p>Unknown action.</p>)),
        );
      }
      if (node?.run === "onConfirm") {
        if (!state.pending.includes(id)) state.pending.push(id);
        const staged = `<p class="action-note">Staged. It runs on Done.</p>`;
        if (req.headers.get("hx-request") === "true") return html(staged);
        try {
          const again = stepWithActionOutput(
            id,
            "Staged. It runs on Done.",
            state,
            ctx,
          );
          if (again !== undefined) return reply(req, again, state, undefined, ctx);
        } catch {
          // Fall through to the bare page below.
        }
        return html(renderPage(opts.title, staged));
      }
      const resolved = resolveCommandMarkers(command, (name) => {
        const value = form.get(name);
        return typeof value === "string" ? value : undefined;
      });
      if (resolved.missing !== undefined) {
        const message = "Type a value for " + resolved.missing +
          " first, then press the button again.";
        const missingBody = renderToString(<TaskOutput output={message} />);
        if (req.headers.get("hx-request") === "true") return html(missingBody);
        try {
          const again = stepWithActionOutput(id, message, state, ctx);
          if (again !== undefined) return reply(req, again, state, undefined, ctx);
        } catch {
          // Fall through to the bare page below.
        }
        return html(renderPage(opts.title, missingBody));
      }
      const argv = resolved.argv;
      if (node?.live === true) {
        const jobId = startLive(argv, id, sessionId);
        const job = jobs.get(jobId);
        const body = liveFragment(jobId, job?.output ?? "");
        if (req.headers.get("hx-request") === "true") return html(body);
        try {
          const again = stepWithActionOutput(id, job?.output ?? "", state, ctx);
          if (again !== undefined) return reply(req, again, state, undefined, ctx);
        } catch {
          // Fall through to the bare page below.
        }
        return html(renderPage(opts.title, body));
      }
      const result = await runCommand(argv);
      const mark = result.ok ? "" : " (failed)";
      const body = renderToString(
        <TaskOutput output={result.output} failed={!result.ok} />,
      );
      if (req.headers.get("hx-request") === "true") return html(body);
      try {
        const again = stepWithActionOutput(id, result.output + mark, state, ctx);
        if (again !== undefined) return reply(req, again, state);
      } catch {
        // Fall through to the bare page below.
      }
      return html(renderPage(opts.title, body));
    }
    if (req.method === "GET" && url.pathname.startsWith("/task/")) {
      const id = decodeURIComponent(url.pathname.slice("/task/".length));
      const job = jobs.get(id);
      if (job === undefined || job.sessionId !== sessionId) {
        // Dead polls get a finished fragment, not a 404 the poller dies on.
        // A poll from a foreign session sees the same finished fragment
        // and never sees the owning session output.
        const body = renderToString(<p>Task finished.</p>);
        if (req.headers.get("hx-request") === "true") return html(body);
        try {
          const again = stepWithFinishedAll(state, ctx);
          if (again !== undefined) return reply(req, again, state, undefined, ctx);
        } catch {
          // Fall through to the bare page below.
        }
        return html(renderPage(opts.title, body));
      }
      if (job.done) {
        const mark = job.ok ? "" : " (failed)";
        const body = renderToString(
          <TaskOutput output={job.output} failed={!job.ok} />,
        );
        const output = job.output + mark;
        const actionId = job.actionId;
        jobs.delete(id);
        if (req.headers.get("hx-request") === "true") return html(body);
        try {
          const again = stepWithActionOutput(actionId, output, state, ctx);
          if (again !== undefined) return reply(req, again, state, undefined, ctx);
        } catch {
          // Fall through to the bare page below.
        }
        return html(renderPage(opts.title, body));
      }
      const body = liveFragment(id, job.output);
      if (req.headers.get("hx-request") === "true") return html(body);
      try {
        const again = stepWithActionOutput(job.actionId, job.output, state, ctx);
        if (again !== undefined) return reply(req, again, state);
      } catch {
        // Fall through to the bare page below.
      }
      return html(renderPage(opts.title, body));
    }
    const prefix = opts.files?.prefix ?? "/files";
    if (
      req.method === "GET" &&
      opts.files !== undefined &&
      (url.pathname === prefix || url.pathname.startsWith(prefix + "/"))
    ) {
      return await serveFile(url.pathname, prefix, opts.files?.root ?? "");
    }
    return new Response("Not found", { status: 404 });
  }

  // Single entry point. Reads or mints the session cookie in one place,
  // then runs every route with that session record.
  const handle = async function (req: Request): Promise<Response> {
    let sessionId = parseSessionId(req);
    let isNew = false;
    if (sessionId === undefined) {
      sessionId = crypto.randomUUID();
      isNew = true;
    }
    const state = getSession(sessionId);
    const ctx: WizardCtx = { sessionId };
    const res = await route(req, sessionId, state, ctx);
    if (isNew) {
      const value = `${SESSION_COOKIE}=${
        encodeURIComponent(sessionId)
      }; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`;
      res.headers.append("Set-Cookie", value);
    }
    return res;
  };

  // Expose the session map plus the latest touch for probes and tests.
  // events and pending stay as live views of the latest session so
  // older probes keep working.
  const api = handle as ((req: Request) => Promise<Response>) & {
    events: WizardEvent[];
    pending: string[];
    sessions: Map<string, SessionRecord>;
  };
  Object.defineProperties(api, {
    events: { get: () => lastTouched?.events ?? [], configurable: true },
    pending: { get: () => lastTouched?.pending ?? [], configurable: true },
  });
  api.sessions = sessions;
  return api;
}
