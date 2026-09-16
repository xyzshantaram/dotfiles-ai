#!/usr/bin/env -S deno run --no-lock -A
// Expense split wizard entry. One script, modular steps, meta menu on top.
// Run it with: deno run --no-lock -A wizards/expense-split.ts
// Then open http://localhost:8471 in a browser.

import {
  buttons,
  createWizard,
  radio,
  type Step,
  step,
  type StepFn,
} from "../wizardkit/mod.ts";
import {
  gatherPickRunId,
  gatherSteps,
  manualRowProblems,
  persistManualRun,
  setPickOverride,
} from "./expense-split/gather.ts";
import {
  createSplitShareLink,
  rememberPeoplePost,
  roleErrors,
  routeStatus,
  splitRunId,
  splitSteps,
} from "./expense-split/split.ts";
import { pushSteps, sourceStep } from "./expense-split/push.ts";
import { settingsSteps } from "./expense-split/settings.ts";
import {
  completeHandshake,
  currentAuthorizeUrl,
  envPath,
  realApi,
  startHandshake,
} from "./expense-split/connect.ts";

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

import { loadSettings, saveSettings, USAGE_MODES, validCurrencyCode } from "../src/settings.ts";
import { field, answerList } from "../src/answers.ts";
import { factoryReset } from "../src/reset.ts";
import { listRunsSync, readRun, setRunPicked, stateRoot } from "../src/runstate.ts";
import { configDir, splitwiseEnvPath } from "../src/paths.ts";
import { manualRows } from "./expense-split/gather.ts";
import {
  applyCutoff,
  executePush,
  prepareShareImport,
  prepareSource,
  prepareSplitwise,
  pushSessionFor,
  resolveNamePicks,
  SHARE_SOURCE,
} from "./expense-split/push-engine.ts";
import {
  sessionStore,
  sidOf,
} from "../src/sessionstore.ts";
import type { WizardCtx } from "../wizardkit/mod.ts";

// Push source step with the finished split run preloaded. The export
// step jumps here with goto:push-source, so the Run entry carries the
// run of the last split session. A value typed by hand wins.
export function pushSourceStep(m: Map<string, string[]>, ctx?: WizardCtx): Step {
  return sourceStep(m, splitRunId(sidOf(ctx)));
}

// pushSteps() returns its own source slot first. Drop that slot and
// lead with the preloaded one, so the forward order stays source,
// names, setup, group, cutoff, confirm, report.
const pushTail: Array<Step | StepFn> = [
  pushSourceStep,
  ...pushSteps().slice(1),
];

const tail: Array<Step | StepFn> = [
  ...gatherSteps(),
  ...splitSteps(),
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
  return step(
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
      buttons(
        [
          { label: "Back", action: "back" },
          { label: "Next", action: "next", primary: true },
        ],
        undefined,
        "split",
      ),
    ],
    "Your first run. This is the first of three quick questions. Pick one, then press Next.",
  );
}

function menuStep(): Step {
  const items = MENU.filter((item) => !item.firstRunOnly || firstRun());
  const guiding = firstRun();
  return step(
    "menu",
    "Pick a task",
    [
      radio(
        "Task",
        "task",
        items.map((item) => ({ value: item.title, hint: item.hint })),
        items[0].title,
      ),
      buttons([{ label: "Next", action: "next", primary: true }]),
    ],
    guiding ? "You are all set. Choose what to do next." : undefined,
  );
}

// Every answer posted so far, by field name and by browser session.
// The submit hook receives only the current step, so this carries
// earlier answers to the decisions that need them. The store replaces
// the module level seen map, which two browsers used to share.
const seenStore = sessionStore((): Map<string, string[]> => new Map());

// First-run chain flags, one per browser session. firstRun() cannot
// carry it: the first saved answer makes that check false for the rest
// of the chain. The store replaces the module level onboarding flag,
// which two browsers used to share.
const onboardingStore = sessionStore((): { value: boolean } => ({ value: false }));

// Step id for one picked menu title. The menu jumps straight there,
// so no confirmation screen sits between the pick and the task.
function menuTarget(picked: string): string {
  const item = MENU.find(
    (entry) => entry.title === picked && (!entry.firstRunOnly || firstRun()),
  ) ?? MENU[0];
  return item.target;
}

