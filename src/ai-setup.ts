// The copyable prompt that sets up the AI path permanently.
// Shared by the Settings menu, the main menu, and the browser wizard.

/** The message the user hands to an AI assistant, one line per row. */
export const AI_SETUP_LINES = [
  "Install the split utils skill from the dotfiles-ai repo path skills/split-utils.",
  "Read docs/schema.md for the output format.",
  "Gather orders from the main menu.",
  "Write the split result as output.json.",
  "Check the file with scripts/validate.ts before you push.",
];

/** The same message as one block, ready to select and copy. */
export function aiSetupMessage(): string {
  return AI_SETUP_LINES.join("\n");
}

export function printAiSetup(say: (line: string) => void): void {
  say("Copy the lines between the --- marks into your AI tool, then follow what it says.");
  say("---");
  for (const line of AI_SETUP_LINES) say(line);
  say("---");
}
