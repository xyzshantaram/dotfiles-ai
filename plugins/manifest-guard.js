// plugins/manifest-guard.ts
import { basename } from "node:path";
import z from "@deepseek-ai/schemastery";
import { FsError } from "@deepseek-ai/dsh-fs";
var name = "manifest-guard";
var inject = [];
var Config = z.object({});
var MANIFEST_NAMES = /* @__PURE__ */ new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "cargo.toml",
  "cargo.lock",
  "pyproject.toml",
  "poetry.lock",
  "pipfile",
  "pipfile.lock",
  "go.mod",
  "go.sum",
  "gemfile",
  "gemfile.lock",
  "bun.lockb"
]);
var DENY_MESSAGE = (name2) => `Direct edits to ${name2} are denied. Use the package tool for dependency changes. Ask the user to run the change when the tool cannot.`;
function isManifestPath(displayPath) {
  const name2 = basename(displayPath);
  return MANIFEST_NAMES.has(name2.toLowerCase());
}
function apply(ctx, config) {
  void config;
  const denyIfManifest = (target) => {
    if (!isManifestPath(target.displayPath)) return;
    throw new FsError(DENY_MESSAGE(basename(target.displayPath)), "FS_PERMISSION_DENIED");
  };
  ctx.on(
    "fs/write-intent",
    async (target, _actor, next) => {
      denyIfManifest(target);
      return next();
    },
    { prepend: true }
  );
  ctx.on(
    "fs/edit-intent",
    async (target, _actor, next) => {
      denyIfManifest(target);
      return next();
    },
    { prepend: true }
  );
}
export {
  Config,
  apply,
  inject,
  name
};
