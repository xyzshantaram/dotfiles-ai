// Tests for the SplitKit select helper. Run with deno test.
// Each case checks one selection rule from the T4 ticket.

import { chosen, createMulti, createSingle, move } from "../src/kit/select.ts";

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("createMulti starts with the given set ticked", () => {
  // Build three people with the first and third ticked.
  const sel = createMulti(3, [0, 2]);
  // Assert the active index and the ticked set match the request.
  assert(sel.state.peek().activeIndex === 0, "active starts at zero");
  assert(JSON.stringify(chosen(sel)) === "[0,2]", "given set is ticked");
});

Deno.test("toggle adds and removes a person", () => {
  // Start with nobody ticked.
  const sel = createMulti(3, []);
  // Toggle the first person on and assert it joins the set.
  sel.toggle(1);
  assert(JSON.stringify(chosen(sel)) === "[1]", "toggle adds the index");
  // Toggle the same person again and assert it leaves the set.
  sel.toggle(1);
  assert(JSON.stringify(chosen(sel)) === "[]", "toggle removes the index");
});

Deno.test("move steps the active index and clamps at both ends", () => {
  // Step down twice from the top.
  const sel = createMulti(3, []);
  move(sel, 1);
  move(sel, 1);
  assert(sel.state.peek().activeIndex === 2, "move steps down");
  // Step down again and assert the index clamps at the last row.
  move(sel, 1);
  assert(sel.state.peek().activeIndex === 2, "move clamps at the end");
  // Step up past the top after resetting, and assert it clamps at zero.
  move(sel, -1);
  move(sel, -1);
  move(sel, -1);
  assert(sel.state.peek().activeIndex === 0, "move clamps at the start");
});

Deno.test("createSingle select replaces the set", () => {
  // Start with the second person ticked.
  const sel = createSingle(3, 1);
  assert(JSON.stringify(chosen(sel)) === "[1]", "single starts on the given index");
  // Select the third person and assert the set holds only that one.
  sel.select(2);
  assert(JSON.stringify(chosen(sel)) === "[2]", "select replaces the set");
  assert(sel.state.peek().activeIndex === 2, "select moves the cursor");
});
