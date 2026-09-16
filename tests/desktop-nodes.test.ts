// Tests for the desktop wizard toolkit core. Run with deno test.
// Each case checks one node kind or one render rule from D1.

import {
  action,
  answers,
  buttons,
  checkbox,
  copyable,
  markdown,
  menu,
  nav,
  numberEntry,
  progress,
  radio,
  repeating,
  spoiler,
  stages,
  step,
  table,
  tabs,
  textarea,
  textEntry,
  tree,
  validateStep,
} from "../wizardkit/mod.ts";
import {
  createWizard,
  renderNode,
  renderPage,
  renderStepFragment,
  replayAnswers,
  runCommand,
  type WizardEvent,
} from "../wizardkit/mod.ts";
import { styleStep } from "../wizardkit/examples/demo.ts";

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

// True when the list holds a message naming the kind.
function namesKind(errors: string[], kind: string): boolean {
  return errors.some((item) => item.includes(kind));
}

// Keep one browser session across requests in older tests. The wrapper
// stores the Set-Cookie value and sends it back, so every post in one
// test lands in one session. It forwards events, pending and sessions.
function sticky(
  handle: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  let cookie = "";
  const inner = handle as unknown as Record<string, unknown>;
  const fn = async (req: Request): Promise<Response> => {
    let out = req;
    if (cookie !== "") {
      const headers = new Headers(req.headers);
      headers.set("cookie", cookie);
      out = new Request(req, { headers });
    }
    const res = await (handle as (r: Request) => Promise<Response>)(out);
    const set = res.headers.get("set-cookie");
    if (set !== null) {
      const m = set.match(/wizard-sid=([^;]+)/);
      if (m && m[1]) cookie = "wizard-sid=" + m[1];
    }
    return res;
  };
  Object.defineProperties(fn, {
    events: {
      get: () => (inner as { events: unknown }).events,
      configurable: true,
    },
    pending: {
      get: () => (inner as { pending: unknown }).pending,
      configurable: true,
    },
    sessions: {
      get: () => (inner as { sessions: unknown }).sessions,
      configurable: true,
    },
  });
  return fn as (req: Request) => Promise<Response>;
}

// Build a wizard with a sticky session, so older multi-post tests keep
// one session without touching their assertions.
function wiz(
  opts: Parameters<typeof createWizard>[0],
): ReturnType<typeof createWizard> {
  return sticky(createWizard(opts)) as ReturnType<typeof createWizard>;
}

// Build one good step with every core node kind.
function goodStep() {
  return step("s1", "Sample", [
    markdown("Some **info** text."),
    menu("Split style", ["Equal", "Percent"], "style"),
    tree("Plan", [{ text: "Pick style", state: "current" }]),
    progress("Coverage", 1, 0, 2),
    radio("Share the fee", "fee", ["Equal", "Skip"], "Equal"),
    checkbox("People", "who", ["Ana", "Bo"], ["Ana"]),
    textEntry("Run name", "run", "Friday", "Dinner"),
    numberEntry("Total paid", "total", 100),
    buttons([{ label: "Next", action: "next" }]),
  ]);
}

Deno.test("validation accepts a good step with every node kind", () => {
  // Feed the full good step to the validator.
  assert(validateStep(goodStep()).length === 0, "good step has no errors");
});

Deno.test("validation rejects a bad menu with a message", () => {
  // Empty the option list.
  const step = goodStep();
  step.nodes[1] = menu("Split style", [], "style");
  const errors = validateStep(step);
  assert(
    errors.length > 0 && namesKind(errors, "menu"),
    "menu error names menu",
  );
});

Deno.test("validation rejects a bad tree with a message", () => {
  // Point one row at an unknown state.
  const step = goodStep();
  const badTree = {
    kind: "tree",
    label: "Plan",
    rows: [{ text: "x", state: "late" }],
  } as unknown as ReturnType<typeof tree>;
  step.nodes[2] = badTree;
  const errors = validateStep(step);
  assert(
    errors.length > 0 && namesKind(errors, "tree"),
    "tree error names tree",
  );
});

Deno.test("validation rejects a bad progress with a message", () => {
  // Push one count below zero.
  const step = goodStep();
  step.nodes[3] = progress("Coverage", -1, 0, 2);
  const errors = validateStep(step);
  assert(
    errors.length > 0 && namesKind(errors, "progress"),
    "progress names kind",
  );
});

Deno.test("validation rejects a bad radio with a message", () => {
  // Pick a value outside the option list.
  const step = goodStep();
  step.nodes[4] = radio("Share the fee", "fee", ["Equal"], "Skip");
  const errors = validateStep(step);
  assert(
    errors.length > 0 && namesKind(errors, "radio"),
    "radio error names radio",
  );
});

Deno.test("validation rejects a bad checkbox with a message", () => {
  // Tick a name outside the option list.
  const step = goodStep();
  step.nodes[5] = checkbox("People", "who", ["Ana"], ["Zoe"]);
  const errors = validateStep(step);
  assert(
    errors.length > 0 && namesKind(errors, "checkbox"),
    "checkbox names kind",
  );
});

Deno.test("validation rejects a bad text entry with a message", () => {
  // Blank the field name.
  const step = goodStep();
  step.nodes[6] = textEntry("Run name", "  ");
  const errors = validateStep(step);
  assert(
    errors.length > 0 && namesKind(errors, "text"),
    "text error names text",
  );
});

Deno.test("validation rejects a bad number entry with a message", () => {
  // Feed a non-finite value.
  const step = goodStep();
  step.nodes[7] = numberEntry("Total paid", "total", NaN);
  const errors = validateStep(step);
  assert(errors.length > 0 && namesKind(errors, "number"), "number names kind");
});

Deno.test("validation rejects bad buttons with a message", () => {
  // Blank the action id.
  const step = goodStep();
  step.nodes[8] = buttons([{ label: "Next", action: "  " }]);
  const errors = validateStep(step);
  assert(
    errors.length > 0 && namesKind(errors, "buttons"),
    "buttons names kind",
  );
});

Deno.test("validation rejects a bad markdown panel with a message", () => {
  // Blank the info text.
  const step = goodStep();
  step.nodes[0] = markdown("   ");
  const errors = validateStep(step);
  assert(
    errors.length > 0 && namesKind(errors, "markdown"),
    "markdown names kind",
  );
});

Deno.test("validation rejects junk input without throwing", () => {
  // Feed null, text, plus an unknown kind.
  assert(validateStep(null).length > 0, "null step fails");
  assert(validateStep("nope").length > 0, "text step fails");
  const odd = step("s", "S", [markdown("ok")]);
  (odd.nodes[0] as { kind: string }).kind = "laser";
  assert(validateStep(odd).length > 0, "unknown kind fails");
});

Deno.test("renderer output contains the node label", () => {
  // Render the full good step.
  const html = renderStepFragment(goodStep());
  assert(html.includes("Sample"), "fragment holds the step title");
  assert(html.includes("Split style"), "fragment holds the menu label");
  assert(html.includes("Plan"), "fragment holds the tree label");
  assert(html.includes("Coverage"), "fragment holds the progress label");
  assert(html.includes("/step"), "form posts to /step");
  // Render the page shell too.
  const page = renderPage("Demo", html);
  assert(page.includes("htmx"), "page loads HTMX");
  assert(
    page.includes("/vendor/htmx/htmx.min.js"),
    "page loads HTMX from the vendored path",
  );
  assert(!page.includes("unpkg"), "page has no CDN reference");
  assert(page.includes("Demo"), "page holds the title");
});

Deno.test("action output stays local, styled, and auto-scrolls", async () => {
  // The served page never points at unpkg.
  const page = renderPage("Demo", renderStepFragment(goodStep()));
  assert(!page.includes("unpkg.com"), "page never references unpkg");
  // The panel CSS rule ships with the page.
  assert(
    page.includes(".action-out") && page.includes("max-height"),
    "action output panel CSS is present",
  );
  // The auto-scroll hook rides the page script.
  assert(
    page.includes("scrollHeight"),
    "page script scrolls the output panel",
  );
  // The vendored HTMX file exists and boots (version marker).
  const htmxPath = new URL("../wizardkit/vendor/htmx/htmx.min.js", import.meta.url);
  const htmx = await Deno.readTextFile(htmxPath);
  assert(
    htmx.includes('version:"2.0.4"'),
    "vendored HTMX is pinned at 2.0.4",
  );
});

Deno.test("renderer shows a step note under the title", () => {
  // Render a step with a note and one without.
  const withNote = step("s", "S", [markdown("ok")], "Mind the <b>gap</b>");
  const html = renderStepFragment(withNote);
  assert(html.includes("wiz-step-note"), "note line has its class");
  assert(html.includes("Mind the &lt;b"), "note is escaped");
  assert(html.includes("</h2>"), "title stays intact");
  const plain = step("s", "S", [markdown("ok")]);
  assert(
    !renderStepFragment(plain).includes("wiz-step-note"),
    "absent note renders no line",
  );
  // Validation allows an absent note and rejects junk notes.
  assert(validateStep(withNote).length === 0, "good note passes");
  const blank = step("s", "S", [markdown("ok")], "   ");
  assert(validateStep(blank).length > 0, "blank note fails");
});

