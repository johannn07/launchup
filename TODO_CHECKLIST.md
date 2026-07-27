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
| **1b** RAG pipeline grounding calls in retrieved context | 🟡 **Pipeline built, corpus inadequate** | Real semantic retrieval as of 2026-07-27: `gemini-embedding-2` at 768 dims, vectors written to `vector_embeddings`, ranked by pgvector `<=>`, floor calibrated to 0.78. `AI_RAG_STRATEGY=keyword\|semantic` makes the old token-overlap path an explicit baseline arm rather than something mislabelled as RAG. **Remaining gap:** the corpus is only other startups' capsule proposals, so this retrieves peer text, not verified knowledge — see below before reporting an Objective 1 result |
| **1c** Output validation layer flagging inconsistent recs | 🔴 **Stub** | `output-validator.service.ts` — `validateEach()` returns `isValid: true` for everything with `// TODO`; `flagInconsistencies()` and `markUnverifiable()` have empty bodies |
| **2a** Multi-tier classification schema | 🟢 Built | `TierConfig` entity + `/admin/tiers` UI + threshold logic (`readiness.service.ts:159-180`) |
| **2b** Weighted composite scoring **by sector / business model** | 🔴 Not implemented | Weights are hardcoded constants (`readiness.service.ts:12-28`). `TierConfig.weights` exists as a column but **the scorer never reads it** — the admin UI edits a field with no effect. Nothing is sector-aware. **But see §5:** measurement on 2026-07-27 showed the *model* was the binding constraint on differentiation — `gemini-2.5-flash-lite` scored an early-stage and a mid-stage startup identically on 5 of 6 dimensions, so no weighting scheme applied to those inputs could have separated them. Raising the model moved the gap from −0.17 to +2.28. Fix the weights, but do not expect them to be the differentiation win. |
| **2c** Gap analysis engine | 🟢 Built | `ReadinessGap` rows with per-dimension shortfall (`readiness.service.ts:225-240`) |
| **3a** OCR of handwritten text | 🟡 Partial | Tesseract.js module + Gemini vision path (`getCapsuleProposalInfoFromImage`, `ai.service.ts:445`); `OcrDocument` stores `fieldConfidence` |
| **3b** Sketch / canvas recognition (BMC, lean canvas fields) | 🟡 Minimal | `sketchDetected`, `sketchConfidence`, `visionLabels` columns exist; no canvas-section mapping logic |
| **3c** Accuracy evaluation (Character Error Rate + SUS) | ⚪ Research task | Not a code deliverable — needs a ground-truth dataset |
| **4a** Controlled bias measurement vs expert ratings | ⚪ Research task | Needs expert-rated profiles; `data/ai-baseline.json` is the intended home |
| **4b** **Adversarial** prompting (find weaknesses *before* scoring) | 🟡 Partial / mislabelled | `reviewBiasScore()` (`ai.service.ts:85-164`) is a **post-hoc review** — "correct the score only if it appears inflated." The objective calls for pre-scoring adversarial prompting that actively hunts unmet criteria. Different mechanism. Toggleable via `AI_BIAS_REVIEW_ENABLED` |
| **4c** Score normalization against a baseline distribution | 🟢 Built | `BaselineService` + `normalizeAiScore()` + `ai_bias_audits` table + `/admin/ai/bias-audits` review UI. Toggleable via `AI_SCORE_NORMALIZATION_ENABLED`, now **independent of 4b** — it previously ran inside `reviewBiasScore()` and could not be exercised without it |

### Objective 1b — RAG now exists; the corpus is what's left

