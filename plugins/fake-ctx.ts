// One fake host ctx for the bash-guard contract tests. Four copies of this
// lived in the four guard test files, each comment claiming to match a
// different sibling; they were byte-identical. Callers cast at the use
// site, as before.
export function fakeCtx() {
  const noop = () => {};
  return {
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    on() {
      return () => {};
    },
    get() {
      return undefined;
    },
  };
}