Deno.test("draft key follows the wizard title", () => {
  // Render two pages and compare the draft keys in their scripts.
  function keyOf(page: string): string {
    const m = page.match(/var KEY = ("[^"]+")/);
    if (!m) throw new Error("assert failed: page holds no draft key");
    return m[1];
  }
  const a = keyOf(renderPage("Demo", renderStepFragment(goodStep())));
  const b = keyOf(renderPage("Other", renderStepFragment(goodStep())));
  const a2 = keyOf(renderPage("Demo", renderStepFragment(goodStep())));
  assert(a !== b, "different titles give different keys");
  assert(a === a2, "same title keeps one key");
});

Deno.test("renderer escapes a hostile string", () => {
  // Feed script markup as a value plus as panel text.
  const hostile = `<script>alert("x")</script>`;
  const entry = renderNode(textEntry("Run name", "run", hostile));
  assert(entry.includes("Run name"), "entry keeps its label");
  assert(entry.includes("&lt;script"), "entry escapes the markup");
  assert(!entry.includes("<script>"), "entry holds no raw markup");
  const panel = renderNode(markdown(hostile));
  assert(panel.includes("&lt;script"), "panel escapes the markup");
  assert(!panel.includes("<script>"), "panel holds no raw markup");
});

Deno.test("renderer shows a textarea and an inline error", () => {
  // Render a textarea with an explicit row count.
  const area = renderNode(textarea("Notes", "notes", { rows: 5 }));
  assert(area.includes("<wa-textarea"), "textarea uses wa-textarea");
  assert(area.includes('rows="5"'), "textarea keeps its row count");
  // Render a text entry carrying an inline error.
  const bad = renderNode({
    ...textEntry("Run name", "run"),
    error: "Name is required",
  });
  assert(bad.includes("Name is required"), "error text appears");
  assert(
    bad.indexOf("Name is required") > bad.indexOf('name="run"'),
    "error sits under the node body",
  );
});

Deno.test("validation accepts good stages, spoiler, plus tabs", () => {
  // Feed one good node of each new kind.
  const st = step("s2", "More", [
    stages("Stages", ["Pick style", "Add people", "Review"], 1),
    spoiler("Answers", [markdown("Some text.")]),
    tabs([
      { label: "People", nodes: [checkbox("Who", "who", ["Ana"], [])] },
      { label: "Amounts", nodes: [numberEntry("Total", "total", 5)] },
    ]),
  ]);
  assert(validateStep(st).length === 0, "new kinds pass");
});

Deno.test("validation rejects bad stages with a message", () => {
  // Point current past the last stage.
  const st = step("s2", "More", [
    stages("Stages", ["Pick style", "Add people"], 4),
  ]);
  const errors = validateStep(st);
  assert(errors.length > 0 && namesKind(errors, "stages"), "stages name kind");
  // Keep only one stage name.
  const short = step("s2", "More", [stages("Stages", ["Solo"], 0)]);
  const shortErrors = validateStep(short);
  assert(shortErrors.length > 0, "one stage fails");
});

Deno.test("validation rejects a bad spoiler with a message", () => {
  // Blank the label and empty the children.
  const st = step("s2", "More", [spoiler("  ", [])]);
  const errors = validateStep(st);
  assert(
    errors.length > 0 && namesKind(errors, "spoiler"),
    "spoiler names kind",
  );
});

Deno.test("validation rejects bad tabs with a message", () => {
  // Blank the tab label and empty its children.
  const st = step("s2", "More", [tabs([{ label: "  ", nodes: [] }])]);
  const errors = validateStep(st);
  assert(errors.length > 0 && namesKind(errors, "tabs"), "tabs name kind");
});

Deno.test("validation recurses into spoiler plus tabs children", () => {
  // Hide a blank markdown panel inside each container.
  const inSpoiler = step("s2", "More", [spoiler("Answers", [markdown("   ")])]);
  assert(validateStep(inSpoiler).length > 0, "spoiler child fails");
  const inTabs = step("s2", "More", [
    tabs([{ label: "Tab", nodes: [markdown("   ")] }]),
  ]);
  assert(validateStep(inTabs).length > 0, "tab child fails");
});

Deno.test("stages render index rows with no state words", () => {
  // Render three stages with the middle one current.
  const html = renderNode(
    stages("Stages", ["Pick style", "Add people", "Review"], 1),
  );
  assert(html.includes("Stages"), "stages keep the label");
  assert(html.includes("1/3"), "first row shows its index");
  assert(html.includes("2/3"), "current row shows its index");
  assert(html.includes("3/3"), "last row shows its index");
  assert(html.includes("goto:1"), "current row posts its action");
  assert(!html.includes("done"), "no done word appears");
  assert(!html.includes("current"), "no current word appears");
});

Deno.test("spoiler renders a details block", () => {
  // Render a spoiler around one markdown child.
  const html = renderNode(spoiler("Answers", [markdown("Some text.")]));
  assert(html.includes("<wa-details"), "spoiler uses wa-details");
  assert(html.includes("Answers"), "spoiler keeps the label");
  assert(html.includes("Some text."), "spoiler holds the child");
});

Deno.test("tabs render two panels", () => {
  // Render two tabs with one child each.
  const html = renderNode(
    tabs([
      { label: "People", nodes: [checkbox("Who", "who", ["Ana"], [])] },
      { label: "Amounts", nodes: [numberEntry("Total", "total", 5)] },
    ]),
  );
  assert(html.includes("People"), "tabs keep the first label");
  assert(html.includes("Amounts"), "tabs keep the second label");
  assert(html.includes("<wa-tab-group>"), "tabs use the group");
  const panels = html.split("<wa-tab-panel").length - 1;
  assert(panels === 2, "tabs render two panels");
});

Deno.test("renderer escapes a hostile stage name", () => {
  // Feed markup as a stage name.
  const html = renderNode(stages("Stages", ["<b>Bold</b>", "Plain"], 0));
  assert(html.includes("&lt;b"), "stage escapes the markup");
  assert(!html.includes("<b>"), "stage holds no raw markup");
});

Deno.test("validation accepts a good action", () => {
  // Feed one action node with id plus command.
  const st = step("s1", "Sample", [
    action("Show system date", "date", ["date"]),
  ]);
  assert(validateStep(st).length === 0, "good action passes");
});

Deno.test("validation rejects a bad action with a message", () => {
  // Blank the id and empty the command.
  const st = step("s1", "Sample", [action("Run it", "  ", [])]);
  const errors = validateStep(st);
  assert(errors.length > 0 && namesKind(errors, "action"), "action names kind");
});

Deno.test("runCommand echo returns ok plus output", async () => {
  // Run echo with one word.
  const result = await runCommand(["echo", "hi"]);
  assert(result.ok === true, "echo exits zero");
  assert(result.output === "hi", "echo output trims the newline");
});

Deno.test("action renders a button naming its id", () => {
  // Render the demo date action.
  const html = renderNode(action("Show system date", "date", ["date"]));
  assert(html.includes("Show system date"), "action keeps the label");
  assert(
    html.includes("&quot;id&quot;: &quot;date&quot;") ||
      html.includes('"id": "date"'),
    "button names the id",
  );
  assert(html.includes("/action"), "button posts to /action");
});

Deno.test("renderer escapes a hostile action label", () => {
  // Feed markup as the action label.
  const html = renderNode(action("<script>", "date", ["date"]));
  assert(html.includes("&lt;script"), "action escapes the markup");
  assert(!html.includes("<script>"), "action holds no raw markup");
});

Deno.test("repeating renders a repeat container with an add button", () => {
  // Render a repeating node with one text and one number field.
  const html = renderNode(
    repeating("Guests", "guests", [
      { kind: "text", label: "Name", name: "guest-name" },
      { kind: "number", label: "Age", name: "guest-age" },
    ]),
  );
  assert(html.includes('data-repeat="guests"'), "container names the node");
  assert(html.includes("Add entry"), "button offers a new row");
  assert(html.includes("data-add-row"), "button carries the add marker");
  assert(html.includes('name="guest-name"'), "text field keeps its name");
  assert(html.includes('name="guest-age"'), "number field keeps its name");
  assert(html.includes('type="number"'), "number field uses number input");
});

// Post one step form to a handler.
function stepPost(
  step: string,
  action: string,
  extra: Record<string, string> = {},
): Request {
  const params = new URLSearchParams({ step, action, ...extra });
  return new Request("http://local/step", { method: "POST", body: params });
}

// Build a three-step wizard with an echo step at the end.
function echoWizard() {
  return wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [
        textEntry("Run name", "run"),
        buttons([
          { label: "B", action: "back" },
          { label: "N", action: "next" },
        ]),
      ]),
      (answers) =>
        step("c", "Third", [
          markdown(answers.get("run")?.join(", ") ?? "none"),
        ]),
    ],
  });
}

Deno.test("wizard moves through next, back, goto, restart", async () => {
  // Drive one wizard through each move.
  const handle = echoWizard();
  const root = await handle(new Request("http://local/"));
  assert((await root.text()).includes("First"), "root shows step one");
  const second = await handle(stepPost("a", "next"));
  assert((await second.text()).includes("Second"), "next advances");
  const back = await handle(stepPost("b", "back"));
  assert((await back.text()).includes("First"), "back returns");
  const jump = await handle(stepPost("a", "goto:2"));
  assert((await jump.text()).includes("Third"), "goto jumps");
  const far = await handle(stepPost("a", "goto:9"));
  assert((await far.text()).includes("Third"), "goto clamps");
  const same = await handle(stepPost("b", "bogus"));
  assert((await same.text()).includes("Second"), "unknown keeps place");
  const fresh = await handle(stepPost("b", "restart", { run: "Friday" }));
  assert((await fresh.text()).includes("First"), "restart returns to start");
  const clean = await handle(stepPost("a", "goto:2"));
  assert((await clean.text()).includes("none"), "restart clears answers");
});

Deno.test("wizard remembers posted fields", async () => {
  // Post a field, then read it on the echo step.
  const handle = echoWizard();
  await handle(stepPost("a", "next"));
  const third = await handle(stepPost("b", "next", { run: "Friday" }));
  assert((await third.text()).includes("Friday"), "echo shows the field");
});

Deno.test("onSubmit veto rejects the post without appending", async () => {
  // The first call returns errors. Nothing appends to the log, the
  // step re-renders with the joined message, and a later echo shows
  // the rejected fields never landed.
  let calls = 0;
  let seen: Record<string, string[]> = {};
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [
        textEntry("Run name", "run"),
        buttons([{ label: "N", action: "next" }]),
      ]),
      step("b", "Second", [markdown("tail")]),
      (answers) =>
        step("c", "Third", [
          markdown(answers.get("run")?.join(", ") ?? "none"),
        ]),
    ],
    onSubmit: (fields) => {
      calls += 1;
      seen = fields;
      if (calls === 1) return { errors: ["no", "way"] };
    },
  });
  const page = await handle(stepPost("a", "next", { run: "Friday" }));
  const body = await page.text();
  assert(calls === 1, "hook runs once");
  assert(seen["run"]?.join(",") === "Friday", "hook sees the fields");
  assert(body.includes("no way"), "errors join onto the node error");
  assert(body.includes("node-error"), "error uses the node error field");
  assert(!body.includes("Second"), "post does not advance");
  const echo = await handle(stepPost("a", "goto:2"));
  assert((await echo.text()).includes("none"), "rejected post stays unlogged");
});

Deno.test("onSubmit goto jumps after the post applies", async () => {
  // The hook names a step id. Navigation lands on it.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [markdown("tail")]),
      step("c", "Third", [markdown("tail")]),
    ],
    onSubmit: (_fields, stepId) => {
      if (stepId === "a") return { goto: "c" };
    },
  });
  const page = await handle(stepPost("a", "next"));
  assert((await page.text()).includes("Third"), "goto jumps to step c");
});