- [x] ✅ **OBJECTIVE · L · Semantic retrieval pipeline** — done 2026-07-27, commits `4708a2e`, `5c390de`, and the strategy commit that follows them.
  - **Embeddings are produced and stored.** `EmbeddingService` (`ai/embedding.service.ts`) calls `gemini-embedding-2` at 768 dimensions; `EmbeddingIndexService` writes `vector_embeddings` on every `recordRagContext`, plus a boot-time backfill for rows written before any of this existed. Verified against Neon: first vector stored at 768 dims, norm 1.0000.
  - **Similarity is computed by pgvector, not JavaScript.** Both `AiService.retrieveSemantic` and `RagQueryService.queryVectorDatabase` order by `<=>` in SQL. The old code loaded every vector into Node — ~3KB transferred per candidate to pick three.
  - **`vector_embeddings` was pinned to `vector(768)`.** It was a dimensionless `vector`, which pgvector cannot index at all. 768 rather than the native 3072 because hnsw/ivfflat refuse anything above 2000 dimensions (verified, not assumed).
  - **`RagQueryService` was looking for a source type nothing writes** (`source_type = 'startup'`), so it returned `lowConfidence: true` on literally every call. It now reads the one real corpus and reaches startups through `rag_contexts.startup_id`.
  - **Three arms, not two.** `AI_RAG_STRATEGY=keyword|semantic` sits alongside `AI_RAG_ENABLED`, so the comparison can separate "does retrieval help at all" from "does *semantic* retrieval beat the token matching that was already here". An unknown value is rejected at boot rather than defaulted, so a typo cannot mislabel an arm.
  - **A startup can no longer retrieve itself.** Its own capsule proposal was previously eligible as a "verified prior profile" — the model reading its own input back as independent corroboration.

  **Similarity floor is calibrated, and the calibration matters.** `RAG_MIN_SIMILARITY = 0.78`, from `measurement/calibrate-similarity.js` (nine startups, three domains, 36 pairs). The distributions **overlap** — same-domain similarity runs as low as 0.7295, cross-domain as high as 0.8036 — so this is a trade-off, not a boundary: 0.78 keeps 8/9 true neighbours and leaks 11% of cross-domain pairs. A first guess of 0.70 leaked **78%** and let an agriculture startup through at 0.765 as context for a health platform. Re-run the calibration if the embedding model changes.

- [ ] 🔴 **OBJECTIVE · M · The corpus is still self-referential — this is now the real Objective 1b gap**
  Retrieval works, but it can only retrieve *other startups' capsule proposals*, because that is the only thing `rag_contexts` ever holds (written solely from `startup.service.ts:158`). `verifiedFrameworks` and `businessModels` are still hardcoded `[]`.
  **Why it matters:** "retrieval-augmented against a verified knowledge base" is the claim. Retrieving peer startup text is peer comparison, not grounding in verified knowledge — and peer text is itself AI-parsed, so errors can propagate. With 2 startups seeded there is also almost nothing to retrieve.
  **Work:** seed a real corpus of TRL/MRL definitions, readiness-level rubrics, and business-framework documents as `rag_contexts` rows with a distinct `sourceType`; the embedding and retrieval path then covers them with no code change. Populate `verifiedFrameworks` / `businessModels` from that corpus.
  **Do this before claiming any Objective 1 result** — the pipeline is measurable now, but with this corpus it would measure peer similarity.

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

