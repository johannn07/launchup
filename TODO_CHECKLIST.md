# LaunchUp — Remaining Work Checklist

Prioritized backlog derived from a full read of the codebase (see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)), plus a second verification pass specifically hunting broken frontend→backend calls, missing guards, and dead code.

**Type legend**

| Tag | Meaning |
|---|---|
| 🔒 **SEC** | Security fix — do it regardless of scope decisions |
| 🐞 **BUG** | Broken code with an unambiguous correct behaviour — just fix it |
| ❓ **SCOPE** | Unfinished feature. Needs *your* decision: **fix it / cut it / leave it hidden**. Not a pure code fix. |
| 🧹 **DEBT** | Cleanup. No user-visible impact. |

**Effort:** S ≈ under an hour · M ≈ half a day · L ≈ multiple days

> **Suggested order:** §0 is the capstone itself and outranks everything else. Then §1 security → the §2 items your demo touches → §3 decisions → §4 last.

---

## Recently completed — AI pipeline configuration and run provenance

Branch `feat/ai-config-flags-plan` (22 commits, not yet merged). This makes the baseline-vs-enhanced comparison *runnable and attributable*; it does not implement any missing objective.

- **The model and all four pipeline enhancements are env-driven.** `AiConfigService` resolves `{ model, temperature, grounding, rag, biasReview, scoreNormalization }` from `GEMINI_MODEL`, `AI_TEMPERATURE`, `AI_GROUNDING_ENABLED`, `AI_RAG_ENABLED`, `AI_BIAS_REVIEW_ENABLED`, `AI_SCORE_NORMALIZATION_ENABLED`. The four booleans default to `true`, reproducing prior behaviour. Documented in `backend/.env.example`.
- **Per-request override** via the `X-Ai-Pipeline-Config` header, gated on `AI_ALLOW_REQUEST_OVERRIDE` (defaults `false`) **and** a Manager/Admin caller. Safe-closed: because these controllers still have no `JwtGuard` (§1), `req.user` is always undefined, so every override is currently rejected with 403.
- **Every AI generation opens an `ai_generation_runs` row** recording the resolved config, model, latency and status, and every generated artifact carries a `generation_run_id` FK. Eight operations — one generation plus one refine route per module across RNA, RNS, initiatives, roadblocks. Migration `Migration20260726120000_AiGenerationRuns.ts`.
- **Score normalization is now independent of bias review.** It previously ran *inside* `reviewBiasScore()` and could not be exercised without it, so two of the four arms were unreachable.
- **A real bug fix:** `temperature` and `maxOutputTokens` were passed at the top level of the `@google/genai` call, where the SDK silently drops them, with an `as any` hiding the type error. See §5 for what changed as a result — the temperature fix is a genuine behaviour change, not a no-op.

**Not done, deliberately:** live verification against a real database and a live Gemini call. Boot the backend, trigger one generation, and confirm a `completed` row appears with the expected `config` snapshot.

---

## 0. Capstone objectives — actual implementation status

Mapped from `Team_07_LaunchUpEnhanced_Software Proposal.pdf` (Part 2) against the code. **This is the section that determines whether you pass**, and several objectives are less built than the scaffolding suggests.

| Objective | Status | Evidence |
|---|---|---|
| **1a** Structured prompt template constraining output to DB fields | 🟡 Partial | `groundPrompt()` appends a fixed instruction string (`ai.service.ts:307`); `GroundedPromptBuilderService` exists. Toggleable via `AI_GROUNDING_ENABLED` |
| **1b** RAG pipeline grounding calls in retrieved context | 🔴 **Not implemented** | See below — no embeddings exist. `AI_RAG_ENABLED` gates the **keyword-overlap** retrieval standing in for it, so toggling that flag measures lexical matching, not semantic search — do not report it as a RAG result |
| **1c** Output validation layer flagging inconsistent recs | 🔴 **Stub** | `output-validator.service.ts` — `validateEach()` returns `isValid: true` for everything with `// TODO`; `flagInconsistencies()` and `markUnverifiable()` have empty bodies |
| **2a** Multi-tier classification schema | 🟢 Built | `TierConfig` entity + `/admin/tiers` UI + threshold logic (`readiness.service.ts:159-180`) |
| **2b** Weighted composite scoring **by sector / business model** | 🔴 Not implemented | Weights are hardcoded constants (`readiness.service.ts:12-28`). `TierConfig.weights` exists as a column but **the scorer never reads it** — the admin UI edits a field with no effect. Nothing is sector-aware. |
| **2c** Gap analysis engine | 🟢 Built | `ReadinessGap` rows with per-dimension shortfall (`readiness.service.ts:225-240`) |
| **3a** OCR of handwritten text | 🟡 Partial | Tesseract.js module + Gemini vision path (`getCapsuleProposalInfoFromImage`, `ai.service.ts:445`); `OcrDocument` stores `fieldConfidence` |
| **3b** Sketch / canvas recognition (BMC, lean canvas fields) | 🟡 Minimal | `sketchDetected`, `sketchConfidence`, `visionLabels` columns exist; no canvas-section mapping logic |
| **3c** Accuracy evaluation (Character Error Rate + SUS) | ⚪ Research task | Not a code deliverable — needs a ground-truth dataset |
| **4a** Controlled bias measurement vs expert ratings | ⚪ Research task | Needs expert-rated profiles; `data/ai-baseline.json` is the intended home |
| **4b** **Adversarial** prompting (find weaknesses *before* scoring) | 🟡 Partial / mislabelled | `reviewBiasScore()` (`ai.service.ts:85-164`) is a **post-hoc review** — "correct the score only if it appears inflated." The objective calls for pre-scoring adversarial prompting that actively hunts unmet criteria. Different mechanism. Toggleable via `AI_BIAS_REVIEW_ENABLED` |
| **4c** Score normalization against a baseline distribution | 🟢 Built | `BaselineService` + `normalizeAiScore()` + `ai_bias_audits` table + `/admin/ai/bias-audits` review UI. Toggleable via `AI_SCORE_NORMALIZATION_ENABLED`, now **independent of 4b** — it previously ran inside `reviewBiasScore()` and could not be exercised without it |

### The critical one — Objective 1b has no RAG

