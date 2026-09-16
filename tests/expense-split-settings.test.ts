// Submit-level checks for the settings step. Ticket B1: the
// "Type a different code" choice reads the custom field, uppercases it,
// and accepts real ISO 4217 codes only.

import { onSubmit } from "../wizards/expense-split.ts";
import { settingsSteps } from "../wizards/expense-split/settings.ts";
import { loadSettings, saveSettings } from "../src/settings.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("custom currency code saves in uppercase", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "b1-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const out = await onSubmit(
    { currency: ["__custom__"], "custom-currency": ["eur"] },
    "settings",
  );
  assert(!out || !out.errors, "no error for a valid code");
  const settings = await loadSettings();
  assert(settings.currency === "EUR", "saved code is EUR, got " + settings.currency);
});

Deno.test("custom currency rejects a bad code", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "b1-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const out = await onSubmit(
    { currency: ["__custom__"], "custom-currency": ["e1"] },
    "settings",
  );
  assert(
    !!out?.errors && out.errors.length === 1,
    "one error for a bad code",
  );
  assert(
    (out?.errors ?? [])[0] === "Type three letters, for example EUR.",
    "error names the rule",
  );
});

Deno.test("custom currency rejects a code outside ISO 4217", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "b1-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const out = await onSubmit(
    { currency: ["__custom__"], "custom-currency": ["zzz"] },
    "settings",
  );
  assert(
    !!out?.errors && out.errors.length === 1,
    "one error for a non-ISO code",
  );
});

Deno.test("fixed currency pick still saves", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "b1-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const out = await onSubmit({ currency: ["USD"] }, "settings");
  assert(!out || !out.errors, "no error for a fixed pick");
  const settings = await loadSettings();
  assert(settings.currency === "USD", "saved code is USD");
});

Deno.test("settings step renders all four tab labels", () => {
  const entry = settingsSteps().find((item) =>
    typeof item === "function" ? item(new Map()).id === "settings" : item.id === "settings"
  );
  const found = typeof entry === "function" ? entry(new Map()) : entry;
  if (found === undefined) {
    throw new Error("assert failed: settings step exists");
  }
  const tabs = found.nodes.find((node) => node.kind === "tabs");
  if (tabs === undefined || tabs.kind !== "tabs") {
    throw new Error("assert failed: settings holds a tabs node");
  }
  const labels = tabs.tabs.map((tab) => tab.label);
  for (const label of ["Currency", "Splitwise", "AI assistant", "Reset"]) {
    assert(labels.includes(label), "tab label renders: " + label);
  }
});

Deno.test("currency field inside a tab still posts its answer", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "b1-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const out = await onSubmit({ currency: ["GBP"] }, "settings");
  assert(!out || !out.errors, "no error for a tabbed pick");
  const settings = await loadSettings();
  assert(settings.currency === "GBP", "saved code is GBP");
});

Deno.test("reset action refuses a wrong confirm word", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "b1-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const out = await onSubmit(
    { currency: ["USD"], "reset-confirm": ["please"] },
    "settings",
    "reset",
  );
  assert(
    !!out?.errors && out.errors.length === 1,
    "one error for a wrong confirm word",
  );
  assert(
    (out?.errors ?? [])[0] === "Type RESET in the box to confirm the reset.",
    "error names the confirm rule",
  );
});

Deno.test("ai usage answer opens settings on the ai tab", () => {
  const entry = settingsSteps().find((item) =>
    typeof item === "function" ? item(new Map()).id === "settings" : item.id === "settings"
  );
  if (entry === undefined || typeof entry !== "function") {
    throw new Error("assert failed: settings step is a function");
  }
  const ai = entry(new Map([["usage", ["With an AI helper"]]]));
  assert(ai.id === "settings", "settings keeps its id");
  assert(ai.title === "Settings", "settings keeps its title");
  const aiTabs = ai.nodes.find((node) => node.kind === "tabs");
  if (aiTabs === undefined || aiTabs.kind !== "tabs") {
    throw new Error("assert failed: settings holds a tabs node");
  }
  assert(aiTabs.selected === 2, "ai usage picks the ai tab");
  const plain = entry(new Map([["usage", ["By myself, push manually"]]]));
  const plainTabs = plain.nodes.find((node) => node.kind === "tabs");
  if (plainTabs === undefined || plainTabs.kind !== "tabs") {
    throw new Error("assert failed: plain settings holds a tabs node");
  }
  assert(plainTabs.selected === 0, "other usage picks the first tab");
});

Deno.test("saved ai usage opens settings on the ai tab", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "b1-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  await saveSettings({ currency: "INR", usage: "ai" });
  const entry = settingsSteps().find((item) =>
    typeof item === "function" ? item(new Map()).id === "settings" : item.id === "settings"
  );
  if (entry === undefined || typeof entry !== "function") {
    throw new Error("assert failed: settings step is a function");
  }
  const found = entry(new Map());
  const tabs = found.nodes.find((node) => node.kind === "tabs");
  if (tabs === undefined || tabs.kind !== "tabs") {
    throw new Error("assert failed: settings holds a tabs node");
  }
  assert(tabs.selected === 2, "saved ai usage picks the ai tab");
});

Deno.test("saved manual usage opens settings on the first tab", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "b1-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  await saveSettings({ currency: "INR", usage: "manual" });
  const entry = settingsSteps().find((item) =>
    typeof item === "function" ? item(new Map()).id === "settings" : item.id === "settings"
  );
  if (entry === undefined || typeof entry !== "function") {
    throw new Error("assert failed: settings step is a function");
  }
  const found = entry(new Map());
  const tabs = found.nodes.find((node) => node.kind === "tabs");
  if (tabs === undefined || tabs.kind !== "tabs") {
    throw new Error("assert failed: settings holds a tabs node");
  }
  assert(tabs.selected === 0, "saved manual usage picks the first tab");
});

Deno.test("the answers map and the onboarding flag stay apart for A and B", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "iso-hub-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const sidA = "iso-hub-A";
  const sidB = "iso-hub-B";
  // The manual screen used to be skipped by a routing jump checked
  // here. The step states that condition itself now, so this test keeps
  // only the onboarding half. The gather suite covers both the manual
  // run isolation and the step condition.
  // Onboarding stays apart: A walks start-usage, then its settings
  // post returns to the menu. B never started, so its settings post
  // saves and stays.
  const usageA = await onSubmit(
    { usage: ["By myself, push manually"] },
    "start-usage",
    "",
    { sessionId: sidA },
  );
  assert(usageA?.goto === "settings", "A enters onboarding");
  const doneA = await onSubmit(
    { currency: ["USD"] },
    "settings",
    "",
    { sessionId: sidA },
  );
  assert(doneA?.goto === "menu", "A leaves onboarding to the menu");
  const doneB = await onSubmit(
    { currency: ["USD"] },
    "settings",
    "",
    { sessionId: sidB },
  );
  assert(doneB === undefined || doneB.goto === undefined, "B never entered onboarding");
});