- [x] 🔒 **SEC · S · Guard the file-upload endpoints** — *fixed 2026-07-27*
  `backend/src/upload/upload.controller.ts` had no guard on `POST /upload/single` or `POST /upload/multiple`. `@UseGuards(JwtGuard)` now sits on the controller, so it covers the new presign routes too. **Verified live:** `/upload/presign`, `/upload/signed-url`, and `/upload/test-connection` all return 401 unauthenticated. `test-connection` no longer echoes the raw SDK error, which named the bucket and endpoint.
  **Why it matters:** anyone on the internet can upload arbitrary files (up to 10 at a time) into the bucket at your cost.
  **Correction (2026-07-27):** this item previously claimed there was "no file-type or size validation" — that is **wrong**. `upload.service.ts:174-194` `validateFile()` already enforces a 10 MB cap and an 8-entry MIME allowlist, and it runs before the object is written. The real gap is authentication only.
  **Fix:** add `JwtGuard` to the controller. Note the allowlist trusts the client-supplied `file.mimetype`, so it stops honest mistakes, not a determined uploader — sniff the magic bytes if that matters. Also `GET /upload/test-connection` (`:19`) is unauthenticated and leaks bucket-reachability plus raw SDK error text.

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
  **DONE (`fix/rns-generation-bugs`):** `rns.service.ts` `generateTasks` now sets `isAiGenerated = false` — **this is the only code change the fix required.** `initiative.service.ts` and `roadblock.service.ts` already wrote `false` at their creation sites; `rna.service.ts` deliberately still writes `true` (see the correction below). Not yet re-verified: `progress-report/+page.svelte:299` additionally filters `status === 7`, so that view may still look empty for unrelated reasons — check separately.
  **Live-verified (2026-07-26, Neon + live Gemini):** RNS generation persisted row id 30 with `isAiGenerated = false` **and** `generation_run_id = 5`, so it passes the frontend filter while remaining provably AI. Roadblock and initiative generation likewise persisted `false` with a `generation_run_id`. The RNA path is **not** live-verified — see the caveat below.

  ⚠️ **Two findings from live verification that qualify this decision:**
  1. **The fix is not retroactive, and the backlog stays invisible.** 22 `rns` rows and 24 `rna` rows already in the DB have `is_ai_generated = true` with `generation_run_id IS NULL` (they predate the provenance work). They still fail the frontend's `isAiGenerated === false` filter, so **flipping the flag surfaces only newly generated rows** — the existing backlog remains permanently unreachable from the UI. If those rows matter, they need a one-off backfill (`UPDATE … SET is_ai_generated = false`); if they don't, they should be deleted.
  2. **`generation_run_id IS NOT NULL` is *not* a complete "AI rows only" predicate.** This section previously recommended it as the replacement for `isAiGenerated`. It misses all 46 legacy AI rows above, which have the flag but no run FK. The two populations are disjoint: legacy AI rows have `is_ai_generated = true, generation_run_id IS NULL`; new AI rows have `is_ai_generated = false, generation_run_id IS NOT NULL`. Until the legacy rows are backfilled or purged, a correct "all AI rows" query needs **both**: `WHERE generation_run_id IS NOT NULL OR is_ai_generated = true`.

  ❗ **CORRECTION — the RNA module was never affected by this bug, and the flip there was reverted.**
  Verified in a real browser (logged in as Manager, `/startups/10/rna`): **the RNA page renders every row unfiltered** — `{#each $rnaQueries[1].data as rna}` at `rna/+page.svelte:255`, no `isAiGenerated` predicate. Legacy rows with `isAiGenerated: true` display perfectly well. The `rna/+page.svelte:77` hit listed above under "same pattern, verify each" is **inside `addToRNA()`**, the accept-action dedup lookup — not a display filter. That line was matched by grep and wrongly assumed to be the same bug.
  Flipping RNA to `false` was therefore not merely unnecessary, it was **actively harmful**, for two reasons:
  1. It erases the only UI provenance signal on an RNA — the dialog's "AI Generated: Yes/No" field (`view-edit-delete-ai-dialog.svelte:289`).
  2. It creates a **self-delete**: `addToRNA()` looks up `data.find(d => d.isAiGenerated === false && same readinessType)` (`rna/+page.svelte:75-80`) to delete the superseded manual row. With generated rows written `false`, that lookup matches **the row being accepted itself** — so it `DELETE`s the row and then `PATCH`es a now-deleted id. Reachable from the Startup role (`view-edit-delete-dialog.svelte:108`).
  `rna.service.ts` keeps `isAiGenerated = true`, with a comment recording why it deliberately differs from the other three generators. **RNS is the only module where the flip was needed** — its board and table filters are real, and its `addToRNS()` only PATCHes, with no self-matching lookup. `initiative`/`roadblock` already wrote `false`.
  ✅ **All display surfaces now verified in the browser** (2026-07-26, against a freshly reseeded DB):

  | Page | Filter real? | Generated rows render? |
  |---|---|---|
  | RNS (board + table) | ✅ Yes | ✅ Yes, after the flip |
  | RNA | ❌ **No filter at all** | ✅ Always did — see the correction above |
  | Initiatives (`:857`) | ✅ Yes | ✅ Yes — 2/2 rendered |
  | Roadblocks (`:657`) | ✅ Yes | ✅ Yes — 2/2 rendered |
  | Progress report (`:220`, `:259`) | ✅ Yes | ✅ Yes — RNS, initiatives, roadblocks all rendered |

  **The `status === 7` filter at `progress-report:299` is not a bug.** It drives the *"RNS — Long Term"* section; `7` is the long-term status. It renders empty only because no seeded RNS has that status, which is correct behaviour, not a hidden-rows problem.

  ⚠️ **Progress report is unreachable without a nav change.** With Progress Report commented out of `access.ts:36-40`, `/startups/:id/progress-report` does not merely lack a nav link — the route **redirects away** to the RNA page. The §3 "re-enable Progress Report" item is therefore a *prerequisite* for using the page at all, not a cosmetic nav tidy. Verified by temporarily uncommenting those five lines (reverted afterwards — the scope decision is still open): the page then rendered completely and correctly.

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
  **Confirmed 2026-07-26:** commenting it out of `access.ts` doesn't just hide the nav link — `/startups/:id/progress-report` **redirects to the RNA page**, so the feature is entirely unreachable. Temporarily uncommenting `:36-40` was verified to make it render completely and correctly (all 6 RNAs, both RNS with correct target levels, both initiatives, both roadblocks) against live data. The re-enable really is a five-line uncomment with no other work required.

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

