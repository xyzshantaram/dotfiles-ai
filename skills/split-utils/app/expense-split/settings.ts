// Settings stage for the expense-split wizard.

import {
  copyable,
  markdown,
  type NavHandler,
  radio,
  type Step,
  step,
  type StepFn,
  tabs,
  textEntry,
} from "jsr:@xyzshantaram/wizardkit@^0.1.1";
import { currentSignedInAs, envPath, realApi, verifyKey } from "./connect.ts";
import type { WizardCtx } from "jsr:@xyzshantaram/wizardkit@^0.1.1";
import { sessionStore, sidOf } from "../../src/sessionstore.ts";
import { field } from "../../src/answers.ts";
import { aiSetupMessage } from "../../src/ai-setup.ts";
import {
  COMMON_CURRENCIES,
  loadSettings,
  loadSettingsSync,
  saveSettings,
  USAGE_MODES,
  validCurrencyCode,
} from "../../src/settings.ts";
import { factoryReset } from "../../src/reset.ts";
import { configDir, splitwiseEnvPath } from "../../src/paths.ts";

// Setup copy mirrors src/splitwise-setup.ts: the Splitwise apps page
// (secure.splitwise.com/apps) shows one API key, and the key is free.
const SPLITWISE_GUIDANCE =
  "To push expenses on its own, this app needs one API key from Splitwise.\n\nThe key is free: register this app at secure.splitwise.com/apps and copy the API key that page shows.\n\nPushing a full run needs Splitwise Pro on at least one group account. Free accounts allow only a few expenses a day.\n\nYou can skip this step and still settle every bill. Leave the box blank and press Next. At the end of a split the app offers two ways that need no key: Summary to copy writes one expense you add to Splitwise by hand, and Share with a friend sends your split to someone whose account can push it.";
const AI_GUIDANCE =
  "The box below holds the message that sets up an AI assistant to run this app for you. Select the text, copy it, and paste it into your AI assistant chat.";
const RESET_GUIDANCE =
  "Factory reset clears this app's saved data on this machine:\n\n- the Splitwise access token file\n- the pushed expense fingerprint file\n- the config directory, with settings and the Splitwise API key\n- share/runs, with every gathered run\n- share/profiles\n- share/zomato-tokens.json\n- share/zomato-login-state.json\n\nIt keeps everything else. Type RESET in the box below, then press Factory reset.";

// First-run chain flag, one per browser session. The start-usage step
// sets it, and the settings save clears it. The store keeps one flag
// per browser, so two browsers never share it.
const onboardingStore = sessionStore((): { value: boolean } => ({ value: false }));

// Mark one browser session as walking the first-run chain.
export function beginOnboarding(sessionId: string): void {
  onboardingStore.for(sessionId).value = true;
}

// Take the first-run chain flag for one browser session. Return true
// once, then clear it. Later posts see false.
function takeOnboarding(sessionId: string): boolean {
  const held = onboardingStore.for(sessionId);
  if (held.value === false) return false;
  held.value = false;
  return true;
}

// Write the Splitwise API key to config/splitwise.env, owner only.
// Same shape as src/splitwise-setup.ts so both paths stay identical.
export async function writeSplitwiseEnv(key: string): Promise<void> {
  const dir = configDir();
  const path = splitwiseEnvPath();
  await Deno.mkdir(dir, { recursive: true });
  // Write owner only so the key stays private.
  await Deno.writeTextFile(
    path,
    "API_KEY=" + key + "\n",
    { mode: 0o600 },
  );
  // Fix the mode again for existing files.
  try {
    await Deno.chmod(path, 0o600);
  } catch {
    // Ignore chmod errors on non posix disks.
  }
}

// Save handler for the settings screen. It saves the currency with
// the same checks the old currency step ran. It saves the key
// only when the box holds text. It never checks the key here.
export const settingsNext: NavHandler = async (_answers, fields, ctx) => {
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
  if (key !== "") {
    await writeSplitwiseEnv(key);
  }
  // One tabbed screen covers the whole first-run chain, so one rule
  // routes it back to the menu here.
  if (takeOnboarding(ctx.sessionId)) {
    return { goto: "menu" };
  }
};

