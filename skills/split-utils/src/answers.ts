// Shared answer readers for posted wizard answers.
// Record shape comes from the submit hook. Map shape comes from step builders.

export function field(fields: Record<string, string[]>, name: string): string {
  return (fields[name]?.[0] ?? "").trim();
}

export function answer(m: Map<string, string[]>, name: string): string {
  return (m.get(name)?.[0] ?? "").trim();
}

// Every posted value for one field, untrimmed and in post order.
// The name avoids the toolkit node builder, which is called answers.
export function answerList(m: Map<string, string[]>, name: string): string[] {
  return m.get(name) ?? [];
}

// True when the posted answers tick the Dry run box. Every stage
// reads the same field, so one pattern covers all three flows.
export function isDryMap(m: Map<string, string[]>): boolean {
  return (m.get("dry") ?? []).includes("dry");
}
