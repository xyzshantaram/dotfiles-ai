import { dot, lineEnd, lineStart } from "@app/src/term.ts";

// Collect encoded stdout text while the callback runs.
function captureWrites(run: () => void): string {
  const parts: string[] = [];
  const original = Deno.stdout.writeSync;
  Deno.stdout.writeSync = ((data: Uint8Array): number => {
    parts.push(new TextDecoder().decode(data));
    return data.length;
  }) as typeof Deno.stdout.writeSync;
  try {
    run();
  } finally {
    Deno.stdout.writeSync = original;
  }
  return parts.join("");
}

// One progress line stays on one line and ends with a result word.
Deno.test("lineStart plus dot plus lineEnd builds one line", () => {
  const text = captureWrites(() => {
    lineStart("Order 1");
    dot();
    dot();
    lineEnd();
  });
  if (text !== "  Order 1.. Done.\n") {
    throw new Error("unexpected progress line: " + JSON.stringify(text));
  }
});

// A closed line writes nothing on lineEnd.
Deno.test("lineEnd on a closed line writes nothing", () => {
  const text = captureWrites(() => {
    lineEnd();
  });
  if (text !== "") {
    throw new Error("expected no output, got: " + JSON.stringify(text));
  }
});