- [x] 🐞 **BUG · S · The boot seeder gives startups to staff accounts and assigns no mentor** — *fixed*
  `backend/src/main.ts` `seedDemoStartups()` set `user: managerUser` for AgroLink PH and `user: mentorUser` for MediSync Cebu — so a **Manager owned one startup and a Mentor owned the other**, while `demo@launchup.local` (the only `Startup`-role account) owned nothing. Neither startup got a `startups_mentors` row, so the seeded state showed a Manager running the whole coaching flow with no mentor involved — a workflow the SRS doesn't describe, and misleading in a demo or screenshot.
  **Why it mattered beyond cosmetics:** any ownership/IDOR work in §1 would have been tested against data where the roles were already conflated, so a broken ownership check could look correct.
  **Fix applied:** `seedLocalDemoData()` now also creates `founder.agrolink@launchup.local` (Rafael Domingo) and `founder.medisync@launchup.local` (Elena Reyes) as `Role.Startup`, and the two near-identical startup blocks were folded into a single `seedDemoStartup(em, spec)` helper that sets the founder as `user`, adds them to `members`, and adds `mentor@launchup.local` to `mentors`. Same accounts and emails `seed-demo-full.js` uses, so the two seeders now agree and the standalone script is a no-op on a fresh boot.
  **Deliberately creation-only.** The `if (existing)` guard is kept, so the boot seeder never rewrites a startup it already created — auto-mutating ownership on every `pnpm dev` would be surprising, and other developers' Neon branches may hold intentional edits. Branches seeded by the old code keep the wrong shape until `node seed-demo-full.js` is run against them; the log line points at that.
  **Verified** on a genuinely cold DB (throwaway `launchup_seedtest` on the same Neon instance, created with pgvector, booted, asserted, dropped): both startups took the create branch, owners are the two `Startup`-role founders, both have `mentor@launchup.local` in `startups_mentors`, and all three assertions — non-`Startup` owners, self-mentoring, mentorless startups — returned 0.
  *Related: setting `qualificationStatus = QUALIFIED` directly anywhere skips `approve-applicant` → `appoint-mentors`, which is where the mentor is normally attached — that shortcut is what left the startups mentorless in the first place.*

- [ ] 🧹 **DEBT · S · `ai_generation_runs` cannot see thinking-token cost**
  The table records `prompt_tokens` and `completion_tokens` but has no column for **thinking tokens**, which on `gemini-3.6-flash` are ~780 per call — more than twice the visible output. Since the default moved to a reasoning tier, the provenance table now systematically under-reports the true cost of every run, which matters for any "was the enhanced pipeline worth it?" comparison.
  **Fix:** add a `thinking_tokens` column and populate it from `usageMetadata.thoughtsTokenCount`, which the SDK already returns. Cheap now; expensive to backfill once a study's worth of rows exists without it.

- [ ] 🧹 **DEBT · S · `pnpm lint` is unusable because of a CRLF-vs-prettier conflict**
  There is **no `.gitattributes`** and `core.autocrlf=true`, so files check out CRLF on Windows, while prettier (no `endOfLine` setting, therefore `"lf"`) flags **every line of every file** as `Delete ␍`. `ai-config.service.ts` + its spec alone account for 205 errors, and the repo-wide total is 727 — almost all of it this one rule. Real findings are buried, and `pnpm lint` runs `eslint --fix`, so anyone who runs it casually rewrites the entire `src/` tree.
  **Fix:** add `.gitattributes` with `* text=auto eol=lf`, or set `"endOfLine": "auto"` in `.prettierrc`. Either drops the error count by roughly an order of magnitude and makes the linter worth running. Consider also splitting `lint` (check) from `lint:fix` so `--fix` is opt-in.