- [ ] 🔴 **OBJECTIVE · L · Implement the RAG pipeline — it currently does not exist**
  Verified across the whole backend:
  - **No embedding model is called anywhere.** No `embedContent`, no `text-embedding`, nothing (grepped `backend/src` entirely).
  - **`vector_embeddings` is read-only.** `RagQueryService` reads it (`rag-query.service.ts:20,31`); **nothing ever writes it.** So `queryVectorDatabase()` always takes the `if (!sourceEmbedding)` branch and returns `lowConfidence: true` with empty arrays — on every single call.
  - **pgvector is installed but unused for search.** `Migration20260528160512_InstallVectorExtension` ran, but similarity is computed in JavaScript by loading every row into memory (`rag-query.service.ts:33-38`).
  - **The path actually wired into generation is keyword matching, not RAG.** `getRelevantRagContexts()` (`ai.service.ts:272`, called at `:688`) scores candidates by **token overlap** (`scoreRagMatch`, `:247`) — a bag-of-words Jaccard score. That is lexical retrieval, not semantic.
  - **The corpus is self-referential.** `RagContext` rows are only written from `startup.service.ts:151` during capsule-proposal parsing, so the system retrieves the startup's *own* prior text. `verifiedFrameworks` and `businessModels` are hardcoded `[]` with TODOs (`rag-query.service.ts:66-67`).

  **Why it matters:** Objective 1 and Research Question 1 are both entirely about RAG. As written you cannot answer RQ1, because there is no retrieval-augmented pipeline to measure against the baseline.
  **Work required:** add an embedding model call, backfill embeddings for startup profiles + a seeded framework corpus, switch similarity to a pgvector `<=>` query, and populate `verifiedFrameworks` / `businessModels` with real business-framework documents.
  *Blocks nothing else technically, but it is the single largest gap between the proposal and the code.*

- [ ] 🔴 **OBJECTIVE · M · Implement the output validation layer (1c)**
  `rna/output-validator.service.ts` is three stub methods. `rna/recommendation-storage.service.ts` is **four stub methods with empty bodies** — including `saveRecommendations()`, so validated recommendations are never persisted.
  **Why it matters:** SRS §2.2 acceptance criteria require schema validation, `null`/`unknown` for unverifiable fields, and a confidence indicator in API responses. The SDD specifies "Validated / Flagged / Low Confidence" badges on each recommendation card. None of that can work against stubs.
  **Note:** `callAiExpectJson()` (`ai.service.ts`) already does schema-checked parsing with a corrective retry — good foundation to build the validator on rather than starting fresh.

### Spec mismatch worth resolving now

- [ ] 🔴 **OBJECTIVE · S · The scored dimensions don't match the specification**
  Proposal, SRS, and SDD all consistently specify five dimensions: **TRL, MRL, RRL, ARL, ORL** (Technology, Market, **Regulatory**, Acceptance, Organizational).
  The code scores: Technology, Market, Acceptance, Organizational, **Investment** (`readiness.service.ts:38-73`).
  So it **omits Regulatory (RRL), which is in the spec**, and **scores Investment (IRL), which is not**. The `ReadinessType` enum has all six.
  **Why it matters:** a panel comparing your SDD to a live demo will see five dimension labels that don't match the document. This is a ~10-line fix and it removes an easy line of questioning.
  **Decision:** align the code to the spec (recommended), or amend the documents to a six-dimension model and justify Investment's inclusion.

- [ ] 🟡 **OBJECTIVE · M · Make composite weights configurable and sector-aware (2b)**
  Objective 2b requires weights that vary "depending on the startup's industry sector and business model type." Today they are five `const` declarations, and `TierConfig.weights` — the column designed to hold them — is never read.
  **Why it matters:** this is a stated specific objective, and the plumbing is already half-there.
  **Work:** read weights from `TierConfig`, add a sector field to `Startup`, and key weight sets by sector. *Do this together with the clamp fix in §3.*

---

## 1. Security issues

### P0 — do these first

- [ ] 🔒 **SEC · S · Remove the hardcoded JWT secret fallback**
  `backend/src/auth/auth.module.ts:18` and `backend/src/auth/strategy/jwt.strategy.ts:19` both do `config.get('JWT_SECRET') || 'launchup-dev-secret'`.
  **Why it matters:** if `JWT_SECRET` is unset in a deployed environment, every token is signed with a string that is committed to a public repo — anyone can forge an Admin token. The `||` fallback means this fails *silently*, with no boot error.
  **Fix:** throw on startup if `JWT_SECRET` is missing. Also decide whether `frontend/src/hooks.server.ts:45` should keep its matching fallback (it must not, for the same reason).
  *No dependencies. Do this one first — it's ten minutes.*

- [ ] 🔒 **SEC · M · Add `JwtGuard` to the entire coaching core — currently 100% public**
  `backend/src/rna/rna.controller.ts`, `backend/src/rns/rns.controller.ts`, `backend/src/initiative/initiative.controller.ts` have **no `@UseGuards` and no guard import anywhere in the file**. That is 21 routes — full CRUD plus all the AI-generation endpoints.
  `backend/src/roadblock/roadblock.controller.ts` is nearly as bad: only `@Delete(':id')` is guarded (`:43-44`), leaving 5 of 6 routes open.
  **Why it matters:** an unauthenticated request can read, create, edit, and delete every startup's RNA, next steps, initiatives, and roadblocks. It can also trigger `POST /rns/generate-tasks` etc., which spend your Gemini quota. This is the single largest hole in the app.
  **Fix:** class-level `@UseGuards(JwtGuard)` on all four controllers.
  *Blocks the ownership work below — add guards before adding ownership checks.*

- [ ] 🔒 **SEC · S · Un-comment the guard on chat history**
  `backend/src/chat_history/chat-history.controller.ts:5` — `// @UseGuards(JwtGuard)`.
  **Why it matters:** all four endpoints expose full AI conversation transcripts for any RNA/RNS/initiative/roadblock id, unauthenticated. These transcripts contain the startup's business details.
  *Same change as the item above; do them together.*

- [ ] 🔒 **SEC · S · Guard the file-upload endpoints**
  `backend/src/upload/upload.controller.ts:15` — no guard on `POST /upload/single` or `POST /upload/multiple`.
  **Why it matters:** anyone on the internet can upload arbitrary files (up to 10 at a time) into your DigitalOcean Spaces bucket at your cost. There is also no file-type or size validation.
  **Fix:** add `JwtGuard`, plus a MIME/extension allowlist and a size cap.

