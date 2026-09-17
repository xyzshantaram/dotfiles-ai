#!/usr/bin/env -S deno run --no-lock -A
// Expense split wizard entry. One script, modular steps, meta menu on top.
// Run it with: deno run --no-lock -A wizards/expense-split.ts
// Then open http://localhost:8471 in a browser.

import {
  createWizard,
  type DraftEntry,
  type NavHandler,
  radio,
  type Step,
  step,
  type StepFn,
} from "../wizardkit/mod.ts";
import { gatherSteps, setResumedRun } from "./expense-split/gather.ts";
import { resumeStep, routeStatus, splitRunId, splitSteps } from "./expense-split/split.ts";
import { pushSteps, sourceStep } from "./expense-split/push.ts";
import { beginOnboarding, settingsSteps } from "./expense-split/settings.ts";

// Menu copy mirrors wizards/meta.ts: titles plus descriptions, same order.
interface MenuItem {
  title: string;
  hint: string;
  target: string;
  firstRunOnly?: boolean;
}

const MENU: MenuItem[] = [
  {
    title: "Start here",
    hint: "Answer three quick questions, then you are ready.",
    target: "start-usage",
    firstRunOnly: true,
  },
  {
    title: "Split and push recent orders",
    hint: "All three steps in order. Do this if you just want to sync some expenses.",
    target: "gather-platforms",
  },
  {
    title: "Pick up where you left off",
    hint: "Continue a session you started earlier.",
    target: "resume",
  },
  {
    title: "Collect orders from platforms",
    hint: "Supported: Zepto, Blinkit, Zomato, Swiggy, or enter expenses by hand.",
    target: "gather-platforms",
  },
  {
    title: "Assign per-order split",
    hint: "Mark who each item belongs to, order by order.",
    // The split flow now asks which run first, so the menu opens that
    // step. Opening the People step instead skipped the run question
    // and left the later steps with no run to read.
    target: "split-run",
  },
  {
    title: "Upload orders to Splitwise",
    hint: "Send your split to Splitwise, or push a share link from a friend.",
    target: "push-source",
  },
  {
    title: "Settings",
    hint: "Currency, Splitwise access, and AI assistant.",
    target: "settings",
  },
];

import { loadSettings, saveSettings, USAGE_MODES } from "../src/settings.ts";
import { listRunsSync, readRun, runHint, stateRoot } from "../src/runstate.ts";
import { sidOf } from "../src/sessionstore.ts";
import type { WizardCtx } from "../wizardkit/mod.ts";

// Push source step with the finished split run preloaded. The export
// step jumps here with goto:push-source, so the Run entry carries the
// run of the last split session. A value typed by hand wins.
export function pushSourceStep(m: Map<string, string[]>, ctx?: WizardCtx): Step {
  return sourceStep(m, splitRunId(sidOf(ctx)));
}

// Push steps carry their own bars already. The source slot above
// replaces the plain one, so the forward order stays source,
// names, setup, group, cutoff, confirm, report.
const pushTail: Array<Step | StepFn> = [
  pushSourceStep,
  ...pushSteps().slice(1),
];

// Next handler for the menu. It opens the picked task itself. No
// confirmation screen sits in between.
export const menuNext: NavHandler = (_answers, fields, _ctx) => {
  return { goto: menuTarget(fields["task"]?.[0] ?? "") };
};

// Next handler for the first-run usage question. It saves the usage
// answer, then marks the browser as walking the onboarding chain.
// Later runs use the plain step order.
export const startUsageNext: NavHandler = async (_answers, fields, ctx) => {
  // Read the first-run flag before the save. Writing the settings
  // file is exactly what turns firstRun() false.
  const wasFirstRun = firstRun();
  const usage = USAGE_MODES[fields["usage"]?.[0] ?? ""];
  if (usage !== undefined) {
    await saveSettings({ ...(await loadSettings()), usage });
  }
  if (wasFirstRun) {
    beginOnboarding(ctx.sessionId);
    // The single settings screen holds every tab, so one target
    // covers the AI path and the manual path alike.
    return { goto: "settings" };
  }
};

// Next handler for the resume picker. It routes the picked session
// by its status, like meta.ts resumeMenu: gathered splits, assigned
// pushes, failed restarts at gather, pushed lands on the done step.
export const resumeNext: NavHandler = async (_answers, fields, _ctx) => {
  const picked = fields["resume-pick"]?.[0] ?? "";
  const found = await readRun(picked);
  if (found === null) {
    return { errors: ["That session is gone. Pick another one."] };
  }
  return { goto: routeStatus(found.meta.status) };
};

