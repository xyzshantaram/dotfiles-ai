// plugins/profiles.ts
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

// plugins/profile-routes.ts
function isRouteCandidate(value) {
  return typeof value === "object" && value !== null && typeof value.provider === "string" && typeof value.model === "string";
}
function normalizeEntry(entry, chains, seen) {
  if (isRouteCandidate(entry)) return [entry];
  if (typeof entry === "string") {
    if (entry.startsWith("chain:")) {
      const name2 = entry.slice("chain:".length);
      if (chains?.[name2] === void 0) return [];
      const guard = new Set(seen ?? []);
      if (guard.has(name2)) return [];
      guard.add(name2);
      return normalizeEntry(chains[name2], chains, guard);
    }
    const slash = entry.indexOf("/");
    if (slash > 0) {
      return [{ provider: entry.slice(0, slash), model: entry.slice(slash + 1) }];
    }
    if (chains?.[entry] !== void 0) {
      const guard = new Set(seen ?? []);
      if (guard.has(entry)) return [];
      guard.add(entry);
      return normalizeEntry(chains[entry], chains, guard);
    }
    return [];
  }
  if (typeof entry === "object" && entry !== null) {
    if (Array.isArray(entry.routes)) {
      return entry.routes.filter(isRouteCandidate);
    }
    if (Array.isArray(entry)) {
      const out = [];
      for (const step of entry) {
        if (typeof step === "string") {
          if (step.startsWith("chain:")) {
            const name2 = step.slice("chain:".length);
            if (chains?.[name2] !== void 0) {
              const guard = new Set(seen ?? []);
              if (!guard.has(name2)) {
                guard.add(name2);
                out.push(...normalizeEntry(chains[name2], chains, guard));
              }
            }
          } else if (step.indexOf("/") > 0) {
            const slash = step.indexOf("/");
            out.push({ provider: step.slice(0, slash), model: step.slice(slash + 1) });
          }
        } else {
          out.push(...normalizeEntry(step, chains, seen));
        }
      }
      return out;
    }
  }
  return [];
}
function chainOf(entry, chainName, chains) {
  if (typeof entry === "object" && entry !== null) {
    const obj = entry;
    if ("orchestrator" in obj || "subagent" in obj) {
      const own = normalizeEntry(
        chainName === "orchestrator" ? obj.orchestrator : obj.subagent,
        chains
      );
      if (own.length > 0) return own;
      const other = normalizeEntry(
        chainName === "orchestrator" ? obj.subagent : obj.orchestrator,
        chains
      );
      if (other.length > 0) return other;
      return [];
    }
  }
  return normalizeEntry(entry, chains);
}

// plugins/shared/output-text.ts
function outputText(output) {
  return output.filter(
    (value) => typeof value === "object" && value !== null && value.type === "text" && typeof value.text === "string"
  ).map((value) => value.text).join("");
}