### P1 — before any real deployment

- [ ] 🔒 **SEC · M · Add ownership checks to startup detail endpoints (IDOR)**
  `backend/src/startup/startup.controller.ts:135-137` (`GET /startups/:startupId`) and every sibling route are `JwtGuard`-only. Row-level filtering exists **only** in the list endpoint, `StartupService.getStartups()` (`backend/src/startup/startup.service.ts:43-82`).
  **Why it matters:** any logged-in founder can read any other startup's full record — capsule proposal, members, waitlist messages — just by changing the id in the URL. Same for the readiness, RNA, and RNS endpoints once they're behind a guard.
  **Fix:** a reusable guard or service helper that asserts the requester owns / is a member of / mentors the startup, unless their role is Manager or Admin.
  *Depends on the guard work above.*

- [ ] 🔒 **SEC · S · Restrict the admissions endpoints to Manager/Admin**
  `POST /startups/:id/approve-applicant`, `PATCH /:id/waitlist-applicant`, `POST /:id/appoint-mentors`, `PATCH /:id/change-mentor`, `PATCH /:id/mark-complete` are all `JwtGuard`-only (`backend/src/startup/startup.controller.ts:30`).
  **Why it matters:** any authenticated founder can approve their own application, assign themselves a mentor, and mark themselves complete. The UI hides these, but the API doesn't.
  **Fix:** a `RolesGuard` + `@Roles(Role.Manager, Role.Admin)` decorator. `AdminGuard` (`backend/src/auth/guard/admin.guard.ts`) is a good template — generalize it rather than copying it.

- [ ] 🔒 **SEC · S · Guard the remaining unauthenticated modules**
  All public today: `backend/src/readiness/readiness.controller.ts:4`, `backend/src/progress/progress.controller.ts:4`, `backend/src/elevate/elevate.controller.ts:14`, `backend/src/ocr/ocr.controller.ts:4`, `backend/src/ai/baseline.controller.ts:4`, `backend/src/ai/ai-metrics.controller.ts:4`.
  **Why it matters:** leaks readiness scores and progress reports; `POST /ai/baseline/update` lets anyone rewrite the bias-normalization baseline that all AI scoring depends on.
  **Fix:** `JwtGuard` on all; `AdminGuard` additionally on `POST /ai/baseline/update`.

- [ ] 🔒 **SEC · S · Delete the raw-SQL debug endpoints**
  `backend/src/startup/startup.controller.ts:62` (`GET /startups/debug-evals`) and `backend/src/admin/admin.controller.ts:157` (`GET /admin/tiers/check-evals`) both execute hand-written SQL via `em.getConnection().execute()`.
  **Why it matters:** the first is reachable by any logged-in user and dumps every startup's score. Both are exactly the kind of thing a capstone panel will spot.
  **Fix:** delete both. Neither is called from the frontend (verified).

- [ ] 🔒 **SEC · S · Align cookie lifetime with token lifetime**
  Cookie `maxAge: 60 * 5 * 60` = **5 hours** (`frontend/src/routes/(auth)/login/+page.server.ts:54`, mirrored in `(auth-admin)/admin-login/+page.server.ts:57`) vs JWT `expiresIn: '24h'` (`backend/src/auth/auth.module.ts:19`).
  **Why it matters:** two different session lengths, neither intentional. The 24h token stays valid for 19 hours after the browser stops sending it — so a leaked token outlives the visible session. Also see the matching bug in §2.
  **Fix:** pick one duration and derive the other from it.

- [ ] 🔒 **SEC · S · Fix `@GetUser('sub')`, which silently ignores its argument**
  `backend/src/auth/decorator/get-user.decorator.ts:5-7` returns the whole `request.user` regardless of the key passed. So `updateProfile(userId, …)` at `backend/src/user/user.controller.ts:33` actually receives a full `User` entity, not a number.
  **Why it matters:** it currently works only because MikroORM coerces an entity to its PK inside a filter. The signature lies, the types lie, and the next person to use this decorator with a key will get a silent wrong value.
  **Fix:** honour the `data` argument (`return data ? request.user?.[data] : request.user`) and correct the call site — note `sub` is not a property of the `User` entity, so it should be `'id'`.

- [ ] 🔒 **SEC · S · Reconsider client-side role checking on the admin login**
  `frontend/src/routes/(auth-admin)/admin-login/+page.server.ts:41-49` base64-decodes the JWT payload and rejects non-Admins *without verifying the signature*.
  **Why it matters:** it runs server-side so it isn't directly exploitable, and `/admin/*` is separately guarded — but it reads as "we trust an unverified JWT," and a reviewer will flag it. Verify with `jose` (already a dependency) or just call a `/auth/me` endpoint.

---

## 2. Broken functionality

Each of these was verified by reading **both** sides of the call.

- [ ] 🐞 **BUG · M · Readiness-level rubric submission posts to two endpoints that don't exist**
  `frontend/src/routes/(app)/startups/[id]/readiness-level/+page.server.ts:64` posts to `/readiness-level-criterion-answers/bulk-create/` and `:78` to `/startup-readiness-levels/bulk-create/`. **Neither route exists anywhere in the backend.** The whole block sits in a `try` whose `catch` is empty (`:104`), so it fails silently, and on "success" it redirects to `/mentor/startups/qualified/:id` — also not a route.
  **Why it matters:** this is the mentor's core task and the gate for the entire coaching chain (`allow-rnas` depends on `StartupReadinessLevel` rows existing). If the working path is really `POST /readinesslevel/startup/:startupId/rate`, this legacy action is dead weight that will burn you in a demo.
  **Fix:** confirm which path the UI actually uses, then rewrite or delete this action. Remove the empty `catch` either way — silent failure is what hid this.
  *Highest-value item in this section.*

- [ ] 🐞 **BUG · S · Removing a team member uses the wrong verb and payload shape**
  `frontend/src/routes/(app)/startups/[id]/overview/members/+page.svelte:155` calls `axiosInstance.delete('/startups/remove-member/:memberId/')` with `{startupId}` in the body. The backend is `@Post('remove-member')` reading `userId` **and** `startupId` from the body (`backend/src/startup/startup.controller.ts:97-103`).
  **Why it matters:** wrong method *and* wrong shape — removing a member always fails.
  **Fix:** `axiosInstance.post('/startups/remove-member', { userId: memberId, startupId })`.

