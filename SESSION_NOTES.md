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

---

## Verified-knowledge RAG corpus (Objective 1b) — built, measured, and live-verified — 2026-07-28

Ten-task plan (`docs/superpowers/plans/2026-07-28-rag-corpus.md`), branch `feat/rag-corpus`, not merged, nothing pushed. Closes the gap the previous entry flagged as "the real Objective 1b gap": `verifiedFrameworks`/`businessModels` were hardcoded `[]`, and the only thing `rag_contexts` ever held was peer capsule proposals.

### What was built

- **A 64-row corpus**, seeded idempotently by `RagCorpusSeederService` / `backend/seed-rag-corpus.js`, embedded the same way as everything else (`gemini-embedding-2`, 768 dims, `vector_embeddings`): 54 `readiness_rubric` rows (9 levels × 6 dimensions) + 10 `business_framework` rows.
- **Every corpus row carries a `provenance` field** — this is the load-bearing fact of the whole task, see below.
- **Three retrieval channels** in `RagQueryService.queryVectorDatabase`: rubrics (`deterministic` exact `(readinessType, level)` key lookup by default; `semantic`, gated by `AI_RAG_RUBRIC_MODE`, embeds the bare dimension name as the code's own substitute for SDD §3.2's profile-embedding mechanism — measured at 0/12 correct-dimension, see the Provenance section below), business frameworks (always semantic), peers (the pre-existing mechanism, unchanged, now gated by `AI_RAG_ENABLED` rather than always running).
- **`AI_RAG_CORPUS_ENABLED`** (default `true`) gates the first two channels independently of `AI_RAG_ENABLED`/peer retrieval, so "corpus on vs off" is its own arm.
- **A real, previously-unknown defect found and fixed:** `GroundedPromptBuilderService.buildGroundedPrompt` printed retrieved peer docs as id/similarity/metadata and never emitted their `content`, and business-framework docs were raw `JSON.stringify`'d objects — so **retrieved text was never reaching the RNA or RNS generation prompt at all**, regardless of what retrieval returned, until this plan fixed it (commit `91da49d`). This predates the corpus work and was never on `TODO_CHECKLIST.md`; it would have silently defeated the corpus even after seeding it.
- A grounding measurement harness, `measurement/measure-grounding.js`.

### Provenance — the honest limit on any Objective 1b claim

Of the 64 rows: **only the 9 Technology/TRL rubric rows are transcribed from a public standard** (European Commission Horizon Europe TRL definitions, consistent with ISO 16290:2013). **36 rows** (Market, Acceptance, Organizational, Regulatory rubrics) are **authored against BRLa's (2021, *Technological Forecasting and Social Change*) published dimension framework and criteria** — not transcribed from it, because BRLa defines dimensions and criteria, not nine numbered per-level descriptions. **The remaining 9** (Investment/IRL) are **authored outright**, because IRL appears in neither BRLa nor any cited standard. The 10 business-framework rows split 3 framework-derived (Osterwalder & Pigneur, Maurya, Blank — each citing a specific named work) / 7 authored. Market sizing and unit economics were retagged from framework-derived to authored after review found their citations named no specific framework at all ("standard venture market-sizing practice" is not a citation); a16z appears only as a sourceUrl on the unit-economics row, not as a cited framework author.

**Five of the six scored dimensions therefore have no externally-sourced level text — only Technology does.** Any claim that this corpus makes the AI's readiness assessment "grounded in verified knowledge" needs that caveat attached, every time.

### What the measurement showed (Task 9, full detail in `measurement/README.md` and `TODO_CHECKLIST.md` §0)