Deno.test("onSubmit insert splices in after the current step", async () => {
  // The hook returns a step. It appears right after the current one
  // and navigation moves into it. A rebuild keeps it.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [markdown("tail")]),
    ],
    onSubmit: (_fields, stepId) => {
      if (stepId === "a") {
        return {
          insert: step("x", "Extra", [markdown("inserted tail")]),
        };
      }
    },
  });
  const page = await handle(stepPost("a", "next"));
  const body = await page.text();
  assert(body.includes("Extra"), "navigation enters the inserted step");
  assert(body.includes("inserted tail"), "inserted step renders");
  // Back from the inserted step follows the visit path to the start.
  const again = await handle(stepPost("x", "back"));
  assert((await again.text()).includes("First"), "back follows the visit path");
  // The insert still sits in the built list after the round trip.
  const rebuilt = await handle(stepPost("a", "next"));
  assert((await rebuilt.text()).includes("Extra"), "rebuild keeps the insert");
});

Deno.test("markdown heading renders h2", () => {
  // Feed a heading line plus a plain line.
  const html = renderNode(markdown("## Answers\nSome text."));
  assert(html.includes("<h2>Answers</h2>"), "heading renders");
  assert(html.includes("Some text."), "plain line stays");
});

Deno.test("validation rejects a bad button layout", () => {
  // Feed a layout outside right plus split.
  const node = buttons([{ label: "Next", action: "next" }]);
  (node as { layout: string }).layout = "left";
  const errors = validateStep(step("s1", "Sample", [node]));
  assert(
    errors.length > 0 && namesKind(errors, "buttons"),
    "layout names kind",
  );
});

Deno.test("buttons default to the right layout", () => {
  // Render buttons with no layout set.
  const html = renderNode(buttons([{ label: "Next", action: "next" }]));
  assert(html.includes("button-row-right"), "default row aligns right");
});

Deno.test("buttons render the split layout", () => {
  // Render buttons with the split layout set.
  const html = renderNode(
    buttons(
      [
        { label: "Back", action: "back" },
        { label: "Next", action: "next" },
      ],
      undefined,
      "split",
    ),
  );
  assert(html.includes("button-row-split"), "split row spreads out");
});

Deno.test("action renders a full-width button", () => {
  // Render the demo date action.
  const html = renderNode(action("Show system date", "date", ["date"]));
  assert(html.includes("<wa-button"), "button element appears");
  assert(html.includes("action-strip"), "strip class appears");
  assert(html.includes('type="button"'), "no native submit to race");
  assert(!html.includes("formaction"), "no shadow submit target");
  assert(html.includes('slot="suffix"'), "hint takes the suffix slot");
  assert(html.includes(">run<"), "hint names run");
  assert(html.includes("action-out"), "output region appears");
});

Deno.test("confirm action shows question and gates the post", () => {
  // Render one action that asks before it runs.
  const html = renderNode(
    action(
      "Wipe cache",
      "wipe",
      ["rm", "-rf"],
      "now",
      undefined,
      "Wipe all cached files?",
    ),
  );
  assert(html.includes("Wipe all cached files?"), "question text appears");
  assert(html.includes(">Confirm</wa-button>"), "confirm button appears");
  assert(html.includes(">Cancel</wa-button>"), "cancel button appears");
  assert(html.includes("hidden"), "confirm region starts hidden");
  const posts = html.split('hx-post="/action"').length - 1;
  assert(posts === 1, "only the Confirm press posts to /action");
});

Deno.test("primary buttons render class plus autofocus", () => {
  // Render one quiet button plus one primary button.
  const html = renderNode(
    buttons([
      { label: "Back", action: "back" },
      { label: "Next", action: "next", primary: true },
    ]),
  );
  assert(html.includes('variant="primary"'), "primary takes its variant");
  const focusCount = html.split("autofocus").length - 1;
  assert(focusCount === 1, "only one button takes focus");
  const backTag = html.split("Back")[0];
  assert(backTag.includes('variant="neutral"'), "quiet button stays plain");
});

Deno.test("validation rejects a bad primary flag", () => {
  // Feed text where true or false belongs.
  const node = buttons([{ label: "Next", action: "next" }]);
  const bad = node.buttons[0] as unknown as { primary: string };
  bad.primary = "yes";
  const errors = validateStep(step("s1", "Sample", [node]));
  assert(
    errors.length > 0 && namesKind(errors, "buttons"),
    "primary names kind",
  );
});

Deno.test("posting done returns the confirmation count", async () => {
  // Post two fields, then post done.
  const handle = echoWizard();
  await handle(stepPost("a", "next", { run: "Friday" }));
  const done = await handle(stepPost("b", "done", { who: "Ana" }));
  const text = await done.text();
  assert(text.includes("Done"), "confirmation shows");
  assert(text.includes("2 answers recorded."), "count matches");
  assert(text.includes("Start over"), "confirmation offers restart");
});

Deno.test("reset control posts restart", () => {
  // Render a full page: the reset lives in the header now.
  const html = renderPage("Demo", renderStepFragment(goodStep()));
  assert(html.includes("<wa-button"), "reset uses web awesome");
  assert(html.includes('title="Reset wizard"'), "reset names itself");
  assert(html.includes('value="restart"'), "reset posts restart");
  assert(html.includes("\u21bb"), "reset shows the glyph");
});

Deno.test("validation accepts onConfirm run", () => {
  // Feed one staged action.
  const st = step("s1", "Sample", [
    action("Write note", "note", ["echo", "x"], "onConfirm"),
  ]);
  assert(validateStep(st).length === 0, "onConfirm passes");
});

Deno.test("restart empties events and answers", async () => {
  // Post a field, then restart, then read the echo step.
  const handle = echoWizard();
  const api = handle as unknown as { events: WizardEvent[] };
  await handle(stepPost("a", "next", { run: "Friday" }));
  assert(api.events.length === 1, "one event logged");
  await handle(stepPost("b", "restart"));
  assert(api.events.length === 0, "events cleared");
  const third = await handle(stepPost("a", "goto:2"));
  assert((await third.text()).includes("none"), "answers cleared");
});

Deno.test("back keeps fields intact", async () => {
  // Go forward, back, then forward with no new fields.
  const handle = echoWizard();
  await handle(stepPost("a", "next", { run: "Friday" }));
  const third = await handle(stepPost("b", "next"));
  assert((await third.text()).includes("Friday"), "echo shows the field");
  const back = await handle(stepPost("c", "back"));
  assert((await back.text()).includes("Second"), "back returns");
  const again = await handle(stepPost("b", "next"));
  assert((await again.text()).includes("Friday"), "field survives back");
});

Deno.test("replay from events matches", async () => {
  // Capture live answers, then replay the logged events.
  let seen: Map<string, string[]> | null = null;
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [
        checkbox("Who", "who", ["Ana", "Bo"], []),
        buttons([{ label: "N", action: "next" }]),
      ]),
      (answers) => {
        seen = new Map(answers);
        return step("b", "Second", [markdown("Hi")]);
      },
    ],
  });
  const api = handle as unknown as { events: WizardEvent[] };
  await handle(stepPost("a", "next", { who: "Ana" }));
  await handle(stepPost("b", "next", { who: "Bo" }));
  const replayed = replayAnswers(api.events, ["who"]);
  const snapshot: Map<string, string[]> = seen ?? new Map();
  const live = (snapshot.get("who") ?? []).join(",");
  assert(live === "Ana,Bo", "live answers append");
  assert(replayed.get("who")?.join(",") === live, "replay matches");
});

// Post one action click.
function actionPost(id: string): Request {
  return new Request("http://local/action", {
    method: "POST",
    body: new URLSearchParams({ id }),
  });
}

// Build a wizard with two staged actions plus done.
function stagedWizard() {
  return wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [
        action("First staged", "s1", ["echo", "first-out"], "onConfirm"),
        action("Second staged", "s2", ["echo", "second-out"], "onConfirm"),
        buttons([{ label: "Done", action: "done", primary: true }]),
      ]),
    ],
  });
}

Deno.test("done executes staged actions in order", async () => {
  // Stage two actions, then post done.
  const handle = stagedWizard();
  const api = handle as unknown as { pending: string[] };
  const note = await handle(actionPost("s1"));
  assert((await note.text()).includes("Staged"), "first stages");
  await handle(actionPost("s2"));
  assert(api.pending.join(",") === "s1,s2", "pending keeps order");
  const done = await handle(stepPost("b", "done"));
  const text = await done.text();
  assert(text.includes("First staged"), "first label shows");
  assert(text.includes("Second staged"), "second label shows");
  assert(
    text.indexOf("first-out") < text.indexOf("second-out"),
    "outputs keep order",
  );
  assert(api.pending.length === 0, "pending drains");
});

Deno.test("demo step 1 holds two tab panels", () => {
  // Render the first demo step.
  const html = renderStepFragment(styleStep());
  const panels = html.split("<wa-tab-panel").length - 1;
  assert(panels === 2, "step 1 renders two tab panels");
});

Deno.test("validation accepts good answers", () => {
  // Feed one answers node with two entries.
  const st = step("s1", "Sample", [
    answers("Fields", [
      { name: "run", values: ["Friday"] },
      { name: "who", values: ["Ana", "Bo"] },
    ]),
  ]);
  assert(validateStep(st).length === 0, "good answers pass");
});

Deno.test("validation rejects bad answers with a message", () => {
  // Empty the entries and blank one name.
  const empty = step("s1", "Sample", [answers("Fields", [])]);
  const emptyErrors = validateStep(empty);
  assert(
    emptyErrors.length > 0 && namesKind(emptyErrors, "answers"),
    "empty names kind",
  );
  const blank = step("s1", "Sample", [
    answers("Fields", [{ name: "  ", values: ["x"] }]),
  ]);
  const blankErrors = validateStep(blank);
  assert(
    blankErrors.length > 0 && namesKind(blankErrors, "answers"),
    "blank names kind",
  );
});

Deno.test("answers render every name with its values", () => {
  // Render two entries.
  const html = renderNode(
    answers("Fields", [
      { name: "run", values: ["Friday"] },
      { name: "who", values: ["Ana", "Bo"] },
    ]),
  );
  assert(html.includes("Fields"), "answers keep the label");
  assert(html.includes("run"), "first name shows");
  assert(html.includes("Friday"), "first value shows");
  assert(html.includes("Ana, Bo"), "values join with commas");
});