// Write the Splitwise key pair to config/splitwise.env, owner only.
// Same shape as src/splitwise-setup.ts so both paths stay identical.
async function writeSplitwiseEnv(key: string, secret: string): Promise<void> {
  const dir = configDir();
  const envPath = splitwiseEnvPath();
  await Deno.mkdir(dir, { recursive: true });
  // Write owner only so secrets stay private.
  await Deno.writeTextFile(
    envPath,
    "CONSUMER_KEY=" + key + "\nCONSUMER_SECRET=" + secret + "\n",
    { mode: 0o600 },
  );
  // Fix the mode again for existing files.
  try {
    await Deno.chmod(envPath, 0o600);
  } catch {
    // Ignore chmod errors on non posix disks.
  }
}

// First-run onboarding route. The usage answer picks the next screen:
// the AI helper path skips the currency and Splitwise steps, because the
// assistant sets those up. Later runs use the plain step order.
// Each submit also persists its answer so firstRun() exits.
export async function onSubmit(
  fields: Record<string, string[]>,
  stepId: string,
  action = "",
  ctx?: WizardCtx,
): Promise<{ errors?: string[]; goto?: string } | void> {
  const sessionId = sidOf(ctx);
  const seen = seenStore.for(sessionId);
  const onboardingHeld = onboardingStore.for(sessionId);
  // Remember every posted answer. The hook sees one step of fields,
  // yet some decisions need an answer from an earlier step. PLAN.md
  // tracks that toolkit gap as K3 and K4.
  for (const [name, values] of Object.entries(fields)) seen.set(name, values);
  if (stepId === "menu") {
    // The menu opens the task itself. No confirmation screen sits in
    // between.
    return { goto: menuTarget(fields["task"]?.[0] ?? "") };
  }
  if (stepId === "start-usage") {
    // Read the first-run flag before the save. Writing the settings
    // file is exactly what turns firstRun() false.
    const wasFirstRun = firstRun();
    const usage = USAGE_MODES[fields["usage"]?.[0] ?? ""];
    if (usage !== undefined) {
      await saveSettings({ ...(await loadSettings()), usage });
    }
    if (wasFirstRun) {
      onboardingHeld.value = true;
      // The single settings screen holds every tab, so one target
      // covers the AI path and the manual path alike.
      return { goto: "settings" };
    }
  }
  if (stepId === "gather-manual") {
    // Refuse a half typed row before anything saves. A back move never
    // reaches this check, because the toolkit ignores errors on one.
    const rowProblems = manualRowProblems(seen);
    if (rowProblems.length > 0) return { errors: rowProblems };
    // The step writes nothing while it renders. The rows save here,
    // when the user presses Next.
    if (!(fields["dry"] ?? []).includes("dry")) persistManualRun(sessionId, seen);
  }
  if (stepId === "gather-pick" && action !== "back") {
    // Select all and Select none only re-render the same screen.
    // They save nothing.
    if (action === "pick-all") {
      setPickOverride(sessionId, "all");
      return { goto: "gather-pick" };
    }
    if (action === "pick-none") {
      setPickOverride(sessionId, "none");
      return { goto: "gather-pick" };
    }
    // Next needs at least one ticked order. Back never reaches here.
    const picked = (fields["pick"] ?? [])
      .map((value) => Number(value))
      .filter((n) => Number.isInteger(n) && n >= 0)
      .sort((a, b) => a - b);
    if (picked.length === 0) {
      return { errors: ["Tick at least one order to split."] };
    }
    const runId = gatherPickRunId(seen, sessionId);
    if (runId === null) {
      // Saving nothing here would drop the ticks without a word.
      return {
        errors: ["The gathered run is gone. Press Back and fetch the orders again."],
      };
    }
    setRunPicked(runId, picked);
  }
  if (stepId === "split-people" && action !== "back") {
    // Keep the posted names before the check. A rejected post never
    // reaches the answers map, so the step seeds its entries from this
    // instead of losing what the user typed. Back never validates: a
    // user leaving the step must not be held by it.
    rememberPeoplePost(sessionId, fields);
    const problems = roleErrors(fields);
    if (problems.length > 0) return { errors: problems };
  }
  if (stepId === "split-share") {
    const made = await createSplitShareLink(sessionId, seen);
    if (!made.ok) return { errors: [made.error] };
    return { goto: "split-share-done" };
  }
  if (stepId === "settings") {
    // The Reset tab wipes saved data. The confirm word must match
    // exactly, so read it raw here instead of through field().
    if (action === "reset") {
      const confirm = fields["reset-confirm"]?.[0] ?? "";
      if (confirm !== "RESET") {
        return { errors: ["Type RESET in the box to confirm the reset."] };
      }
      await factoryReset();
      return { goto: "settings-reset-done" };
    }
    // The Splitwise tab saves the pair and starts the handshake.
    if (action === "connect") {
      const key = field(fields, "sw-key");
      const secret = field(fields, "sw-secret");
      if (key === "" && secret === "") {
        // No keys yet. Skip the write and carry on.
      } else if (key === "" || secret === "") {
        return {
          errors: [
            "Paste both the Consumer Key and the Consumer Secret, or leave both blank.",
          ],
        };
      } else {
        await writeSplitwiseEnv(key, secret);
      }
      // A key pair is in hand (just written or saved earlier). Start the
      // OAuth handshake and show the approve link on the next screen.
      let havePair = key !== "" && secret !== "";
      if (!havePair) {
        try {
          await Deno.stat(envPath());
          havePair = true;
        } catch {
          // No saved key pair either.
        }
      }
      if (havePair) {
        const started = await startHandshake(sessionId, await realApi());
        if (!started.ok) return { errors: [started.error] };
        return { goto: "settings-connect" };
      }
      return;
    }
    // Save and return, plus Back. Save the currency with the same
    // checks the old currency step ran. Save the key pair only when
    // both boxes hold text. Never start the handshake on this path.
    const choice = field(fields, "currency");
    let currency = choice.toUpperCase();
    if (choice === "__custom__") {
      // A typed code wins. It must hold exactly three letters.
      currency = field(fields, "custom-currency").toUpperCase();
      if (!validCurrencyCode(currency)) {
        return { errors: ["Type three letters, for example EUR."] };
      }
    }
    if (currency.length === 0) {
      return { errors: ["Pick a currency code before you continue."] };
    }
    await saveSettings({ ...(await loadSettings()), currency });
    const key = field(fields, "sw-key");
    const secret = field(fields, "sw-secret");
    if (key !== "" && secret !== "") {
      await writeSplitwiseEnv(key, secret);
    }
  }
  if (stepId === "settings-connect") {
    // No handshake for this browser means the screen drew no verifier
    // box, so asking for one names a control the user cannot see.
    if (currentAuthorizeUrl(sessionId) === null) {
      return {
        errors: [
          "No approval is waiting. Open Settings, then press Save keys and connect on the Splitwise tab.",
        ],
      };
    }
    const raw = fields["sw-verifier"]?.[0] ?? "";
    if (raw.trim() === "") {
      return {
        errors: ["Paste the verifier code, or the full callback URL, first."],
      };
    }
    const done = await completeHandshake(sessionId, raw, await realApi());
    if (!done.ok) return { errors: [done.error] };
    return { goto: "settings-connect-done" };
  }
  if (stepId === "push-source") {
    // Stage the source doc, then discover Splitwise access. A share
    // link fetches through fetchShareLink and lands under
    // share/imports before the same push flow continues on it.
    const source = fields["source"]?.[0] ?? "";
    if (source === SHARE_SOURCE) {
      const imported = await prepareShareImport(sessionId, fields["share-link"]?.[0] ?? "");
      if (!imported.ok) return { errors: [imported.error] };
    } else {
      const typed = field(fields, "run-id-other");
      const listed = field(fields, "run-id");
      const runId = typed !== "" ? typed : listed;
      const prepared = await prepareSource(
        sessionId,
        source,
        runId,
        fields["split-file"]?.[0] ?? "",
      );
      if (!prepared.ok) return { errors: [prepared.error] };
    }
    const sw = await prepareSplitwise(sessionId);
    if (!sw.ok) {
      // Ambiguous or unmatched names route to the picker step, like
      // the pusher pick list. Everything else shows the error.
      if (sw.needsNamePick) return { goto: "push-names" };
      return { errors: [sw.error] };
    }
    // Live access needs no access screen: the state rides along on
    // the next step. Aggregate mode keeps it, because that screen
    // explains the summary path.
    return { goto: pushSessionFor(sessionId).mode === "live" ? "push-group" : "push-setup" };
  }
  if (stepId === "push-names") {
    const picked = resolveNamePicks(sessionId, fields);
    if (!picked.ok) return { errors: [picked.error] };
    // The stashed choices let the setup finish this time.
    const sw = await prepareSplitwise(sessionId);
    if (!sw.ok) return { errors: [sw.error] };
    // Live access needs no access screen: the state rides along on
    // the next step. Aggregate mode keeps it, because that screen
    // explains the summary path.
    return { goto: pushSessionFor(sessionId).mode === "live" ? "push-group" : "push-setup" };
  }
  if (stepId === "push-setup") {
    // Live access picks a group first. The aggregate path skips it.
    return { goto: pushSessionFor(sessionId).mode === "live" ? "push-group" : "push-cutoff" };
  }
  if (stepId === "push-group") {
    const picked = Number(fields["push-group"]?.[0] ?? "0");
    pushSessionFor(sessionId).groupId = Number.isFinite(picked) ? picked : 0;
    return { goto: "push-cutoff" };
  }
  if (stepId === "push-cutoff") {
    const cut = applyCutoff(sessionId, fields["cutoff"]?.[0] ?? "");
    if (!cut.ok) return { errors: [cut.error] };
    return { goto: "push-confirm" };
  }
  if (stepId === "push-confirm") {
    // Per-order radios drive the real push. Unpicked orders stay out.
    // A ticked dry box runs the plan instead: counts and totals with
    // no expense, no fingerprint, and no archive.
    const dry = (fields["dry"] ?? []).includes("dry");
    const choices: Record<string, string> = {};
    for (const [name, values] of Object.entries(fields)) {
      if (name.startsWith("order-")) choices[name.slice("order-".length)] = values[0] ?? "";
    }
    const done = await executePush(sessionId, choices, dry ? { dry: true } : undefined);
    if (!done.ok) return { errors: [done.error] };
    return { goto: "push-report" };
  }
  if (stepId === "gather-review") {
    // Done means Continue only after something was gathered. Dry runs
    // show the plan instead, so they skip this gate.
    if ((fields["dry"] ?? []).includes("dry")) return;
    // The platforms answer lands on an earlier step, so read it from
    // the remembered answers. Reading the review post instead finds an
    // empty list, and the gate then lets every user straight through.
    const picked = (answerList(seen, "platforms"))
      .map((value) => value.toLowerCase())
      .filter((value, index, all) => all.indexOf(value) === index);
    const runs = listRunsSync();
    const missing = picked.filter((id) => {
      if (id === "manual") return manualRows(seen).length === 0;
      return !runs.some((run) => run.platforms.includes(id));
    });
    if (missing.length > 0) {
      return {
        errors: [
          "No orders loaded for " + missing.join(", ") +
          " yet. Press Fetch on each one, wait for it to finish, then press Next.",
        ],
      };
    }
  }
  if (stepId === "resume") {
    // Route the picked session by its status, like meta.ts resumeMenu:
    // gathered splits, assigned pushes, failed restarts at gather,
    // pushed lands on the done step.
    const picked = fields["resume-pick"]?.[0] ?? "";
    const found = await readRun(picked);
    if (found === null) {
      return { errors: ["That session is gone. Pick another one."] };
    }
    return { goto: routeStatus(found.meta.status) };
  }
  // Onboarding chain. firstRun() turns false the moment start-usage
  // saves its answer, so an in-memory flag carries the chain instead
  // of that file check. One tabbed screen covers the whole chain, so
  // one branch routes it back to the menu.
  if (onboardingHeld.value && stepId === "settings") {
    onboardingHeld.value = false;
    return { goto: "menu" };
  }
}

const handle = createWizard({
  title: "Expense Split",
  steps: [menuStep(), ...tail],
  actions: {},
  stages: {
    names: ["Gather", "Split", "Push"],
    stageOf: (stepId: string) => {
      if (stepId.startsWith("gather-")) return 0;
      if (stepId.startsWith("split-")) return 1;
      if (stepId.startsWith("push-")) return 2;
      return null;
    },
  },
  onSubmit,
});

if (import.meta.main) {
  // The runtime passes WIZARD_PORT. Plain runs fall back below.
  const port = Number(Deno.env.get("WIZARD_PORT") ?? 8471);
  Deno.serve({ port }, handle);
}
