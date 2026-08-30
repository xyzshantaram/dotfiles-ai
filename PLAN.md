# Plan — sync-models.mjs catalog swap, plus profiles verification

## Vision

Replace the two model-metadata catalogs in `sync-models.mjs` with models.dev.
The current pair is incomplete: the vendored pi-ai catalog knows 47 of the 70
ids we sync and has no entry for GLM 5.3 at all, and LiteLLM does not carry the
gateway-prefixed ids. That gap is why the image gate silently denied
`read_image` on a vision-capable model until someone hit it by hand.

One residual ticket from the finished profiles effort also lives here. T6 is a
verification sweep that has not been run.

## Tickets

### T6 — verification (profiles effort)

**Status:** todo
**Acceptance criteria:**

- `node build.mjs` passes and rebuilds every bundle that embeds
  `profile-routes`: `profiles.js`, `see.js`, `profiles-client/dist/client.js`,
  and `subscriptions/lib/client.js`.
- `pnpm exec tsc --noEmit` reports only the known pre-existing errors.
- `pnpm exec prettier --check .` passes. It fails today on
  `plugins/profiles.ts`, `plugins/profiles-client/src/client.tsx`, and
  `plugins/subscriptions/src/client.tsx`. That drift predates this effort.
- The orchestrator independently verifies at least one concrete behavior claim
  per ticket before closing it.

### S1 — replace both catalogs with models.dev (`sync-models.mjs`)

**Status:** done

**Outcome.** Landed, with two additions found during the work.

- `meridian` is now seeded like the other gateways. It was hand-maintained and
  carried no `reasoningEfforts` at all, so the work profile showed no effort
  picker. It serves its list at `/v1/models`, not `/models`, so the script
  gained a per-provider listing path. Its `api` is `anthropic-messages`, so the
  `api === "openai-completions"` guard was dropped; `SEEDED_PROVIDERS` is the
  allowlist and does that job alone.
- Entry names now come from the models.dev `name` field. Deriving them from the
  id turned `claude-sonnet-4-6` into "Claude Sonnet 4 6".
- `opencode-zen` correctly seeds to zero models, because the models.dev
  `opencode` catalog covers every id the gateway serves. The old pi-ai catalog
  was stale, which is the only reason that block ever held 8 entries. An empty
  `models:` block is NOT harmless: pi-ai rejects a provider that resolves no
  models, so the block is deleted outright when the extras set is empty.

One cohesive swap inside one file, staged internally rather than split. The
steps are many but the design is decided. Each stage below is its own
checkpoint.

**Settled decisions.**

- models.dev becomes the only metadata source. LiteLLM and pi-ai both go.
- Fetch `https://models.dev/api.json` live on every run. Do not commit a
  snapshot.
- Keep `VISION_MODELS` as a manual override of last resort. After the swap only
  three entries still earn their place: `Qwen/Qwen3.7-Max`, where the vendor
  says text but 28 resellers say image, and `Qwen/Qwen3.8-27B` and
  `Qwen/Qwen3.7-Flash`, which only a tier-3 reseller matched. The other five
  were dropped because the first-party vendor now declares image input.
  `tencent/hy3-paid` is text-only and was never in this set.
- Resolve a model id in this order, first hit wins: the models.dev provider
  matching our route, then the first-party vendor provider, then the union
  across every provider. The SAME order applies to vision and to reasoning
  efforts.
- Effort churn is accepted, not avoided. Every one of the 31 models that carry
  efforts today will change, and about 25 more will gain a block. Vendor values
  were chosen over reseller values deliberately.

**Stage 1 — research.** Confirm the first-party provider id for every vendor we
route to, and settle the id-to-vendor mapping. `anthropic`, `zai`, `zhipuai`,
`alibaba`, `deepseek`, `moonshotai`, and `minimax` all exist. Produce the
mapping table and the exact diff the swap would make to `home/settings.yaml`.
Do not edit anything in this stage.

**Stage 2 — implement.**

- Add the models.dev fetch, index, and ordered lookup.
- Point `vision`, `contextWindow`, and `maxTokens` at it. `modalities.input`
  carries image, `limit.context` and `limit.output` carry the sizes.
- Point `fetchCatalogModelIds` at the models.dev `opencode` provider.
- Build `reasoningEfforts` from `reasoning_options` entries of type `effort`.
  Map the value `none` to the key `off` with a null wire value. Ignore
  `toggle` and `budget_tokens`.
- Delete `LITELLM_URL`, `lookupMeta`, `buildPiAiIndex`, `lookupPiAi`,
  `PI_AI_VERSION`, and `PI_AI_CATALOG_BASE`.
- Delete the `--with-meta` flag outright. Always fetch the richest data. That
  means `WITH_META` at line 47, the `if (WITH_META)` block at line 484, the
  gated lookup at line 551, and the comments at lines 21, 33, 451, and 545.
  The `sync-models` script in `package.json` passes the flag, so it becomes
  `node sync-models.mjs`. Change that through the sanctioned package tool, not
  by hand-editing the manifest.
- Warn when a chain-referenced model resolves to no vision data from any
  source. This is the check that would have caught the GLM 5.3 gap at sync
  time instead of at image-read time.
- Re-check all nine `VISION_MODELS` entries and drop the ones models.dev now
  covers.

**Stage 3 — review.** Dispatch a review pass, then read the diff directly.

**Acceptance criteria:**

