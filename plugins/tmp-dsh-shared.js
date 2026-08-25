// plugins/tmp-dsh-shared.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
var name = "tmp-dsh-shared";
var inject = ["sandbox"];
function bindDurableTmp(confined, hostTmpDsh, hostAidosScratch) {
  const argv = confined.argv;
  const idx = argv.findIndex((arg, i) => arg === "--tmpfs" && argv[i + 1] === "/tmp");
  if (idx < 0) return confined;
  try {
    mkdirSync(hostTmpDsh, { recursive: true });
  } catch {
    return confined;
  }
  const binds = ["--bind", hostTmpDsh, "/tmp/dsh"];
  if (hostAidosScratch) {
    try {
      mkdirSync(hostAidosScratch, { recursive: true });
      binds.push("--bind", hostAidosScratch, hostAidosScratch);
    } catch {
    }
  }
  const next = [...argv.slice(0, idx + 2), ...binds, ...argv.slice(idx + 2)];
  return { ...confined, argv: next };
}
function markApplied(hostTmpDsh) {
  try {
    mkdirSync(hostTmpDsh, { recursive: true });
    writeFileSync(join(hostTmpDsh, ".applied"), `${process.pid} ${Date.now()}`);
  } catch {
  }
}
function apply(ctx) {
  const sandbox = ctx.sandbox;
  const hostTmpDsh = join(tmpdir(), "dsh");
  const hostAidosScratch = dshHomePath("aidos", "scratch");
  markApplied(hostAidosScratch);
  markApplied(hostTmpDsh);
  const original = sandbox.confine.bind(sandbox);
  sandbox.confine = (argv, policy) => {
    const confined = original(argv, policy);
    return bindDurableTmp(confined, hostTmpDsh, hostAidosScratch);
  };
  let proto = null;
  try {
    proto = Object.getPrototypeOf(sandbox);
  } catch {
    proto = null;
  }
  let protoOriginal = null;
  if (proto !== null && typeof proto.confine === "function") {
    protoOriginal = proto.confine;
    proto.confine = function(...args) {
      return bindDurableTmp(
        protoOriginal.apply(this, args),
        hostTmpDsh,
        hostAidosScratch
      );
    };
  }
  ctx.effect(() => () => {
    if (sandbox.confine !== void 0) {
      sandbox.confine = original;
    }
    if (proto !== null && protoOriginal !== null && proto.confine !== void 0) {
      proto.confine = protoOriginal;
    }
  });
}
export {
  apply,
  bindDurableTmp,
  inject,
  name
};
