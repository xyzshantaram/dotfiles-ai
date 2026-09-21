// Remainder agreement: the Deno engine and the browser board must put the
// leftover paisa on the SAME person. Regression test for ticket #337 — the
// board computes with shareEqual/sharePercent, checkpoints the amounts to
// the server unchecked, and the export copies them verbatim into
// output.json, so any divergence here ships real money to the wrong person.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  equalAmounts,
  type ItemAssignment,
  repeatAmounts,
} from "@app/src/splitstate.ts";
import { handleBoardRoute } from "@app/app/expense-split/board-routes.ts";
import {
  shareEqual,
  sharePercent,
} from "@app/app/expense-split/split-board.js";

// Ten rupees across three people leaves a one-paisa remainder. Both sides
// must agree person by person, not just on the total.
Deno.test("equal split: engine and board agree person by person", () => {
  const people = ["Ann", "Ben", "Cara"];
  assertEquals(equalAmounts(10, people), shareEqual(10, people));
});

// The remainder lands on the first person. Stated here, enforced here.
Deno.test("equal split: remainder lands on the first person", () => {
  assertEquals(equalAmounts(10, ["Ann", "Ben", "Cara"]), {
    Ann: 3.34,
    Ben: 3.33,
    Cara: 3.33,
  });
});

// The percent path splits too. Ten rupees at 33.33/33.33/33.34 rounds every
// share down to 3.33, so the one-paisa remainder must land on Ann.
Deno.test("percent split: remainder lands on the first person", () => {
  assertEquals(sharePercent(10, { Ann: 33.33, Ben: 33.33, Cara: 33.34 }), {
    Ann: 3.34,
    Ben: 3.33,
    Cara: 3.33,
  });
});

// The board imports ./split-math.js, so the server must serve it as
// JavaScript next to the component. Otherwise the import 404s in the
// browser and the board never boots.
Deno.test("board math module serves as JavaScript", async () => {
  const res = await handleBoardRoute(
    new Request("http://localhost/app/split-math.js"),
  );
  assert(res !== null);
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("content-type"),
    "text/javascript; charset=utf-8",
  );
  assertStringIncludes(await res.text(), "shareEqual");
});

// The engine's scaled repeat (the path a saved percent or custom split
// takes onto a new price) must park the gap on the first person too.
// Scaling 100 rupees of 33.33/33.33/33.34 down to 10 rounds every part to
// 3.33, leaving one paisa.
Deno.test("repeat split: scaled remainder lands on the first person", () => {
  const prev: ItemAssignment = {
    splitType: "custom",
    people: ["Ann", "Ben", "Cara"],
    amounts: { Ann: 33.33, Ben: 33.33, Cara: 33.34 },
  };
  assertEquals(repeatAmounts(prev, 10, ["Ann", "Ben", "Cara"]).amounts, {
    Ann: 3.34,
    Ben: 3.33,
    Cara: 3.33,
  });
});