Deno.test("renderer escapes a hostile answer value", () => {
  // Feed markup as a value.
  const html = renderNode(
    answers("Fields", [{ name: "run", values: ["<b>Bold</b>"] }]),
  );
  assert(html.includes("&lt;b"), "answer escapes the markup");
  assert(!html.includes("<b>"), "answer holds no raw markup");
});

Deno.test("table renders headings with aligned cells", () => {
  // Render one table with a right-aligned column.
  const html = renderNode(
    table(
      "Runs",
      [{ heading: "Name" }, { heading: "Time", align: "right" }],
      [
        ["Run A", "10s"],
        ["Run B", "20s"],
      ],
    ),
  );
  assert(html.includes("Name"), "first heading shows");
  assert(html.includes("Time"), "second heading shows");
  assert(html.includes("Run A"), "first row cell shows");
  assert(
    html.includes(`text-align: right">20s</td>`),
    "alignment lands on the cell",
  );
  assert(
    html.includes(`text-align: left">Run A</td>`),
    "default alignment is left",
  );
});

Deno.test("renderer escapes a hostile table cell", () => {
  // Feed markup as a cell.
  const html = renderNode(
    table("Runs", [{ heading: "Name" }], [["<b>Bold</b>"]]),
  );
  assert(html.includes("&lt;b"), "table escapes the markup");
  assert(!html.includes("<b>Bold</b>"), "table holds no raw markup");
});

Deno.test("validation rejects a table row with a bad cell count", () => {
  // Feed one row with too few cells.
  const st = step("s1", "Sample", [
    table("Runs", [{ heading: "Name" }, { heading: "Time" }], [["Run A"]]),
  ]);
  const errors = validateStep(st);
  assert(
    errors.length > 0 && namesKind(errors, "table"),
    "row width mismatch names kind",
  );
});

// Build a wizard serving one fixture directory.
function filesWizard() {
  return wiz({
    title: "T",
    steps: [step("a", "First", [markdown("Hi")])],
    files: { root: new URL("./desktop-files", import.meta.url).pathname },
  });
}

Deno.test("files serve bytes plus content type", async () => {
  // Fetch the text fixture.
  const handle = filesWizard();
  const res = await handle(new Request("http://local/files/hello.txt"));
  assert(res.status === 200, "fixture serves");
  assert((await res.text()) === "hello files\n", "bytes match");
  const type = res.headers.get("content-type") ?? "";
  assert(type.includes("text/plain"), "type matches");
});

Deno.test("files refuse escape plus missing paths", async () => {
  // Probe traversal, raw dots, hidden, plus missing names.
  const handle = filesWizard();
  const evil = await handle(new Request("http://local/files/%2e%2e/x"));
  assert(evil.status === 404, "escape fails");
  const plain = await handle(new Request("http://local/files/../nodes.ts"));
  assert(plain.status === 404, "raw dots fail");
  const hidden = await handle(new Request("http://local/files/.dot"));
  assert(hidden.status === 404, "hidden fails");
  const gone = await handle(new Request("http://local/files/nope.txt"));
  assert(gone.status === 404, "missing fails");
});

Deno.test("page shell holds layout plus the draft script", () => {
  // Render a page and check the shell block plus script.
  const page = renderPage("Demo", renderStepFragment(goodStep()));
  for (const name of [".wiz-head", ".wiz-main", ".wiz-foot"]) {
    assert(page.includes(name), "page holds " + name);
  }
  assert(page.includes("wiz-draft"), "page holds the draft script");
  assert(page.includes("wa-callout"), "draft bar uses a callout");
  assert(page.includes("Unsaved answers from before."), "bar names restore");
});

Deno.test("single tabs step renders a root tabbed view", () => {
  // Build a step holding one tabs node only.
  const st = step("s1", "Tabbed", [
    tabs([{ label: "One", nodes: [markdown("Hi")] }]),
  ]);
  // Assert the section takes the root tabs class.
  assert(renderStepFragment(st).includes("is-root-tabs"), "root tabs class");
});

Deno.test("page shell holds a footer with draft status", () => {
  // Render a page and check the footer block.
  const page = renderPage("Demo", "hi");
  assert(page.includes("wiz-foot"), "page holds the footer");
  assert(page.includes('id="draft-status"'), "footer holds draft status");
});

Deno.test("form nodes render web awesome tags", () => {
  // Render one of each form node.
  const forms = [
    renderNode(menu("Style", ["Equal", "Custom"], "style")),
    renderNode(radio("Fee", "fee", ["Equal", "Skip"], "Equal")),
    renderNode(checkbox("Who", "who", ["Ana"], ["Ana"])),
    renderNode(textEntry("Run", "run", "", "")),
    renderNode(numberEntry("Total", "total", 5)),
  ].join("\n");
  assert(forms.includes("<wa-select"), "menu uses wa-select");
  assert(forms.includes('placeholder="Select"'), "menu prompts first");
  assert(forms.includes("<wa-option"), "menu holds options");
  assert(forms.includes("<wa-radio-group "), "radio uses its group");
  assert(forms.includes("<wa-radio "), "radio holds items");
  assert(forms.includes("<wa-checkbox"), "checkbox uses wa-checkbox");
  assert(forms.includes('type="text"'), "text entry keeps its type");
  assert(forms.includes("<wa-input"), "entries use wa-input");
  assert(forms.includes('name="who"'), "field names survive");
  assert(forms.includes('value="Ana"'), "field values survive");
});

Deno.test("radio group carries the name plus the picked value", () => {
  // The group is the form element, so a browser submit posts its name
  // and value. Children hold no name and no checked flag.
  const html = renderNode(radio("Money code", "currency", ["INR", "EUR"], "INR"));
  assert(
    html.includes('<wa-radio-group name="currency" value="INR">'),
    "group holds the name and the picked value",
  );
  const children = html.match(/<wa-radio [^>]*>/g) ?? [];
  assert(children.length === 2, "both options render as children");
  for (const child of children) {
    assert(!child.includes("name="), "child holds no name: " + child);
    assert(!child.includes("checked"), "child holds no checked: " + child);
  }
});

Deno.test("progress, spoiler, plus markdown render web awesome tags", () => {
  // Render one display node of each kind.
  const shown = [
    renderNode(progress("Coverage", 1, 0, 2)),
    renderNode(spoiler("More", [markdown("Hi")])),
    renderNode(markdown("Hello")),
  ].join("\n");
  assert(shown.includes("<wa-progress-bar"), "progress uses its bar");
  assert(shown.includes("<wa-details"), "spoiler uses wa-details");
  assert(shown.includes("<wa-callout"), "markdown uses wa-callout");
});

Deno.test("page shell loads web awesome plus dark mode", () => {
  // Render a page and check the vendor assets.
  const page = renderPage("Demo", "hi");
  assert(page.includes("/vendor/webawesome/"), "page serves WA locally");
  assert(page.includes("webawesome.loader.js"), "page loads the WA loader");
  assert(page.includes("base-path.js"), "page sets the WA base path");
  assert(page.includes("wa-dark"), "page wires dark mode");
});

Deno.test("back after done re-renders the done summary", async () => {
  // Post done, then send a stray back from the done step.
  const handle = echoWizard();
  await handle(stepPost("a", "next"));
  const done = await handle(stepPost("b", "done"));
  assert((await done.text()).includes("answers recorded."), "done shows");
  const stray = await handle(stepPost("done", "back"));
  const text = await stray.text();
  assert(
    text.includes("Done") && text.includes("answers recorded."),
    "stray post re-renders the summary",
  );
  assert(!text.includes("First"), "stray post does not clamp to step one");
});

Deno.test("draft saver stamps a version and skips mismatches", () => {
  // Render a page and check the draft script guards the version.
  const page = renderPage("Demo", renderStepFragment(goodStep()));
  assert(
    page.includes("v: VER") && page.includes("saved.v !== VER"),
    "draft script stamps a version and ignores mismatches",
  );
});

Deno.test("double submit serializes step posts", async () => {
  // Fire two posts at once. Both land, one after the other.
  const handle = echoWizard();
  const api = handle as unknown as { events: WizardEvent[] };
  await handle(new Request("http://local/"));
  const [a, b] = await Promise.all([
    handle(stepPost("a", "next", { run: "Friday" })),
    handle(stepPost("b", "next", { run: "Monday" })),
  ]);
  assert(a.status === 200 && b.status === 200, "both posts answer");
  assert(api.events.length === 2, "both posts log in order");
  const tail = await b.text();
  assert(tail.includes("Monday"), "second post lands after the first");
});

Deno.test("unknown task id renders a finished fragment", async () => {
  // Poll a task id that never existed or was evicted.
  const handle = echoWizard();
  const res = await handle(new Request("http://local/task/nope"));
  assert(res.status === 200, "dead poll is not a 404");
  assert((await res.text()).includes("finished"), "fragment says finished");
});

// Build a wizard with the staged-flow option for marker tests.
function stagedFlowWizard() {
  const names = ["Gather", "Split", "Push"];
  const stageOf = (id: string) => {
    if (id.startsWith("gather-")) return 0;
    if (id.startsWith("split-")) return 1;
    if (id.startsWith("push-")) return 2;
    return null;
  };
  return wiz({
    title: "T",
    steps: [
      step("gather-first", "Gather one", [markdown("one")]),
      step("gather-second", "Gather two", [markdown("two")]),
      step("menu", "Menu", [markdown("menu")]),
    ],
    stages: { names, stageOf },
  });
}

Deno.test("wizard without stages renders no marker", async () => {
  // Drive a wizard with no stages option.
  const handle = echoWizard();
  const body = await (await handle(new Request("http://local/"))).text();
  assert(!body.includes("stage-name"), "no stages markup appears");
});

Deno.test("wizard with stages renders the marker on a mapped step", async () => {
  // Open the first gather step.
  const handle = stagedFlowWizard();
  const body = await (await handle(new Request("http://local/"))).text();
  assert(body.includes("stage-name"), "marker appears");
  assert(body.includes("Gather"), "marker names Gather");
  assert(body.includes("Split"), "marker names Split");
  assert(body.includes("Push"), "marker names Push");
});

Deno.test("wizard with stages renders no marker off the flow", async () => {
  // Jump to the menu step, which stageOf maps to null.
  const handle = stagedFlowWizard();
  const page = await handle(stepPost("gather-first", "goto:menu"));
  const body = await page.text();
  assert(body.includes("Menu"), "menu step shows");
  assert(!body.includes("stage-name"), "no stages markup appears");
});