- [ ] 🐞 **BUG · S · Two unit tests fail on `master` — the suite is red before anyone starts**
  `pnpm test` is **74 passed / 2 failed** on a clean `master` checkout (verified 2026-07-27 by checking out `master` and re-running, so this is not from any feature branch). Both look like stale expectations rather than product defects, but a red baseline means nobody can tell a real regression from the noise.
  - `src/ai/ai.service.spec.ts` › *"passes valid task responses through unchanged"* — the test's own context sets `scoreNormalization: true` and mocks `normalizeScore` to return `{ scaled: 5, z: 0 }`, so the service correctly emits `target_level_normalized: 5` plus `target_level_z: 0`. The assertion still expects `target_level_normalized: 3` and no `_z` field. **The expectation is wrong, not the code** — note the hand-edited comment on the line, which suggests it was patched without being run.
  - `src/readiness/readiness.service.spec.ts` › *"returns a weighted score, tier, and prioritized recommendations"* — `expect(jest.fn()).toHaveBeenCalledTimes(1)` receives 2. Needs a look at whether the extra call is intended.
  **Fix:** correct both expectations (or the code, if the second turns out to be a real double-call), then keep the suite green so CI is meaningful.

- [ ] 🧹 **DEBT · S · Removing an uploaded file orphans the object in the bucket**
  `FileUploadField.svelte`'s "Remove file" only rewrites the assessment's `answerValue` — it never deletes the stored object. `UploadService.deleteFile()` exists and works, but the only route that calls it is **commented out** (`backend/src/upload/upload.controller.ts`, the `@Delete(':key(*)')` block). So every removed or replaced attachment stays in storage forever, counting against the ~1 GB free tier with no way to find it from the app.
  **Fix:** uncomment the delete route, put it behind `JwtGuard` (now on the controller), and have `removeUploadedFile()` call it with `file.key` before rewriting the answer. Ignore a 404 so a missing object doesn't block the UI. *Legacy rows store `url` rather than `key` and can't be resolved to an object — skip the delete for those.*
  **Why it's worth doing now:** cheap while the storage code is fresh, and the alternative is a bucket nobody can safely clean because there's no record of which keys are still referenced.

- [ ] 🧹 **DEBT · S · The SQLite fallback in `mikro-orm.config.ts` does not work**
  `backend/src/mikro-orm.config.ts:8` falls back to an in-memory SQLite DB when `DB_HOST` is unset, and `CLAUDE.md` describes it as "useful for quick local runs without Docker". It isn't — booting with `DB_HOST=` fails at connect with `Error: Could not locate the bindings file`, because `better-sqlite3`'s native bindings were never compiled for this install. **Verified** 2026-07-27.
  Note also that `dotenv` never overrides a key already present in `process.env`, so `.env`'s `DB_HOST` always wins unless the variable is exported as an *empty string* — PowerShell's `$env:DB_HOST=''` deletes the variable rather than emptying it, so the fallback cannot be reached from PowerShell at all.
  **Fix:** either make it work (`pnpm rebuild better-sqlite3`, and confirm the pgvector-typed entities can even be created under SQLite) or delete the branch and the `@mikro-orm/sqlite` dependency and correct `CLAUDE.md`. Deleting is probably right — the entity set now assumes Postgres.

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
  `backend/src/upload/upload.service.ts` read five `DO_SPACES_*` vars; none were set, so `enabled = false` and uploads 503'd. The SDD only ever says *"Object storage (file storage service)"* (p.48) — **no vendor is specified**.
  **Code is done (2026-07-27); only credentials are outstanding.** Cloudflare R2 was the original recommendation but was ruled out — it requires a credit card on file even for the free tier. **Targeting Supabase Storage** instead: S3-compatible, no card, ~1 GB free.
  **What landed:**
  - `DO_SPACES_*` → `S3_*` throughout, plus `forcePathStyle: true` (Supabase addresses buckets as a path segment).
  - Dropped `ACL: 'public-read'`. Supabase, R2, and modern S3 all control public access at the *bucket* level; per-object ACLs are not the model any more.
  - **Presigned PUT** (`POST /upload/presign`) — the browser uploads straight to the bucket, so a 10 MB file no longer occupies an API request.
  - **Presigned GET** (`GET /upload/signed-url?key=`) — the bucket is private, so this is the only read path.
  - `JwtGuard` on the whole controller, closing the §1 SEC item.
  - Frontend `FileUploadField.svelte` switched to presign → PUT, and now stores `{key, fileName}`. Legacy `{url, fileName}` rows still render.
  **Two bugs the unit tests caught before they could reach production:** the AWS SDK signs a CRC32 checksum of the *empty* signing-time body by default, so every real upload would have failed validation at the bucket (fixed with `requestChecksumCalculation: 'WHEN_REQUIRED'`); and `getSignedUrl` signs only `host` unless told otherwise, which made the returned `Content-Type` requirement decorative (fixed with `signableHeaders`).
  **Verified end to end against the live Supabase bucket (2026-07-27).** Credentials are in `backend/.env`; `test-connection` reports `connected`. API round trip: presign → PUT (200) → signed GET (200) returned a byte-identical file, and an **unsigned** GET on the same object returned **403**, confirming the bucket is genuinely private. Through the UI as `founder.agrolink@launchup.local` (Startup role): attached a PNG to "Upload your system architecture diagram", submitted, the assessment flipped to Completed, and Preview resolved a fresh signed URL that rendered the image. The stored `answerValue` is `{"files":[{"key":"assessments/…png","fileName":"architecture-diagram.png"}]}` — a **key, no URL**, as designed.
  *The assessment tables were empty after the DB wipe, so `seed-demo-full.js` now also seeds 6 assessments (2 File-type) — without them the assessment page renders nothing and the upload field is unreachable.*

