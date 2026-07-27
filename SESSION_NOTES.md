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
- **Role separation corrected** (John's callout). `main.ts`'s boot seeder made `managerUser` own AgroLink and `mentorUser` own MediSync — staff accounts owning startups, with no mentor attached to either. Setting `QUALIFIED` directly compounded it by skipping the `approve-applicant` → `appoint-mentors` step where the mentor is actually assigned. `seed-demo-full.js` now creates dedicated **Startup**-role founders (`founder.agrolink@`, `founder.medisync@`), transfers ownership and membership to them, and assigns `mentor@launchup.local` to both via `startups_mentors`. Verified: 0 startups owned by a non-Startup role, 0 startups mentored by their own owner. The frontend-only `Manager as Mentor` pseudo-role is deliberately not used anywhere in testing.
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

### Boot seeder fixed at the source

The `seed-demo-full.js` fix above only repaired the DB *after* boot — a fresh `pnpm dev` on an empty database still produced staff-owned, mentorless startups. `main.ts` is now fixed too:

- `seedLocalDemoData()` seeds the two `Startup`-role founders itself, using the **same emails and names** as `seed-demo-full.js` so the two seeders agree and the standalone script is a no-op on a fresh boot.
- The two near-identical startup blocks collapsed into one `seedDemoStartup(em, spec)` helper that sets the founder as `user`, adds them to `members`, and adds `mentor@launchup.local` to `mentors` — the `appoint-mentors` step the old seeder skipped.
- Repeated user lookups collapsed into an `ensureUser()` helper; `ensureReadinessLevelExists` picked up real types (it was implicitly `any`).

**Creation-only by design.** The `if (existing)` guard stays, so the boot seeder never rewrites a startup it already created — auto-mutating ownership on every `pnpm dev` would surprise people, and other developers' branches may hold intentional edits. Branches seeded before 2026-07-27 keep the wrong shape until `node seed-demo-full.js` is run against them; that script now documents itself as the migration path.

**Verified on a genuinely cold database.** Created a throwaway `launchup_seedtest` DB on the same Neon instance (with pgvector), booted the real backend against it via `DB_NAME`, asserted, then dropped it — the shared branch was never touched. Both startups took the create branch; owners are the two founders (`Startup` role), both have `mentor@launchup.local` in `startups_mentors`, and all three assertions returned 0 (non-`Startup` owners / self-mentoring / mentorless).

Side finding: **the SQLite fallback at `mikro-orm.config.ts:8` does not work** — `better-sqlite3`'s native bindings were never compiled, so booting with an empty `DB_HOST` dies at connect. `CLAUDE.md` describes it as a usable no-Docker path; it isn't. Logged in §2. (Also: `dotenv` never overrides an existing `process.env` key, and PowerShell's `$env:X=''` *deletes* rather than empties a variable — so `.env`'s `DB_HOST` always wins from PowerShell regardless.)

### Object storage: presigned uploads (Supabase, not R2)

**R2 was ruled out** — Cloudflare requires a credit card even on the free tier. Switched to **Supabase Storage**: S3-compatible, no card, ~1 GB free. Because `upload.service.ts` uses the generic `@aws-sdk/client-s3` `S3` class with a configurable `endpoint`, the provider change stayed a config swap rather than a rewrite.

**Read path decision: private bucket + presigned GET**, storing the object *key* rather than a URL. Normally that costs a data migration, but the DB wipe left no upload rows to convert — so the secure option was effectively free. It matters here because assessment attachments and capsule proposals carry startup financials and IP status.

What changed:
- `DO_SPACES_*` → `S3_*`; added `forcePathStyle: true`; dropped `ACL: 'public-read'` (Supabase/R2/modern S3 all gate public access per *bucket*, not per object).
- `POST /upload/presign` → browser PUTs straight to the bucket. `GET /upload/signed-url?key=` → temporary read URL.
- `JwtGuard` on the whole controller (closes the §1 SEC item); `test-connection` no longer leaks raw SDK error text naming the bucket and endpoint.
- `FileUploadField.svelte` switched to presign → PUT, stores `{key, fileName}`, still renders legacy `{url, fileName}`. Preview became a button, since a signed URL expires and there is no stable `href`.

**Two real bugs the tests caught, both of which would have shipped silently:**
1. The AWS SDK computes a CRC32 checksum by default. On a presigned PUT there is no body at signing time, so it signed the checksum of *nothing* — every real upload would have been rejected at the bucket. Fixed with `requestChecksumCalculation: 'WHEN_REQUIRED'`.
2. `getSignedUrl` signs only `host` unless given `signableHeaders`. The `Content-Type` returned as "required" was therefore decorative — a client could request an image URL and PUT anything through it.

Also hit a dependency trap: `pnpm add @aws-sdk/s3-request-presigner` resolved to 3.1095.0 against `client-s3` 3.901.0, pulling two copies of `@smithy/types` and breaking the build with a wall of structural-mismatch errors. Pin the presigner to the client's exact version.

**Verified — end to end against the live bucket.** Credentials went into `backend/.env`; `test-connection` reports `connected`.

- 14 unit tests pass (signing is a local HMAC, so the presigned URLs are genuinely SDK-produced).
- Auth/degradation probe: 401 on all three routes unauthenticated, 400 on an oversize request (DTO-level, before storage is consulted), 503 when `S3_*` is unset instead of a crash.
- API round trip: presign → PUT (200) → signed GET (200), **byte-identical** file back. An **unsigned** GET on the same object returned **403** — the bucket really is private, not merely assumed to be.
- Through the UI as `founder.agrolink@launchup.local` (Startup role, not staff): attached a PNG, submitted, Technology moved 2 Pending → 1 Pending / 1 Done, and Preview resolved a fresh signed URL that rendered the image (10×10, `image/png`). No console errors.
- Stored `answerValue` is `{"files":[{"key":"assessments/…png","fileName":"…"}]}` — a **key, no URL**, as designed.

Two things surfaced during that verification:

1. **The assessment tables were empty after the wipe**, so the assessment page rendered nothing and the File field was unreachable. `seed-demo-full.js` now seeds 6 assessments (2 File-type) applied to both startups. Worth knowing that the wipe took out more than the seeders replaced.
2. **Removing a file orphans the object.** "Remove file" only rewrites `answerValue`; `deleteFile()` exists but its route is commented out, so removed attachments stay in the bucket forever with nothing in the app pointing at them. Logged in §2.

Also note **PowerShell 5.1's `Invoke-WebRequest` reported the HTTPS PUT to Supabase as failed with no status code** — but a later bucket listing showed the object *had* been created, so the request reached storage and only the client-side completion or response read failed. Treat a PS failure against Supabase as unreliable in both directions: it may report failure on success, and it cannot be trusted to tell you why. The same request from Node worked and reported correctly. **Use Node for storage probes.**

### Model tiering (§5) — steps 0–2

**Step 0 — measure before choosing.** Queried the project's own key rather than trusting the docs, and it overturned the plan twice: **`gemini-2.5-flash`, the model this checklist recommended, now 404s** ("no longer available to new users"), and **no Pro-tier model is reachable on the free tier** (`gemini-2.5-pro`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview` all 429 with 20s spacing, so tier exclusion rather than a rate limit). Per-task tiering with Pro on scoring is therefore impossible without paid billing.

**Step 1 — default raised to `gemini-3.6-flash`.** The deciding measurement was thinking tokens: every `*-flash-lite` tier spends **0**, and 2.5-flash-lite answered a *Technology* readiness question in terms of revenue and product-market fit — the wrong dimension. 3.6-flash spends ~780 and stays on-topic. Picked over 3.5-flash on latency (6.5s vs 12.1s) and thinking cost (779 vs 965). Costs ~2.8× tokens and ~3× latency; `gemini-3.5-flash-lite` documented as the escape hatch (still beats 2.5-flash-lite on every axis). `gemini-embedding-2` is reachable for the §0 RAG work.

**Step 2 — the three untracked calls now open runs.** `getCapsuleProposalInfo`, `getCapsuleProposalInfoFromImage`, and `generateStartupAnalysisSummary` read `AiConfigService.defaults` directly and left no `ai_generation_runs` row, so they ignored `X-Ai-Pipeline-Config` and were invisible to the comparison study — including the whole Objective 3 handwriting path. They now take an `AiRunContext` under two new operations, `capsule_extract` and `analysis_summary`. Both open with a null `startupId`; `analysis_summary` backfills via `AiRunService.attribute()` once the startup is persisted.

Verified live against real routes, not just unit tests:

| Operation | Model | Latency | Tokens | Attributed |
|---|---|---|---|---|
| `capsule_extract` (1400×1000 image) | gemini-3.6-flash | 26.5s | 1605 / 251 | n/a — no startup yet |
| `analysis_summary` | gemini-3.6-flash | 9.1s | 324 / 106 | ✅ startup_id backfilled |

Notes for whoever picks this up:
- **The capsule route has a legibility gate** (`OcrService.checkLegibility`) requiring **≥1200×900 and tail entropy ≥4.2**. Below that it returns early and never calls the model, so a small test image silently proves nothing. No image in `frontend/static/` is large enough.
- **My Step 1 commit left `ai-run.service.spec` red** — I ran only the `ai-config` spec then, not the full suite. Its `configService()` builds a real `AiConfigService` with no env, so it asserts `DEFAULT_MODEL`. Fixed in the Step 2 commit. Run the whole suite after touching a default.
- The `deleteRule: 'set null'` on `ai_generation_runs.startup` means deleting a startup silently detaches its runs — worth knowing before reading attribution counts.

**Step 3 — measured old vs new, and it overturned the section's premise.**

Same input, production grounding instruction, `temperature: 0`, 3 reps, two documents (AgroLink = paper prototype, zero revenue; MediSync = 6 paying facilities, PHP 5k MRR). Only the model varied.

| | `gemini-2.5-flash-lite` | `gemini-3.6-flash` |
|---|---|---|
| AgroLink mean level | 1.67 | 2.33 |
| MediSync mean level | 1.50 | 4.61 |
| **Gap** | **−0.17** | **+2.28** |
| Invented values for absent fields | 0/9 | 0/9 |
| Total tokens (6 calls) | 3,135 | 14,978 |

Four findings, one of which contradicts what the checklist had assumed:

1. **The old model ranked the two startups backwards.** A −0.17 gap means the venture with paying customers scored slightly *lower* than the paper-prototype one, and 5 of 6 dimensions returned identical scores for both. On 3.6-flash every dimension moves correctly (Technology 3→6, Investment 1→4).
2. **"The lite tier is sycophantic / lenient" was wrong.** It was not lenient — it was floor-bound and blind, collapsing everything to 1–3 regardless of evidence. The real defect was **differentiation (Objective 2)**, not leniency (Objective 4).
3. **This reframes Objective 2b.** `TierConfig.weights` going unread is still a bug, but weighting near-identical inputs could never have produced differentiation. The model was the binding constraint, not the formula — worth knowing before anyone invests in the weighted-scoring work expecting it to fix differentiation.
4. **Grounding did not improve.** Both models refused all 9 absent fields and recalled all 9 present ones — `groundPrompt()` is doing that work and there was no headroom, so **no Objective 1 gain can be claimed from the model change.**

Limits worth repeating before anyone cites these numbers: N is small (3 reps × 6 dimensions × 2 docs), there is no expert ground truth so the trustworthy signal is the *gap and its direction* rather than absolute levels, the prompt mirrors production shape but is not `createBasePrompt` with RAG attached, and 1 of 3 AgroLink reps on 3.6-flash produced unparseable output (n=12 not 18 for that cell).

**Next:** RAG pipeline (§0) — `gemini-embedding-2` is reachable. Still open: the legacy-row backfill question is now moot (the wipe cleared those 46 rows).

### RAG pipeline (§0) — built and measured

Branch `feat/model-tiering`, four commits (`4708a2e`, `5c390de`, `8abba71`, + docs). Nothing pushed.

Objective 1b now has an actual retrieval-augmented pipeline. Before this, `vector_embeddings` had never held a single row since the table was created, and `RagQueryService` searched `source_type = 'startup'` — which nothing has ever written — so it returned `lowConfidence: true` on *every* call and the RNA/RNS prompts were "grounded" in nothing at all.

**What was built.** `EmbeddingService` (`gemini-embedding-2`, 768 dims) + `EmbeddingIndexService` writing `vector_embeddings` on every `recordRagContext`, plus an idempotent boot-time backfill. Both retrieval paths now rank with pgvector `<=>` in SQL instead of loading every vector into Node. `AI_RAG_STRATEGY=keyword|semantic` sits alongside `AI_RAG_ENABLED` so the comparison has three arms, and an unrecognised value is rejected at boot rather than defaulted — a typo must not silently mislabel which arm a batch of generations ran under. A startup can also no longer retrieve its own capsule proposal as a "verified prior profile"; it previously could, letting the model read its own input back as corroboration.

**Four things were measured rather than assumed, and three of them changed the design:**

1. **`gemini-embedding-2` over `-001`.** Wider relevant/irrelevant separation, and it stays unit-normalised when truncated to 768 where `-001` drops to norm 0.59. It also ignores `taskType` entirely — DOCUMENT and QUERY return bit-identical vectors — so there is no asymmetric encoding to get wrong.
2. **768 dimensions, not the native 3072.** pgvector refuses to build hnsw or ivfflat above 2000 dimensions. At 3072 the column could only ever be sequentially scanned. The column was also a *dimensionless* `vector`, which pgvector cannot index at all.
3. **The similarity floor.** A first guess of 0.70 was fitted to one hand-picked pair and leaked **78%** of cross-domain pairs — an agriculture startup scored 0.765 against a health-referral query. Calibrated properly (`measurement/calibrate-similarity.js`, 9 documents / 36 pairs) the answer is **0.78**: keeps 8/9 true neighbours, leaks 11%. The distributions *overlap* (same-domain down to 0.7295, cross-domain up to 0.8036), so this is a trade-off and not a boundary.
4. **The arm comparison** (`measurement/measure-retrieval.js`): keyword 56% precision / 15 of 18 same-domain surfaced; semantic **76%** / 16 of 18. Semantic returned **fewer** documents (21 vs 27) and still surfaced **more** correct ones, so precision was not bought with recall. Keyword's `score > 0` floor admits anything sharing one token.

**What live verification caught that tests could not.** The backfill used the injected global `EntityManager` and failed on every boot with *"Using global EntityManager instance methods for context specific actions is disallowed"* — invisible to unit tests whose EM is a mock. It now forks, and the test double grew a `fork()` so the regression is catchable. Separately, the retrieval SQL was exercised against Neon in a rolled-back transaction with real embeddings (it correctly ranked a health context above an agriculture one), and then both retrieval methods were called through the real DI graph — because raw `pg` would not have covered MikroORM's own `?`→`$n` placeholder rewriting.

**Operational note:** do not run `pnpm build` while `pnpm dev` is watching. Both write `dist/`, and the race left the running server unable to resolve its own modules until restarted.

**The remaining Objective 1b gap is the corpus, not the pipeline.** `rag_contexts` only ever holds other startups' capsule proposals (written solely from `startup.service.ts:158`), so this retrieves peer text, not verified knowledge — and peer text is itself AI-parsed, so errors can propagate. `verifiedFrameworks` and `businessModels` are still hardcoded `[]`. Seeding a real corpus of readiness-level rubrics and business-framework documents needs no code change: they are `rag_contexts` rows with a distinct `sourceType`, and the embedding + retrieval path covers them automatically. **Do that before claiming any Objective 1 result.**

Also still true: the only row in `rag_contexts` is titled "PROVENANCE PROBE - delete me" from an earlier session. Left in place — deleting it is John's call.

### Security P0 (§1) — JWT secret + 11 unguarded controllers

Branch `fix/auth-guards`, two commits off the post-merge `master` (`93b42c4`, `ad232d5`).

**`JWT_SECRET` no longer falls back.** Both backend call sites go through `requireJwtSecret()` (`backend/src/auth/jwt-secret.ts`), which throws at boot instead of silently signing with `'launchup-dev-secret'` — a string committed to a public repo. The old `||` also treated a **whitespace-only** secret as valid and would have signed tokens with it; the new check trims. Tested against unset / empty / whitespace / real.

The frontend had the same fallback. Its check had to go at **module scope**, not at the point of verification: that code sits inside a `try` whose `catch` redirects to `/login`, so throwing there would have made a misconfigured deployment present as "your password is wrong".

**Eleven controllers were reachable with no credentials, not the four the checklist recorded.** `rna`, `rns`, `initiative`, `roadblock`, `chat-history`, `readiness`, `progress`, `elevate`, `ocr`, `ai/metrics`, `ai/baseline`. Anyone could read, edit and delete every startup's coaching data, read full AI transcripts, and spend Gemini quota through the generation routes. The two `ai/*` surfaces got `AdminGuard` as well — `POST /ai/baseline/update` rewrites the distribution that score normalization (4c) measures against, so an ordinary user could have moved every normalized score in the study.

**Guarding them alone would have broken the entire UI, and finding out why was the real work.** The `Access` cookie is `httpOnly`, so no script can read it to build an `Authorization` header — and `axiosInstance` was configured with **no credentials of any kind**. All 13 client-side calls across 7 components were anonymous and would have started 401ing.

The three components that *look* like they authenticate are worse than useless: `PendingTab`, `AcceptedTab` and `RatedTab` each hardcode a JWT string literal. Decoded, it is a **Django SimpleJWT token that expired 2024-09-06**, with a payload shape (`token_type`, `jti`, `user_id`) this backend has never issued. That dead credential is why "the frontend already sends Bearer tokens" looked true. Logged as debt; all three are also unimported.

So `JwtStrategy` now also extracts the token from the `Access` cookie (hand-parsed, no new dependency), and axios sends `withCredentials`. Keeping the token httpOnly and reading it server-side is the stronger arrangement anyway.

**A second pass caught what the first missed.** Two dialogs build their request with a bare `fetch` rather than the axios instance, so they never inherited `withCredentials` — `rna/view-edit-delete-ai-dialog.svelte` and `rns/view-edit-delete-ai-dialog.svelte`, both hitting `/:id/refine`. `fetch` defaults to `credentials: 'same-origin'` and `:5173 → :3000` is cross-origin, so both AI refine dialogs would have failed silently. Every *other* raw fetch in the frontend targets routes that were already guarded, so nothing else changed behaviour.

**Verified live rather than by inspection:** all 11 routes 401 with no credentials and authenticate under both a Bearer header and a cookie; `GET /` and `POST /auth/signin` still work anonymously; the CORS preflight for a JSON POST returns 204 with `Access-Control-Allow-Credentials: true`; and the cookie-authenticated `POST /rna/1/refine` returned **201 after running the real Gemini refine**. `svelte-check` is unchanged at 160 pre-existing errors — confirmed by running it against `master`, not assumed.

**Deliberately not changed — needs John's decision.** The login cookie is `sameSite: 'strict'`. That works locally, because `localhost:5173` and `localhost:3000` are the same *site* (cookie scope ignores the port). It will **not** work deployed: `launchup.vercel.app → launchup.onrender.com` are different sites, the browser will not attach the cookie, and every client-side call will 401. Either set `sameSite: 'none'; secure: true` (CSRF trade-off) or proxy client calls through SvelteKit server routes. Logged in `TODO_CHECKLIST.md` §1.

**One gap I could not close myself:** the SvelteKit login form would not submit under browser automation — no POST ever reached the server — so the transport chain was proven directly instead of by clicking through the app. **One manual login + a click through a startup's RNA/RNS pages, including the AI refine dialog, is still owed before this merges.**

### On the branches that ended up on GitHub

John asked why commits were on the repo. Facts, since it matters for the local-first workflow:

- No `git push` was ever issued from this session — every git command is in the transcript.
- Commits are authored by this machine's git identity (`Johann-107 <johnanthonysb@gmail.com>`); the only marker of AI authorship is the `Co-Authored-By: Claude Opus 5` trailer. There is no separate AI identity.
- The remote-tracking reflog records both pushes under that same identity: `origin/feat/model-tiering` at 08:59 UTC (matches the PR #10 merge) and `origin/fix/auth-guards` at 14:04 UTC — **3h42m after** its last commit was created, which rules out an immediate post-commit auto-push.
- VS Code's Git extension is active on the repo (it wrote `branch.fix/auth-guards.vscode-merge-base` into git config). A manual Sync / Publish Branch is the most likely explanation.

**Worth checking `git.postCommitCommand` in VS Code settings** — if it is set to `push` or `sync`, locally-made commits will keep going straight to GitHub and quietly defeat the "test before it reaches master" rule.

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

*(The "What we did" block above is the original session's record — the four-step sequence it describes is now complete. Current status follows.)*

---

## Current status — 2026-07-27

**Merged to `master`:** config flags (PR #7), RNS/RNA bug fixes (PR #8), storage + presigned uploads (PR #9), model tiering + RAG pipeline (PR #10).

**Open:** `fix/auth-guards` — 2 commits ahead of `master`, pushed to GitHub but **not merged**. Security P0, described above.

### Still in progress / owed

- **One manual smoke test of `fix/auth-guards`** before merging: log in through the UI and click through a startup's RNA and RNS pages, including the AI refine dialog. Everything else about that branch is verified; browser automation could not drive the login form.
- **The `sameSite` decision** blocks deployment, not merge. See §1 of the checklist.
- **The RAG corpus is the real Objective 1b gap.** The pipeline is built and measured; it currently retrieves peer startup text rather than verified knowledge, and there are only 2 startups to retrieve from.
- **`rag_contexts` still holds exactly one row**, titled "PROVENANCE PROBE - delete me". Deleting it is John's call.
- **Two pre-existing test failures** on `master`, untouched all session: `ReadinessService › returns a weighted score…` and `AiService › passes valid task responses through unchanged`. Backend is otherwise 111 passing.
- **`svelte-check` has 160 pre-existing errors** in 46 files. Not introduced this session (verified against `master`), but it means type-checking cannot currently gate anything.

### Next step

1. **Smoke-test and merge `fix/auth-guards`.** It is the last thing standing between the app and a demo where every coaching route is publicly writable.
2. **Seed the RAG corpus (Objective 1b).** This is the highest-value item: it converts work already done into a claimable Objective 1 result. **No code change needed** — readiness-level rubrics and business-framework documents are just `rag_contexts` rows with a distinct `sourceType`, and the embedding + retrieval path picks them up automatically. Do this before reporting any Objective 1 result, or the measurement is peer similarity rather than grounding.
3. **Output validation (1c).** `output-validator.service.ts` and `recommendation-storage.service.ts` are stubs with empty bodies, including `saveRecommendations()`. The SRS acceptance criteria and the SDD's Validated / Flagged / Low-Confidence badges are all specified against them. `callAiExpectJson()` already does schema-checked parsing with a corrective retry — build on that.
4. **Dimension alignment.** ~10 lines. The documents specify TRL/MRL/**RRL**/ARL/ORL; the code scores Investment instead of Regulatory. Removes an easy line of panel questioning.
5. **Weights (2b).** `TierConfig.weights` is still never read, so the admin editor has no effect. Worth fixing — but the Step 3 measurement showed the *model* was the binding constraint on differentiation, so do not expect weighting to be the win.

### Operational notes for next session

- **Do not run `pnpm build` while `pnpm dev` is watching.** Both write `dist/`; the race left the running server unable to resolve its own modules until restarted. `pnpm test` is safe (ts-jest does not touch `dist/`).
- **Mocked unit tests here have repeatedly passed while the code was broken.** The boot-time embedding backfill failed on *every* startup with a MikroORM global-EntityManager error that no test could see. Exercise the real path: `preview_start` + `preview_logs`, or a script that builds the real DI graph via `NestFactory.createApplicationContext`. For SQL, run it against Neon inside `begin` / `rollback`.
- **`backend/measurement/`** holds four reproducible harnesses (model comparison, differentiation, similarity calibration, retrieval arms). Re-run rather than re-cite if the model or embedding model changes.
