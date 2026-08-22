/**
 * Join the text blocks of a child result into one string.
 *
 * Shared by plugins/see.ts and plugins/profiles.ts. One source implementation
 * in one file so the two bundles cannot drift.
 */

import type { ContentBlock } from "@deepseek-ai/dsh-llm";

/** Join the text blocks of a child result into one string. */
export function outputText(output: ContentBlock[]): string {
  return output
    .filter(
      (value): value is { type: "text"; text: string } =>
        typeof value === "object" &&
        value !== null &&
        (value as { type?: unknown }).type === "text" &&
        typeof (value as { text?: unknown }).text === "string",
    )
    .map((value) => value.text)
    .join("");
}