// plugins/profiles.ts
var name = "profiles";
var inject = ["tools", "subagents", "systemPrompt"];
var RoutePin = z.union([
  z.object({ provider: z.string(), model: z.string() }),
  z.object({ routes: z.array(z.object({ provider: z.string(), model: z.string() })) })
]);
var Config = z.object({
  /** The subagents provider to start children on. The standard preset uses spawn. */
  provider: z.string().default("spawn"),
  /** Same-provider retry cap for retryPolicy.mode="always" adapters. */
  alwaysMaxRetries: z.number().step(1).min(1).default(2),
  /** Per-role head pins. Any role left unset follows the profile namespace. */
  roles: z.object({
    coder: RoutePin.default(void 0),
    tester: RoutePin.default(void 0),
    researcher: RoutePin.default(void 0)
  }).default(void 0)
});
var PROFILE_NS = settingsNamespace("profile");
var ROLE_MAX_DEPTH = 1;
function service(ctx, name2) {
  return ctx.get(name2);
}
function activeEntry(profile) {
  return (profile?.active ?? "work") === "personal" ? profile?.personal : profile?.work;
}
var ERROR_WINDOW_MS = 6e5;
var ERROR_CLASSES = ["no-credits", "model-unavailable", "auth", "bad-request"];
var downCache = /* @__PURE__ */ new Map();
function errorKey(level, cls) {
  return `${level.provider}:${level.model}:${cls}`;
}
function normalizeErrorClass(code, message) {
  const c = String(code ?? "").toLowerCase();
  const m = String(message ?? "").toLowerCase();
  const hit = (...needles) => needles.some((n) => c.includes(n) || m.includes(n));
  if (hit("401", "unauthorized", "authentication", "invalid api key")) return "auth";
  if (hit("400", "bad request", "bad_request", "invalid request")) return "bad-request";
  if (hit("quota", "balance", "insufficient", "credit", "usage limit", "billing", "429", "rate limit"))
    return "no-credits";
  if (hit("model", "not found", "unavailable", "404", "no such model")) return "model-unavailable";
  return void 0;
}
function markDown(level, code, message) {
  const cls = normalizeErrorClass(code, message);
  if (!cls) return;
  downCache.set(errorKey(level, cls), Date.now());
}
function isCachedDown(level) {
  const now = Date.now();
  for (const cls of ERROR_CLASSES) {
    const at = downCache.get(errorKey(level, cls));
    if (at !== void 0 && now - at < ERROR_WINDOW_MS) return true;
  }
  return false;
}
function depthOf(agent) {
  const a = agent;
  const header = a?.session?.header?.delegationDepth ?? 0;
  const options = a?.options?.subagentDepth ?? 0;
  return Math.max(header, options);
}
function chainForDepth(ctx, depth) {
  const settings = service(ctx, "settings");
  const profile = settings?.get(PROFILE_NS);
  return chainOf(activeEntry(profile), depth >= 1 ? "subagent" : "orchestrator", profile?.chains);
}
function effectiveChain(ctx, depth) {
  return chainForDepth(ctx, depth);
}
var ROLES = [
  {
    toolName: "coder",
    description: "Delegate ONE well-scoped implementation unit to a coder subagent. Give a self-contained brief: the files involved, the exact change, the constraints, and any test the orchestrator names. It works in its own context and returns a report, not intermediate steps. Leaf worker: it cannot spawn further subagents."
  },
  {
    toolName: "tester",
    description: "Delegate test, lint, or build verification to a tester subagent. Name the exact commands or scope to run. It runs them and reports pass/fail with failure details. It never fixes code or edits files. Leaf worker: it cannot spawn further subagents."
  },
  {
    toolName: "researcher",
    description: "Delegate investigation or a code review to a researcher subagent. Give the specific question or the diff to review. It reads, searches, and fetches, then reports findings with references. It never edits files or runs mutating commands. Leaf worker: it cannot spawn further subagents."
  }
];
function resolveHead(ctx, pin) {
  const settings = service(ctx, "settings");
  const profile = settings?.get(PROFILE_NS);
  const pinned = normalizeEntry(pin, profile?.chains);
  if (pinned.length > 0) return pinned[0];
  const chain = effectiveChain(ctx, 1);
  return chain.find((level) => !isCachedDown(level));
}
function via(route) {
  return route ? ` via ${route.provider}/${route.model}` : "";
}
function registerRoleTool(ctx, spec, config) {
  ctx.tools.register(
    defineTool({
      name: spec.toolName,
      description: spec.description + " Runs in the background by default and returns a durable subagent id; send_message continues that conversation. Set run_in_background: false to wait for the result.",
      parameters: {
        description: {
          type: "string",
          required: true,
          description: "A short (3-5 word) description of the delegated task, for display."
        },
        prompt: {
          type: "string",
          required: true,
          description: "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs."
        },
        run_in_background: {
          type: "boolean",
          description: "Whether to run in the background and return a durable subagent id immediately. Defaults to true. Set false to wait for the result when your next action depends on it."
        }
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }]
      },
      async execute(args, exec) {
        const parent = exec.agent;
        if (!parent)
          throw new Error(`${spec.toolName} requires a calling agent (exec.agent was undefined)`);
        const head = resolveHead(
          ctx,
          config.roles?.[spec.toolName]
        );
        const provider = config.provider ?? "spawn";
        const request = {
          label: args.description,
          prompt: [{ type: "text", text: args.prompt }],
          parent,
          ...head !== void 0 ? { agentOptions: head } : {},
          maxDepth: ROLE_MAX_DEPTH
        };
        if (args.run_in_background ?? true) {
          const { childId } = await ctx.subagents.startContinuable({
            provider,
            label: args.description,
            request,
            signal: exec.signal
          });
          return `started ${spec.toolName} subagent ${childId}${via(head)}. It runs in the background; send_message continues that conversation, and the runtime sends a notice when the run settles.`;
        }
        const run = await ctx.subagents.start(provider, { ...request, signal: exec.signal });
        try {
          const result = await run.result;
          if (result.stopReason !== "completed") {
            const diagnostic = result.diagnostic ? `: ${result.diagnostic}` : "";
            throw new Error(
              `${spec.toolName}: child ended with stop reason "${result.stopReason}"${diagnostic}`
            );
          }
          return outputText(result.output);
        } finally {
          await run.dispose();
        }
      }
    })
  );
}
function registerFailover(ctx, alwaysMaxRetries) {
  const state = /* @__PURE__ */ new WeakMap();
  const keyOf = (turn, step) => `${String(turn)}:${String(step)}`;
  ctx.on("agent/request", async (payload, next) => {
    const proposal = await next();
    if (!proposal?.provider || !proposal.model) return proposal;
    const p = payload;
    if (!p.agent) return proposal;
    const chain = effectiveChain(ctx, depthOf(p.agent));
    const agentDefaultModel = service(ctx, "agentDefaultModel");
    const selection = agentDefaultModel?.currentSelection?.();
    const levels = selection ? [
      selection,
      ...chain.filter(
        (level2) => !(level2.provider === selection.provider && level2.model === selection.model)
      )
    ] : chain;
    const matched = levels.findIndex(
      (level2) => level2.provider === proposal.provider && level2.model === proposal.model
    );
    if (matched < 0) return proposal;
    const stepKey = keyOf(p.turn, p.step);
    let s = state.get(p.agent);
    if (!s || s.stepKey !== stepKey) {
      s = { stepKey, levels, cursor: matched, retries: 0, failures: [] };
      state.set(p.agent, s);
    }
    const llm = service(ctx, "llm");
    while (s.cursor < s.levels.length) {
      const candidate = s.levels[s.cursor];
      if (isCachedDown(candidate)) {
        s.cursor += 1;
        continue;
      }
      try {
        await llm?.resolveCallConfig(
          { ...proposal, provider: candidate.provider, model: candidate.model },
          p.signal
        );
        break;
      } catch (error) {
        if (p.signal?.aborted) throw error;
        const err = error;
        s.failures.push({
          level: candidate,
          code: err?.code ?? "UNKNOWN",
          message: err?.message ?? String(error)
        });
        markDown(candidate, err?.code, err?.message ?? String(error));
        s.cursor += 1;
      }
    }
    if (!s || s.cursor >= s.levels.length) {
      const tried = s ? s.failures.map((f) => `  - ${f.level.provider}/${f.level.model}: ${f.code} \u2014 ${f.message}`).join("\n") : "(no levels)";
      throw new Error(`profiles: no level can serve the active chain:
${tried}`);
    }
    const level = s.levels[s.cursor];
    return {
      ...proposal,
      provider: level.provider,
      model: level.model,
      ...level.reasoningEffort ? { reasoningEffort: level.reasoningEffort } : {}
    };
  });
  ctx.on("agent/request-error", (payload, next) => {
    const p = payload;
    const s = p.agent ? state.get(p.agent) : void 0;
    if (!s || !p.agent || s.stepKey !== keyOf(p.turn, p.step)) return next();
    const cur = s.levels[s.cursor];
    if (!cur) return next();
    if (p.signal?.aborted) {
      state.delete(p.agent);
      return next();
    }
    const failure = p.failure ?? {};
    const last = s.failures[s.failures.length - 1];
    if (last && last.level.provider === cur.provider && last.level.model === cur.model) {
      last.code = failure.code ?? "UNKNOWN";
      last.message = failure.message ?? "";
    } else {
      s.failures.push({
        level: cur,
        code: failure.code ?? "UNKNOWN",
        message: failure.message ?? ""
      });
    }
    markDown(cur, failure.code, failure.message ?? "");
    if (p.retryPolicy?.mode === "always") {
      s.retries += 1;
      if (s.retries <= alwaysMaxRetries) return next();
    }
    s.retries = 0;
    s.cursor += 1;
    while (s.cursor < s.levels.length && isCachedDown(s.levels[s.cursor])) s.cursor += 1;
    if (s.cursor < s.levels.length) {
      const nxt = s.levels[s.cursor];
      ctx.logger.warn(
        "profiles: %s/%s failed (%s) -> failing over to %s/%s",
        cur.provider,
        cur.model,
        failure.code ?? "UNKNOWN",
        nxt.provider,
        nxt.model
      );
      return { kind: "retry" };
    }
    const tried = s.failures.map((f) => `  - ${f.level.provider}/${f.level.model}: ${f.code} \u2014 ${f.message}`).join("\n");
    state.delete(p.agent);
    throw new Error(`profiles: all levels exhausted for the active chain:
${tried}`);
  });
}
function syncDefaultModel(ctx, profile) {
  const head = chainOf(activeEntry(profile), "orchestrator", profile?.chains)[0];
  if (!head) return;
  const agentDefaultModel = service(ctx, "agentDefaultModel");
  void agentDefaultModel?.saveSelection({
    provider: head.provider,
    model: head.model,
    ...head.reasoningEffort ? { reasoningEffort: head.reasoningEffort } : {}
  }).catch(() => {
  });
}
function canonicalEntry(entry, chains) {
  return {
    orchestrator: { routes: chainOf(entry, "orchestrator", chains) },
    subagent: { routes: chainOf(entry, "subagent", chains) }
  };
}
function canonicalConfig(profile) {
  return {
    active: profile?.active ?? "work",
    chains: profile?.chains,
    work: canonicalEntry(profile?.work, profile?.chains),
    personal: canonicalEntry(profile?.personal, profile?.chains)
  };
}
var MAX_BODY_BYTES = 64 * 1024;
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  const declared = req.headers["content-length"];
  if (declared !== void 0 && Number(declared) > MAX_BODY_BYTES) {
    throw new Error("request body too large");
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("body is not valid JSON");
  }
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateRouteRow(value, path) {
  if (!isPlainObject(value)) return { ok: false, error: `${path} must be an object` };
  for (const key of Object.keys(value)) {
    if (key !== "provider" && key !== "model" && key !== "reasoningEffort") {
      return { ok: false, error: `${path} has unknown key "${key}"` };
    }
  }
  const provider = value.provider;
  const model = value.model;
  if (typeof provider !== "string" || provider.length === 0) {
    return { ok: false, error: `${path}.provider must be a non-empty string` };
  }
  if (typeof model !== "string" || model.length === 0) {
    return { ok: false, error: `${path}.model must be a non-empty string` };
  }
  const rawEffort = value.reasoningEffort;
  let reasoningEffort;
  if (rawEffort !== void 0) {
    if (typeof rawEffort !== "string" || rawEffort.length === 0) {
      return { ok: false, error: `${path}.reasoningEffort must be a non-empty string` };
    }
    reasoningEffort = rawEffort;
  }
  return {
    ok: true,
    value: {
      provider,
      model,
      ...reasoningEffort !== void 0 ? { reasoningEffort } : {}
    }
  };
}
function validateChain(value, path) {
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (key !== "routes") return { ok: false, error: `${path} has unknown key "${key}"` };
    }
    if (!Array.isArray(value.routes))
      return { ok: false, error: `${path}.routes must be an array` };
    for (let i = 0; i < value.routes.length; i++) {
      const row = validateRouteRow(value.routes[i], `${path}.routes[${i}]`);
      if (row.ok === false) return row;
    }
    return { ok: true, value };
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const step = value[i];
      if (typeof step === "string") {
        if (step.length === 0)
          return { ok: false, error: `${path}[${i}] must be a non-empty string` };
      } else if (isPlainObject(step)) {
        const row = validateRouteRow(step, `${path}[${i}]`);
        if (row.ok === false) return row;
      } else {
        return { ok: false, error: `${path}[${i}] must be a string or route pair` };
      }
    }
    return { ok: true, value };
  }
  return { ok: false, error: `${path} must be an object ({routes}) or array (composition)` };
}
function validateEntry(value, path) {
  if (!isPlainObject(value)) return { ok: false, error: `${path} must be an object` };
  for (const key of Object.keys(value)) {
    if (key !== "orchestrator" && key !== "subagent") {
      return { ok: false, error: `${path} has unknown key "${key}"` };
    }
  }
  const orchestrator = validateChain(value.orchestrator, `${path}.orchestrator`);
  if (orchestrator.ok === false) return orchestrator;
  const subagent = validateChain(value.subagent, `${path}.subagent`);
  if (subagent.ok === false) return subagent;
  return { ok: true, value: { orchestrator: orchestrator.value, subagent: subagent.value } };
}
function validateChains(value, path) {
  if (!isPlainObject(value)) return { ok: false, error: `${path} must be an object` };
  const result = {};
  for (const key of Object.keys(value)) {
    const chain = validateChain(value[key], `${path}.${key}`);
    if (chain.ok === false) return chain;
    result[key] = chain.value;
  }
  return { ok: true, value: result };
}
function validateSection(value) {
  if (!isPlainObject(value)) return { ok: false, error: "config must be an object" };
  for (const key of Object.keys(value)) {
    if (key !== "active" && key !== "work" && key !== "personal" && key !== "chains") {
      return { ok: false, error: `unknown key "${key}"` };
    }
  }
  const active = value.active;
  if (typeof active !== "string" || active !== "work" && active !== "personal") {
    return { ok: false, error: 'active must be "work" or "personal"' };
  }
  const work = validateEntry(value.work, "work");
  if (work.ok === false) return work;
  const personal = validateEntry(value.personal, "personal");
  if (personal.ok === false) return personal;
  let chains;
  if (value.chains !== void 0) {
    const validatedChains = validateChains(value.chains, "chains");
    if (validatedChains.ok === false) return validatedChains;
    chains = validatedChains.value;
  }
  return { ok: true, value: { active, work: work.value, personal: personal.value, chains } };
}
function makeConfigHandler(ctx) {
  return async (req, res) => {
    if (req.method === "GET") {
      const settings = service(ctx, "settings");
      const profile = settings?.get(PROFILE_NS);
      sendJson(res, 200, {
        ok: true,
        config: canonicalConfig(profile),
        errorCache: { ttlMs: ERROR_WINDOW_MS, down: [...downCache.keys()] }
      });
      return;
    }
    if (req.method === "PUT") {
      const settings = service(ctx, "settings");
      if (settings === void 0) {
        sendJson(res, 503, { ok: false, error: "settings service unavailable" });
        return;
      }
      let body;
      try {
        body = await readBody(req);
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
        return;
      }
      const validated = validateSection(body);
      if (validated.ok === false) {
        sendJson(res, 400, { ok: false, error: validated.error });
        return;
      }
      try {
        await settings.replace(PROFILE_NS, validated.value);
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
        return;
      }
      const profile = settings.get(PROFILE_NS);
      sendJson(res, 200, {
        ok: true,
        config: canonicalConfig(profile),
        errorCache: { ttlMs: ERROR_WINDOW_MS, down: [...downCache.keys()] }
      });
      return;
    }
    sendJson(res, 405, { ok: false, error: `method ${req.method} not allowed` });
  };
}
function makeSwitchHandler(ctx) {
  return async (req, res) => {
    if (req.method !== "PUT") {
      sendJson(res, 405, { ok: false, error: `method ${req.method} not allowed` });
      return;
    }
    const settings = service(ctx, "settings");
    if (settings === void 0) {
      sendJson(res, 503, { ok: false, error: "settings service unavailable" });
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }
    const rawActive = isPlainObject(body) ? body.active : void 0;
    if (typeof rawActive !== "string" || rawActive !== "work" && rawActive !== "personal") {
      sendJson(res, 400, { ok: false, error: 'active must be "work" or "personal"' });
      return;
    }
    const profile = settings.get(PROFILE_NS);
    const next = { ...profile ?? {}, active: rawActive };
    try {
      await settings.replace(PROFILE_NS, next);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }
    const after = settings.get(PROFILE_NS);
    sendJson(res, 200, {
      ok: true,
      config: canonicalConfig(after),
      errorCache: { ttlMs: ERROR_WINDOW_MS, down: [...downCache.keys()] }
    });
  };
}
function apply(ctx, config) {
  const cfg = config ?? {};
  for (const spec of ROLES) {
    registerRoleTool(ctx, spec, cfg);
  }
  registerFailover(ctx, cfg.alwaysMaxRetries ?? 2);
  ctx.inject(["webServer"], (scope) => {
    const server = scope.webServer;
    server.register({
      kind: "exact",
      path: "/profiles/config",
      handler: makeConfigHandler(ctx)
    });
    server.register({
      kind: "exact",
      path: "/profiles/switch",
      handler: makeSwitchHandler(ctx)
    });
  });
  ctx.on("settings/updated", (ns, next) => {
    if (ns !== PROFILE_NS) return;
    downCache.clear();
    syncDefaultModel(ctx, next);
  });
  ctx.systemPrompt.section({
    name: "tool:profiles",
    order: 116.4,
    text: "Role tools route delegation by job: coder implements one scoped unit, tester runs verification, researcher investigates or reviews. Prefer them over the generic subagent tool for those jobs; each child runs on the profile-routed model with automatic fallback and is a leaf worker. Start independent delegations together in one message."
  });
}
export {
  Config,
  apply,
  inject,
  name
};