// Resume picker with its bar attached. The split module owns the
// screen, and this entry owns the submit rule. The empty screen
// keeps no forward button, so nothing attaches there.
function resumeStepWithNav(): Step {
  const built = resumeStep();
  if (built.nav?.next === undefined) return built;
  return {
    ...built,
    nav: { ...built.nav, next: { label: "Next", run: resumeNext } },
  };
}

const splitTail: Array<Step | StepFn> = splitSteps().map((entry) =>
  entry === resumeStep ? resumeStepWithNav : entry
);

const tail: Array<Step | StepFn> = [
  ...gatherSteps(),
  ...splitTail,
  ...pushTail,
  startUsageStep(),
  ...settingsSteps(),
];

// True when the settings file misses. First run shows Start here.
function firstRun(): boolean {
  try {
    Deno.statSync(stateRoot() + "/config/settings.json");
    return false;
  } catch {
    return true;
  }
}

// Onboarding flow from meta.ts startHere: usage first, then the
// settings chain (currency, Splitwise or AI setup) carries on.
function startUsageStep(): Step {
  return {
    ...step(
      "start-usage",
      "How do you wish to use this app?",
      [
        // No label: the step heading above already asks this question, and
        // a second heading here made the screen state it twice.
        radio("", "usage", [
          {
            value: "With an AI helper",
            hint: "An AI assistant runs this app for you and handles the details.",
          },
          {
            value: "By myself but push to Splitwise automatically",
            hint: "Needs at least one person in your group to have Splitwise Pro.",
          },
          {
            value: "By myself, push manually",
            hint:
              "You can use this program entirely for free. It writes one summary expense you can add to Splitwise quickly by hand.",
          },
        ]),
      ],
      "Your first run. This is the first of three quick questions. Pick one, then press Next.",
    ),
    nav: { back: true, next: { label: "Next", run: startUsageNext } },
  };
}

function menuStep(): Step {
  const items = MENU.filter((item) => !item.firstRunOnly || firstRun());
  const guiding = firstRun();
  return {
    ...step(
      "menu",
      "Pick a task",
      [
        radio(
          "Task",
          "task",
          items.map((item) => ({ value: item.title, hint: item.hint })),
          items[0].title,
        ),
      ],
      guiding ? "You are all set. Choose what to do next." : undefined,
    ),
    nav: { next: { label: "Next", run: menuNext } },
  };
}

// Step id for one picked menu title. The menu jumps straight there,
// so no confirmation screen sits between the pick and the task.
function menuTarget(picked: string): string {
  const item = MENU.find(
    (entry) => entry.title === picked && (!entry.firstRunOnly || firstRun()),
  ) ?? MENU[0];
  return item.target;
}

// List resumable runs newest first for the drafts hook.
// Drop pushed runs because pushed runs hold no further work.
export function listResumableDrafts(): DraftEntry[] {
  return listRunsSync()
    .filter((run) => run.status !== "pushed")
    .map((run) => ({
      id: run.id,
      label: run.label + " · " + run.createdAt.slice(0, 10),
      at: run.createdAt,
      hint: runHint(run),
    }));
}

// Resume one draft run by id for the drafts hook.
// Return null when no resumable run matches the id.
// Remember the run for the pick screen.
// Then open its next step.
export function resumeDraft(id: string, ctx: WizardCtx): string | null {
  // One scan answers both questions: the run exists, and it still holds
  // work. A pushed run is finished, so it never resumes.
  const run = listRunsSync().find(
    (entry) => entry.id === id && entry.status !== "pushed",
  );
  if (run === undefined) return null;
  setResumedRun(ctx.sessionId, id);
  return routeStatus(run.status);
}

const handle = createWizard({
  title: "Expense Split",
  steps: [menuStep(), ...tail],
  actions: {},
  drafts: {
    list: () => listResumableDrafts(),
    resume: (id, ctx) => resumeDraft(id, ctx),
  },
  stages: {
    names: ["Gather", "Split", "Push"],
    stageOf: (stepId: string) => {
      if (stepId.startsWith("gather-")) return 0;
      if (stepId.startsWith("split-")) return 1;
      if (stepId.startsWith("push-")) return 2;
      return null;
    },
  },
});

if (import.meta.main) {
  // The runtime passes WIZARD_PORT. Plain runs fall back below.
  const port = Number(Deno.env.get("WIZARD_PORT") ?? 8471);
  Deno.serve({ port }, handle);
}
