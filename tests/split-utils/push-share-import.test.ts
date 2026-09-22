// Tests for the share-link push screen. A fetch stub stands in for
// the paste hosts, so no network call happens. A temp dir holds the
// state root with its share imports.
import { codeToKey, encryptForShare, fetchShareLink } from "@app/src/share.ts";
import {
  prepareShareImport,
  prepareSource,
  pushSessionFor,
  resetPush,
} from "@app/app/expense-split/push-engine.ts";
import { stateRoot } from "@app/src/runstate.ts";
import { assert } from "@std/assert";

// One finished output doc with a rare marker in the item name.
function docText(): string {
  return JSON.stringify({
    split_at: "2026-01-06T09:00:00Z",
    people: ["Ann", "Bob"],
    splits: [{
      item: "Milk-x7q9",
      platform: "zepto",
      order_id: "o1",
      date: "2026-01-01T10:00:00",
      price: 100,
      split_type: "custom",
      assignments: { Ann: 60, Bob: 40 },
    }],
    totals: { Ann: 60, Bob: 40 },
    settlements: [{ from: "Bob", to: "Ann", amount: 40 }],
  });
}

const CODE = "ab2x9k";
const BLOB_URL = "https://paste.rs/u4stub1";
const PAGE_URL = "https://paste.rs/u4stub2";
const BLOB_LINK = BLOB_URL + "#" + CODE;
const PAGE_LINK = PAGE_URL + "#" + CODE;

const root = await Deno.makeTempDir({ prefix: "push-share-test-" });
Deno.env.set("SPLIT_UTILS_STATE", root + "/state");

const key = await codeToKey(CODE);
const blob = await encryptForShare(docText(), key);

// Stand in for the paste hosts: the blob URL serves the blob, the page
// URL serves a rendered page first and the blob at its .txt form.
globalThis.fetch = ((input: string | URL | Request) => {
  const url = String(input);
  if (url === BLOB_URL) return Promise.resolve(new Response(blob));
  if (url === PAGE_URL) return Promise.resolve(new Response("<html>rendered page</html>"));
  if (url === PAGE_URL + ".txt") return Promise.resolve(new Response(blob));
  return Promise.resolve(new Response("missing", { status: 404 }));
}) as typeof fetch;

Deno.test("share link round-trips through the fetch stub", async () => {
  const text = await fetchShareLink(BLOB_LINK);
  assert(text === docText(), "decrypted text matches the input");
});

Deno.test("share link retries the .txt form for rendered pages", async () => {
  const text = await fetchShareLink(PAGE_LINK);
  assert(text === docText(), "decrypted text matches after the retry");
});

Deno.test("share import saves under share/imports and stages the push", async () => {
  const sid = "t-share-1";
  resetPush(sid);
  const res = await prepareShareImport(sid, BLOB_LINK);
  assert(res.ok, "import loads");
  const prefix = stateRoot() + "/share/imports/";
  const live = pushSessionFor(sid);
  assert(live.file.startsWith(prefix), "file sits under share/imports");
  const base = live.file.slice(prefix.length);
  assert(/^\d+-import\.json$/.test(base), "file name holds unix time: " + base);
  const saved = await Deno.readTextFile(live.file);
  assert(saved === docText(), "saved import matches the plaintext");
  assert(live.runId === null, "imports carry no run id");
  assert(JSON.stringify(live.people) === '["Ann","Bob"]', "people staged");
  assert(live.groups.length === 1, "one order staged");
  assert(
    live.shareNote === "Link opened. Starting the push flow.",
    "share note set",
  );
});

Deno.test("share import copy on empty and bad links", async () => {
  const sid = "t-share-2";
  resetPush(sid);
  const empty = await prepareShareImport(sid, "   ");
  assert(
    !empty.ok && empty.error === "Nothing pasted. Try again when ready.",
    "empty link copy",
  );
  const bad = await prepareShareImport(sid, "https://paste.rs/u4missing#" + CODE);
  if (bad.ok) throw new Error("assert failed: bad link must fail");
  assert(bad.error === "That link did not open. Check it and try again.", "bad link copy");
  assert(!bad.error.includes("u4missing"), "error hides the link");
});

Deno.test("plain source clears the share note", async () => {
  const sid = "t-share-3";
  resetPush(sid);
  const imported = await prepareShareImport(sid, BLOB_LINK);
  assert(imported.ok, "import loads");
  assert(pushSessionFor(sid).shareNote !== null, "share note set after import");
  const src = await prepareSource(sid, "Split JSON file", "", pushSessionFor(sid).file);
  assert(src.ok, "plain source loads");
  assert(pushSessionFor(sid).shareNote === null, "share note cleared");
});