- **Quota-free mechanism comparison, full N, reproduces exactly.** The shipped `deterministic` rubric mode is 12/12 correct-dimension by construction (it's an exact key lookup). The code's `semantic` substitute — embedding the bare dimension name (`"Technology"`) — is **0/12**: every query's top-2 nearest-neighbour score fell below the 0.78 similarity floor, because the corpus text uses TRL/MRL/etc. abbreviations and the bare enum name shares almost no register with it. **SDD §3.2's mechanism as actually written** (embed the whole startup profile) is a different query the code never runs for rubrics; tested directly, it is also empty (**0/2**), most likely because narrative business prose and short definitional rubric text share little vocabulary. **Both the code's substitute and the SDD's own specified mechanism fail to retrieve this corpus, for what look like different structural reasons.** This settles the SDD deviation on its own terms — the shipped `deterministic` default is not merely a preference, it is the only one of the three approaches that works at all.
- **The three generation arms — baseline vs `ragCorpus: true` semantic vs `ragCorpus: true` deterministic — did not run.** Both Task 9 and Task 10 hit `gemini-3.6-flash`'s free-tier daily cap (`GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20`, confirmed from the 429 body) on every attempt. **This is an unmeasured null, not a negative result:** whether the corpus (in its shipped `deterministic` form) actually reduces the unsupported-claim rate or improves the differentiation gap remains an open question, not a "no" — nobody has been able to spend the quota to ask it yet.

### Task 10 — live verification against the running server (2026-07-28)

Booted the backend clean (no `Invalid AI pipeline configuration` error, no MikroORM global-EntityManager error — the class of bug that made the boot-time embedding backfill fail on every startup earlier in this plan, and that a mocked unit test could not have caught).

**AgroLink PH's RNA set turned out to already be complete** (`generation_run_id=5`, from 2026-07-27 live-verification work predating this plan) — so `/rna/:id/generate-rna` short-circuits to `[]` before ever calling the RAG pipeline (verified: it does, run id 10 opened and completed empty, no prompt ever assembled). **RNS generation for AgroLink PH substituted for it** (0 existing RNS rows, a genuinely missing generation) — it calls the identical `RagQueryService.queryVectorDatabase` + `GroundedPromptBuilderService.buildGroundedPrompt` pair that RNA generation would have used, so this changes nothing about what the verification actually exercises.

With a temporary debug log on the assembled prompt (added, captured, then reverted before commit — `git diff` confirms no residual change):

- **Corpus on** (default config): the prompt contained `--- Verified Readiness Rubrics (authoritative) ---` with the real **TRL 2** and **TRL 3** rubric text verbatim (AgroLink PH's actual Technology level and the level above). The call then hit the same `gemini-3.6-flash` 429 as the measurement harness — expected, and it proves nothing wrong, since the thing under test (prompt assembly) had already completed. `ai_generation_runs` row 11 recorded `status: 'failed'` with the 429 error, but its `config` snapshot — written when the row opened, before the model call — still correctly recorded `ragCorpus: true, rubricMode: "deterministic"`.
- **Corpus off** (`AI_RAG_CORPUS_ENABLED=false`, fresh restart): the rubric section was **entirely absent** — no peer cleared the similarity floor either, so the call fell all the way back to the plain (non-grounded) prompt. This attempt happened not to hit the 429 and completed successfully, producing a real RNS row (id 6) whose `generation_run_id` (12) points at a run whose `config` correctly recorded `ragCorpus: false`.
- `node seed-rag-corpus.js` re-run against the now-live-used corpus reported `{ created: 0, updated: 0, unchanged: 64, embedded: 0 }` — idempotent under real use, not just a fresh seed.
- `pnpm test`: 153 passing / 2 failing, the same pre-existing baseline as every prior task in this plan. `pnpm build`: clean.

### What remains

- **The three generation arms are still unmeasured.** Needs a day with fresh `gemini-3.6-flash` quota, ideally spent on this before anything else that day, or spread across more than one day (54 calls wanted against a 20/day cap).
- **Output validation (1c)** is still three stub methods; `recommendation-storage.service.ts` still never persists a validated recommendation.
- **`docs/SRS.md` and `docs/SDD.md` were deleted this task** (`git rm`), not corrected. Both were short (18-19 line) in-repo summaries that disagreed with the actual source PDFs — `docs/SDD.md` listed six scored dimensions including Investment/IRL, where the real source documents specify five (TRL, MRL, RRL, ARL, ORL, no IRL). A short summary that quietly disagrees with its own source on the one fact most likely to be checked is worse than no summary. `TODO_CHECKLIST.md` §0's dimension-mismatch item now cites the real source PDFs, not the deleted file.
- **`CLAUDE.md`'s "there is no RAG pipeline" note was false as of this task** and has been replaced with an accurate description, including the provenance split above and the two new env vars (`AI_RAG_CORPUS_ENABLED`, `AI_RAG_RUBRIC_MODE`).

---

## Branch close-out and local-test handoff — 2026-07-28 (same day, later)

`feat/rag-corpus` is **finished and awaiting John's integration decision**. 22 commits ahead of `master` (merge-base `c57d115`), HEAD `c88413a`, working tree clean, **nothing pushed**.

### What happened after Task 10

- **Whole-branch review + fix wave.** Two fix commits landed: `48af3c6` (RNA/RNS retrieval fallbacks were ignoring `rubricMode` and `AI_RAG_ENABLED`) and `c52e2fe` (retagged the unearned framework citations described in the Provenance section above, and removed comments that still conflated the code's semantic substitute with SDD §3.2's mechanism). A scoped re-review verdicted every finding ADDRESSED with no new breakage.
- **13.7 MB of capstone PDFs were committed by accident** in `dbffae5` — a one-line plan edit made with `git add -A` swept in the three source PDFs. Removed from branch history with `git filter-branch` over `master..HEAD`; `c88413a` gitignores them going forward. **Backup branch `backup/rag-corpus-preflight` still holds the pre-rewrite history including those blobs** — delete it once the branch is integrated, or the objects stay in the local store.
- **Test baseline moved to 167 passing / 2 failing** (was 153/2 at Task 10 — the fix wave added tests). The 2 failures are the same documented pre-existing pair that also fails on a clean `master` checkout: `ReadinessService › returns a weighted score…` and `AiService › passes valid task responses through unchanged`. A *third* failure would be a real regression. `pnpm build` clean.
- **`finishing-a-development-branch` Steps 1–3 complete**, normal repo (no worktree), base `master`. The Step 4 menu was presented; **John has not yet chosen** merge-locally / push-and-PR / keep-as-is. Per the standing "no push without asking" rule, option 2 needs explicit confirmation.

### Local-run config, verified 2026-07-28

Checked before handing over the runbook, all green:

- `JWT_SECRET` **matches** between `backend/.env` and `frontend/.env` (compared by hash, not printed) — this is the failure that silently breaks every login, since the frontend verifies the JWT itself rather than calling the backend.
- `PUBLIC_API_URL=http://localhost:3000` matches backend `PORT=3000`.
- `.claude/launch.json` already defines both `backend` (3000) and `frontend` (5173).
- **No dependency changes on the branch** (`package.json`/lockfiles untouched) — no reinstall needed to test it.
- `backend/.env` **does not set `AI_RAG_CORPUS_ENABLED` or `AI_RAG_RUBRIC_MODE`.** Harmless — they default to `true`/`deterministic` — but they must be added explicitly to run the corpus-off arm.

### The local test ladder (cheapest first)

1. `cd backend && pnpm test` — expect 167/2 as above.
2. `cd backend && node seed-rag-corpus.js` — **run it twice**; the second run must report all-unchanged. That is the idempotency test, and it exercises Neon + Gemini embeddings for real.
3. `node measurement/measure-grounding.js --retrieval-only` — **spends zero generation quota** and reproduces the 12/12-vs-0 mechanism result. The single most informative check per unit of cost.
4. Two VS Code terminals (`pnpm dev` in each; backend first, let its schema sync finish), then `http://localhost:5173`, log in `demo@launchup.local` / `password123`, and generate on `/startups/<id>/rna` or `/rns`.
5. **The toggle test, which is the one that actually proves wiring:** set `AI_RAG_CORPUS_ENABLED=false`, restart, generate again, and confirm `rag_retrieval_logs.channel_counts` drops `rubrics`/`frameworks` to 0 while `peers` is unaffected.

Between rungs 3 and 4, `node inspect-prompt.js <startupId> [--dimension T]` prints the assembled prompt (see below).

**Two corrections to ad-hoc DB queries used earlier in this work:** `pg` is **not resolvable** from `backend/` (it is pnpm-isolated under `@mikro-orm/postgresql`, never a direct dependency), so one-off `require('pg')` scripts fail with MODULE_NOT_FOUND. Go through `MikroORM.init(require('./dist/src/mikro-orm.config').default)` and `orm.em.getConnection().execute(sql)` instead. And the tables are **pluralised** — `startups`, `startups_readiness_level`, `rag_retrieval_logs`, `rag_contexts` — not the singular entity names.

**Why the ladder rather than "run the tests":** the defect this branch fixed — retrieved text never reaching the prompt — passed every unit test for its entire lifetime. Tests prove the parts, `channel_counts` proves the wiring, and only the toggle proves the feature reaches the model. Generated output that merely *looks* plausible is exactly what the broken build produced.

⚠️ **Quota is the binding constraint on browser testing.** `GEMINI_MODEL=gemini-3.6-flash` is on the 20-request/day free tier, and one generation fans out into several calls (grounding + bias review + normalization all enabled) — budget **3–5 full generations per day**, not 20. 429s surface in the backend terminal, not the browser UI. Dropping to `gemini-2.5-flash-lite` restores a working UI for layout/flow testing but not for judging output quality.

### `backend/inspect-prompt.js` — added 2026-07-28, verified live

Replaces Task 10's ad-hoc temporary debug log (which was reverted, leaving no standing way to eyeball an assembled prompt). Boots the app context, runs the real `RagQueryService` + `GroundedPromptBuilderService` pair, prints the resolved config, the per-channel counts, and the assembled prompt — then **stops before `sendToGemini`, so it spends no generation quota.** Dimensions come from `StartupReadinessLevel` rather than from existing RNAs, which is what lets it run on any startup regardless of generation history; Task 10 hit exactly that wall when AgroLink's completed RNA set short-circuited before the RAG pipeline.

Verified against live Neon:

- `node inspect-prompt.js 1 --dimension T` → AgroLink PH, `{rubrics: 12, frameworks: 0, peers: 0, lowConfidence: false}`, prompt contains **TRL 2 and TRL 3** verbatim with full `[standard — European Commission, Horizon Europe…]` attribution. TRL 2 is AgroLink's actual level; TRL 3 is the level above.
- `node inspect-prompt.js 2` → MediSync Cebu, all six dimensions, **each scoped to its own rubric** (Acceptance 3 → Acceptance rows, Technology 5 → Technology rows, and so on). This is direct evidence the per-dimension filter in `rns.service.ts` behaves as intended.
- Bad startup id and unknown `--dimension` both exit 1.

Two things it surfaced that are worth knowing:

- **The framework channel returns 0 rows in practice.** `frameworks: 0` on both startups — the business-framework channel is always semantic, and its top-2 never clears the 0.78 floor. Consistent with every other semantic result measured in this work; it means the 10 framework rows are seeded and embedded but **are not currently reaching any prompt**. The rubric channel carries the whole grounding contribution. Not a regression — it has never been otherwise — but it narrows what "the corpus is live" actually means.
- `mikro-orm.config.ts` hard-codes `debug: true`, which echoes the full 768-float pgvector literal twice per semantic query. The script calls `orm.config.set('debug', false)` after boot; the two lines printed before that point are unavoidable without changing shared config.

### Commit convention change — 2026-07-28

`Co-Authored-By` trailers are no longer added to commit messages. Enforced two ways because they cover different paths: `.claude/settings.json` (**tracked, not gitignored** — applies to anyone who clones, unlike `settings.local.json`) sets `includeCoAuthoredBy: false` so the harness suppresses the trailer mechanically, and a `## Git commit conventions` section in `CLAUDE.md` covers message paths the setting does not reach — subagents, `git commit -F` heredocs, other tooling. Commit `b7f7790` is the first without the trailer.

### Open at end of session

- **`feat/rag-corpus` is merged.** John pushed it and merged **PR #13** into `master` (merge commit `c1b978d`), so the 22-commit corpus work is on `master` as of 2026-07-28. The branch still carries **4 later commits not in `master`** — everything in this session after the merge: `07eaae3` (close-out notes), `322cb63` (`inspect-prompt.js`), `b7f7790` (commit convention), `2b7fd67` (these notes). Three are on `origin/feat/rag-corpus`; `2b7fd67` is local only. **These need a second PR or a fast-forward** — they are not on `master` yet, and `inspect-prompt.js` in particular is a tool, not just docs.
- **The three generation arms remain unmeasured** (unchanged from Task 10; still the headline gap for Objective 1b). Needs days with fresh `gemini-3.6-flash` quota, not more code.
- **The business-framework channel retrieves nothing** (see the `inspect-prompt.js` section above). Three plausible fixes — lower the floor for that channel alone, make it deterministic the way rubrics are, or drop the channel and the 10 rows. Not a merge blocker; it has never worked differently. Worth deciding before anyone describes the corpus as "64 rows grounding the model," because in practice 54 are.
- **`backup/rag-corpus-preflight` still exists** (tip `99fbcda`) and holds the pre-rewrite history including the 13.7 MB of PDF blobs. The merge is done, so it is now safe to delete — and worth doing, since it is the only remaining reference keeping those blobs alive locally.
- **`.superpowers/sdd/2026-07-28-rag-corpus/`** (gitignored) was deliberately *not* deleted despite the process prescribing it — it holds the ten task reports with TDD evidence, which is the debugging record while John tests. Remove after merge.

---

## Grounding measurement — Step B finally ran — 2026-07-29

Branch `measure/grounding-arms`, off `master` (which now carries the merged corpus work, PRs #13/#14/#15). Nothing pushed.

The top open item was Step B of `measure-grounding.js` — the three generation arms, n=0 since 2026-07-28. **It ran.** 16 of 18 calls landed before the daily cap; raw per-call records are committed at `backend/measurement/results/2026-07-29-rep1.json`.

### The blocker was two problems, and only one of them was quota

The 20/day cap on `gemini-3.6-flash` was real, but the harness made it fatal rather than merely limiting. It iterated `arm → startup → rep` at `REPS = 3`, so 9 calls went into the first (arm, startup) cell and the whole 20-call budget was consumed **inside the baseline arm**. Every metric in the file is a *between-arm* contrast, so that partial run had nothing to compare and reported n=0 across the board.

Three changes, verified before spending any quota:

- **`REPS` defaults to 1**, overridable with `--reps=N`. One rep is 18 calls — what a free-tier day actually buys.
- **Reps are the outermost loop.** Each completed rep is now a full three-arm comparison, so a 429 costs precision instead of the comparison itself. Retrieval is hoisted above the rep loop so `semantic` still embeds only once.
- **`--out` / `--merge`** persist and recombine the raw per-call records. The report functions are pure over the concatenated calls, so N days of one rep equals one N-rep run. `--merge` **refuses** files whose model, embedding model, corpus size or floor differ rather than averaging two experiments together.

The merge path and the refusal path were both exercised against synthetic fixtures first — no quota spent proving the plumbing.

### What the numbers say, and mostly what they don't

| metric | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — rubric-term grounding | n/a | n/a (nothing retrieved) | 1/12 (8%) |
| 2 — invented absent fields | 0/6 | 0/6 | 0/3 |
| 3 — differentiation gap | +1.50 | +2.50 | incomplete |

**Four findings, and the most valuable one is not in the table.**

1. **`sdd-semantic` is not a distinct arm — it is a null-condition replicate of `baseline`.** Semantic rubric retrieval returned 0 rows for both startups (confirmed in the results file, exactly as Step A predicted), so its rubric block is the empty string — and baseline's is too. **The two arms sent byte-identical prompts.** The study is really two conditions plus one accidental control.
2. **That control measured the noise floor, and it is large.** Same prompt, `temperature: 0`, two samples: **8 of 12 per-dimension levels differed**, gap +1.50 → +2.50. AgroLink came back `T3 M3 A3 O3 R1 I1` once and `T2 M3 A2 O2 R1 I1` the other time. So **±1.0 gap points is run-to-run variance at n=1**, and no corpus effect below that is detectable. This is the single most useful number the run produced, and it was free.
3. **Metric 2 is saturated and cannot move.** 0/15 invented, 15/15 present recalled, every arm — reproducing 2026-07-27's 0/9 and 9/9 across two different models. `groundPrompt()` already handles this probe completely. A null result here is **evidence about the probe, not the corpus**; Objective 1's claim cannot be tested until the probe is harder (longer documents, plausible distractors, partially-supported fields).
4. **Metric 1's 8% is largely an artifact, and inspecting the misses proves it.** With `TRL 2`/`TRL 3` verbatim in the prompt, the model wrote *"Tested a paper prototype of the lot-aggregation flow with 3 cooperatives in September 2025"* — a correct TRL-2/3 characterization that shares no wording with `keyTerms: ["concept formulated", "speculative application", …]`. The RNA prompt demands specificity to the source document, which structurally conflicts with echoing abstract rubric phrasing. Metric 1 measures **vocabulary reuse**, which is near zero here even where retrieval demonstrably worked. The README had flagged exact-substring matching as a risk; this run shows it is the dominant case.

### Operational note worth keeping

**The free-tier daily window resets at midnight US Pacific = 15:00 Philippine time.** A run started in the PH morning draws on the *previous* window. That is why this run got 16 calls rather than 18 — some of 2026-07-28's evening attempts had already spent from the same window.

### What's owed

- **Two calls**: `deviation-deterministic` / MediSync (levels + hallucination probe). That gap is why metric 3's headline arm reads `n/a`.
- **At least two more reps**, one per quota window, then `--merge`. Three reps is the minimum for metric 3 to clear the ±1.0 noise floor.
- **Two probe redesigns** — now indicated by measurement rather than speculation: metric 2 needs headroom, metric 1 needs to stop rewarding verbatim echo.

---

## Probe redesign executed, and the first clean rep — 2026-07-30

Branch `measure/grounding-arms`, several commits past `master` at the time of this entry (the branch kept growing after it was written — run `git log master..HEAD --oneline | wc -l` for the current count rather than trusting a number here), **nothing pushed**. Spec `docs/superpowers/specs/2026-07-29-grounding-probes-design.md`, plan `docs/superpowers/plans/2026-07-29-grounding-probes.md`, executed as 8 subagent tasks with an independent review after each.

### The two confounds — the actual reason the redesign was necessary

Reading production's `createBasePrompt` (`ai.service.ts:937-943`) showed the harness's arms differed by more than the treatment, which invalidates the comparison at *any* N. More reps would not have helped.

1. **Production emits the startup's readiness levels for every arm**; only the rubric block varies with `ragCorpus`. The harness emitted them for none — so it was measuring *"told its levels" vs "not told"*, a contrast production never presents.
2. **Deterministic retrieval keys on `(readinessType, level)` using the startup's actual level**, and the levels probe then asked the model to assess that level. The arm was shown the answer.

Fixed: the levels block now goes to all three arms in the RNA prompt; the levels probe receives the full nine-rung ladder instead of the startup's own rung.

### What else changed

Metric 1 became level-placement accuracy against seeded ground truth (the old one scored 1/12 while the text was substantively right — it measured vocabulary reuse). Metric 2 became SO 1.3's own example, the stage-inappropriate recommendation rate, scored with an **authored** lexicon held disjoint from the corpus `keyTerms` by test. The saturated absent-field probe was demoted behind `--with-fabrication-probe`, taking a rep from 18 calls to 12. Fingerprints are keyed **(metric, arm)** so a probe change refuses only what it actually invalidates. `--dry-run` prints every arm's assembled prompts without a generation call.

**49 measurement tests exist where there were none**, run by `pnpm test:measurement` (Node's built-in runner — no new dependency, and jest's 167/2 baseline is untouched).

### First clean rep (`measurement/results/2026-07-30-redesign-rep1.json`, n=1)

| metric (direction) | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — placement MAE (lower better) | 0.67 | 0.42 | **1.50** |
| 2 — stage-inappropriate rate | 0% | 0% | 0% |
| 3 — differentiation gap (higher better) | 2.83 | 2.33 | **1.17** |

`baseline` and `sdd-semantic` send **byte-identical prompts** (semantic retrieves nothing against this corpus), so their spread is the noise floor, not a comparison: 0.25 MAE and 0.50 gap points this rep. **The corpus arm sits outside it on both metrics** — +0.83 MAE, −1.66 gap.

Per-dimension it is not uniform inflation: on MediSync the deterministic arm overshoots Technology/Market/Acceptance and collapses Organizational, Regulatory and Investment to level 1. **Working hypothesis: the levels probe hands corpus arms all 54 rubric rows and that volume destabilises placement rather than grounding it** — a property of the harness's confound-2 fix, not of the shipped product.

That case also vindicated a fix insisted on during Task 3. MediSync's deterministic deltas are `+2 +2 +2 −3 −2 −2`: signed mean **−0.17**, which would have read as near-perfect, against a true MAE of **2.17**. The suite originally could not distinguish `Math.abs` from a signed difference; a mutation check proved it, and the guard added then is what makes this row honest.

**Metric 2's 0% is real, not a dead metric** — injecting *"Move to full market launch and prepare an IPO."* at AgroLink Technology 2 correctly flags both markers. Since confound 1's fix gives all arms the levels block, the economical reading is that **the levels block, not the corpus, is what keeps recommendations stage-appropriate.** The reserved `baseline-no-levels` arm is how to isolate that.

**n=1. This does not show the corpus is harmful** — the +2.28 differentiation baseline it is measured against was itself 3 reps. It shows the instrument is finally clean and that the first clean reading runs against the corpus. Two more reps, then `--merge`.

### What the review loop actually caught

Seven defects. **Six were in the spec or plan, not in any implementer's work** — the subagents transcribed faithfully and the reviews caught design errors. Five were found by *mutation testing*, not by reading; in each case the suite was green and the guard was decorative. The two that would have cost real money:

- **`ipo` matched `IPOPHL`.** The Philippine IP Office appears verbatim in both seeded documents, so an RNA recommending a trademark filing — correct advice at Regulatory 1 — would have scored as the most severe hallucination the metric can record. Fixed generally with whole-word matching.
- **`mergeRuns` keyed its comparability reference on `days[0]`.** The documented `--merge results/*.json` sorts the legacy file first; with it as reference, *nothing* pooled. Reproduced: 0 calls pooled where 2 should have been. That would have silently destroyed the multi-day accumulation the redesign exists to enable.

One test had also **fabricated its own fixture** — replacing MediSync's real `Revenue: PHP 5,000 monthly recurring` with `Revenue: None to date`, which was precisely the line that would have failed the assertion.

### Final whole-branch review — five more findings, all fixed

Run on the most capable model over all 28 commits, then one fix wave (`0a493cb` code, `cbd0bd7` docs). Tests went 49 → 64.

1. **The fingerprint covered less than its own documentation claimed.** It hashed `.toString()` of the three top-level prompt builders only — which excludes the bodies of helpers they *call*. So `readinessLevelBlock`, `renderRubricBlock` and `fullLadderRubrics` were invisible to it, meaning **this branch's own confound-1 fix could have been reverted with every fingerprint unchanged.** `envKey` also checked `corpusRows`, a row *count*, so any same-length edit to a rubric row went undetected. Now hashes all three helper sources plus a full content hash of `RUBRICS`, still scoped per arm so a corpus edit never refuses `baseline` data. The stored map in the results file was regenerated at zero quota cost — done now precisely because exactly one fingerprinted file existed.
2. **`--merge results/*.json` — the documented workflow — did not run on this machine.** Neither PowerShell nor Node expands globs; only a POSIX shell does. Fixed inside the script with `fs.globSync`, so the same command works on any shell, and explicit file lists still bypass expansion.
3. **A typo could silently spend the day's budget.** A bare `--merge`, `--merge` placed last, or a glob matching nothing all left `MERGE_FILES` empty and **fell through to a full 12-call live run**. `--out foo.json` (space instead of `=`) spent 12 calls and discarded the output. All now hard-error before any model call, with messages naming the likely typo. Highest-value fix on the branch: the others cost a reader's time, this one cost a day of measurement.
4. **The README overclaimed.** It called metrics 1 and 3 "two independent metrics moving the same direction". They are both computed from the same `levelCalls` array — two readings of one signal, mechanically coupled. Retracted, along with a "~3× the noise" multiplier that rested on a single paired difference.
5. **`TODO_CHECKLIST.md` contradicted itself** — re-asserted the two completed probe redesigns as open work, carried the same stale "18 calls" figure already corrected elsewhere, left the superseded 2026-07-29 table unmarked, and omitted the stage-marker lexicon's authored provenance.

Scoped re-review: all five ADDRESSED, no new breakage, merge approved. Findings 6-13 were deliberately deferred and confirmed untouched.

### State at end of session

- **Branch `measure/grounding-arms`, 30 commits past `master`** (merge-base `037b4ff`), clean tree, **nothing pushed**.
- **Touches zero files under `backend/src/` or `frontend/`.** The only non-measurement code change is `backend/package.json` gaining `test:measurement`; `"test"` is untouched. So the 2 Jest failures are provably the documented pre-existing pair, not this branch.
- **64 measurement tests** (`pnpm test:measurement`, Node's built-in runner, no new dependency) where there were none. Jest 167 passing / 2 failing, unchanged.
- **The integration decision is still John's** — the finishing-a-development-branch menu was presented and not yet answered.

### Next step

**Two more reps, one per quota window, then merge them.** That is the whole remaining path to a defensible result, and it needs no more code:

```
node measurement/measure-grounding.js --reps=1 --out=measurement/results/<date>-rep2.json
node measurement/measure-grounding.js --merge measurement/results/*.json
```

The window resets at **15:00 Philippine time** (midnight US Pacific). A rep is 12 calls against a 20/day cap, so one rep per day is the ceiling.

Before that, the quota-free ladder worth running locally: `pnpm test:measurement` proves the parts, `--dry-run` shows the real assembled prompts, `--merge` reproduces the result tables. None spends generation quota.

Optional and deferred: the **`baseline-no-levels` fourth arm**, which would isolate whether metric 2's 0%-everywhere is the levels block rather than the corpus. Costs 2 calls per rep; only worth it if that distinction needs defending.

---

## Rep 2 — the corpus arm's error is reproducible, not noisy — 2026-08-03

Master already carries all the measurement work (`measure/grounding-arms`, `feat/rag-corpus`, `fix/auth-guards` are all merged; only the disposable `backup/rag-corpus-preflight` is unmerged). So the top open item was the one both files named: **more reps**. Rep 2 ran, all 12 calls, no generation quota hit. Raw records at `backend/measurement/results/2026-08-03-rep2.json`.

### Preflight, all quota-free, all green

64/64 measurement tests; Step A reproduced exactly (deterministic 12/12, the code's semantic substitute 0/12, SDD §3.2's profile query 0/2); `--dry-run` showed `baseline`/`sdd` retrieving 0 rows and the corpus arm 12 for the RNA probe and 54 for the levels probe.

**The `--dry-run` also earned its keep a second way.** Running it twice back-to-back exhausted the *embedding* per-minute quota (`EmbedContentRequestsPerMinutePerUserPerProjectPerModel-FreeTier`, 100/min — a different quota from the 20/day generation cap), so Step A 429'd inside the measured run. That did **not** invalidate anything, and checking why is the point: `deterministic` is an exact `(readinessType, level)` key lookup that touches no embedding endpoint. Confirmed from the results file — the corpus arm retrieved `trl-2,trl-3,…` for AgroLink (actual level 2) and `trl-5,trl-6,…` for MediSync (actual level 5), the correct 12 keys each. Verified rather than assumed, because "the arm silently ran empty" is exactly the failure this harness has hit before.

### n=2 pooled

| metric (direction) | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — placement MAE (lower better) | 0.71 | 0.38 | **1.42** |
| 1 — within one rung | 21/24 | 23/24 | **8/24** |
| 2 — stage-inappropriate rate | 0% | 0% | 0% |
| 3 — differentiation gap (higher better) | 2.25 | 2.08 | **1.33** |

**The headline is not the means — it is the reproducibility.** MediSync's per-dimension signed deltas for the corpus arm are `+2 +2 +2 −3 −2 −2` in rep 1 and `+2 +2 +2 −2 −2 −2` in rep 2. Meanwhile `baseline` wobbles more between reps than the corpus arm does (AgroLink `T2 M2 A2` → `T3 M3 A3`).

**That retracts the recorded working hypothesis.** "The levels probe hands corpus arms all 54 rubric rows and that volume destabilises placement" cannot be right — the corpus arm is the *more* stable of the two. It **displaces placement systematically**: up 2 rungs on Technology/Market/Acceptance, down 2 on Organizational/Regulatory/Investment. On AgroLink only the upward half is visible (Market +2.0, Acceptance +2.5, the rest exact) because its bottom three dimensions are already at level 1 and cannot collapse further.

This is a better defect to have found. Instability would be a prompt-volume problem with no clean fix; a reproducible per-dimension displacement points at **the rubric text's own calibration** — the O/R/I rungs appear to demand more evidence than the model's unaided prior, the T/M/A rungs less — which is measurable per dimension and correctable in the corpus rows. Hypothesis, not demonstrated cause.

`within one rung` is the sharpest number: baseline 21/24, corpus 8/24 — and the corpus arm's *exact* count is also 8, so **every non-exact corpus placement is off by more than one rung.** Large-grained displacement, not drift.

### Three things checked rather than assumed

1. **`baseline` and `sdd-semantic` really are byte-identical.** `sdd` beat `baseline` on metric 1 in *both* reps, which looked like a signal. Diffed the two assembled prompts out of `--dry-run`: identical, same md5. So it is a coin flip landing the same way twice — and a useful calibration of how little a consistent direction proves at n=2.
2. **Every arm overshoots Acceptance** (+1.0 to +2.5 pooled, both startups), *including* the two arms that receive no rubric text. So it is not a corpus effect — it points at the seeded Acceptance ground truth or at the seeded documents carrying more adoption evidence than their assigned ARL rung implies. Inflates all three MAEs about equally, so it does not bias the between-arm contrast. Worth checking against `seed-demo-full.js`.
3. **`--merge results/*.json` works on this machine.** The final review's `fs.globSync` fix is confirmed on Windows/Git Bash, and the fingerprint guard refuses the superseded `2026-07-29-rep1.json` with an explicit per-group "Not pooled" list rather than silently averaging two probe designs together. Pooled numbers identical to the explicit file list.

### What is and isn't established

Metrics 1 and 3 are still **one finding read two ways** — both come off the same `levelCalls` array, and the displacement pattern mechanically raises MAE *and* compresses the early-vs-mid gap. Not corroboration.

Not established: **whether the corpus helps or harms in production.** Every number here comes from the levels probe, which hands corpus arms all 54 rubric rows; production's RNA path retrieves 12 (current rung + next). And metric 3's per-arm rep-to-rep swing (baseline 2.83 → 1.67) is still comparable to the effect being measured.

### Next step

**Rep 3, after 15:00 PH today.** 8 of the current window's 20 calls remain and a rep costs 12. A partial run now would spend all 8 inside `baseline`+`sdd` and add nothing to the corpus arm, biasing the pool toward the controls — worth *not* doing. Note rep 2 ran at 01:15 on 08-03 and therefore drew on the **08-02** window; the reset is 15:00 PH.

```
node measurement/measure-grounding.js --reps=1 --out=measurement/results/2026-08-03-rep3.json
node measurement/measure-grounding.js --merge measurement/results/*.json
```

Then, newly indicated by this rep rather than by speculation: **a per-dimension calibration pass over the rubric text**, targeting the O/R/I rungs that read stricter than the model's prior and the T/M/A rungs that read looser. That is a corpus-content change, and it is the first time the measurement has pointed at one.

---

## Rep 3 — partial (503), and metric 3 is retired as unresolvable — 2026-08-03 evening

Ran at 18:11 PH, after the 15:00 reset. **11 of 12 calls landed.** The twelfth failed on a transient **503 "This model is currently experiencing high demand"** — *not* a quota 429 — and it hit `deviation-deterministic / MediSync / levels`, the single cell that carries the whole finding. Raw records at `backend/measurement/results/2026-08-03-rep3.json`.

### The useful result is a negative one about the instrument

**Metric 3 cannot resolve the corpus effect, and I don't think more reps will fix it.** `baseline` and `sdd-semantic` send byte-identical prompts, so every gap reading they produce is a draw from one distribution. Three reps give six such draws:

| | rep 1 | rep 2 | rep 3 |
|---|---|---|---|
| baseline gap | 2.83 | 1.67 | 3.33 |
| sdd-semantic gap | 2.33 | 1.83 | 1.83 |

That spans **1.67 to 3.33 — 1.66 gap points between identical prompts.** The corpus arm's pooled deficit is −1.19, i.e. *smaller than the control arms' own spread*. The 2026-07-29 "±1.0 noise floor" was an underestimate, and the 0.17 control spread I recorded at n=2 last night was a small-sample artifact — it grew to 0.61 with one more rep. That is precisely the failure the README warned against when it retracted the "~3× the noise" multiplier: a single paired difference of two means is one number, not a distribution. I reproduced the same mistake at n=2 and the third rep caught it.

**Metric 1 behaves the opposite way and is the metric to report.** Per-rep MAE — baseline 0.67 / 0.75 / 0.92, sdd 0.42 / 0.33 / 0.50, deviation 1.50 / 1.33 / (incomplete). The deviation readings sit outside the baseline range with no overlap.

### The reproducibility finding, one rep stronger and one rep short

AgroLink's corpus-arm deltas now run three-for-three: `+0 +2 +3 +0 +0 +0`, `+0 +2 +2 +0 +0 +0`, `+0 +1 +2 +0 +0 +0` — Market and Acceptance pushed up, the other four exact. The MediSync half (the −2 collapse on O/R/I) still rests on two observations, because rep 3 is exactly the one that 503'd.

### Do not quote the n=3 pooled MAE

Adding rep 3 moved the corpus arm's pooled MAE from 1.42 to **1.23** — and that looks like improvement but is not. Rep 3 contributed 6 AgroLink calls (its low-error startup) and 0 MediSync calls (where all its error lives), so deviation's pool is now 18 AgroLink / 12 MediSync against baseline's 18 / 18. **The missing cell biases the corpus arm's headline number in its own favour.** The balanced n=2 figure, **1.42**, is the like-for-like comparison. Metric 3 is barely touched by the same imbalance (deviation's AgroLink mean moves 2.25 → 2.17, shifting the gap 0.09) but it is unresolvable regardless.

The merge output is honest about this on its face — it prints `MediSync n = 12` next to `AgroLink n = 18` — but the pooled MAE column does not, so it is worth stating in words.

### Harness gap this exposed

**There is no `--only=arm/startup` filter**, so refilling one failed cell costs a full 12-call rep. A one-call retry was impossible. That is the highest-value addition to the harness right now, and it is cheap: the loop already iterates arm × startup.

Also worth noting: **a 503 is not a 429.** The harness stops cleanly on quota, but a transient 503 spends the attempt and produces the same partial-cell outcome without the day being over. A bounded retry on 503 specifically would likely have saved this rep.

### Next step

One full rep to fill the missing `deviation / MediSync / levels` cell — **after 15:00 PH tomorrow (2026-08-04)**. Roughly 8 calls remain in the current window, and a rep needs 12; a partial run now would again spend everything on `baseline` + `sdd` before reaching the corpus arm.

```
node measurement/measure-grounding.js --reps=1 --out=measurement/results/2026-08-04-rep4.json
node measurement/measure-grounding.js --merge measurement/results/*.json
```

### Both harness gaps closed, same session

Built TDD (tests written and watched fail before any implementation), then mutation-tested. **91 measurement tests, up from 64.** Jest unchanged at the documented 167 passing / 2 failing.

- **`--only-arm=` / `--only-startup=`** — case-insensitive prefix match, comma-separated, so `MediSync Cebu`'s space never needs quoting. Refilling tomorrow's missing cell is now **2 calls instead of 12**. A filter matching nothing **hard-errors before any network call** and lists the real names; verified live (`exit=1`, Step A never ran). Unselected arms keep an empty results entry so reports and `--merge` stay well-formed.
- **Bounded 503 retry** — 3 attempts at 15s then 30s. **429 is never retried**, because the daily cap does not reopen for ~24h.

**The mutation pass earned its keep, exactly as it did on the last measurement branch.** Four guards were mutated; three broke tests immediately. The fourth — the `is429` early-return inside `isRetryableServerError` — **passed with the guard removed**, because a real 429 body contains neither `503` nor `UNAVAILABLE`, so nothing I had written could tell the difference. It was a decorative guard. The test that now kills it uses a body naming both codes, which is the only case where the precedence is load-bearing. Written after the mutation revealed the hole, and confirmed to fail without the guard.

Verified end to end without spending generation quota: `--only-arm=deviation --only-startup=MediSync --dry-run` assembles exactly one cell (12 rubric rows for the RNA probe, 54 for the levels probe) and reports no quota spent.

**Caveat recorded in the README:** a filtered file is a partial rep — its own tables read n=0 for everything unselected, so it must be `--merge`d with a full run rather than read alone.

## Grounding measurement — n=3 complete, volume hypothesis refuted, displacement confirmed — 2026-08-04

Branch `measure/grounding-rep2`, 3 commits (`8ee0d13`, `e838e87`, `93f6d19`), nothing pushed. 20/20 of the day's `gemini-3.6-flash` quota spent.

### What ran

A 2-call refill of the cell a 503 cost on 2026-08-03, then two new arms testing the standing hypothesis. **n=3 is now complete and balanced** (deviation 18/18 against baseline's 18/18), which discharges the "do not quote the pooled MAE" caveat the checklist carried — the like-for-like figure is **1.36** against baseline's **0.78**.

### The volume hypothesis is refuted, and this time by experiment

Since 2026-07-30 the docs carried *"the levels probe hands corpus arms all 54 rubric rows and that volume destabilises placement."* The checklist had already retracted it at n=2 on the grounds that *"reproducibility is the opposite of destabilisation"* — a reasonable argument but not a test, since a volume effect would reproduce too. `measurement/README.md` still carried the un-retracted version, which is the one this session set out to test.

Two new arms make it a ladder, holding level coverage fixed so exact placement stays reachable and the true level is still never leaked:

| arm | levels block | MAE | within1 |
|---|---|---|---|
| `baseline` | none | 0.78 | 30/36 |
| `deviation-deterministic` | 31,850 ch | 1.36 | 13/36 |
| `deviation-titles` | 12,552 ch | 1.69 | 15/36 |
| `deviation-bare` | 4,002 ch | 1.78 | 12/36 |

An **87% cut in block size leaves aggregate placement flat and bad.** Trimming *levels* instead would have been the wrong experiment — it removes the correct answer for any startup at level 2-4, degrading placement for an unrelated reason.

### The per-dimension breakdown is where the finding actually lives

Two effects were hiding inside one MAE number, and they respond to volume in opposite directions:

- **Organizational and Investment are volume-invariant.** Every corpus arm sits at -1.17 and -1.00 signed error, identical to two decimals across the whole cut, while baseline places both *too high* at +0.67. The corpus flips the sign and the flip does not care how much text is sent. This is the displacement hypothesis confirmed on a far stronger basis than the n=2 reproducibility argument: the effect survives an 87% change in everything except the rubric's meaning. It is per-dimension and therefore correctable in the corpus rows.
- **Technology and Acceptance move the other way and do track volume**: +1.00 to +2.50 and +2.17 to +3.00 as bodies are stripped. Removing text made over-placement *worse* — a bare title is an aspirational label with no criteria attached. So do not "fix" this by shortening the rubric; the body was the restraint.

### The control keeps earning its keep

`baseline` and `sdd-semantic` send byte-identical prompts, and `sdd-semantic` "beats" baseline in **all three reps**. So a consistent direction across three reps is *not* evidence of an effect in this study — the null pair does it too, at similar magnitude. Any "the corpus arm lost 3/3, therefore it is real" argument is refuted by the study's own control. What survives is `within1`, where the control pair differs by 0/-2/-2 while the corpus arms differ from baseline by -7/-6/-4.

### Harness changes

- **`--only-probe=<rna|levels>`.** Metric 2 has been saturated at 0% on every arm since the 2026-07-30 redesign, so half of every rep bought nothing. Narrowing halves the cost of the only discriminating metric, and is the sole reason a third ladder point fit in one window (6 calls where it would have been 12). The wiring test asserts the call is *suppressed*, not filtered afterwards.
- **Ambiguous `--only-arm` prefixes now hard-error.** Adding a fourth arm made `--only-arm=deviation` match two, which would have silently run both and doubled the spend against a 20/day cap. Over-selection is as costly here as under-selection. Exact names always win, so one arm's name prefixing another's never makes it unselectable.
- **Three separate renderers, deliberately not one parameterised function.** Every `(metric, arm)` fingerprint hashes `renderRubricBlock`'s source, so editing it in place would have stopped three reps of collected data from pooling. Verified before and after each change that all pre-existing fingerprints stayed byte-identical — 9 for the titles arm, 12 for the bare arm.
- **A `--dry-run` divergence, caught and fixed.** The dry-run path rendered the ladder independently of the live path, so the first arm to differ made `--dry-run` print a prompt the run would not send — defeating the only quota-free way to check a prompt before paying for it. Both now go through one helper.
- Harness tests 91 to 103.

### Limits to quote

Every number is the **levels probe**, a harness construct: production does not ask the model to assign readiness levels, mentors set them. This is a direct negative result for Objective 1b's *assessment* claim and says nothing about RNA generation quality, where metric 2 has never produced a signal on any arm. Two data artifacts recorded rather than hidden: the refill re-ran an RNA probe that already existed, so `deviation-deterministic` shows 42 RNA observations against 36 elsewhere (harmless — metrics 1 and 3 read `levelCalls` only); and `deviation-bare` has no metric-2 data at all, having been run `--only-probe=levels` deliberately.

### Next

Not more reps and not another arm — **edit the O/R/I rubric rows** so their evidence bar matches the seeded ground truth, then re-run `deviation-deterministic` alone at `--only-probe=levels --reps=3` (6 calls). The corpus edit changes the content hash, so the recalibrated arm will correctly refuse to pool with these runs; that is the fingerprint guard working as designed.