- [ ] ❓ **SCOPE · M · Move off `gemini-2.5-flash-lite` to task-appropriate models**
  **Partially addressed:** the model is no longer a hardcoded literal — `AiConfigService` (`backend/src/ai/ai-config.service.ts`) now resolves `model` and `temperature` from `GEMINI_MODEL` / `AI_TEMPERATURE` env vars (see `backend/.env.example`), and every call site in `ai.service.ts` reads `this.aiConfig.defaults.model` / `.temperature` instead of a literal, so switching models is now an env change, not a code change. `temperature` is also now applied consistently across call sites (defaulting to `0`), which resolves the "pin `temperature: 0` on all scoring calls" ask two paragraphs down.
  **Default raised to `gemini-3.6-flash` (2026-07-27)** — `DEFAULT_MODEL` in `ai-config.service.ts` and `GEMINI_MODEL` in both `.env` and `.env.example`.
  **Why it matters for *this* project specifically:** Objectives 1 and 4 are about hallucination and leniency bias, and the lite tier is the most susceptible to both — weakest instruction-following, weakest reasoning, most sycophantic. Objective 3 needs handwriting and sketch understanding, which is exactly where a lite vision model is weakest. A weak model doesn't just degrade UX here; it **biases your research results against your own hypothesis**.

  ⚠️ **The earlier recommendation in this section was wrong, and measuring it is what caught that.** It named Gemini 2.5 Pro / 2.5 Flash. Measured against the project's own API key on 2026-07-27:

  | Model | Latency | Output tok | **Thinking tok** | Total | JSON |
  |---|---|---|---|---|---|
  | `gemini-2.5-flash-lite` *(was default)* | 2.3s | 326 | **0** | 448 | fenced |
  | `gemini-3.1-flash-lite` | 2.1s | 266 | 0 | 388 | clean |
  | `gemini-3.5-flash-lite` | 1.9s | 280 | 0 | 402 | clean |
  | **`gemini-3.6-flash`** *(new default)* | 6.5s | 343 | **779** | 1244 | clean |
  | `gemini-3.5-flash` | 12.1s | 362 | 965 | 1449 | clean |
  | `gemini-2.5-flash` | — | — | — | — | **404 "no longer available to new users"** |
  | `gemini-2.5-pro`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview` | — | — | — | — | **429 — not on the free tier** |

  - **`gemini-2.5-flash` is gone.** Wiring the old recommendation would have 404'd every AI call.
  - **No Pro-tier model is reachable on the free key.** All three 429 with 20s spacing, so it is tier exclusion, not a rate limit. **Any plan that puts Pro on scoring/bias requires paid billing.**
  - **The lite tiers spend zero tokens reasoning.** Asked for *Technology* readiness, `2.5-flash-lite` answered about revenue and product-market fit — the wrong dimension. Every 3.x model stayed on-topic. That is the leniency-bias objective visible in one sample.
  - **Cost:** ~2.8× tokens and ~3× latency versus the old default. If free-tier quota bites, `gemini-3.5-flash-lite` is the escape hatch — still better than `2.5-flash-lite` on every measured axis, but no reasoning.
  - `gemini-embedding-2` (8192 input) and `gemini-embedding-001` (2048) are both reachable for the §0 RAG work.

  **Verified live:** RNA generation for AgroLink returned 6 rows in 14s, citing specifics from the capsule proposal ("18 cooperative interviews", "1 provisional buyer agreement", "SMS fallback") rather than generic filler. `ai_generation_runs` id=5 records `model: gemini-3.6-flash` with the full resolved config.
  **Instrumentation gap closed (2026-07-27).** Three calls previously read `AiConfigService.defaults` directly and opened **no** `ai_generation_runs` row — `getCapsuleProposalInfo`, `getCapsuleProposalInfoFromImage`, and `generateStartupAnalysisSummary`. They now take an `AiRunContext` like every other model call, under two new operations:
  - `capsule_extract` — `POST /startups/parse-capsule-proposal`, opened with a null `startupId` because parsing happens while the application is still being filled in. Covers **Objective 3's Gemini Vision handwriting path**, which was entirely invisible to the comparison study before.
  - `analysis_summary` — `POST /startups/apply`, also opened with a null `startupId` and then backfilled via `AiRunService.attribute()` once `create()` has persisted the startup.
  Both now honour `X-Ai-Pipeline-Config` (they silently ignored it before) and contribute their token spend to the run. The vision call and its Tesseract-text fallback accumulate into **one** run rather than being counted separately.
  **Verified live:** `capsule_extract` recorded `model: gemini-3.6-flash`, 26.5s, 1605 prompt / 251 completion tokens on a 1400×1000 image; `analysis_summary` recorded 9.1s, 324/106, attributed to the startup it created.
  ### Measured old vs new (2026-07-27) — and the premise of this section was wrong

  Same input, same production grounding instruction, `temperature: 0`, 3 repetitions, two documents (AgroLink = paper prototype and zero revenue; MediSync = 6 paying facilities and PHP 5k MRR). Only the model varied.

  | | `gemini-2.5-flash-lite` | `gemini-3.6-flash` |
  |---|---|---|
  | AgroLink (early) mean level | 1.67 | 2.33 |
  | MediSync (mid) mean level | 1.50 | 4.61 |
  | **Gap between them** | **−0.17** | **+2.28** |
  | Distinct levels used across both | 3 | 5 |
  | Invented values for absent fields | 0 / 9 | 0 / 9 |
  | Recalled facts present in the doc | 9 / 9 | 9 / 9 |
  | Total tokens (6 calls) | 3,135 | 14,978 |

  **1. The old model could not tell the two startups apart — it ranked them backwards.** A gap of −0.17 means the mid-stage venture with paying customers scored *marginally lower* than the one with a paper prototype. Per-dimension, **5 of 6 dimensions returned identical scores for both companies**. Every dimension moves the right way on 3.6-flash (Technology 3→6, Investment 1→4, Regulatory 1→3).

  **2. This section's stated premise — that the lite tier is "most sycophantic", most prone to leniency — is not supported.** The lite model was not lenient; it was floor-bound and blind, collapsing everything to 1–3 regardless of evidence. The real defect was **differentiation, i.e. Objective 2**, not leniency (Objective 4).

  **3. That reframes Objective 2b.** `TierConfig.weights` being unread by the scorer is still a real bug, but fixing weighted scoring alone would **not** have produced differentiation: the per-dimension inputs being weighted were nearly identical for both startups. The model was the binding constraint, not the formula.

  **4. The model change did *not* measurably improve grounding.** Both models refused all 9 absent fields and recalled all 9 present ones. `groundPrompt()` is doing that work, and this test found no headroom — so **Objective 1 gains cannot be attributed to the model upgrade**. A harder probe (longer documents, adversarial distractors) is needed to find where grounding actually breaks.

  **Limits, stated honestly:** N is small (3 reps × 6 dimensions × 2 documents); there is no expert ground truth, so the reliable signal is the *gap and its direction*, not the absolute levels; the prompt mirrors production shape but is not `createBasePrompt` with RAG attached; and 1 of 3 AgroLink reps on 3.6-flash returned output that did not parse into levels (n=12 rather than 18 for that cell), which is a small robustness caveat.

  **Still open — per-task tiering:** deferred, not dropped. There is no seam between scoring and generation today (both read `ctx.config.model`), and with Pro unreachable there is no stronger model to point a seam at. The measurement above also weakens the case for one: the large differentiation win is already banked on 3.6-flash, and no leniency problem was observed that a stronger model would fix.
  Verify current model IDs against <https://ai.google.dev/gemini-api/docs/models> before wiring; the family moves fast — as this section demonstrates.
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
