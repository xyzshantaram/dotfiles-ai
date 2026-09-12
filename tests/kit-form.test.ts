// Tests for the SplitKit amount form helper. Run with deno test.
// Each case checks one validation rule from the T3 ticket.

import { amountForm } from "../src/kit/form.ts";

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("an equal split validates true", () => {
  // Two people at 50 each match the total of 100.
  const { form } = amountForm(["ana", "bo"], 100, 50);
  const result = form.inspect();
  assert(result.valid === true, "equal split is valid");
});

Deno.test("a wrong sum validates false with the total message", () => {
  // Lower one share so the sum misses the total.
  const { form, inputs } = amountForm(["ana", "bo"], 100, 50);
  inputs["ana"]!.value = "30";
  // Recheck the whole form so the schema validate runs.
  form.validate();
  const result = form.inspect();
  assert(result.valid === false, "wrong sum is invalid");
  assert(
    Object.values(result.errors ?? {}).flat().includes("amounts must add to 100"),
    "error carries the total message",
  );
});

Deno.test("a negative input fails its field validator", () => {
  // Push one share below zero.
  const { form, inputs } = amountForm(["ana", "bo"], 100, 50);
  inputs["bo"]!.value = "-5";
  const result = form.inspect();
  assert(result.valid === false, "negative input is invalid");
  assert(
    (result.errors?.["bo"] ?? []).includes("bo needs a number 0 or above"),
    "field error names the person",
  );
});