Deno.test("marker names the current stage on a later step", async () => {
  // Jump to the second gather step. The marker still names Gather now.
  const handle = stagedFlowWizard();
  const page = await handle(stepPost("gather-first", "goto:gather-second"));
  const body = await page.text();
  assert(body.includes("Gather two"), "later step shows");
  assert(body.includes("stage-name"), "marker appears");
  const at = body.indexOf("stage-row is-now");
  assert(at >= 0, "one stage marks now");
  assert(body.slice(at, at + 200).includes("Gather"), "now names Gather");
});

Deno.test("done with onDone goto renders the named step", async () => {
  // Post done with a hook that names the menu step.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "D", action: "done" }])]),
      step("menu", "Menu", [markdown("menu tail")]),
    ],
    onDone: (answers) => {
      if ((answers.get("run") ?? []).includes("Friday")) return { goto: "menu" };
    },
  });
  const page = await handle(stepPost("a", "done", { run: "Friday" }));
  const body = await page.text();
  assert(body.includes("Menu"), "onDone goto renders the menu step");
  assert(body.includes("menu tail"), "named step content shows");
  assert(!body.includes("answers recorded."), "summary screen stays hidden");
  // A hook that returns nothing keeps the summary screen.
  const plain = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "D", action: "done" }])]),
      step("menu", "Menu", [markdown("menu tail")]),
    ],
    onDone: () => {},
  });
  const summary = await plain(stepPost("a", "done", { run: "Friday" }));
  const summaryBody = await summary.text();
  assert(summaryBody.includes("answers recorded."), "empty hook keeps summary");
  // A hook that names a missing step also keeps the summary screen.
  const missing = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "D", action: "done" }])]),
      step("menu", "Menu", [markdown("menu tail")]),
    ],
    onDone: () => ({ goto: "nowhere" }),
  });
  const fallback = await missing(stepPost("a", "done"));
  assert(
    (await fallback.text()).includes("answers recorded."),
    "bad goto keeps summary",
  );
  // No hook at all still renders the summary screen.
  const bare = wiz({
    title: "T",
    steps: [step("a", "First", [buttons([{ label: "D", action: "done" }])])],
  });
  const bareBody = await (await bare(stepPost("a", "done"))).text();
  assert(bareBody.includes("answers recorded."), "absent hook keeps summary");
});

Deno.test("back follows the visit path after a goto jump", async () => {
  // Jump from step one to step five, then post back.
  const handle = wiz({
    title: "T",
    steps: [
      step("s1", "Step one", [buttons([{ label: "J", action: "goto:s5" }])]),
      step("s2", "Step two", [markdown("two")]),
      step("s3", "Step three", [markdown("three")]),
      step("s4", "Step four", [markdown("four")]),
      step("s5", "Step five", [buttons([{ label: "B", action: "back" }])]),
    ],
  });
  const jump = await handle(stepPost("s1", "goto:s5"));
  assert((await jump.text()).includes("Step five"), "jump lands on step five");
  const back = await handle(stepPost("s5", "back"));
  const body = await back.text();
  assert(body.includes("Step one"), "back returns to step one");
  assert(!body.includes("Step four"), "back skips step four");
});

Deno.test("onSubmit sees the pressed action string", async () => {
  // Post a custom action and read the third hook argument.
  let seen: string | undefined;
  let seenStep = "";
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "Go", action: "custom" }])]),
      step("b", "Second", [markdown("tail")]),
    ],
    onSubmit: (_fields, stepId, action) => {
      seen = action;
      seenStep = stepId;
    },
  });
  await handle(stepPost("a", "custom"));
  assert(seen === "custom", "hook sees the custom action");
  assert(seenStep === "a", "hook still sees the step id");
  // A two argument hook still runs without change.
  let twoCalls = 0;
  const legacy = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [markdown("tail")]),
      step("c", "Third", [markdown("third tail")]),
    ],
    onSubmit: (_fields, stepId) => {
      twoCalls += 1;
      assert(stepId === "a", "legacy hook sees the step id");
      if (stepId === "a") return { goto: "c" };
    },
  });
  const page = await legacy(stepPost("a", "next"));
  const body = await page.text();
  assert(twoCalls === 1, "legacy hook runs once");
  assert(body.includes("Third"), "returned goto still wins over next");
});

Deno.test("a rejected post re-renders with state the hook recorded", async () => {
  // A hook that records the rejected fields must see that record in the
  // re-render. Without it, a step that seeds its own entries from the
  // last post loses every value the user typed, and the step can never
  // be passed. The expense-split People step works exactly that way.
  let held: string[] = [];
  const handle = wiz({
    title: "T",
    steps: [
      (answers) =>
        step("a", "First", [
          ...held.map((name) => textEntry("Name", "person", name)),
          textEntry("Next name", "person"),
          buttons([{ label: "N", action: "next" }]),
          markdown(answers.get("person")?.join(", ") ?? "no answers"),
        ]),
      step("b", "Second", [markdown("tail")]),
    ],
    onSubmit: (fields) => {
      held = fields["person"] ?? [];
      if (held.length < 2) return { errors: ["Add one more name."] };
    },
  });
  const page = await handle(stepPost("a", "next", { person: "Ann" }));
  const body = await page.text();
  assert(body.includes("Add one more name."), "the step reports the problem");
  assert(body.includes('value="Ann"'), "the rejected name comes back filled in");
  assert(!body.includes("Second"), "the post does not advance");
});

Deno.test("action output renders inside its panel when set", () => {
  // An action node with output holds a pre inside its action-out panel.
  const full = renderNode({
    ...action("Show system date", "date", ["date"]),
    output: "hello out",
  });
  assert(full.includes("action-out"), "panel keeps its class");
  assert(full.includes('id="out-date"'), "panel keeps its id");
  assert(full.includes("<pre>"), "output uses a pre element");
  assert(full.includes("hello out"), "output text shows");
  // An action node without output renders the empty panel.
  const empty = renderNode(action("Show system date", "date", ["date"]));
  assert(empty.includes("action-out"), "empty panel keeps its class");
  assert(empty.includes('id="out-date"'), "empty panel keeps its id");
  assert(!empty.includes("<pre>"), "empty panel holds no pre");
});

Deno.test("action post without hx header keeps the step page", async () => {
  // Visit the step first, then post the action with no hx header.
  const handle = wiz({
    title: "T",
    steps: [step("a", "First", [action("Run it", "run", ["echo", "hello-action"])])],
  });
  await handle(new Request("http://local/"));
  const res = await handle(actionPost("run"));
  const body = await res.text();
  assert(body.includes("First"), "page holds the step heading");
  assert(body.includes('id="step"'), "page holds the step fragment");
  assert(body.includes("action-out"), "page holds the output panel");
  assert(body.includes("hello-action"), "panel holds the command output");
  assert(body.includes("<pre>"), "output renders as a pre element");
});

Deno.test("unknown task without hx header keeps the step page", async () => {
  // Visit the step first, then poll an unknown task with no hx header.
  const handle = wiz({
    title: "T",
    steps: [step("a", "First", [action("Run it", "run", ["echo", "hi"])])],
  });
  await handle(new Request("http://local/"));
  const res = await handle(new Request("http://local/task/nope"));
  const body = await res.text();
  assert(res.status === 200, "dead poll is not a 404");
  assert(body.includes("First"), "page holds the step heading");
  assert(body.includes('id="step"'), "page holds the step fragment");
  assert(body.includes("action-out"), "page holds the output panel");
  assert(body.includes("Task finished."), "panel holds the finished line");
});

Deno.test("repeating seeds one filled row per record plus the blank row", () => {
  // Render a repeating node with two seeded rows.
  const fields = [
    { kind: "text", label: "Name", name: "guest-name" },
    { kind: "number", label: "Age", name: "guest-age" },
  ] as { kind: "text" | "number"; label: string; name: string }[];
  const html = renderNode(
    repeating("Guests", "guests", fields, [
      { "guest-name": "Ada", "guest-age": "36" },
      { "guest-name": "Bo" },
    ]),
  );
  assert(html.includes('value="Ada"'), "first seeded value shows");
  assert(html.includes('value="36"'), "second seeded value shows");
  assert(html.includes('value="Bo"'), "third seeded value shows");
  const rows = html.split('<div class="repeat-row"').length - 1;
  assert(rows === 3, "two seeded rows plus the blank row: " + rows);
  assert(html.includes("Add entry"), "add button stays");
  // Seeded rows pass validation.
  const st = step("s1", "Sample", [
    repeating("Guests", "guests", fields, [{ "guest-name": "Ada" }]),
  ]);
  assert(validateStep(st).length === 0, "seeded rows pass");
});

Deno.test("repeating with no rows renders the blank row alone", () => {
  // Render a repeating node without rows and count its rows.
  const html = renderNode(
    repeating("Guests", "guests", [
      { kind: "text", label: "Name", name: "guest-name" },
    ]),
  );
  const rows = html.split('<div class="repeat-row"').length - 1;
  assert(rows === 1, "blank row alone: " + rows);
  assert(!html.includes("value="), "blank row sets no values");
});

Deno.test("repeating rejects a record naming an unknown sub field", () => {
  // Seed a row with a field the node never declared.
  const st = step("s1", "Sample", [
    repeating("Guests", "guests", [
      { kind: "text", label: "Name", name: "guest-name" },
    ], [{ "nickname": "Ada" }]),
  ]);
  const errors = validateStep(st);
  assert(
    errors.length > 0 && namesKind(errors, "repeating"),
    "unknown field names repeating",
  );
  assert(
    errors.some((item) => item.includes("nickname")),
    "error names the unknown field",
  );
});

Deno.test("nav renders back first and a primary next in a split row", () => {
  // Render the standard row with back plus next.
  const html = renderNode(nav({ back: true, next: "Continue" }));
  assert(html.includes("button-row-split"), "nav uses the split layout");
  const backAt = html.indexOf(">Back<");
  const nextAt = html.indexOf(">Continue<");
  assert(backAt >= 0 && nextAt > backAt, "back sits before next");
  assert(html.includes('value="back"'), "back posts back");
  assert(html.includes('value="next"'), "next posts next");
  const forward = html.slice(html.lastIndexOf("<wa-button", nextAt), nextAt);
  assert(forward.includes('variant="primary"'), "next is primary");
  const back = html.slice(html.lastIndexOf("<wa-button", backAt), backAt);
  assert(back.includes('variant="neutral"'), "back stays plain");
});

