// App settings for split-utils. The file holds the currency label.
// Load defaults when the file misses. Never throw on read.

import { configDir } from "./paths.ts";

// One settings record stored as settings.json in the config dir.
export interface Settings {
  currency: string;
  usage?: "ai" | "auto" | "manual";
}

// True when the value names a known usage mode.
function validUsage(value: unknown): value is "ai" | "auto" | "manual" {
  // Accept the three modes from onboarding only.
  return value === "ai" || value === "auto" || value === "manual";
}

// Map the usage radio answer to the stored usage mode.
export const USAGE_MODES: Record<string, Settings["usage"]> = {
  "With an AI helper": "ai",
  "By myself but push to Splitwise automatically": "auto",
  "By myself, push manually": "manual",
};

// Build the settings.json path under the state root.
export function settingsPath(): string {
  // Append the fixed config file name.
  return configDir() + "/settings.json";
}

// Parse settings text into a Settings value. Return INR defaults on bad JSON.
export function parseSettings(text: string): Settings {
  // Fall back to INR when the text misses.
  const fallback: Settings = { currency: "INR" };
  // Parse the text and return defaults on bad JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fallback;
  }
  // Accept a three letter code and fix its case.
  const record = parsed as Partial<Settings>;
  // Fall back to INR when the code misses.
  let currency = "INR";
  if (typeof record.currency === "string" && record.currency.trim().length > 0) {
    currency = record.currency.trim().toUpperCase();
  }
  // Keep the usage mode when it names a known mode.
  if (validUsage(record.usage)) {
    return { currency, usage: record.usage };
  }
  return { currency };
}

// Load settings from disk. Return INR defaults on any failure.
export async function loadSettings(): Promise<Settings> {
  // Fall back to INR when the file misses.
  const fallback: Settings = { currency: "INR" };
  // Read the file and return defaults when it misses.
  let text: string;
  try {
    text = await Deno.readTextFile(settingsPath());
  } catch {
    return fallback;
  }
  // Parse the text with the shared parser.
  return parseSettings(text);
}

// Load settings from disk with a sync read. Return INR defaults on any failure.
export function loadSettingsSync(): Settings {
  try {
    // Fall back to INR when the file misses.
    const fallback: Settings = { currency: "INR" };
    // Read the file and return defaults when it misses.
    let text: string;
    try {
      text = Deno.readTextFileSync(settingsPath());
    } catch {
      return fallback;
    }
    // Parse the text with the shared parser.
    return parseSettings(text);
  } catch {
    // Never throw from the sync loader.
    return { currency: "INR" };
  }
}

// Save settings to disk with two space indent.
export async function saveSettings(s: Settings): Promise<void> {
  // Make the config dir with parents.
  const path = settingsPath();
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  // Write the file with two space indent.
  await Deno.writeTextFile(path, JSON.stringify(s, null, 2));
}

// Fixed currency codes offered before the custom entry.
export const COMMON_CURRENCIES = [
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

// Accept real ISO 4217 codes after trim and case fix.
const ISO_4217 =
  /^(?:A(?:ED|FN|LL|MD|OA|RS|UD|WG|ZN)|B(?:AM|BD|DT|HD|IF|MD|ND|OB|OV|RL|SD|TN|WP|YN|ZD)|C(?:AD|DF|HE|HF|HW|LF|LP|NY|OP|OU|RC|UP|VE|ZK)|D(?:JF|KK|OP|ZD)|E(?:GP|RN|TB|UR)|F(?:JD|KP)|G(?:BP|EL|HS|IP|MD|NF|TQ|YD)|H(?:KD|NL|TG|UF)|I(?:DR|LS|NR|QD|RR|SK)|J(?:MD|OD|PY)|K(?:ES|GS|HR|MF|PW|RW|WD|YD|ZT)|L(?:AK|BP|KR|RD|SL|YD)|M(?:AD|DL|GA|KD|MK|M[NT]|OP|RU|RV|WK|XN|XV|YR|ZN)|N(?:AD|GN|IO|OK|PR|ZD)|O(?:MR)|P(?:AB|EN|GK|HP|KR|LN|YG)|Q(?:AR)|R(?:ON|SD|UB|WF)|S(?:AR|BD|CR|DG|EK|GD|HP|LE|OS|RD|SP|TN|VC|YP|ZL)|T(?:HB|JS|MT|ND|OP|RY|TD|WD|ZS)|U(?:AH|GX|SD|SN|YI|YU|YW|ZS)|V(?:ED|ES|ND|UV)|W(?:ST)|X(?:AD|AF|AG|AU|BA|BB|BC|BD|CD|CG|DR|OF|PD|PF|PT|SU|TS|UA|XX)|Y(?:ER)|Z(?:AR|MW|WG))$/;
export function validCurrencyCode(value: string): boolean {
  return ISO_4217.test(value.trim().toUpperCase());
}
