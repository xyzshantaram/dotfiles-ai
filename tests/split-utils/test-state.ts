// One fresh state root per test. Points SPLIT_UTILS_STATE at a new temp
// dir, so state from another test never leaks in. gather and settings
// used to repeat the two lines inline, once per test; f6's push tests use
// freshRoot below, which adds the push-session reset.
import { resetPush } from "@app/app/expense-split/push-engine.ts";

export async function freshState(prefix: string): Promise<string> {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  return root;
}

// freshState plus a push-session reset, for the push-flow tests.
export async function freshRoot(prefix: string, sid: string): Promise<string> {
  const root = await freshState(prefix);
  resetPush(sid);
  return root;
}
