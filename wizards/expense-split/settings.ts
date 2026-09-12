// Settings stage for the expense-split wizard.

import {
  buttons,
  copyable,
  markdown,
  radio,
  type Step,
  step,
  type StepFn,
  tabs,
  textEntry,
} from "../../wizardkit/mod.ts";
import { currentAuthorizeUrl, currentSignedInAs } from "./connect.ts";
import { aiSetupMessage } from "../../src/ai-setup.ts";
import { loadSettingsSync, USAGE_MODES } from "../../src/settings.ts";

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

// Handshake step. The key step starts the OAuth handshake, then this
// step shows the approve link (clickable, plus copyable text) and takes
// the verifier. A bare code or the full callback URL both work.
function connectStep(_: Map<string, string[]>): Step {
  const url = currentAuthorizeUrl();
  const nodes: Step["nodes"] = [];
  if (url === null) {
    nodes.push(
      markdown(
        "The approval link is not ready. Press Back, then press Next on the Splitwise key step again.",
      ),
    );
  } else {
    nodes.push(
      markdown(
        "1. Open [this Splitwise approval page](" +
          url +
          ") and choose Allow.\n\n2. Copy the code the page shows.\n\nOr paste the whole address from the browser bar. The address is also here to copy:\n\n`" +
          url +
          "`",
      ),
    );
    nodes.push(
      textEntry(
        "Verifier",
        "sw-verifier",
        "",
        "Paste the code, or the full callback URL",
      ),
    );
  }
  nodes.push(
    buttons(
      [
        { label: "Back", action: "back" },
        { label: "Next", action: "next", primary: true },
      ],
      undefined,
      "split",
    ),
  );
  return step(
    "settings-connect",
    "Approve Splitwise access",
    nodes,
    "One-time check that this app may talk to Splitwise.",
  );
}

// Confirmation step for a finished handshake.
function connectDoneStep(_: Map<string, string[]>): Step {
  const name = currentSignedInAs();
  const line = name !== null && name !== ""
    ? "Signed in as " + name + "."
    : "Signed in to Splitwise.";
  return step(
    "settings-connect-done",
    "Splitwise connected",
    [
      markdown(line),
      buttons(
        [
          { label: "Back", action: "back" },
          { label: "Back to menu", action: "goto:menu", primary: true },
        ],
        undefined,
        "split",
      ),
    ],
    "The access token is saved owner only on this machine.",
  );
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
  return step(
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
            buttons([
              { label: "Save keys and connect", action: "connect", primary: true },
            ]),
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
            buttons([
              { label: "Factory reset", action: "reset", primary: true },
            ]),
          ],
        },
      ], selected),
      buttons(
        [
          { label: "Back", action: "back" },
          { label: "Save and return", action: "goto:menu", primary: true },
        ],
        undefined,
        "split",
      ),
    ],
    "Currency, Splitwise access, AI assistant, and reset.",
  );
}

export function settingsSteps(): Array<Step | StepFn> {
  return [
    settingsStep,
    connectStep,
    connectDoneStep,
    step(
      "settings-reset-done",
      "Reset done",
      [
        markdown(
          "Factory reset cleared the Splitwise access token file, the pushed expense fingerprint file, the config directory, share/runs, share/profiles, share/zomato-tokens.json, and share/zomato-login-state.json.",
        ),
        buttons(
          [
            { label: "Back to menu", action: "goto:menu", primary: true },
          ],
          undefined,
          "split",
        ),
      ],
      "The app is back to its first-run state.",
    ),
  ];
}