Deno.test("nav rejects zero or two forward buttons", () => {
  // Feed next plus done together, then neither.
  let both = "";
  try {
    nav({ next: "Next", done: "Done" });
  } catch (err) {
    both = err instanceof Error ? err.message : String(err);
  }
  assert(both.includes("exactly one"), "both together report the rule");
  let none = "";
  try {
    nav({ back: true });
  } catch (err) {
    none = err instanceof Error ? err.message : String(err);
  }
  assert(none.includes("exactly one"), "none set reports the rule");
});

Deno.test("copyable renders a read only textarea plus a Copy button", () => {
  // Render a copyable node with a link.
  const html = renderNode(
    copyable("Share link", "link", "https://example.test/x"),
  );
  assert(html.includes("Share link"), "copyable keeps its label");
  assert(html.includes("<textarea"), "copyable uses a textarea");
  assert(html.includes('name="link"'), "textarea carries the name");
  assert(
    html.includes("readonly") || html.includes("readOnly"),
    "textarea is read only",
  );
  assert(
    html.includes("https://example.test/x"),
    "textarea holds the text",
  );
  assert(html.includes(">Copy</wa-button>"), "copy button shows");
  assert(html.includes("data-copy-btn"), "button carries the copy marker");
  // A good copyable node passes validation.
  const st = step("s1", "Sample", [
    copyable("Share link", "link", "https://example.test/x"),
  ]);
  assert(validateStep(st).length === 0, "good copyable passes");
});

Deno.test("copyable rejects a blank name", () => {
  // Blank the field name.
  const st = step("s1", "Sample", [copyable("Share link", "  ", "x")]);
  const errors = validateStep(st);
  assert(
    errors.length > 0 && namesKind(errors, "copyable"),
    "blank name names copyable",
  );
});

// A wizard whose hook vetoes step b with errors plus a goto. The seen
// list records each hook call as action plus step id.
function vetoWizard(seen: string[]) {
  return wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [
        textEntry("Run name", "run"),
        buttons([
          { label: "B", action: "back" },
          { label: "N", action: "next" },
        ]),
      ]),
      step("c", "Third", [markdown("tail")]),
    ],
    onSubmit: (_fields, stepId, action) => {
      seen.push(action + ":" + stepId);
      if (stepId === "b") return { errors: ["veto says no"], goto: "c" };
    },
  });
}

Deno.test("a veto never blocks a back move", async () => {
  // Post back from the vetoed step. The move lands on step one with
  // no error text, and the hook still ran.
  const seen: string[] = [];
  const handle = vetoWizard(seen);
  await handle(stepPost("a", "next"));
  const back = await handle(stepPost("b", "back", { run: "Friday" }));
  const body = await back.text();
  assert(body.includes("First"), "back moves back");
  assert(!body.includes("veto says no"), "back shows no error text");
  assert(seen.includes("back:b"), "hook still runs on back");
});

Deno.test("a veto still blocks a next move", async () => {
  // Post next from the vetoed step. The post rejects with the error.
  const seen: string[] = [];
  const handle = vetoWizard(seen);
  await handle(stepPost("a", "next"));
  const next = await handle(stepPost("b", "next", { run: "Friday" }));
  const body = await next.text();
  assert(body.includes("veto says no"), "next shows the error text");
  assert(!body.includes("Third"), "next does not advance");
});

Deno.test("a veto never blocks a restart move", async () => {
  // Post restart from the vetoed step. The wizard restarts clean.
  const seen: string[] = [];
  const handle = vetoWizard(seen);
  await handle(stepPost("a", "next"));
  const fresh = await handle(stepPost("b", "restart"));
  const body = await fresh.text();
  assert(body.includes("First"), "restart returns to start");
  assert(!body.includes("veto says no"), "restart shows no error text");
  assert(seen.includes("restart:b"), "hook still runs on restart");
});

Deno.test("a veto goto never redirects a back move", async () => {
  // Post back from the vetoed step. The hook names step three, but
  // the move still lands on step one.
  const seen: string[] = [];
  const handle = vetoWizard(seen);
  await handle(stepPost("a", "next"));
  const back = await handle(stepPost("b", "back"));
  const body = await back.text();
  assert(body.includes("First"), "back moves back");
  assert(!body.includes("Third"), "back ignores the hook goto");
});

Deno.test("a live task fragment names its own target", async () => {
  // htmx inherits hx-target from ancestors. The step form carries
  // hx-target="#step", so a fragment with no target of its own swaps the
  // whole step away on the first poll: heading, panel and buttons all go.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "Live", [
        action("Run it", "run-it", ["echo", "hello"], "now", true),
        buttons([{ label: "N", action: "next" }]),
      ]),
    ],
  });
  await handle(new Request("http://local/"));
  const res = await handle(
    new Request("http://local/action", {
      method: "POST",
      body: new URLSearchParams({ id: "run-it" }),
      headers: { "hx-request": "true" },
    }),
  );
  const body = await res.text();
  assert(body.includes('hx-get="/task/'), "fragment polls the task route");
  assert(body.includes('hx-target="this"'), "fragment names its own target");
  const id = body.split('hx-get="/task/')[1].split('"')[0];
  const poll = await handle(
    new Request("http://local/task/" + id, {
      headers: { "hx-request": "true" },
    }),
  );
  const pollBody = await poll.text();
  const stillPolling = pollBody.includes('hx-get="/task/');
  assert(
    !stillPolling || pollBody.includes('hx-target="this"'),
    "a running poll keeps its own target",
  );
});

Deno.test("plain action shows its label once", () => {
  // Render a plain action and count its label.
  const html = renderNode(action("Fetch Zepto orders", "zepto", ["echo", "hi"]));
  const hits = html.split("Fetch Zepto orders").length - 1;
  assert(hits === 1, "plain label appears once: " + hits);
  assert(!html.includes("<h3>"), "plain action renders no heading");
});

Deno.test("confirm action keeps its heading", () => {
  // Render a confirm action and check its heading.
  const html = renderNode(
    action("Wipe cache", "wipe", ["rm", "-rf"], "now", undefined, "Wipe all cached files?"),
  );
  assert(html.includes("<h3>Wipe cache</h3>"), "confirm heading keeps the label");
});

Deno.test("tabs with a chosen index mark only that tab active", () => {
  // Render three tabs with the middle one chosen.
  const html = renderNode(
    tabs([
      { label: "One", nodes: [markdown("First")] },
      { label: "Two", nodes: [markdown("Second")] },
      { label: "Three", nodes: [markdown("Third")] },
    ], 1),
  );
  const tabTags = html.match(/<wa-tab [^>]*>/g) ?? [];
  assert(tabTags.length === 3, "three tabs render");
  assert(!(tabTags[0] ?? "").includes("active"), "first tab stays plain");
  assert((tabTags[1] ?? "").includes("active"), "chosen tab takes active");
  assert(!(tabTags[2] ?? "").includes("active"), "last tab stays plain");
  const panelTags = html.match(/<wa-tab-panel [^>]*>/g) ?? [];
  assert(panelTags.length === 3, "three panels render");
  assert(!(panelTags[0] ?? "").includes("active"), "first panel stays plain");
  assert((panelTags[1] ?? "").includes("active"), "chosen panel takes active");
  assert(!(panelTags[2] ?? "").includes("active"), "last panel stays plain");
});

Deno.test("tabs with no chosen index render no active flag", () => {
  // Render two tabs with no chosen index.
  const html = renderNode(
    tabs([
      { label: "People", nodes: [checkbox("Who", "who", ["Ana"], [])] },
      { label: "Amounts", nodes: [numberEntry("Total", "total", 5)] },
    ]),
  );
  assert(!html.includes("active"), "no active flag renders");
});

// Post one action click with extra step fields plus the hx header.
function fieldActionPost(
  id: string,
  extra: Record<string, string> = {},
): Request {
  return new Request("http://local/action", {
    method: "POST",
    body: new URLSearchParams({ id, ...extra }),
    headers: { "hx-request": "true" },
  });
}

// Build a wizard with one text field plus one marker action.
function markerWizard() {
  return wiz({
    title: "T",
    steps: [
      step("a", "First", [
        textEntry("Run name", "run"),
        action("Say it", "say", ["echo", "{run}"]),
      ]),
    ],
  });
}

Deno.test("action button posts its step fields", () => {
  // Render one plain action plus one confirm action.
  const html = renderNode(action("Say it", "say", ["echo", "{run}"]));
  assert(
    html.includes('hx-include="closest form"'),
    "action button carries hx-include",
  );
  const confirm = renderNode(
    action("Wipe cache", "wipe", ["echo", "x"], "now", undefined, "Wipe it?"),
  );
  assert(
    confirm.includes('hx-include="closest form"'),
    "confirm button carries hx-include",
  );
});

Deno.test("action marker fills from the posted step field", async () => {
  // Type a value on the step, then press the marker action.
  const handle = markerWizard();
  await handle(new Request("http://local/"));
  const res = await handle(fieldActionPost("say", { run: "Friday" }));
  assert((await res.text()).includes("Friday"), "panel shows the typed value");
});

Deno.test("empty action field stops the run with a prompt", async () => {
  // Post only spaces for the field, then press the marker action.
  const handle = markerWizard();
  await handle(new Request("http://local/"));
  const res = await handle(fieldActionPost("say", { run: "   " }));
  assert(
    (await res.text()).includes(
      "Type a value for run first, then press the button again.",
    ),
    "panel shows the exact prompt",
  );
});

Deno.test("action without a marker still runs unchanged", async () => {
  // Press a plain echo action with no marker in its command.
  const handle = wiz({
    title: "T",
    steps: [step("a", "First", [action("Run it", "run", ["echo", "plain-ok"])])],
  });
  await handle(new Request("http://local/"));
  const res = await handle(fieldActionPost("run", { run: "Friday" }));
  assert((await res.text()).includes("plain-ok"), "plain command still runs");
});

Deno.test("staged action fills its marker from saved answers on Done", async () => {
  // Stage a marker action, then post Done with the field saved.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [
        textEntry("Run name", "run"),
        action("Staged say", "s1", ["echo", "{run}"], "onConfirm"),
        buttons([{ label: "Done", action: "done", primary: true }]),
      ]),
    ],
  });
  await handle(new Request("http://local/"));
  await handle(actionPost("s1"));
  const done = await handle(stepPost("a", "done", { run: "Friday" }));
  const text = await done.text();
  assert(text.includes("Staged say"), "staged label shows");
  assert(text.includes("Friday"), "Done output holds the saved value");
});