// Connect action for the Splitwise tab. It saves the key and checks
// it at once. It lands on the done screen when the key works.
export const settingsConnect: NavHandler = async (_answers, fields, ctx) => {
  const sessionId = ctx.sessionId;
  const key = field(fields, "sw-key");
  if (key !== "") {
    if (/[^A-Za-z0-9_-]/.test(key)) {
      return {
        errors: [
          "That does not look like an API key. Copy the whole key from the Splitwise apps page. It holds letters and digits only.",
        ],
      };
    }
    await writeSplitwiseEnv(key);
  } else {
    try {
      await Deno.stat(envPath());
    } catch {
      return { errors: ["Paste your API key first."] };
    }
  }
  const done = await verifyKey(sessionId, await realApi());
  if (!done.ok) return { errors: [done.error] };
  return { goto: "settings-connect-done" };
};

// Reset action for the Reset tab. It wipes saved data. The confirm
// word must match exactly, so read it raw here.
export const settingsReset: NavHandler = async (_answers, fields, _ctx) => {
  const confirm = fields["reset-confirm"]?.[0] ?? "";
  if (confirm !== "RESET") {
    return { errors: ["Type RESET in the box to confirm the reset."] };
  }
  await factoryReset();
  return { goto: "settings-reset-done" };
};

// Confirmation step for a good key check.
function connectDoneStep(_: Map<string, string[]>, ctx?: WizardCtx): Step {
  const name = currentSignedInAs(sidOf(ctx));
  const line = name !== null && name !== ""
    ? "Signed in as " + name + "."
    : "Signed in to Splitwise.";
  return {
    ...step(
      "settings-connect-done",
      "Splitwise connected",
      [
        markdown(line),
      ],
      "The API key is saved owner only on this machine.",
    ),
    nav: { back: true, goto: { step: "menu", label: "Back to menu" } },
  };
}

// Settings screen. Reads the saved usage answer and opens the AI
// tab for an AI user, else the first tab.
function settingsStep(answers: Map<string, string[]>): Step {
  // Map the radio label to the stored mode first.
  const label = answers.get("usage")?.[0];
  let mode = label === undefined ? undefined : USAGE_MODES[label];
  // Read the saved usage when the map holds nothing.
  if (label === undefined) {
    mode = loadSettingsSync().usage;
  }
  const selected = mode === "ai" ? 2 : 0;
  return {
    ...step(
      "settings",
      "Settings",
      [
        tabs([
          {
            label: "Currency",
            nodes: [
              radio("Money code", "currency", [
                ...COMMON_CURRENCIES,
                { value: "__custom__", label: "Type a different code" },
              ], "INR"),
              textEntry(
                "Custom code",
                "custom-currency",
                "",
                "Three letters, for example EUR",
              ),
            ],
          },
          {
            label: "Splitwise",
            nodes: [
              markdown(SPLITWISE_GUIDANCE),
              textEntry("API key", "sw-key", "", "Paste the API key"),
            ],
          },
          {
            label: "AI assistant",
            nodes: [
              markdown(AI_GUIDANCE),
              copyable("Setup message", "ai-message", aiSetupMessage()),
            ],
          },
          {
            label: "Reset",
            nodes: [
              markdown(RESET_GUIDANCE),
              textEntry(
                "Type RESET to confirm",
                "reset-confirm",
                "",
                "Type RESET",
              ),
            ],
          },
        ], selected),
      ],
      "Currency, Splitwise access, AI assistant, and reset.",
    ),
    nav: {
      back: true,
      goto: { step: "menu", label: "Save and return", run: settingsNext },
      actions: [
        { id: "connect", label: "Save key and connect", run: settingsConnect },
        { id: "reset", label: "Factory reset", run: settingsReset },
      ],
    },
  };
}

export function settingsSteps(): Array<Step | StepFn> {
  return [
    settingsStep,
    connectDoneStep,
    {
      ...step(
        "settings-reset-done",
        "Reset done",
        [
          markdown(
            "Factory reset cleared the Splitwise access token file, the pushed expense fingerprint file, the config directory, share/runs, share/profiles, share/zomato-tokens.json, and share/zomato-login-state.json.",
          ),
        ],
        "The app is back to its first-run state.",
      ),
      nav: { goto: { step: "menu", label: "Back to menu" } },
    },
  ];
}
