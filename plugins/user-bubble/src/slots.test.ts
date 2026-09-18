/**
 * Slot registration pin for the user-bubble takeover (#176).
 *
 * WHY THIS TEST DRAINS LAZILY: `apply` does not register directly. It hands
 * one generator per key to `ctx.slots.inject`, and the slot system runs those
 * generators LATER, after `apply` returns. The defect was `for (var key of
 * CHAT_NODE_KEYS)`: `var` is function scoped, so every generator closed over
 * ONE binding, and by drain time that binding held the LAST key. Both
 * generators therefore registered `steering`, the second one threw as a
 * duplicate, and `user` was never registered at all. A test that runs the
 * generators EAGERLY inside a fake `inject` sees each key before the loop
 * moves on, so it passes against the broken code and proves nothing. This
 * test collects the generators and drains them AFTER `apply` returns, which
 * is what the slot system does, then asserts each key lands exactly once.
 */
import { describe, expect, it, vi } from "vitest";

// The client bundle reaches these through the shell loader at runtime, so
// they are ambient shims here, not installed packages. Mock them before the
// import below: the test never renders, it only runs `apply`.
vi.mock("react", () => ({
  createElement: () => null,
  Fragment: "fragment",
  memo: (component: unknown) => component,
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useState: (initial: unknown) => [initial, () => {}],
}));

vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  IconCheckOutline16: () => null,
  IconCopyOutline16: () => null,
  JsonBlock: () => null,
  MarkdownText: () => null,
  Tooltip: () => null,
  writeClipboard: () => Promise.resolve(false),
}));

// The stylesheet injects as raw text at build time. It plays no part in
// which keys get registered, so it stays empty here.
vi.mock("./client.module.css", () => ({ default: "" }));

import { apply } from "./client";

/** One recorded `slots.register` call. */
interface Registration {
  name: string;
  key: string;
  priority: number;
}

/** A fake slot host that records instead of rendering. */
function makeSlots() {
  const registrations: Registration[] = [];
  const pending: Array<() => Generator<unknown>> = [];
  const slots = {
    inject: (name: string, generator: () => Generator<unknown>) => {
      void name;
      pending.push(generator);
    },
    register: (entry: Registration, _view: unknown) => {
      registrations.push(entry);
      return entry.key;
    },
  };
  return { registrations, pending, slots };
}

describe("user-bubble slot registration: both keys land exactly once (#176)", () => {
  it("registers user AND steering, each exactly once, drained after apply returns", () => {
    const { registrations, pending, slots } = makeSlots();
    apply({ slots });
    // The slot system reconciles after apply returns. Drain here, not inside
    // the fake inject: draining eagerly would pass against the broken code.
    expect(pending.length).toBe(2);
    for (const generator of pending) {
      for (const _ of generator()) {
        // Exhaust each generator so every register call happens.
      }
    }
    expect(registrations.length).toBe(2);
    const keys = registrations.map((r) => r.key).sort();
    expect(keys).toEqual(["steering", "user"]);
  });

  it("registers both keys on the chat node slot at shadow priority", () => {
    const { registrations, pending, slots } = makeSlots();
    apply({ slots });
    for (const generator of pending) {
      for (const _ of generator()) {
        // Exhaust each generator so every register call happens.
      }
    }
    for (const r of registrations) {
      expect(r.name).toBe("conversation.chat.node");
      expect(r.priority).toBe(-100);
    }
  });
});