Deno.test("first request sets the session cookie once", async () => {
  // Open the wizard with no cookie.
  const handle = createWizard({
    title: "T",
    steps: [step("a", "First", [markdown("Hi")])],
  });
  const first = await handle(new Request("http://local/"));
  const set = first.headers.get("set-cookie") ?? "";
  assert(set.includes("wizard-sid="), "first response sets the cookie");
  assert(set.includes("Path=/"), "cookie carries the root path");
  assert(set.includes("HttpOnly"), "cookie carries http only");
  assert(set.includes("SameSite=Strict"), "cookie carries strict same site");
  assert(set.includes("Max-Age=86400"), "cookie carries a one day age");
  const m = set.match(/wizard-sid=([^;]+)/);
  assert(m !== null && (m[1] ?? "") !== "", "cookie holds a value");
  // Send the cookie back. No new cookie lands.
  const second = await handle(
    new Request("http://local/", {
      headers: { cookie: "wizard-sid=" + (m as RegExpMatchArray)[1] },
    }),
  );
  assert(
    second.headers.get("set-cookie") === null,
    "second request sets no cookie",
  );
});

Deno.test("two sessions keep separate answers", async () => {
  // Post a field as A. Read the echo step as B.
  const handle = createWizard({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [
        textEntry("Run name", "run"),
        buttons([
          { label: "B", action: "back" },
          { label: "N", action: "next" },
        ]),
      ]),
      (answers) =>
        step("c", "Third", [
          markdown(answers.get("run")?.join(", ") ?? "none"),
        ]),
    ],
  });
  function post(
    cookie: string,
    sid: string,
    act: string,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const params = new URLSearchParams({ step: sid, action: act, ...extra });
    return handle(
      new Request("http://local/step", {
        method: "POST",
        headers: { cookie },
        body: params,
      }),
    );
  }
  await post("wizard-sid=A", "a", "next");
  await post("wizard-sid=A", "b", "next", { run: "Friday" });
  const own = await post("wizard-sid=A", "a", "goto:2");
  assert((await own.text()).includes("Friday"), "owner keeps the value");
  const other = await post("wizard-sid=B", "a", "goto:2");
  const body = await other.text();
  assert(!body.includes("Friday"), "other session never sees the value");
  assert(body.includes("none"), "other session starts empty");
});

Deno.test("a foreign poll never sees the job output", async () => {
  // Start a slow live job as A. Poll it as B and as A.
  const handle = createWizard({
    title: "T",
    steps: [
      step("a", "Live", [
        action("Run it", "run-it", ["sleep", "5"], "now", true),
        buttons([{ label: "N", action: "next" }]),
      ]),
    ],
  });
  await handle(
    new Request("http://local/", { headers: { cookie: "wizard-sid=A" } }),
  );
  const started = await handle(
    new Request("http://local/action", {
      method: "POST",
      headers: { cookie: "wizard-sid=A", "hx-request": "true" },
      body: new URLSearchParams({ id: "run-it" }),
    }),
  );
  const startedBody = await started.text();
  const parts = startedBody.split('hx-get="/task/');
  assert(parts.length > 1, "start returns a poll fragment");
  const jobId = (parts[1] as string).split('"')[0] as string;
  const foreign = await handle(
    new Request("http://local/task/" + jobId, {
      headers: { cookie: "wizard-sid=B", "hx-request": "true" },
    }),
  );
  const foreignBody = await foreign.text();
  assert(foreignBody.includes("finished"), "foreign poll says finished");
  assert(!foreignBody.includes("hx-get"), "foreign poll keeps no poll target");
  const owner = await handle(
    new Request("http://local/task/" + jobId, {
      headers: { cookie: "wizard-sid=A", "hx-request": "true" },
    }),
  );
  const ownerBody = await owner.text();
  assert(ownerBody.includes("hx-get"), "owner poll keeps the poll target");
});

Deno.test("a step function sees the session id", async () => {
  // Record the context value. Open the wizard with one cookie.
  let seen = "";
  const handle = createWizard({
    title: "T",
    steps: [
      (_answers, ctx) => {
        seen = ctx?.sessionId ?? "";
        return step("a", "First", [markdown("Hi")]);
      },
    ],
  });
  await handle(
    new Request("http://local/", { headers: { cookie: "wizard-sid=probe-1" } }),
  );
  assert(seen === "probe-1", "step sees the session id");
});

Deno.test("the session cap drops the oldest session", async () => {
  // Fill the map past fifty. The first session drops out.
  const handle = createWizard({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [
        textEntry("Run name", "run"),
        buttons([
          { label: "B", action: "back" },
          { label: "N", action: "next" },
        ]),
      ]),
      (answers) =>
        step("c", "Third", [
          markdown(answers.get("run")?.join(", ") ?? "none"),
        ]),
    ],
  });
  function post(
    cookie: string,
    sid: string,
    act: string,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const params = new URLSearchParams({ step: sid, action: act, ...extra });
    return handle(
      new Request("http://local/step", {
        method: "POST",
        headers: { cookie },
        body: params,
      }),
    );
  }
  function open(cookie: string): Promise<Response> {
    return handle(new Request("http://local/", { headers: { cookie } }));
  }
  await post("wizard-sid=cap-old", "a", "next");
  await post("wizard-sid=cap-old", "b", "next", { run: "Friday" });
  for (let i = 0; i < 49; i++) await open("wizard-sid=cap-" + i);
  await post("wizard-sid=cap-new", "a", "next");
  await post("wizard-sid=cap-new", "b", "next", { run: "Kept" });
  const dropped = await post("wizard-sid=cap-old", "a", "goto:2");
  const droppedBody = await dropped.text();
  assert(!droppedBody.includes("Friday"), "oldest session loses its value");
  assert(droppedBody.includes("none"), "oldest session starts over");
  const kept = await post("wizard-sid=cap-new", "a", "goto:2");
  assert((await kept.text()).includes("Kept"), "newest session keeps its value");
});

Deno.test("repeating check renders one checkbox per row index", () => {
  // Render a check field with two seeded rows plus the blank row.
  const html = renderNode(
    repeating("Tasks", "tasks", [
      { kind: "check", label: "Split later", name: "later" },
    ], [{}, {}]),
  );
  assert(html.includes('type="checkbox"'), "check uses a checkbox");
  assert(html.includes('name="later"'), "check keeps its name");
  assert(html.includes('value="0"'), "first row posts zero");
  assert(html.includes('value="1"'), "second row posts one");
  assert(html.includes('value="2"'), "blank row posts two");
  const hits = html.split('type="checkbox"').length - 1;
  assert(hits === 3, "three rows render three boxes: " + hits);
});

Deno.test("repeating check seeds ticked from 1 and unticked from 0", () => {
  // Seed one row with 1 and one row with 0.
  const html = renderNode(
    repeating("Tasks", "tasks", [
      { kind: "check", label: "Split later", name: "later" },
    ], [{ "later": "1" }, { "later": "0" }]),
  );
  const inputs = html.match(/<input[^>]*>/g) ?? [];
  const boxes = inputs.filter((tag) => tag.includes('name="later"'));
  assert(boxes.length === 3, "two seeded rows plus blank: " + boxes.length);
  assert((boxes[0] ?? "").includes("checked"), "1 renders ticked");
  assert(!(boxes[1] ?? "").includes("checked"), "0 renders unticked");
});

Deno.test("repeating text plus number keep their markup", () => {
  // Render one text field plus one number field.
  const html = renderNode(
    repeating("Guests", "guests", [
      { kind: "text", label: "Name", name: "guest-name" },
      { kind: "number", label: "Age", name: "guest-age" },
    ]),
  );
  assert(html.includes('type="text"'), "text keeps its type");
  assert(html.includes('type="number"'), "number keeps its type");
  assert(html.includes('name="guest-name"'), "text keeps its name");
  assert(html.includes('name="guest-age"'), "number keeps its name");
  assert(html.includes("<wa-input"), "fields use wa-input");
  assert(!html.includes('type="checkbox"'), "no checkbox appears");
});

Deno.test("nav with a plain goto string renders Next", () => {
  // Render nav with a step id string.
  const html = renderNode(nav({ goto: "menu" }));
  assert(html.includes(">Next<"), "plain goto keeps Next");
  assert(html.includes('value="goto:menu"'), "plain goto posts the step");
});

Deno.test("nav with a goto object renders its label", () => {
  // Render nav with a step plus label object.
  const html = renderNode(nav({ goto: { step: "menu", label: "Back to menu" } }));
  assert(html.includes(">Back to menu<"), "object goto keeps its label");
  assert(html.includes('value="goto:menu"'), "object goto posts the step");
});

Deno.test("nav with a blank goto label throws and names nav", () => {
  // Feed a goto object with a blank label.
  let message = "";
  try {
    nav({ goto: { step: "menu", label: "  " } });
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  assert(message.includes("nav"), "error names nav");
  assert(message.includes("label"), "error names the label field");
});

// A three-step wizard with a conditional middle step. The middle step
// carries a when function, so every move must skip it when false.
function conditionalWizard(
  when: (answers: Map<string, string[]>) => boolean,
) {
  return wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [markdown("middle")], undefined, when),
      step("c", "Third", [markdown("tail")]),
    ],
  });
}

Deno.test("conditional next skips a step whose condition is false", async () => {
  // Post next from the first step. The wizard lands on the third one.
  const handle = conditionalWizard(() => false);
  const page = await handle(stepPost("a", "next"));
  const body = await page.text();
  assert(body.includes("Third"), "next lands on the following step");
  assert(body.includes("tail"), "following step content shows");
  assert(!body.includes("Second"), "next skips the gated step");
});

Deno.test("conditional back skips the same step in reverse", async () => {
  // Walk forward past the gated step, then post back from the third.
  const handle = conditionalWizard(() => false);
  await handle(stepPost("a", "next"));
  const back = await handle(stepPost("c", "back"));
  const body = await back.text();
  assert(body.includes("First"), "back returns to the step before");
  assert(!body.includes("Second"), "back skips the gated step");
});

// A wizard whose middle step applies only when the posted mode is show.
function answerWizard() {
  return wiz({
    title: "T",
    steps: [
      step("a", "First", [
        textEntry("Mode", "mode"),
        buttons([{ label: "N", action: "next" }]),
      ]),
      step(
        "b",
        "Second",
        [markdown("middle")],
        undefined,
        (answers) => (answers.get("mode") ?? []).includes("show"),
      ),
      step("c", "Third", [markdown("tail")]),
    ],
  });
}

