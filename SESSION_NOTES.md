# Session Notes — 2026-07-26

## Follow-up (later same day) — merge confirmed, four bug fixes

`feat/ai-config-flags-plan` is now merged into `master` (PR #7, commit `661f27e`). Checked both background follow-up sessions mentioned below: neither `claude/xenodochial-colden-25e582` nor any branch for the `requestedStatus` fix had commits ahead of `master` — both were still open, contrary to hope.

Fixed all four items from "Next step" §2 on a new branch, **`fix/rns-generation-bugs`** (based on `master`, not pushed, not merged — per standing instruction to test locally first):

1. **`targetLevelScore` always `-1`** — `Rns.getTargetLevelScore()` now returns `this.targetLevel.level` directly; deleted the stale hardcoded id→level map (`backend/src/utils.ts`), which had no other callers.
2. **AI-generated rows invisible** — flipped `isAiGenerated = false` at the two generation sites that still wrote `true`: `rns.service.ts generateTasks`, `rna.service.ts generateRNA`. Checked the other two call sites first: `initiative.service.ts generateInitiatives` and `roadblock.service.ts generateRoadblocks` **already wrote `isAiGenerated: false`** at both their creation points — that half of the original diagnosis didn't hold for those two modules, only RNS and RNA needed the change.
3. **`generateRoadblocks` always returned `[]`** — added the missing `roadblocks.push(roadblock)` after `persistAndFlush` in the loop.
4. **`requestedStatus` asymmetry in `generateInitiatives`** — the single-`rnsId` branch now sets `requestedStatus = 1` like the bulk branch does.

Verified: `pnpm build` clean; `pnpm test -- rns roadblock initiative rna readiness` — all 4 touched suites pass. The one failing suite (`readiness.service.spec.ts`) is pre-existing and unrelated (matches the already-documented "`GET /readiness/:startupId` writes on every read" bug) — not touched this pass.

`TODO_CHECKLIST.md` updated to mark all four items done.

### Live verification (same session, against real Neon + live Gemini)

Booted the backend on the fix branch (confirmed PID/start-time that no stale `:3000` server from the earlier session was serving the old code) and drove the API directly — the RNA/RNS/initiative/roadblock controllers are still unguarded (§1), so no auth was needed.

| Fix | Result |
|---|---|
| `targetLevelScore` `-1` | ✅ All 6 broken rows now return real levels; 0 return `-1` |
| `isAiGenerated` flip | ✅ RNS row 30 persisted `false` + `generation_run_id=5`. ⚠️ RNA path **blocked**, see below |
| `generateRoadblocks` `[]` | ✅ Returned a 2-element array, both persisted |
| initiative `requestedStatus` | ✅ Single-`rnsId` branch created row 14 with `requestedStatus: 1` |

The live data confirmed the `-1` diagnosis exactly: id 9 = Regulatory 3 (old map said Technology 9), id 11 = Technology 8 (map said Market 2), id 71 past the map's 54-row ceiling.

**Two findings that qualify the `isAiGenerated` decision** (both now written into `TODO_CHECKLIST.md` §2):

1. **The fix is not retroactive.** 22 `rns` + 24 `rna` rows already in the DB have `is_ai_generated = true` but `generation_run_id IS NULL` (they predate the provenance work). They still fail the frontend filter, so the existing backlog stays permanently invisible — only *new* generations surface. Needs a one-off backfill or a purge; **decision required.**
2. **`generation_run_id IS NOT NULL` is not a complete "AI rows" predicate.** The checklist had recommended it as the replacement for `isAiGenerated`, but it misses those 46 legacy rows. The two populations are disjoint, so a correct query currently needs `generation_run_id IS NOT NULL OR is_ai_generated = true`.

**RNA: verified by delete+regenerate — and it overturned the premise.** With John's approval, deleted RNA id 25 (startup 10, Regulatory — full backup kept) and regenerated. Generation worked and wrote `isAiGenerated: false` with `generation_run_id = 12`. But loading `/startups/10/rna` in a real browser as Manager showed **all six RNAs rendering, including the five legacy `isAiGenerated: true` ones** — so the RNA page has no display filter at all (`{#each $rnaQueries[1].data as rna}`, `rna/+page.svelte:255`).

The `rna/+page.svelte:77` grep hit that the checklist listed as "same pattern" is **inside `addToRNA()`** — the accept-action dedup lookup, not a display filter. So:

- The RNA module never had this bug; the flip there fixed nothing.
- Worse, it was harmful: it erases the dialog's "AI Generated: Yes/No" provenance label, and it makes `addToRNA()`'s `find(d => d.isAiGenerated === false && same type)` match **the row being accepted itself**, deleting it and then PATCHing a deleted id (reachable from the Startup role).

**Reverted `rna.service.ts` to `isAiGenerated = true`** with a comment explaining why it intentionally differs from the other three generators. Set the regenerated row 41's flag back to `true` so the data matches the code. Rebuilt, 4/4 suites pass, and re-confirmed in the browser that all six rows still render.

**Net: RNS was the only module that needed the change.** Its filters are real and its `addToRNS()` only PATCHes — no self-match. Initiative/roadblock already wrote `false`. Whether *their* pages have real display filters was not browser-checked.

Also noted in passing: `backend/src/mikro-orm.config.ts:30` sets `ssl: { rejectUnauthorized: false }` against Neon. Neon presents a publicly-trusted cert, so this needlessly allows MITM — spawned as a separate task chip, not fixed here.

Still unchecked: `progress-report/+page.svelte:299`'s separate `status === 7` filter.

### Database reset + full reseed (same session)

John confirmed the shared Neon data was throwaway test data from development, so it was wiped and rebuilt.

- **Backed up first** — full JSON dump of all 42 tables / 352 rows to `Projects/Launchup/db-backups/` (outside the git repo), with `restore-neon.js` to replay it. The wipe is reversible.
- Dropped all tables **preserving the `vector` (pgvector) extension** — `DROP SCHEMA public CASCADE` would have taken it with them.
- Rebooted the backend so `updateSchema()` rebuilt the schema (41 tables; the 42nd was the MikroORM migrations table, which auto-sync doesn't recreate).
- **New `backend/seed-demo-full.js`** — the boot seeder in `main.ts` creates the four demo accounts and two startups but **never creates capsule proposals**, and seeds only ~13 readiness levels. That is exactly why generation paths couldn't run earlier. The new seeder adds the full 6×9 readiness grid (54 rows), capsule proposals for both startups, sets them QUALIFIED, and seeds RNAs for one of them.
- The two startups are deliberately asymmetric so every path is testable at once: **AgroLink PH (id=1)** has a proposal but no RNAs → exercises RNA generation; **MediSync Cebu (id=2)** has a proposal + 6 RNAs → exercises RNS / initiative / roadblock generation.
- Note `nest build` emits to `dist/src/`, not `dist/` (because `seed-dummy.ts` sits at the backend root). The pre-existing `seed-admin.js` and `seed-demo-runner.js` hardcode `./dist/` and are **broken** under the current layout; the new seeder resolves either.

Smoke-tested end to end on the fresh data: RNS generation (2 rows), initiative generation via the single-`rnsId` branch (2 rows, `requestedStatus: 1`), roadblock generation (returned 2, not `[]`). Both of the day's fixes hold on clean data.

### All display surfaces verified

| Page | Filter real? | Generated rows render? |
|---|---|---|
| RNS | ✅ | ✅ |
| RNA | ❌ no filter at all | ✅ (always did) |
| Initiatives | ✅ | ✅ 2/2 |
| Roadblocks | ✅ | ✅ 2/2 |
| Progress report | ✅ | ✅ all sections |

Two findings:

1. **`progress-report:299`'s `status === 7` filter is not a bug** — it drives the "RNS — Long Term" section, and 7 *is* the long-term status. Empty is correct when no RNS has it.
2. **Progress report is unreachable, not just unlinked.** With it commented out of `access.ts:36-40`, the route redirects to the RNA page. Temporarily uncommenting made it render perfectly (all 6 RNAs, both RNS at target level 7, both initiatives, both roadblocks) — reverted afterwards, the §3 decision is still John's. The re-enable is genuinely a five-line uncomment.

Also visible in the UI: RNS target levels render as **7**, not `-1` — the entity fix confirmed end to end through the browser.

**Provider decision:** staying on Gemini for now. Claude Pro ≠ API access (separate billing), the Claude API has no free tier, and Anthropic ships no embedding model — so a switch would mean running two providers once RAG lands, on top of breaking baseline-vs-enhanced comparability.

**Next:** R2 + presigned URLs → model tiering → RAG pipeline (see `TODO_CHECKLIST.md` §0/§5). Still open: the legacy-row backfill question is now moot (the wipe cleared those 46 rows).

---

## What we did

**Branch:** `feat/ai-config-flags-plan` — 25 commits ahead of `master`, not merged, nothing pushed.

Built AI pipeline configuration and per-run provenance — step 1 of the agreed 4-step sequence (**config flags → R2 + presigned URLs → model tiering → RAG pipeline**). This makes the four capstone AI enhancements independently toggleable and every generation attributable to the exact config that produced it, so a baseline-vs-enhanced comparison is actually runnable.

- `AiConfigService` resolves `{ model, temperature, grounding, rag, biasReview, scoreNormalization }` from env vars (`GEMINI_MODEL`, `AI_TEMPERATURE`, `AI_GROUNDING_ENABLED`, `AI_RAG_ENABLED`, `AI_BIAS_REVIEW_ENABLED`, `AI_SCORE_NORMALIZATION_ENABLED`). Booleans default `true`, reproducing prior behaviour.
- Optional per-request override via `X-Ai-Pipeline-Config` header, gated on `AI_ALLOW_REQUEST_OVERRIDE` (default `false`) **and** a Manager/Admin caller.
- Every AI generation opens an `ai_generation_runs` row (model, config snapshot, latency, status, tokens); every generated artifact carries a `generation_run_id` FK. Eight tracked operations — one generation + one refine route per module across RNA, RNS, initiatives, roadblocks.
- Score normalization decoupled from bias review — it previously ran *inside* bias review and couldn't be exercised independently.
- **Real bug fixed:** `temperature`/`maxOutputTokens` were passed at the top level of the `@google/genai` call, where the SDK silently drops them (`as any` hid the type error). Every Gemini call had been running at the API default temperature, never at the configured `0`.
- Built via brainstorm → spec → 10-task plan → subagent-driven execution (fresh implementer + independent review per task, 5 fix rounds triggered, final whole-branch review on the most capable model). The final review caught 3 cross-cutting bugs invisible to any single task's diff — most notably that run attribution wasn't durably persisted on the failure path, which two earlier fix rounds believed they'd already fixed.
- **Live-verified against the real Neon DB and live Gemini:** triggered one RNS generation, confirmed a `completed` row in `ai_generation_runs` with the correct config, and confirmed 6 well-formed RNS rows persisted with correct `targetLevelId` values.

While verifying live, found and diagnosed (not fixed) two pre-existing bugs unrelated to this branch:

1. **AI-generated RNS never display.** Both RNS display surfaces filter `isAiGenerated === false`; generation writes `true`. The accept action (`addToRNS`) already flips the flag and works — there's just no review surface that calls it. **Decision made:** flip generation to write `isAiGenerated: false` directly, once this branch is merged. Now safe to do because `generation_run_id` — not `isAiGenerated` — is what carries AI provenance; the flag becomes a pure display concern. Trades away a review/accept gate.
2. **`targetLevelScore` is `-1` on every RNS row.** `getTargetLevelScore()` matches against a hardcoded id→level map in `utils.ts` that no longer matches the live `readiness_levels` table (verified via `GET /readinesslevel/readiness-levels`). Fix is a deletion: `getStartupRns` already populates `targetLevel`, so `this.targetLevel.level` is the answer sitting in memory.

Both are logged in `TODO_CHECKLIST.md` §2 with root cause, file:line, and fix shape.

Docs updated throughout: `CLAUDE.md`, `PROJECT_OVERVIEW.md`, `TODO_CHECKLIST.md` (new "Recently completed" section, objective-table flag annotations, both new bugs, the visibility decision).

## Still in progress

- **`feat/ai-config-flags-plan` is not merged.** Live verification passed; nothing else is blocking it.
- **`.claude/launch.json`** (backend :3000 / frontend :5173 dev-server config) is untracked — written this session, not yet committed either way.
- **Backend dev server may still be running** on `:3000` from live verification — stop it if you're done testing.
- A separate background session was spawned to fix the pre-existing `generateRoadblocks` always-returns-`[]` bug on its own branch (`claude/xenodochial-colden-25e582`, based on `master`). It ended with **no commits** — check its output before assuming that bug is fixed; treat it as still open.
- A second background chip was spawned for the `requestedStatus` asymmetry in `generateInitiatives` (bulk branch sets it, single branch doesn't) — status unknown, not checked this session.

## Next step

1. **Merge `feat/ai-config-flags-plan` into `master`** (or open a PR) — live verification is done, this is the only remaining gate.
2. Then, in order:
   - Fix the two logged pre-existing bugs (`-1` target level; flip `isAiGenerated` on the 4 generation call sites — `rns.service.ts` `generateTasks`, `rna.service.ts` `generateRNA`, `initiative.service.ts` `generateInitiatives`, `roadblock.service.ts` `generateRoadblocks`)
   - Continue the agreed sequence: **R2 + presigned URLs** (unblocks Objective 3 uploads — `upload.service.ts` currently 503s, no `DO_SPACES_*` vars set) → **model tiering** (env-driven now, but still `gemini-2.5-flash-lite` everywhere — TODO_CHECKLIST.md §5) → **RAG pipeline** (§0 — no embedding model exists anywhere; `AI_RAG_ENABLED` currently gates keyword-overlap retrieval, not semantic search)
3. Before then: check on the two background follow-up sessions (roadblock empty-array fix, initiative `requestedStatus` fix) — confirm whether either actually landed a commit.
