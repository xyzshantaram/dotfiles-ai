// Settings stage for the expense-split wizard.

import {
  copyable,
  markdown,
  radio,
  type NavHandler,
  type Step,
  step,
  type StepFn,
  tabs,
  textEntry,
} from "../../wizardkit/mod.ts";
import {
  completeHandshake,
  currentAuthorizeUrl,
  currentSignedInAs,
  envPath,
  realApi,
  startHandshake,
} from "./connect.ts";
import type { WizardCtx } from "../../wizardkit/mod.ts";
import { sessionStore, sidOf } from "../../src/sessionstore.ts";
import { field } from "../../src/answers.ts";
import { aiSetupMessage } from "../../src/ai-setup.ts";
import {
  loadSettings,
  loadSettingsSync,
  saveSettings,
  USAGE_MODES,
  validCurrencyCode,
} from "../../src/settings.ts";
import { factoryReset } from "../../src/reset.ts";
import { configDir, splitwiseEnvPath } from "../../src/paths.ts";

// Fixed currency codes mirror COMMON_CURRENCIES in src/settings.ts.
const CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SGD",
  "AUD",
  "CAD",
  "JPY",
  "CHF",
];

// Setup copy mirrors src/splitwise-setup.ts: the Splitwise apps page
// (secure.splitwise.com/apps) names them Consumer Key and Consumer
// Secret, and the key pair is free.
const SPLITWISE_GUIDANCE =
  "To push expenses on its own, this app needs its own Consumer Key and Consumer Secret from Splitwise.\n\nThey are free: register this app at secure.splitwise.com/apps and copy the two codes it shows.\n\nPushing a full run needs Splitwise Pro on at least one group account. Free accounts allow only a few expenses a day.\n\nYou can skip this step and still settle every bill. Leave both boxes blank and press Next. At the end of a split the app offers two ways that need no key: Summary to copy writes one expense you add to Splitwise by hand, and Share with a friend sends your split to someone whose account can push it.";
const AI_GUIDANCE =
  "The box below holds the message that sets up an AI assistant to run this app for you. Select the text, copy it, and paste it into your AI assistant chat.";
const RESET_GUIDANCE =
  "Factory reset clears this app's saved data on this machine:\n\n- the Splitwise access token file\n- the pushed expense fingerprint file\n- the config directory, with settings and the Splitwise key pair\n- share/runs, with every gathered run\n- share/profiles\n- share/zomato-tokens.json\n- share/zomato-login-state.json\n\nIt keeps everything else. Type RESET in the box below, then press Factory reset.";

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

// Write the Splitwise key pair to config/splitwise.env, owner only.
// Same shape as src/splitwise-setup.ts so both paths stay identical.
async function writeSplitwiseEnv(key: string, secret: string): Promise<void> {
  const dir = configDir();
  const path = splitwiseEnvPath();
  await Deno.mkdir(dir, { recursive: true });
  // Write owner only so secrets stay private.
  await Deno.writeTextFile(
    path,
    "CONSUMER_KEY=" + key + "\nCONSUMER_SECRET=" + secret + "\n",
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
// the same checks the old currency step ran. It saves the key pair
// only when both boxes hold text. It never starts the handshake here.
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
  const secret = field(fields, "sw-secret");
  if (key !== "" && secret !== "") {
    await writeSplitwiseEnv(key, secret);
  }
  // One tabbed screen covers the whole first-run chain, so one rule
  // routes it back to the menu here.
  if (takeOnboarding(ctx.sessionId)) {
    return { goto: "menu" };
  }
};

// Connect action for the Splitwise tab. It saves the pair and starts
// the handshake. It shows the approve link on the next screen.
export const settingsConnect: NavHandler = async (_answers, fields, ctx) => {
  const sessionId = ctx.sessionId;
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

// Next handler for the approve screen. It checks the verifier and
// finishes the handshake. It reports when no handshake is waiting.
export const connectNext: NavHandler = async (_answers, fields, ctx) => {
  const sessionId = ctx.sessionId;
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
};

// Handshake step. The Splitwise tab of the settings step starts the
// OAuth handshake, then this step shows the approve link (clickable,
// plus copyable text) and takes the verifier. A bare code or the full
// callback URL both work.
function connectStep(_: Map<string, string[]>, ctx?: WizardCtx): Step {
  // The handshake belongs to the browser that started it, so this read
  // must use the same session id the start used. Reading the default
  // session here hid every live link behind the not-ready branch.
  const url = currentAuthorizeUrl(sidOf(ctx));
  if (url === null) {
    // No handshake is waiting for this browser. Next would ask for a
    // verifier box that this branch never draws, so the only way on is
    // the button that starts the handshake.
    return {
      ...step(
        "settings-connect",
        "Approve Splitwise access",
        [
          markdown(
            "No approval is waiting. Open Settings, then press Save keys and connect on the Splitwise tab.",
          ),
        ],
        "One-time check that this app may talk to Splitwise.",
      ),
      nav: { back: true, goto: { step: "settings", label: "Open Settings" } },
    };
  }
  return {
    ...step(
      "settings-connect",
      "Approve Splitwise access",
      [
        markdown(
          "1. Open [this Splitwise approval page](" +
            url +
            ") and choose Allow.\n\n2. Copy the code the page shows.\n\nOr paste the whole address from the browser bar. The address is also here to copy:\n\n`" +
            url +
            "`",
        ),
        textEntry(
          "Verifier",
          "sw-verifier",
          "",
          "Paste the code, or the full callback URL",
        ),
      ],
      "One-time check that this app may talk to Splitwise.",
    ),
    nav: { back: true, next: { label: "Next", run: connectNext } },
  };
}

// Confirmation step for a finished handshake.
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
      "The access token is saved owner only on this machine.",
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
                ...CURRENCIES,
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
              textEntry("Consumer Key", "sw-key", "", "Paste the Consumer Key"),
              textEntry(
                "Consumer Secret",
                "sw-secret",
                "",
                "Paste the Consumer Secret",
              ),
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
        { id: "connect", label: "Save keys and connect", run: settingsConnect },
        { id: "reset", label: "Factory reset", run: settingsReset },
      ],
    },
  };
}

export function settingsSteps(): Array<Step | StepFn> {
  return [
    settingsStep,
    connectStep,
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