- `pnpm run sync-models` completes and reports zero chain warnings.
- The regenerated `home/settings.yaml` gives `z-ai/glm-5.3-flash` a
  `defaultInput` of `[text, image]` with no entry in `VISION_MODELS`. This is
  the whole point of the swap and must be shown, not assumed.
- `tencent/hy3-paid` still appears. It is text-only and needs no override; the
  earlier note claiming it needed one was wrong.
- No model loses a `defaultInput` it has today. Any model that gains one is
  listed in the report with the reason.
- The `reasoningEfforts` diff is reviewed model by model before it lands.
  Expect all 31 existing blocks to change and about 25 more to appear. A SMALL
  diff means the resolution order never reached the vendor entry, which is a
  bug, not a success.
- `pnpm test` passes.
- `PI_AI_VERSION` is gone, and nothing else in the repo still needs it in step
  with `plugins/llm-pi-ai/package.json`.
- `Qwen/Qwen3.6-Max-Preview` is removed from `VISION_MODELS`. Both the vendor
  entry and the union agree it takes text only.

**Verified.** `pnpm run sync-models` exits 0 with zero chain warnings.
`z-ai/glm-5.3-flash` gets `defaultInput: [text, image]` with its override
removed, matched on an exact `glm-5.3-flash` key under the models.dev `zai`
provider. A before/after comparison shows no model lost an image input.
`pnpm test` passes, 55 tests. `PI_AI_VERSION` is gone.
`Qwen/Qwen3.6-Max-Preview` is out of `VISION_MODELS`.

The vision warning was checked against a negative control rather than trusted
for being quiet: pointing the `see` chain at `command-code/tencent/hy3-paid`
makes it fire. That caught a real bug where the tier-vision test had been
dropped, leaving the warning firing for every model not in `VISION_MODELS`.

**Still owed by the human.** Run the tool and read the settings diff. A passing
sync is not evidence the effort values are the ones you want.

## Critical context

- Bundle outputs under `plugins/*.js`, `plugins/*/dist`, and `plugins/*/lib`
  are committed. `build.mjs` regenerates them. Rebuild after every TypeScript
  change.
- `see.ts` and `plugins/subscriptions/src/client.tsx` also import from
  `profile-routes`. A change there reaches both bundles.
- Do not add a runtime dependency without asking the user.
- `sync.sh` step `step_sync_guard_rules` copies `guards/.` into
  `$DSH_HOME/plugins/guards/`. It copies and never deletes, so a renamed or
  removed rule file leaves a stale copy behind.
- The guard re-reads its rule files on every call, so a rule edit needs only a
  sync. A plugin code change needs a restart of the running session.
- pi-ai serves TWO jobs in `sync-models.mjs`, not one. It supplies metadata,
  and `fetchCatalogModelIds` also pulls the opencode model id LIST from unpkg
  to exclude those ids from the opencode-zen block. Retiring pi-ai must cover
  both. models.dev lists 94 opencode models against the 58 excluded today, so
  the opencode-zen block WILL change.
- `command-code` and `meridian` do not exist in models.dev. They are private
  gateways. Only `opencode-zen` maps to a real provider there, `opencode`,
  which covers 8 of its 8 ids. This is why the lookup falls back to the
  first-party vendor.
- pi-ai gives a level-to-wire MAP, such as `low: high`. models.dev gives a flat
  vocabulary. The mapping cannot survive the swap, so the wire value always
  equals the level. Some models will offer fewer effort levels than today.
- The union across providers is noisy. `claude-opus-5` is hosted by 30
  providers carrying 5 different effort vocabularies. `glm-5.3-flash` is hosted
  by 38 carrying 6.
- REFUTED, do not retry: preferring the first-party vendor does NOT reduce
  effort churn. Measured on the 31 ids carrying efforts today, first-party
  changes 31 and the union changes 23. pi-ai encoded a level-to-wire MAP that
  no models.dev strategy can reproduce, so churn is unavoidable. The vendor
  order was kept for value quality, not for diff size.
- `Qwen/Qwen3.6-Max-Preview` is NOT a vision model. The vendor entry and the
  union both report text only, so the current `VISION_MODELS` entry is a live
  bug that predates the swap.
- `Qwen/Qwen3.7-Max` is genuinely disputed. The vendor reports text only and 28
  reseller entries report image. It stays in `VISION_MODELS` and keeps vision.
- The old code comment blaming the `z-ai/` prefix for the GLM 5.3 miss is
  wrong. `lookupPiAi` already strips known prefixes and normalizes. The real
  cause is that pinned pi-ai 0.82.1 stops at GLM 5.2.

## Human review queue

- Confirm in the running web GUI that the profiles panel shows the correct
  chain name for each entry field, that a reasoning effort survives a save,
  and that the model seat still applies a profile.
- Run a real `grep -rn foo src/` and a real `find . -name '*.ts'` in a live
  session. Confirm the translated command runs, the output is correct, and the
  note appears once above the output.
- Run `find . -delete` against scratch and confirm the approval prompt appears.
- Confirm the transcript shows the original command while the translated one
  runs. Decide whether that is acceptable or needs a follow-up ticket.
- After `sync.sh` and a `dsh-web` restart, confirm the `fallback: subagent
  chain empty` warn stops and a new subagent picks the subagent chain head.
- Paste an image on a glm-5.3-flash route and confirm `read_image` works.
- After S1 lands, spot-check the reasoning effort picker for a Claude model and
  a GLM model. The available levels are expected to change.

## User preferences and special rules

- Never commit without explicit approval.