Deno.test("a condition reading a posted answer decides both ways", async () => {
  // Post hide. Next skips the middle step and back skips it too.
  const hidden = answerWizard();
  const past = await hidden(stepPost("a", "next", { mode: "hide" }));
  assert((await past.text()).includes("Third"), "next skips when false");
  const back = await hidden(stepPost("c", "back"));
  const backBody = await back.text();
  assert(backBody.includes("First"), "back skips when false");
  assert(!backBody.includes("Second"), "skipped step stays hidden");
  // Post show. Next lands on the middle step and back returns to it.
  const shown = answerWizard();
  const middle = await shown(stepPost("a", "next", { mode: "show" }));
  assert((await middle.text()).includes("Second"), "next lands when true");
  await shown(stepPost("b", "next"));
  const again = await shown(stepPost("c", "back"));
  assert((await again.text()).includes("Second"), "back lands when true");
});

Deno.test("a goto naming a skipped step lands past it", async () => {
  // Name the gated step id. The wizard lands on the next applying one.
  const handle = conditionalWizard(() => false);
  const page = await handle(stepPost("a", "goto:b"));
  const body = await page.text();
  assert(body.includes("Third"), "goto lands on the next applying step");
  assert(!body.includes("Second"), "goto skips the named step");
});

// A staged wizard with one stage per step. The middle step never
// applies, so its stage must drop out of the marker.
function stagedConditionalWizard() {
  const names = ["One", "Two", "Three"];
  const stageOf = (id: string) => {
    if (id === "s1") return 0;
    if (id === "s2") return 1;
    if (id === "s3") return 2;
    return null;
  };
  return wiz({
    title: "T",
    steps: [
      step("s1", "Alpha", [markdown("a")]),
      step("s2", "Beta", [markdown("b")], undefined, () => false),
      step("s3", "Gamma", [markdown("c")]),
    ],
    stages: { names, stageOf },
  });
}

Deno.test("the stage marker counts only the applying steps", async () => {
  // Open the first step. The marker names One plus Three, not Two.
  const handle = stagedConditionalWizard();
  const first = await (await handle(new Request("http://local/"))).text();
  assert(first.includes("Alpha"), "first step shows");
  assert(first.includes("One"), "marker keeps the first stage");
  assert(first.includes("Three"), "marker keeps the last stage");
  assert(!first.includes("Two"), "marker drops the skipped stage");
  assert(first.includes("1/2"), "marker counts two stages");
  assert(!first.includes("3/"), "marker shows no third slot");
  // Walk forward. The last step marks now on the second slot.
  const last = await (await handle(stepPost("s1", "next"))).text();
  assert(last.includes("Gamma"), "next lands past the skipped step");
  assert(last.includes("2/2"), "marker names the last slot");
  const at = last.indexOf("stage-row is-now");
  assert(at >= 0, "one stage marks now");
  assert(last.slice(at, at + 200).includes("Three"), "now names Three");
});

Deno.test("a step with no condition walks every screen", async () => {
  // Drive three plain steps forward and back. Every screen appears.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [markdown("middle")]),
      step("c", "Third", [markdown("tail")]),
    ],
  });
  const second = await handle(stepPost("a", "next"));
  assert((await second.text()).includes("Second"), "next lands on step two");
  const third = await handle(stepPost("b", "next"));
  assert((await third.text()).includes("Third"), "next lands on step three");
  const back = await handle(stepPost("c", "back"));
  assert((await back.text()).includes("Second"), "back returns to step two");
});

Deno.test("a throwing condition keeps the step visible", async () => {
  // The condition throws. The step still applies and renders.
  const handle = conditionalWizard(() => {
    throw new Error("boom");
  });
  const page = await handle(stepPost("a", "next"));
  const body = await page.text();
  assert(body.includes("Second"), "throwing condition keeps the step");
  assert(!body.includes("Third"), "wizard does not skip past it");
});

Deno.test("default done summary stays with no done option", async () => {
  // Post done with no done option. The summary keeps its shape.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [
        textEntry("Run name", "run"),
        buttons([{ label: "D", action: "done", primary: true }]),
      ]),
    ],
  });
  await handle(stepPost("a", "next"));
  const done = await handle(stepPost("b", "done", { run: "Friday" }));
  const body = await done.text();
  assert(body.includes("Done"), "summary keeps Done");
  assert(body.includes("1 answers recorded."), "summary keeps count");
  assert(body.includes("Start over"), "summary keeps restart");
  assert(!body.includes("Custom tail"), "no custom content leaks");
});

Deno.test("custom done step renders and Back returns to prior step", async () => {
  // Post done with a static custom step. Back returns to step two.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step("b", "Second", [
        buttons([{ label: "D", action: "done", primary: true }]),
      ]),
    ],
    done: step("fin", "Finished", [
      markdown("Custom tail"),
      buttons([{ label: "B", action: "back" }]),
    ]),
  });
  await handle(stepPost("a", "next"));
  const done = await handle(stepPost("b", "done"));
  const body = await done.text();
  assert(body.includes("Finished"), "custom title shows");
  assert(body.includes("Custom tail"), "custom content shows");
  assert(!body.includes("answers recorded."), "default summary stays hidden");
  const back = await handle(stepPost("fin", "back"));
  assert((await back.text()).includes("Second"), "Back returns to prior step");
});

Deno.test("goto from custom done lands on named step", async () => {
  // The done function reads answers. A goto from it lands on menu.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [
        textEntry("Run name", "run"),
        buttons([{ label: "N", action: "next" }]),
      ]),
      step("b", "Second", [
        buttons([{ label: "D", action: "done", primary: true }]),
      ]),
      step("menu", "Menu", [markdown("menu tail")]),
    ],
    done: (answers) =>
      step("fin", "Finished", [
        markdown("Custom for " + (answers.get("run")?.join(", ") ?? "none")),
        buttons([{ label: "Go", action: "goto:menu", primary: true }]),
      ]),
  });
  await handle(stepPost("a", "next", { run: "Friday" }));
  const done = await handle(stepPost("b", "done"));
  assert(
    (await done.text()).includes("Custom for Friday"),
    "custom function sees answers",
  );
  const jump = await handle(stepPost("fin", "goto:menu"));
  assert((await jump.text()).includes("Menu"), "goto lands on menu");
});

Deno.test("onEnter runs once on arrival not on re-render", async () => {
  // The hook sets a flag. The step function reads it, so the flag
  // proves the hook ran before render.
  let calls = 0;
  let mode = "cold";
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      (_answers) =>
        step(
          "b",
          "Second",
          [markdown("mode:" + mode)],
          undefined,
          undefined,
          () => {
            calls += 1;
            mode = "warm";
          },
        ),
    ],
  });
  const second = await handle(stepPost("a", "next"));
  const secondBody = await second.text();
  assert(secondBody.includes("Second"), "arrival lands");
  assert(secondBody.includes("mode:warm"), "write shows in render");
  assert(calls === 1, "hook runs once");
  const same = await handle(stepPost("b", "bogus"));
  assert((await same.text()).includes("Second"), "re-render stays");
  assert(calls === 1, "hook stays silent on re-render");
});

Deno.test("rejected post keeps onEnter silent", async () => {
  // The hook vetoes step two. The veto re-renders without the hook.
  let calls = 0;
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step(
        "b",
        "Second",
        [
          textEntry("Run name", "run"),
          buttons([{ label: "N", action: "next" }]),
        ],
        undefined,
        undefined,
        () => {
          calls += 1;
        },
      ),
      step("c", "Third", [markdown("tail")]),
    ],
    onSubmit: (_fields, stepId) => {
      if (stepId === "b") return { errors: ["veto says no"] };
    },
  });
  await handle(stepPost("a", "next"));
  assert(calls === 1, "arrival runs once");
  const veto = await handle(stepPost("b", "next", { run: "Friday" }));
  const body = await veto.text();
  assert(body.includes("veto says no"), "veto shows");
  assert(!body.includes("Third"), "veto holds place");
  assert(calls === 1, "veto re-render skips hook");
});

Deno.test("leaving and returning runs onEnter again", async () => {
  // Walk to step two, back to step one, then forward again.
  let calls = 0;
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step(
        "b",
        "Second",
        [
          buttons([
            { label: "B", action: "back" },
            { label: "N", action: "next" },
          ]),
        ],
        undefined,
        undefined,
        () => {
          calls += 1;
        },
      ),
    ],
  });
  await handle(stepPost("a", "next"));
  assert(calls === 1, "first arrival runs");
  const back = await handle(stepPost("b", "back"));
  assert((await back.text()).includes("First"), "back leaves");
  assert(calls === 1, "back skips the hook");
  await handle(stepPost("a", "next"));
  assert(calls === 2, "return runs again");
});

Deno.test("throwing onEnter still renders the step", async () => {
  // The hook throws. The wizard catches it and renders step two.
  const handle = wiz({
    title: "T",
    steps: [
      step("a", "First", [buttons([{ label: "N", action: "next" }])]),
      step(
        "b",
        "Second",
        [markdown("tail")],
        undefined,
        undefined,
        () => {
          throw new Error("boom");
        },
      ),
    ],
  });
  const page = await handle(stepPost("a", "next"));
  assert(page.status === 200, "render keeps 200");
  assert((await page.text()).includes("Second"), "step still renders");
});

Deno.test("onEnter sees the session id from context", async () => {
  // Record the context value. Open the wizard with one cookie.
  let seen = "";
  const handle = createWizard({
    title: "T",
    steps: [
      step(
        "a",
        "First",
        [markdown("Hi")],
        undefined,
        undefined,
        (_answers, ctx) => {
          seen = ctx.sessionId;
        },
      ),
    ],
  });
  await handle(
    new Request("http://local/", {
      headers: { cookie: "wizard-sid=probe-enter" },
    }),
  );
  assert(seen === "probe-enter", "hook sees session id");
});

// A one-question screen states the question in its own heading, so the
// input must be able to draw no heading of its own. Whitespace stays an
// error: a blank-looking label is a mistake, an empty one is intent.
Deno.test("an empty input label draws no heading", () => {
  const html = renderStepFragment(
    step("one", "How do you wish to use this app?", [radio("", "usage", ["A", "B"])]),
  );
  const headings = (html.match(/<h3>/g) ?? []).length;
  if (headings !== 0) throw new Error("expected no h3, found " + headings);
  if (!html.includes('name="usage"')) throw new Error("radio missing");
});

Deno.test("a whitespace input label is still an error", () => {
  const problems = validateStep(
    step("one", "Pick one", [radio("   ", "usage", ["A", "B"])]),
  );
  if (problems.length === 0) throw new Error("expected a validation error");
  if (!problems[0].includes("label")) throw new Error("error does not name the label");
});
