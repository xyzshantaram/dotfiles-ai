// plugins/grant.ts
import { realpathSync } from "node:fs";
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path";
var name = "grant";
var inject = ["fs"];
function stripQuotes(raw) {
  if (raw.length >= 2) {
    const first = raw[0];
    if ((first === '"' || first === "'") && raw[raw.length - 1] === first) {
      return raw.slice(1, -1);
    }
  }
  return raw;
}
function canonicalPath(path) {
  try {
    return realpathSync.native(path);
  } catch {
    let dir = dirname(path);
    let rest = [path.slice(dir.length)];
    while (true) {
      try {
        const canonDir = realpathSync.native(dir);
        return canonDir + rest.join("");
      } catch {
        const parent = dirname(dir);
        if (parent === dir) return resolve(path);
        rest.unshift(dir.slice(parent.length));
        dir = parent;
      }
    }
  }
}
function isUnder(root, target) {
  if (root.length <= 1) return false;
  if (target === root) return true;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return target.startsWith(prefix);
}
function targetUnderGrant(target, roots) {
  const canonical = canonicalPath(target.displayPath);
  for (const root of roots) {
    if (isUnder(root, canonical)) return true;
  }
  return false;
}
function findSeam(fs) {
  let proto = Object.getPrototypeOf(fs);
  while (proto !== null) {
    if (typeof proto.checkedTarget === "function" && typeof proto.writeText === "function" && typeof proto.editText === "function") {
      return {
        proto,
        originalWrite: proto.writeText,
        originalEdit: proto.editText
      };
    }
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}
async function mutation(grants, ctx, original, self, target, payload, expected, signal, policy) {
  const sessionId = policy?.sessionId;
  if (sessionId !== void 0) {
    const sessions = ctx.get("sessions");
    const session = sessions?.get(sessionId);
    const entry = session === void 0 ? void 0 : grants.get(session);
    if (entry !== void 0 && entry.sessionId === sessionId && targetUnderGrant(target, entry.roots)) {
      const fresh = await self.resolve(target.displayPath);
      return original.call(self, fresh, payload, expected, signal, {
        mode: "danger-full-access"
      });
    }
  }
  return original.call(self, target, payload, expected, signal, policy);
}
function apply(ctx) {
  const fs = ctx.fs;
  if (fs === void 0) return;
  const seam = findSeam(fs);
  const grants = /* @__PURE__ */ new WeakMap();
  if (seam !== null) {
    const { proto, originalWrite, originalEdit } = seam;
    const wrappedWrite = function(target, content, expected, signal, policy) {
      return mutation(grants, ctx, originalWrite, this, target, content, expected, signal, policy);
    };
    const wrappedEdit = function(target, edit, expected, signal, policy) {
      return mutation(grants, ctx, originalEdit, this, target, edit, expected, signal, policy);
    };
    proto.writeText = wrappedWrite;
    proto.editText = wrappedEdit;
    ctx.effect(() => () => {
      if (proto.writeText === wrappedWrite) proto.writeText = originalWrite;
      if (proto.editText === wrappedEdit) proto.editText = originalEdit;
    });
  }
  const commands = ctx.get("commands");
  if (commands === void 0) {
    ctx.logger.warn("grant: commands service not mounted; /grant is not registered");
    return;
  }
  commands.register({
    name: "grant",
    description: "grant this session write access to one absolute path for the rest of the session",
    input: { hint: "<absolute path>" },
    handler: (invocation) => {
      const session = invocation.agent?.session;
      if (session === void 0) {
        return { kind: "error", text: "/grant requires a session." };
      }
      const raw = stripQuotes(invocation.rawInput.trim());
      if (raw.length === 0) {
        return { kind: "error", text: "usage: /grant <absolute path>" };
      }
      if (!isAbsolute(raw)) {
        return { kind: "error", text: `path must be absolute: ${raw}` };
      }
      if (seam === null) {
        return {
          kind: "error",
          text: "the sandboxed filesystem seam is not present in this composition; /grant cannot work."
        };
      }
      const root = canonicalPath(normalize(raw));
      if (root === "/" || root.length <= 1) {
        ctx.logger.warn(`refused to grant filesystem root (/) to session ${session.id}`);
        return {
          kind: "error",
          text: "grant: refusing to grant filesystem root (/); choose a narrower path"
        };
      }
      const entry = grants.get(session) ?? {
        sessionId: session.id,
        roots: []
      };
      if (!entry.roots.includes(root)) entry.roots.push(root);
      grants.set(session, entry);
      ctx.logger.info(`granted write access under ${root} for session ${session.id}`);
      return {
        kind: "success",
        text: `granted write access under ${root} for session ${session.id}.`
      };
    }
  });
}
export {
  apply,
  inject,
  name
};