- [ ] 🐞 **BUG · S · Assessment preview dialog calls a non-existent `/fields` route**
  `frontend/src/lib/components/dashboard/sub/AssessmentPreviewDialog.svelte:30` fetches `/assessments/:id/fields`. No `fields` route exists in `backend/src/assessment/`.
  **Why it matters:** this component *is* mounted — `QualifiedDialog` → `/applications` (Manager) and `ApprovalDialog` → `PendingDialog`/`WaitlistedDialog`. So a Manager opening an applicant's assessment preview gets an empty or erroring dialog.
  **Fix:** point at `GET /assessments/:id`, or add the endpoint if per-field data is genuinely needed.

- [ ] 🐞 **BUG · S · Re-uploading a capsule proposal during edit hits a commented-out endpoint**
  `frontend/src/routes/(app)/startups/+page.server.ts:63` calls `PATCH /startups/:id/with-capsule-proposal`. The handler is commented out at `backend/src/startup/startup.controller.ts:231`.
  **Why it matters:** editing a startup *and* attaching a new proposal PDF silently fails. Editing without a file works (different branch), so this is easy to miss in testing.
  **Fix:** either restore the handler or route the file through `POST /startups/parse-capsule-proposal` + `PATCH /startups/:id/capsule-proposal`.

- [ ] 🐞 **BUG · S · Admin "create assessment type" posts to a GET-only route**
  `frontend/src/routes/(app)/admin/assessments/+page.server.ts:47` does `POST /assessments/types`; the backend only declares `@Get('types')` (`backend/src/assessment/assessment.controller.ts:41`).
  **Why it matters:** the action always 404s. Note `AssessmentType` is a **TypeScript enum** (`backend/src/entities/enums/assessment-type.enum.ts`), not a table — so "creating a type" at runtime isn't possible without a schema change. This may be a ❓SCOPE item in disguise.
  **Fix:** decide whether types are fixed (remove the UI) or dynamic (needs a new table + endpoints — that's L, not S).

- [ ] 🐞 **BUG · S · Elevate page queries a non-existent `/startup-rna/` endpoint**
  `frontend/src/routes/(app)/startups/[id]/overview/elevate/+page.svelte:71` calls `getData('/startup-rna/?startup_id=…')`. The real prefix is `/rna` (`backend/src/rna/rna.controller.ts:15`).
  **Why it matters:** the RNA panel on the Elevate tab never populates.
  **Fix:** change to `/rna?startupId=…` to match `@Get()` + `@Query('startupId')`.

- [x] 🔴 **BUG · M · AI-generated RNS are persisted but no screen can ever display them** — **FIXED** (`fix/rns-generation-bugs`, see DONE note below)
  Confirmed live: generation succeeds, `ai_generation_runs` records a `completed` row, and `GET /rns/?startupId=10` returns six well-formed rows — yet the page renders nothing.
  The RNS page has exactly two display surfaces and **both exclude AI output**: the kanban columns (`frontend/src/routes/(app)/startups/[id]/rns/+page.svelte:384-392`) and the table (`:690`) each filter `isAiGenerated === false`. Generated rows are written with `isAiGenerated: true`, so neither can ever show them.
  The *acceptance* half exists — `addToRNS()` (`:187-228`) PATCHes a row to `isAiGenerated: false`, which is what makes it appear, and the `card` snippet (`:490`) already takes an `ai` flag and an `addToRns` handler that `RnsCard` renders as an add button. **What's missing is the pending-AI review list that would invoke it.** The snippet is only ever passed to `KanbanBoardNew` (`:670`), whose columns are themselves `isAiGenerated === false`, so the `ai = true` variant is unreachable.
  **This is not new.** `git diff master..HEAD -- frontend/` for the AI-config branch is empty, and `getStartupRns` was not modified. Generation has presumably always written rows nothing displays.
  **Why it matters:** every AI feature in the capstone demo — Objectives 1 and 4 both — produces output the user cannot see. It also silently inflates the DB: each generation adds rows that can never be reached or cleaned up from the UI.
  **Same pattern, verify each:** `rna/+page.svelte:77`, `initiatives/+page.svelte:170,232,254,494,857`, `roadblocks/+page.svelte:657`, `progress-report/+page.svelte:220,259,299` all filter `isAiGenerated === false` too. Check whether *any* of them has a working review surface — if one does, copy it.
  **DECIDED (2026-07-26): write generated rows with `isAiGenerated: false`** so they appear in the board and table alongside manual rows. Chosen over a dedicated AI-suggestions panel or a post-generation review dialog.
  **Why this is now safe:** the usual objection is that flipping the flag destroys the ability to distinguish AI output from manual entry. That stopped being true with the provenance work — every AI-generated row carries a `generation_run_id` FK to `ai_generation_runs`, which records the operation, model and full pipeline config. Provenance no longer depends on `isAiGenerated`, so the flag becomes purely a display concern. Queries that need "AI rows only" should join on `generation_run_id IS NOT NULL` instead.
  **What this trades away, knowingly:** the human-in-the-loop accept/discard step the SRS describes. Generated rows go live immediately, with no review gate. If a panel is wanted later, the pieces are still there — `addToRNS()` is the accept action, and the `card` snippet's `ai` variant already renders an add button.
  **DONE (`fix/rns-generation-bugs`):** `rns.service.ts` `generateTasks` and `rna.service.ts` `generateRNA` now set `isAiGenerated = false`. `initiative.service.ts` `generateInitiatives` and `roadblock.service.ts` `generateRoadblocks` turned out to already set it `false` at both their creation sites — not verified when this note was first written. All four generation paths now surface without any frontend change. Not yet re-verified: `progress-report/+page.svelte:299` additionally filters `status === 7`, so that view may still look empty for unrelated reasons — check separately.
  **Live-verified (2026-07-26, Neon + live Gemini):** RNS generation persisted row id 30 with `isAiGenerated = false` **and** `generation_run_id = 5`, so it passes the frontend filter while remaining provably AI. Roadblock and initiative generation likewise persisted `false` with a `generation_run_id`. The RNA path is **not** live-verified — see the caveat below.

  ⚠️ **Two findings from live verification that qualify this decision:**
  1. **The fix is not retroactive, and the backlog stays invisible.** 22 `rns` rows and 24 `rna` rows already in the DB have `is_ai_generated = true` with `generation_run_id IS NULL` (they predate the provenance work). They still fail the frontend's `isAiGenerated === false` filter, so **flipping the flag surfaces only newly generated rows** — the existing backlog remains permanently unreachable from the UI. If those rows matter, they need a one-off backfill (`UPDATE … SET is_ai_generated = false`); if they don't, they should be deleted.
  2. **`generation_run_id IS NOT NULL` is *not* a complete "AI rows only" predicate.** This section previously recommended it as the replacement for `isAiGenerated`. It misses all 46 legacy AI rows above, which have the flag but no run FK. The two populations are disjoint: legacy AI rows have `is_ai_generated = true, generation_run_id IS NULL`; new AI rows have `is_ai_generated = false, generation_run_id IS NOT NULL`. Until the legacy rows are backfilled or purged, a correct "all AI rows" query needs **both**: `WHERE generation_run_id IS NOT NULL OR is_ai_generated = true`.

  **RNA path not live-verified — blocked, not skipped.** No startup in the shared Neon DB can generate an RNA without first mutating data: startups 7/10/12/14 have all 6 readiness levels *and* all 6 RNAs (nothing missing to generate), 13/15 have a capsule proposal but zero `startups_readiness_level` rows (nothing to generate against), and 8/9 have no capsule proposal at all. Forcing it requires either deleting an existing RNA — which irreversibly loses its generated text, since regeneration produces different content — or seeding readiness levels. Both are writes to shared team data. The change itself is a one-line flag flip identical to the RNS one that *was* verified end-to-end.

- [x] 🐞 **BUG · S · `targetLevelScore` is `-1` on every RNS row** — **FIXED & live-verified** (`fix/rns-generation-bugs`)
  `Rns.getTargetLevelScore()` now returns `this.targetLevel.level` directly; the stale hardcoded id→level map in `backend/src/utils.ts` (the only caller) has been deleted along with the file.
  **Live-verified (2026-07-26):** `GET /rns?startupId=10` — all 6 previously-broken rows now return real levels, 0 rows return `-1`. The live data confirms the diagnosis exactly: id 9 = *Regulatory* level 3 (old map claimed Technology 9), id 11 = *Technology* level 8 (map claimed Market 2), id 23 = *Technology* level 3 (map claimed Acceptance 5), and id 71 is past the map's 54-entry ceiling entirely.

- [ ] 🐞 **BUG · S · Approve-applicant is two non-transactional calls**
  `frontend/src/routes/(app)/applications/+page.svelte:80-113` fires `approve-applicant`, then `appoint-mentors`, with no rollback between them.
  **Why it matters:** if the second call fails, the startup is `QUALIFIED` with no mentor — it lands in a state no screen is designed to show, and the Manager gets no error.
  **Fix:** either a single backend endpoint that does both in one `em.transactional()`, or handle the partial failure explicitly in the UI.

- [ ] 🐞 **BUG · S · `GET /readiness/:startupId` writes to the database on every read**
  `backend/src/readiness/readiness.service.ts:196-241` persists a new `readiness_evaluations` row plus one `readiness_gaps` row per dimension on every call.
  **Why it matters:** the table grows by 6 rows per page view. Any "evaluation history" feature built on it will be meaningless noise, and `readinessEvaluations` is eagerly populated in several `getStartups` queries — so payloads grow unboundedly too.
  **Fix:** move persistence to the explicit `POST /readiness/score` endpoint and make the `GET` pure. *(Check `ReadinessDashboard.svelte` — it already calls `/readiness/score`, so the write may simply be redundant.)*

- [ ] 🐞 **BUG · S · Logout clears a `Refresh` cookie that is never set**
  `frontend/src/routes/(auth)/logout/+page.server.ts:19-22`. The refresh interceptor in `frontend/src/lib/axios.ts:13-45` is fully commented out and no `/tokens/refresh/` endpoint exists.
  **Why it matters:** harmless on its own, but it implies a refresh flow that doesn't exist. Combined with the 5h cookie, users are silently logged out mid-session with no renewal path.
  **Fix:** delete the dead cookie clear, and decide whether refresh tokens are in scope (❓SCOPE if yes — that's M–L).

- [x] 🐞 **BUG · S · Bulk initiative generation sets `requestedStatus`, single generation doesn't** — **FIXED & live-verified** (`fix/rns-generation-bugs`)
  `initiative.service.ts` `generateInitiatives()` single-`rnsId` branch now also sets `initiative.requestedStatus = 1`, matching the bulk branch.
  **Live-verified:** `POST /initiatives/generate-initiatives {"rnsId":30}` (the single-id branch specifically) created initiative id 14 with `requestedStatus: 1`, confirmed persisted via `GET /initiatives?startupId=10`.

- [x] 🐞 **BUG · S · `generateRoadblocks` always returns `[]` despite persisting rows correctly** — **FIXED & live-verified** (`fix/rns-generation-bugs`)
  Added `roadblocks.push(roadblock);` after `persistAndFlush` inside the loop in `roadblock.service.ts`.
  **Live-verified:** `POST /roadblocks/generate-roadblocks {"no_of_roadblocks_to_create":2}` returned a 2-element array (previously always `[]`), both rows persisted.

---

## 3. Incomplete features — need a scope decision

These are **not** simple code fixes. Each needs a *fix it / cut it / leave it hidden* call from you. For a capstone, "cut it cleanly" is usually the stronger answer than "leave it half-built."

- [ ] ❓ **SCOPE · L · Analytics and Cohorts pages have no backend at all**
  `frontend/src/routes/(app)/analytics/+page.svelte:16,31,46` and `.../cohorts/+page.svelte:16,31,46` call `/analytics/startups/`, `/analytics/elevate-logs/`, and `/cohorts`. **There is no analytics controller and no cohorts controller in the backend** — and no cohort entity either. Both pages are ~190 lines of finished UI, Manager-gated, and commented out of the nav (`frontend/src/lib/access.ts:104-113`).
  **Decision:** *Cut* (delete both routes + nav entries — recommended, cohorts are a whole domain concept that doesn't exist), or *Fix* (build a cohort entity, controller, and aggregation service — this is genuinely large).

- [ ] ❓ **SCOPE · M · `ManageAssessmentTypes.svelte` is orphaned and every call in it is broken**
  `frontend/src/lib/components/admin/assessment/ManageAssessmentTypes.svelte` — **not imported anywhere** (verified). All 8 fetches target `/assessment/*` (singular); the real prefix is `/assessments`, and no `fields` routes exist: `:39`, `:56`, `:64`, `:75`, `:85`, `:108`, `:114`, `:126`.
  **Decision:** *Cut* (delete the file — recommended), or *Fix* (needs the dynamic assessment-type work from §2 first).
  *Related to the "create assessment type" bug above — decide both together.*

- [ ] ❓ **SCOPE · S · Regulatory readiness is collected but never scored**
  `ReadinessService` maps only 5 of the 6 readiness types (`backend/src/readiness/readiness.service.ts:38-73`): Acceptance→team, Market→market, Technology→product, Organizational→traction, Investment→funding. **Regulatory (`ReadinessType.R`) has no weight and no dimension.**
  **Why it matters:** founders answer Regulatory questions in the application and mentors grade Regulatory rubrics, and none of it affects the score. If a panel asks "why six dimensions but five weights?", there needs to be an answer.
  **Decision:** *Fix* (add a 6th dimension and rebalance weights so they still sum to 1.0), or *Leave + document* (state explicitly in the SDD that Regulatory is tracked but not scored, and say why).

- [ ] ❓ **SCOPE · S · Readiness scores are clamped to 0–5 but levels run 1–9**
  `backend/src/readiness/readiness.service.ts:129` — `Math.min(5, …)`, while `readiness_levels.level` is populated 1–9 and the rubric UI renders 9 levels.
  **Why it matters:** a startup at level 9 scores identically to one at level 5. That directly undermines "Enhance Startup Readiness Differentiation," which is objective 2.3 in `docs/SRS.md`.
  **Decision:** *Fix* (clamp to 9 and divide by 9 — small change, but it shifts every tier boundary, so `tier_configs` needs revisiting too), or *Leave + document* the 5-level design intent.
  *If you fix this, re-check the §1 tier thresholds and any seeded `tier_configs`.*

- [ ] ❓ **SCOPE · S · Three finished features are hidden from navigation**
  Commented out in `frontend/src/lib/access.ts`: Progress Report (`:36-40`), Analytics (`:104-108`), Cohorts (`:109-113`). Progress Report is fully working — UI plus `GET /progress/:startupId/progress-report`.
  **Decision:** Progress Report looks like a *re-enable* (one line, and it works). Analytics/Cohorts fold into the first item in this section.

- [ ] ❓ **SCOPE · M · "Rate applicant" was designed but never built**
  `frontend/src/lib/components/admin/PendingTab.svelte:105-107` — a commented-out call to `/startups/:id/rate-applicant/` with the note *"COMMENT FOR NOW, NEED TO IMPLEMENT BACKEND FIRST."* The `RatedTab` component and a `rated` tab in `/applications` both exist.
  **Why it matters:** there's a visible "rated" state in the admissions UI with no way to reach it.
  **Decision:** *Cut* the rated tab and the three orphaned Tab components, or *Fix* by building the scoring endpoint.

- [ ] ❓ **SCOPE · M · `overview` module is an empty shell**
  `backend/src/overview/overview.controller.ts` declares `@Controller('overview')` with **zero routes**, yet the module is imported in `backend/src/app.module.ts:69`. The frontend's four Overview tabs get their data from `/startups/:id` instead.
  **Decision:** *Cut* the module (recommended — the tabs work without it), or *Fix* by moving the overview aggregation here.

- [ ] ❓ **SCOPE · L · No refresh-token flow**
  See the logout bug in §2. Deliberate omission or missing feature?
  **Decision:** *Leave* (document that sessions are fixed-length — fine for a capstone), or *Fix* (refresh endpoint + rotation + interceptor).

---

## 4. Cleanup / tech debt

- [ ] 🧹 **DEBT · S · Delete three orphaned admin Tab components**
  `frontend/src/lib/components/admin/PendingTab.svelte`, `AcceptedTab.svelte`, `RatedTab.svelte` — **none are imported anywhere** (verified). `RatedTab.svelte` also calls `/readinesslevel/:id/calculator-final-scores/`, which doesn't exist (the real route is `/startups/:id/calculator-final-scores`).
  *Coupled to the "rate applicant" scope decision — resolve that first.*

- [ ] 🧹 **DEBT · S · Delete `ReadinessCard.svelte`**
  `frontend/src/lib/components/dashboard/ReadinessCard.svelte` — orphaned (verified). Note `ReadinessDashboard.svelte`, which it wraps, *is* used in three places, so delete only the card.

- [ ] 🧹 **DEBT · S · Drop three unused entities and their tables**
  Never referenced by any service or controller (verified across the whole backend):
  - `MentorAssignment` (`backend/src/entities/mentor-assignment.entity.ts`) — mentor assignment actually writes to the `startups`↔`users` pivot (`backend/src/startup/startup.service.ts:942-963). Misleading, because the entity looks like the source of truth and even has an `assignedBy` audit field the real path lacks.
  - `ConsultationRequest` (`consultation-request.entity.ts`)
  - `ScoringGuide` (`scoring-guide.entity.ts`)
  **Fix:** delete the entities and add a migration to drop the tables. *If the `assignedBy`/`isActive` audit trail is actually wanted, that's a ❓SCOPE item instead — switch mentor assignment over to this entity.*

- [ ] 🧹 **DEBT · S · Consolidate duplicate enums and tables**
  - `RnsStatus` (integer-backed, `backend/src/entities/enums/rns.enum.ts`) and `Status` (string-backed, `enums/status.enum.ts`) define the same seven states. `Status` also carries a Cebuano comment (`// basin pwede sa RNS…`) that should go before submission.
  - `recommendations` (`recommendation.entity.ts`, written by `rna/recommendation-storage.service.ts`) and `ai_recommendations` (`ai-recommendation.entity.ts`, written by `ai/ai.service.ts:176`) overlap heavily.
  **Fix:** pick one of each and migrate.

- [ ] 🧹 **DEBT · S · Remove committed scratch files**
  All tracked in git: `backend/test-login.js` (0 bytes), `frontend/fix-page.cjs`, `frontend/src/routes/(app)/admin/assessments/+page.svelte.backup`, `frontend/src/routes/(app)/admin/assessments/temp_fix.txt`, `chumcheck_2025-03-04_025337.sql` (561 KB).
  Also untracked but sitting in the repo root: `backend.zip` (116 MB) and `frontend.zip` (84 MB) — add to `.gitignore` or delete.
  **Why it matters:** `.backup` and `temp_fix.txt` files next to the code they patch are the first thing a reviewer notices.

- [ ] 🧹 **DEBT · S · Purge `chumcheck` references**
  `scripts/reset_db.sh`, `scripts/reset_db.ps1`, `scripts/delete_db.sh` all target a database named `chumcheck` with user `postgres`, while `docker-compose.yml` creates `launchup_db` / `launchup_user`.
  **Why it matters:** running any of these scripts does nothing to your actual dev database — or worse, drops an unrelated one. Update or delete them.

- [ ] 🧹 **DEBT · M · Resolve migrations vs. `updateSchema()`**
  `backend/src/main.ts:292` calls `orm.getSchemaGenerator().updateSchema()` on every boot, while 93 migration files sit in `backend/src/migrations/`.
  **Why it matters:** the migrations are effectively inert; the auto-sync is what shapes the dev DB. Schema drift is invisible, and a migration you write won't obviously do anything. Auto-sync on boot is also unsafe against a production database.
  **Fix:** pick one strategy. For a capstone, gating `updateSchema()` behind `if (process.env.NODE_ENV !== 'production')` is a reasonable compromise.

- [ ] 🧹 **DEBT · S · Move demo seeding out of `bootstrap()`**
  `backend/src/main.ts:16-268` — ~250 lines of seeding logic (including a large commented-out block at `:97-148`) runs on every startup, with `console.log` output per record.
  **Fix:** move to a seeder script (`backend/seed-*.js` already exist) invoked by an npm script, and gate it on a `SEED_DEMO` env flag.

- [ ] 🧹 **DEBT · S · Remove `console.log` debugging from request paths**
  e.g. `backend/src/startup/startup.controller.ts:216-226` logs full request and response bodies on every capsule-proposal PATCH; `frontend/src/routes/(app)/admin/+page.server.ts:14,19` logs on every admin page load.
  **Why it matters:** the backend one writes startup proposal contents to logs.

- [ ] 🧹 **DEBT · S · Fix the doubled route segment `/startups/startups`**
  `backend/src/startup/startup.controller.ts:31` (`@Controller('startups')`) + `:38` (`@Get('/startups')`).
  **Why it matters:** cosmetic, but confusing — and note `backend/src/assessment/startup-assessment.controller.ts:16` *also* claims the `startups` prefix, so route ownership is already split across two files.
  **Fix:** change to `@Get()`; update the two frontend callers (`(app)/startups/+page.server.ts:11`, `(app)/startups/+page.svelte`).

- [ ] 🧹 **DEBT · S · Delete commented-out dead code**
  Largest blocks: `backend/src/startup/startup.controller.ts:231-310` (the `with-capsule-proposal` handler — resolve the §2 bug first), `frontend/src/lib/axios.ts:13-45` (refresh interceptor), `backend/src/app.controller.ts:75-89`, `frontend/src/routes/(app)/startups/[id]/+layout.server.ts:12-40`.

- [ ] 🧹 **DEBT · S · Add `README.md` corrections**
  `README.md:29` lists `DISQUALIFIED` as a qualification status; the enum has no such value — it has `COMPLETED` (`backend/src/entities/enums/qualification-status.enum.ts`). The README also doesn't mention that `JWT_SECRET` must match across both `.env` files, which is the most common setup failure.

---

## 5. Infrastructure decisions (open questions)

Neither the SRS nor the SDD names a storage vendor, a specific model version, or Docker — so these are genuinely your call. Recommendations below.

- [ ] ❓ **SCOPE · S · Pick a file-storage provider to replace DigitalOcean Spaces**
  `backend/src/upload/upload.service.ts:24-45` reads five `DO_SPACES_*` vars; none are set, so `enabled = false` and uploads 503 (`:52`). The SDD only ever says *"Object storage (file storage service)"* (p.48) — **no vendor is specified**, so you're free.
  **Key fact:** the service uses the generic `@aws-sdk/client-s3` `S3` class with a configurable `endpoint`, so **any S3-compatible provider is a drop-in** — no code change beyond env values.
  **Recommendation: Cloudflare R2** — S3-compatible, 10 GB free, zero egress fees, and egress is what bites you when a dashboard re-renders stored images. **Supabase Storage** is the easier-signup alternative (1 GB free, no card). Avoid local-filesystem storage: Vercel and Render have ephemeral disks, so uploads vanish on redeploy.
  **Also do:** rename `DO_SPACES_*` → `S3_*` (or `STORAGE_*`) so the config isn't misleadingly vendor-specific, and update `backend/.env.example`.

- [ ] ❓ **SCOPE · M · Move off `gemini-2.5-flash-lite` to task-appropriate models**
  **Partially addressed:** the model is no longer a hardcoded literal — `AiConfigService` (`backend/src/ai/ai-config.service.ts`) now resolves `model` and `temperature` from `GEMINI_MODEL` / `AI_TEMPERATURE` env vars (see `backend/.env.example`), and every call site in `ai.service.ts` reads `this.aiConfig.defaults.model` / `.temperature` instead of a literal, so switching models is now an env change, not a code change. `temperature` is also now applied consistently across call sites (defaulting to `0`), which resolves the "pin `temperature: 0` on all scoring calls" ask two paragraphs down.
  **Still not done:** the *default* remains the same weak `gemini-2.5-flash-lite` tier for every call, and there is still only one model for every task — the per-task tiering recommendation below (Pro for scoring/bias, Flash for generation, a real embedding model for RAG) requires an actual env/config value change plus verifying vision quality, not just code.
  **Why it matters for *this* project specifically:** Objectives 1 and 4 are about hallucination and leniency bias, and the lite tier is the most susceptible to both — weakest instruction-following, weakest reasoning, most sycophantic. Objective 3 needs handwriting and sketch understanding, which is exactly where a lite vision model is weakest. A weak model doesn't just degrade UX here; it **biases your research results against your own hypothesis**.
  **Recommendation — tier by task rather than one model everywhere:**
  - Scoring, bias review, adversarial re-prompting (Obj. 1 + 4) → **Gemini 2.5 Pro**, low temperature, thinking enabled
  - RNA/RNS generation and refinement chat → **Gemini 2.5 Flash**
  - Handwriting / sketch vision (Obj. 3) → **Gemini 2.5 Flash or Pro**
  - RAG embeddings → **`gemini-embedding-001`** — currently missing entirely (see §0)
  Verify current model IDs against <https://ai.google.dev/gemini-api/docs/models> before wiring; the family moves fast.
  **Do at the same time:** switch structured calls to `responseMimeType: 'application/json'` + `responseSchema` instead of regex-stripping ```` ```json ```` fences (`extractJsonPayload`, `ai.service.ts:338`) — still unaddressed. That directly satisfies the SRS §2.2 criterion "all AI-generated structured outputs are validated against expected schemas." ~~Also pin `temperature: 0` on all scoring calls — only one call site sets it today (`:303`)~~ — **done**: `AI_TEMPERATURE` now defaults to `0` and is applied via `AiConfigService` across all call sites, satisfying SRS §2.3's reproducibility requirement. **Note this is a real behaviour change, not a no-op.** That one call site passed `temperature` at the *top level* of the request, where the SDK dropped it exactly as it dropped `maxOutputTokens` — so every Gemini call in this codebase previously ran at the API default temperature, never at `0`. Baseline-arm results gathered before this change are therefore not sampling-comparable with results gathered after it.

- [ ] ❓ **SCOPE · M · Decide whether Gemini calls should have output caps at all, and pick values per call site**
  **No call in `ai.service.ts` currently sends `maxOutputTokens`, and none ever effectively did.** Before the AI-config work, `callAiExpectJson` passed `maxOutputTokens: 1024` at the *top level* of the `@google/genai` request — but `GenerateContentParameters` only accepts `model`, `contents`, and `config`, so the SDK silently dropped it (an `as any` hid the type error). The other calls (`getCapsuleProposalInfo`, `getCapsuleProposalInfoFromImage`, `generateStartupAnalysisSummary`, and the four `refine*` methods) passed no cap at all. So every Gemini call in this codebase has always been uncapped.
  **Why it is now explicitly absent:** moving sampling params into `config` (which was the point — it is what made `temperature` take effect) would have *newly enforced* those caps for the first time. That is a user-visible regression, not a no-op: `getCapsuleProposalInfo` extracts eight full prose fields from a whole document, and truncation at 1024 tokens makes `JSON.parse` throw at `startup/startup.service.ts:355`, whose catch at `:356` sets `parsedPayload = {}` — the founder gets a completely blank extraction review screen with only a `console.error` in the logs. The caps were therefore removed rather than moved, so default behaviour matches the base commit exactly.
  **The open decision:** if the team *wants* caps (cost control, latency bounds, or forcing concise output), choose a value per call site from the actual prompt shape — the capsule extraction and image OCR paths need far more headroom than a three-sentence summary — and add a test per site that a realistic full-length response is not truncated. Do not reintroduce a single blanket number.
  **Note if you do add caps:** Gemini 2.5 models bill and count *thinking* tokens against `maxOutputTokens`, so a cap sized to the visible JSON alone can truncate before the model emits any answer at all.
  **Related under-count in the provenance data:** `ai_generation_runs.completion_tokens` sums only `candidatesTokenCount` (`accumulateTokenUsage`, `ai.service.ts:352`). `thoughtsTokenCount` is billed separately and is *not* included in that figure, so recorded output spend is a floor, not a total, on any thinking-enabled model. Fold it in before using these columns for a cost analysis.

- [ ] ❓ **SCOPE · S · Verify the `GEMINI_API_KEY` format**
  The configured key starts with `AQ.Ab8RN6…`. Google AI Studio keys normally begin with `AIzaSy`. Confirm this is a valid AI Studio key (and not a Vertex/OAuth credential, which `@google/genai` would need different auth for) — a bad key here would make every AI feature fail at demo time.

- [ ] ❓ **SCOPE · S · Drop Docker, and give each developer a Neon branch instead**
  `docker-compose.yml` only ever provided local Postgres, and `backend/.env` now points at Neon (`ep-still-salad-…aws.neon.tech`). **Neither the SRS nor the SDD mentions Docker anywhere** — there is no requirement to satisfy.
  **Recommendation: don't adopt it.** Nothing in your remaining work is containerization-shaped (it's AI and scoring logic), Vercel/Render don't build from your compose file, and it's friction for a 5-person Windows team.
  **But fix the real problem it masks:** `backend/src/main.ts:292` runs `updateSchema()` and seeds demo data **on every boot**, and all five of you now point at the *same* Neon database. Every `pnpm dev` mutates shared schema and re-inserts demo rows. Use **Neon branching** (one branch per developer, free tier supports it) so everyone gets an isolated database from the same provider. Combine with gating the auto-sync behind `NODE_ENV !== 'production'` (see §4).
  **Then:** delete `docker-compose.yml` or mark it clearly unused, and correct `README.md` / `CLAUDE.md` / `PROJECT_OVERVIEW.md` §8, which all still describe the Docker path.

---

## Quick reference — what's *not* broken

Checked and confirmed fine, so you don't re-investigate:

- ✅ `.env` files are **not** tracked in git — only `.env.example` (verified via `git ls-files`).
- ✅ `backend.zip` / `frontend.zip` are untracked (though they should still be gitignored).
- ✅ Admin module guard coverage is correct — class-level `@UseGuards(JwtGuard, AdminGuard)` on all 18 routes.
- ✅ Assessment module guards are correct — class-level `JwtGuard` + method-level `AdminGuard` on create/update/delete.
- ✅ Password handling is sound — argon2 hashing, `@Property({hidden: true})` on `User.hash`, and old-password verification on change.
- ✅ Cookies are `httpOnly` + `sameSite: 'strict'` + `secure` outside dev.
- ✅ The global `ValidationPipe` uses `whitelist: true`, so DTOs strip unknown properties.
