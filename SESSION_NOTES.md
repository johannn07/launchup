# Session Notes

Chronological, oldest first. Sessions older than the last three are compressed to outcome only — see `TODO_CHECKLIST.md` for the live backlog and `measurement/README.md` for measurement detail.

---

## Standing operational notes

Cross-session gotchas. These cost real time when rediscovered.

- **Never run `pnpm build` while `pnpm dev` is watching.** Both write `dist/`; the race leaves the server unable to resolve its own modules. `pnpm test` is safe (ts-jest doesn't touch `dist/`).
- **Green mocked tests have repeatedly coexisted with broken reality here.** The boot-time embedding backfill failed on every startup; deleting `TierConfig.weights` broke `seed-dummy.ts` so `pnpm dev` wouldn't compile — both with a green suite. Exercise the real path: `preview_start` + `preview_logs`, or `NestFactory.createApplicationContext`. Run SQL against Neon inside `begin`/`rollback`.
- **Gemini free tier: 20 generation calls/day on `gemini-3.6-flash`, window resets 15:00 Philippine time** (midnight US Pacific). A run started before 15:00 draws on the *previous* window. One UI generation fans out into several calls — budget 3–5/day, not 20. 429s surface in the backend terminal, not the browser. Embedding has a separate 100/min quota.
- **`pg` is not resolvable from `backend/`** (pnpm-isolated under `@mikro-orm/postgresql`). Use `MikroORM.init(require('./dist/src/mikro-orm.config').default)` + `orm.em.getConnection().execute(sql)`. Tables are **pluralised**: `startups`, `startups_readiness_level`, `rag_contexts`, `rag_retrieval_logs`.
- **`nest build` emits to `dist/src/`, not `dist/`** (because `seed-dummy.ts` sits at the backend root). `seed-admin.js` and `seed-demo-runner.js` hardcode `./dist/` and are broken.
- **`mikro-orm.config.ts` hardcodes `entities: ['./dist/**/*.entity.js']`.** A build emitted anywhere else still loads **stale** entities from `dist/`, silently. Any probe compiled to a scratch dir must override `entities`, or it is measuring the last build — this produced a convincing false negative once (a new property read as "not in metadata").
- **To browser-test as any role without the login form:** `POST /auth/signin` for a token, then set it as the `Access` cookie via `javascript_tool` (`document.cookie`). `hooks.server.ts` verifies that cookie locally with `jose`, so no backend round-trip and no form automation is needed. The form itself still resists automation.
- **Dark mode is class-based** (`html.dark`, mode-watcher) — `prefers-color-scheme` does not drive it, so a devtools colour-scheme toggle proves nothing. Toggle the class.
- **`pnpm lint` runs `eslint --fix`** and rewrites the whole tree over a CRLF/prettier conflict (checklist §4). Check `git status` before committing after anyone runs it.
- **A fired scheduled task is not evidence it ran.** One fired, started its MCP servers, and never ran the command. Check for the artifact.
- **Use Node, not PowerShell, for storage probes.** PS 5.1's `Invoke-WebRequest` reported a *successful* Supabase PUT as failed with no status code.
- **`node inspect-prompt.js <startupId> [--dimension T]`** prints a real assembled prompt and stops before `sendToGemini` — zero quota.

---

## Compressed history — 2026-07-26 → 2026-08-09

**AI pipeline config and run provenance (2026-07-26, PR #7).** `AiConfigService` resolves `{model, temperature, grounding, rag, biasReview, scoreNormalization}` from env, with a Manager/Admin-gated `X-Ai-Pipeline-Config` override; every generation opens an `ai_generation_runs` row and every artifact carries a `generation_run_id`, so runs are attributable to an exact arm. Score normalization was decoupled from bias review (two of four arms were previously unreachable). **Real bug fixed:** `temperature`/`maxOutputTokens` were passed at the top level of the `@google/genai` call, where the SDK silently drops them — every call had run at the API default, never at the configured `0`, so baseline results gathered before this are not sampling-comparable with results after.

**Four generation bugs (2026-07-26, PR #8).** `targetLevelScore` always `-1` (stale id→level map deleted); `generateRoadblocks` always returned `[]` (missing `push`); `requestedStatus` asymmetry in single-vs-bulk initiative generation; and AI-generated RNS invisible because both display surfaces filter `isAiGenerated === false`. **The RNA half of that last diagnosis was wrong and was reverted** — the RNA page has no display filter at all, and flipping the flag there erased the dialog's provenance label and made `addToRNA()` self-match and delete the row being accepted. `rna.service.ts` deliberately still writes `true`. All five display surfaces browser-verified.

**Database reset and reseed (2026-07-26).** Shared Neon data was throwaway; wiped after a full JSON backup to `Projects/Launchup/db-backups/` (with `restore-neon.js`). Dropped tables while **preserving the pgvector extension** — `DROP SCHEMA public CASCADE` would have taken it. New `seed-demo-full.js` adds what the boot seeder never created: the full 6×9 readiness grid, capsule proposals, 6 assessments (2 File-type). **Role separation corrected** — the boot seeder had staff accounts owning startups with no mentor attached; `main.ts` now seeds dedicated `Startup`-role founders and attaches `mentor@launchup.local`. Creation-only by design (`if (existing)` guard), so branches seeded before 2026-07-27 need `node seed-demo-full.js`. Verified on a genuinely cold throwaway Neon DB.

**Object storage — Supabase, presigned, private (2026-07-27, PR #9).** R2 ruled out (requires a card even on free tier). `DO_SPACES_*` → `S3_*` with `forcePathStyle`; presigned PUT + presigned GET against a **private** bucket, storing the object *key* not a URL — the DB wipe meant the secure option cost no migration. **Two bugs the tests caught that would have shipped silently:** the SDK signs a CRC32 checksum of the empty signing-time body (fixed with `requestChecksumCalculation: 'WHEN_REQUIRED'`), and `getSignedUrl` signs only `host` unless given `signableHeaders`, making the returned `Content-Type` requirement decorative. Verified end to end: presign → PUT → signed GET returns a byte-identical file, unsigned GET returns 403. **Dependency trap:** pin `@aws-sdk/s3-request-presigner` to the exact `client-s3` version or two copies of `@smithy/types` break the build.

**Model tiering (2026-07-27, PR #10).** Measured against the project's own key rather than trusting docs, and it overturned the plan twice: **`gemini-2.5-flash` 404s** ("no longer available to new users") and **no Pro-tier model is reachable on the free tier** (429 at 20s spacing = tier exclusion). Default raised to **`gemini-3.6-flash`** — the deciding measurement was thinking tokens (every `*-flash-lite` spends 0; 2.5-flash-lite answered a *Technology* question in terms of revenue). `gemini-3.5-flash-lite` is the documented escape hatch. Three previously untracked calls (`capsule_extract`, `analysis_summary`) now open runs, which is what made Objective 3's handwriting path visible to the study at all. **Old-vs-new measurement overturned this section's premise:** 2.5-flash-lite ranked the two startups *backwards* (gap −0.17 vs +2.28), so the defect was **differentiation (Objective 2), not leniency (Objective 4)** — and grounding did not improve (0/9 invented on both models), so no Objective 1 gain can be attributed to the model change. **Gotcha:** the capsule route has a legibility gate (≥1200×900, tail entropy ≥4.2) — a small test image silently proves nothing.

**RAG pipeline (2026-07-27, PR #10).** Before this, `vector_embeddings` had never held a row and `RagQueryService` searched `source_type = 'startup'`, which nothing writes — so it returned `lowConfidence: true` on every call and prompts were "grounded" in nothing. Built `EmbeddingService` (`gemini-embedding-2`, 768 dims) + `EmbeddingIndexService` with a boot-time backfill; both retrieval paths rank with pgvector `<=>` in SQL. Four things measured rather than assumed: `gemini-embedding-2` over `-001` (stays unit-normalised when truncated); **768 dims not 3072** (pgvector refuses to index above 2000, and the column was dimensionless); **similarity floor 0.78** from `calibrate-similarity.js` (a first guess of 0.70 leaked 78% of cross-domain pairs; the distributions genuinely overlap, so this is a trade-off, not a boundary); semantic 76% precision vs keyword 56% with *fewer* documents returned. A startup can no longer retrieve its own capsule proposal as corroboration.

**Security P0 (2026-07-27, PR #15).** `JWT_SECRET` no longer falls back to a string committed to a public repo — `requireJwtSecret()` throws at boot and trims (the old `||` accepted whitespace). The frontend check had to go at **module scope**: at the point of verification it sits inside a `try` whose `catch` redirects to `/login`, so a misconfigured deployment would have presented as "your password is wrong". **Eleven controllers were reachable with no credentials, not the four recorded** — including both `ai/*` surfaces, where `POST /ai/baseline/update` rewrites the distribution score normalization measures against. Guarding them alone would have broken the whole UI: the `Access` cookie is `httpOnly` and `axiosInstance` sent **no credentials of any kind**; the three components that *look* authenticated hardcode a **Django SimpleJWT token that expired 2024-09-06**. Fixed by extracting the token from the cookie server-side plus `withCredentials`. A second pass caught two dialogs using bare `fetch` (cross-origin, so `credentials: 'same-origin'` silently failed). **Still owed: one manual login + click-through** — browser automation could not drive the SvelteKit login form.

**Verified-knowledge RAG corpus (2026-07-28, PR #13).** 64 rows seeded idempotently by `RagCorpusSeederService`/`seed-rag-corpus.js`: 54 readiness-rubric (9 levels × 6 dimensions) + 10 business-framework. Three retrieval channels — rubrics (`deterministic` exact `(readinessType, level)` lookup by default), business frameworks (always semantic), peers. `AI_RAG_CORPUS_ENABLED` gates the first two independently. **A real defect found and fixed (`91da49d`):** `buildGroundedPrompt` printed retrieved docs as id/similarity/metadata and never emitted their `content` — **retrieved text was never reaching any prompt**, regardless of what retrieval returned. That predates the corpus work and would have silently defeated it.

> **Corpus provenance — the honest limit on any Objective 1b claim, and it must be attached every time.** Every row carries a `provenance` field. Of the 54 rubric rows: **9 (Technology/TRL) are transcribed from a public standard** (EU Horizon Europe TRL, consistent with ISO 16290:2013); **36 (Market/Acceptance/Organizational/Regulatory) are authored against BRLa's (2021, *Technological Forecasting and Social Change*) published dimension framework** — not transcribed, because BRLa defines dimensions and criteria, not nine numbered per-level descriptions; **9 (Investment/IRL) are authored outright**, IRL appearing in neither BRLa nor any cited standard. The 10 framework rows split 3 framework-derived (Osterwalder & Pigneur, Maurya, Blank, each citing a named work) / 7 authored — market sizing and unit economics were retagged to `authored` after review found their citations named no framework at all. **So only 1 of 6 scored dimensions has externally-sourced level text.**

**Corpus live verification and close-out (2026-07-28).** Booted clean; a real assembled prompt contained `--- Verified Readiness Rubrics (authoritative) ---` with TRL 2 and TRL 3 verbatim, and `AI_RAG_CORPUS_ENABLED=false` removed the section entirely. Re-seeding reported all-unchanged. **`docs/SRS.md` and `docs/SDD.md` were deleted, not corrected** — 18–19-line in-repo summaries that disagreed with the source PDFs on the one fact a reviewer checks first (`docs/SDD.md` listed six dimensions including IRL; the real documents specify five, no IRL). 13.7 MB of capstone PDFs were committed by accident and removed with `git filter-branch`; **`backup/rag-corpus-preflight` still holds those blobs locally** and is safe to delete. **`inspect-prompt.js` added** — and it surfaced that **the business-framework channel returns 0 rows in practice**: always semantic, top-2 never clears the 0.78 floor. The 10 framework rows are seeded and embedded but reach no prompt, so "64 rows grounding the model" is really 54. Not a regression; it has never worked otherwise. Also: `Co-Authored-By` trailers dropped, enforced via tracked `.claude/settings.json` plus a `CLAUDE.md` section for paths the setting doesn't reach.

**Grounding measurement, first runs (2026-07-29 → 2026-07-30).** Step B finally ran after the harness was restructured — reps became the *outermost* loop (it had iterated arm → startup → rep, so a 20-call budget was consumed entirely inside the baseline arm and every between-arm metric read n=0), with `--out`/`--merge` to accumulate across days and a refusal path when model/corpus/floor differ. **The most valuable finding was free:** `baseline` and `sdd-semantic` send **byte-identical prompts** (semantic rubric retrieval returns 0 rows), so the pair is an accidental null control — and at `temperature: 0` it still differed on 8 of 12 per-dimension levels. Then the probes were redesigned, because reading production's `createBasePrompt` showed two confounds that invalidated the comparison at *any* N: production emits the startup's readiness levels for **every** arm (the harness emitted them for none), and deterministic retrieval keys on the startup's actual level, so the arm was shown the answer. 49 measurement tests were added where there were none. **Review caught seven defects, six of them in the spec/plan rather than any implementer's work, and five found by mutation testing rather than reading** — notably `ipo` matching `IPOPHL` (which appears in both seeded documents, so correct trademark advice would have scored as the worst hallucination the metric records), and `mergeRuns` keying comparability on `days[0]` so the documented `--merge results/*.json` pooled nothing.

**Reps 2 and 3 (2026-08-03).** Rep 2 (n=2 pooled) showed the corpus arm's per-dimension deltas were **reproducible, not noisy** — MediSync `+2 +2 +2 −3 −2 −2` then `+2 +2 +2 −2 −2 −2`, while baseline wobbled more. That retracted the standing "54 rubric rows destabilise placement" hypothesis: systematic displacement, not instability. Rep 3 lost its twelfth call to a transient **503** (not a 429) in the single cell carrying the finding, which exposed that **metric 3 cannot resolve these arms** — the byte-identical control pair spans 1.67–3.33 gap points across three reps, wider than the effect being measured. Do not quote a pooled MAE from an unbalanced pool; the missing cell biased the corpus arm in its own favour. Both harness gaps were then closed TDD-first: `--only-arm=`/`--only-startup=` (refilling one cell costs 2 calls, not 12; a filter matching nothing hard-errors before any network call) and a bounded 503 retry that **never retries 429**. Mutation testing again earned its keep — the `is429` guard passed with the guard *removed*, because a real 429 body contains neither `503` nor `UNAVAILABLE`; it was decorative.

**Three streams (2026-08-04).** Output validation (1c, PR #18) and sector-aware weighted scoring (2b, PR #19) merged; the grounding n=3 volume ladder did not. **1c is a length-and-confidence validator, not "full output validation"** — groundedness and stage-appropriateness were excluded because both probes measured saturated, a rationale partly refuted on 2026-08-06. No backfill by design, so a `'validated'` status on a pre-existing row is *not* evidence the validator ran. **2b: `TierConfig.weights` was deleted rather than used** — keyed per tier, so a startup crossing a boundary could see its composite *fall* as a dimension improved. Two findings that correct earlier framing: the ÷5 → ÷9 fix **narrows** differentiation (AgroLink/MediSync gap 44 → 24) and is a correctness fix, and **the measured sector effect is about one point**, so 2b is correctness and configurability, not a differentiation win. `tier_configs` is empty on Neon, so the hardcoded 85/70/55/40/25 ladder is what runs and is now harsher against ÷9 scores. The volume-ladder result stands in direction (an 87% cut in rubric text left aggregate placement flat, and stripping bodies made Technology/Acceptance *worse*) but its magnitudes were scored against the reference broken below. **Branch-hygiene lesson:** a long-lived measurement branch that edits shared docs should merge `master` **before** writing to them.

**The ground-truth audit inverted Objective 1b (2026-08-05).** The session set out to recalibrate the O/R/I rubric rows and instead found the reference was wrong. Metric 1 had scored placement against seeded `StartupReadinessLevel` rows — UI demo fixtures, **contradicted by their own documents in ten of twelve cells** (seeded Market 4 requires "no prospect has yet indicated a specific willingness to pay" beside a document stating PHP 5,000 MRR). Re-scoring the same calls reversed the direction. Against a reference fixed *before* the generations existed (`2026-08-05-corrected-reference.json`, 18/18): **corpus 0.22 MAE / 36-36 within one rung vs baseline 0.69 / 29-36**, read against a byte-identical null control whose own spread is 0.25 MAE and 1 rung. The corpus arm is *exactly* right on O/R/I where both corpus-free arms inflate. **The reference-free figure is the one to quote:** three rungs require an artifact class neither document mentions, so any placement above them asserts absent evidence — baseline **61%**, corpus **0%**. `src/demo-readiness-levels.ts` became the single source for the levels (`main.ts`, the harness and `seed-demo-full.js` had held three states between them, which is how the app and the study drifted). The O/R/I recalibration is **cancelled, not deferred** — those rows are now exactly right. **Methodological lesson:** a reference can be independent of the prompt and still be wrong; three reps agreeing in direction tested sampling noise, not the reference. **Limit that must travel with every figure:** this is the levels probe, a harness construct — production never asks the model to assign levels.

---

**Supplied-level fabrication probe (2026-08-06).** Closed the gap that every grounding number to date was the *levels* probe, where the model infers the level; production does the opposite — mentors set levels and the RNA path consumes them. Needed a manipulation, because the 2026-08-05 ground-truth correction had removed the trigger without touching the vulnerability: `--level-condition=truth|inflated` inflates O/R/I to 3 while T/M/A stay at truth as a within-call control. **Result (n=2, 16/16 calls): only corpus+inflated fabricates — `deviation-deterministic` 2/12 (17%), baseline 0/12 under *both* conditions.** The wrong supplied level alone produces nothing. Both flagged clauses weld a fabricated artifact to a true document fact (*"Currently at RRL 3, with legal counsel engaged and a trademark application pending with IPOPHL"*). **Organizational is the level-isolating cell** — ORL 3 reaches the model under both conditions, so identical rubric text with only the supplied level differing flips *"Needs: advance to ORL 3 by engaging the first non-founder contributor"* into an assertion that one exists; that rules out "the corpus added new text" as the explanation, and it was recorded in the spec before the run. Reading `flaggedClauses` by hand found two more genuine fabrications sitting in `unclassified`, so **17% was a floor**. **Three design defects, all in the spec rather than the implementation** (the tests were written from the same mistaken model): the classifier admitted bare copulas, `absentTokens` had `contractor` but not `contributor` — the word ORL 3's own rubric uses, so Organizational would have read 0 for the wrong reason — and inflating to 4 would have skipped the very row the probe was about. The classifier was deliberately **not** patched and the data not re-scored; the fingerprint guard enforces that mechanically. Superseded by the 2026-08-09 re-run.

**The assertion classifier repaired, and five cues cut (2026-08-09, PR #24).** The recorded diagnosis was a third of the picture: of 14 `unclassified` clauses, **12 were recommendations mis-binned** (the model's `Needs:` label form, and coordination splits stranding fragments from their governing modal) — recommendation detection, not assertion detection, was the dominant defect. A counterexample to the module's lower-bound guarantee was already in the collected data (a fragment stranded from its `must` and scored `asserted`), fixed by **scope inheritance**: a continuation inherits its governing clause's negation/recommendation cues and **never** its assertion. **Five assertion cues (`require`, `existed`, `existing`, `exists`, an accompaniment predicate) were specified and all five cut after review** — each failed the same way, the artifact token being an attributive modifier rather than the head of its phrase. The killer: *"Investor interest exists"* and *"A basic funding plan exists"* are structurally identical, so the genuine detection worked only because `plan` happens to be a head noun. **The assertion branch therefore ships byte-identical**; all recovery came from the recommendation side, and both genuinely missed assertions are known uncaught classes with tests — a lower-bound statement, so it costs the headline nothing. **Re-run** (`results/2026-08-09-supplied-level.json`, 16/16, n=2): only corpus+inflated fabricates — `deviation-deterministic` inflated **3/12 (25%)**, baseline **0/12 under both conditions**; all three clauses are one mechanism (IRL 3's funding plan asserted as drafted). `--merge` refused to pool into any `assertion|*` group while pooling the untouched metrics. **Quote the hand count: 6/12; the reported 3/12 is a floor**, and the known-uncaught classes are why the floor is trustworthy. **Both pre-registered predictions were wrong, in opposite directions.** AgroLink fabricated this time, closing 2026-08-06's open question — its earlier zero was chance, not a property of the document. Metric 2 returned non-zero for the first time (baseline 2/24, corpus 1/24) — a hint at n=2, confirm against earlier files before quoting. **Mutation lesson that has since recurred twice:** nine mutants, nine killed, but **two first read as survivors and had silently failed to apply** (`String.replace(string, string)` takes only the first occurrence; a `\n` anchor against a CRLF file) — **a mutation that fails to apply reports a green suite, indistinguishable from a decorative guard.** Assert the mutation landed. Suite 178 → 207.

---

## 2026-08-18 — the adversarial summary, measured

Branch `feat/adversarial-summary`. Spec and plan under `docs/superpowers/`; the run is `backend/measurement/results/2026-08-18-summary-bias.json`.

### What shipped

`generateStartupAnalysisSummary` now runs a field-ordered `responseSchema` (`unmet_criteria` → `critical_risks` → `summary`) behind `AI_ADVERSARIAL_SUMMARY_ENABLED`, with the shipped prompt preserved verbatim as `LEGACY_SUMMARY_PROMPT` for the baseline arm. `src/ai/summary-tone.ts` is the SO 4.4 instrument, one copy imported by both the service and the harness. The verdict persists as an `analysis_summary` `AiRecommendation`.

**SO 4.2 targets the readiness *summary*, not a score** — the objective text names the summary, and the branch delivers it there. **The readiness-scoring path is untouched**: `createBasePrompt`, `reviewBiasScore` and `normalizeAiScore` are unchanged, so checklist objective 4b stays 🟡. `reviewBiasScore` (`ai.service.ts:339`) is **mislabelled, not misplaced** — its only two call sites review an RNS *target level* (`rns.service.ts:373`) and a roadblock *risk number* (`roadblock.service.ts:224`), neither a readiness summary. Behaviour deliberately unchanged.

### The run — partial, 10/12 calls

`gemini-3.6-flash`, temp 0, grounding on, reps=3, 12 API requests spent. Two adversarial cells (rep1/MediSync, rep2/AgroLink) failed on **503 model overload, not quota**, and were deliberately not re-run: reported as partial, every mean over surviving rows, never padded. Validity gate passed — all 4 completed adversarial calls used `source=schema`, so no control output wears the adversarial label.

| arm | n | meanCritical | meanPositive | meanRatio | flagged | flagRate | meanUnmetCriteria | meanCriticalRisks |
|---|---|---|---|---|---|---|---|---|
| baseline | 6 | 1 | 1.67 | 0.39 | 0 | 0 | 0 (structural) | 0 (structural) |
| adversarial | 4 | 3 | 0 | 1.00 | 0 | 0 | 4 | 3.75 |

`structural` = the baseline arm has no criteria field at all, so its zero is not a measurement.

**1. The mechanism works.** More critical observations and real structured findings where the baseline structurally produces none, at 100% schema adherence. What was tested is the mechanism — field-ordered `responseSchema` + `propertyOrdering` — not wording, and Gemini honouring `propertyOrdering` is now supported by this run rather than assumed.

**2. The SO 4.4 flag rule is measured WRONG, and the run supplies its replacement.** `flagged = criticalCount === 0` fired **0 times in 10 summaries, in both arms**. Every baseline summary scored exactly `criticalCount: 1` — the legacy prompt mandates *"3. Critical risks and primary recommendations"*, so every baseline summary ends with a risk sentence. **The rule cannot fire against the prompt it exists to police.** The baseline summaries are plainly lenient (*"demonstrates strong market viability"*) with one dutiful risk sentence appended, so the bias is positive framing with a token risk mention, not absent critical language — the instrument tested for the wrong property. Per-call `ratio` separates the arms with **no overlap**: baseline `0.33 0.33 0.33 0.33 0.50 0.50`, adversarial `1.00 ×4`. A threshold at **~0.75** flags all six baseline summaries and none of the adversarial ones. Spec §3 planned exactly this — ship uncalibrated, let the run supply the distribution, the order `RAG_MIN_SIMILARITY = 0.78` was set in. ~~**Not implemented.**~~ **Implemented 2026-08-18**, see below.

**3. The differentiation guard did NOT pass.** Both arms `FAIL - uniform`, `criticalGap 0`. Specified pass/fail before the run, so reported failed. The adversarial arm is **saturated** — all four calls at `criticalCount: 3`, the maximum a three-sentence summary allows — so that column cannot discriminate; `unmetGap` is 0 because AgroLink 4,4 and MediSync 3,5 have coinciding means while the values differ in no consistent direction; and the **baseline arm also fails**, uniformly at 1. **This run cannot distinguish genuine overcorrection from instrument ceiling.** Resolving it needs a non-saturating metric, not more reps. The precedent that motivated the guard stands: `gemini-2.5-flash-lite` read as lenient but was floor-bound and blind, and the real defect was differentiation.

### Open items the review surfaced

- **The SO 4.4 verdict is unreachable by a Manager.** Nothing in `frontend/src` reads `confidenceStatus`, `positive-language-flagged` or `analysis_summary`, and both backend `AiRecommendation` queries filter `recommendationKind` `'RNA'`/`'RNS'`. The summary *text* is shown to Managers (`PendingDialog.svelte:86` and its Waitlisted/Qualified/Completed siblings); the verdict beside it is not. Decision taken: ship detection now, surface it as its own task. **An alert nobody sees is not an alert.**
- **`propertyOrdering` enforces sequence, not substance.** `unmet_criteria: []` is a valid response — `required` requires the key, not a non-empty array — and nothing cross-checks the summary against the criteria. A model could emit empty findings then a glowing summary. The tone check is the only guard, and it is the one that goes nowhere.
- **A literal JSON `null` degrades with no `recordFailure`.** `analysisSummarySchema.nullable()` means `null` *parses*, returns `null`, and falls back to legacy — 2 calls instead of 3, no failure metric. Its only trace is `notes.source === 'legacy'`, which is why `source` is load-bearing.
- **`measurement/tests/demo-proposals.test.js` asserts on source text, not behaviour** — it regex-matches the `.ts` file rather than importing `toApplicationDto`, so a `title:` inside a comment satisfies it and a changed *value* is undetectable.
- **Only the create path of `createStartupProposal` is tested.** Deleting the update branch's `recordSummaryProvenance` call leaves all three `startup.service.spec.ts` tests green — verified by mutation. Both paths do record in code; only one is covered. Mitigating: the update branch looks unreachable from its sole caller (`create()` always passes a brand-new `Startup`, whose `capsuleProposal` inverse side is necessarily undefined), and it predates this branch. Do not describe the spec as covering "both persistence paths".
- **`TONE_CUES` is an unused export** (`summary-tone.ts:48`) — zero consumers, not even its own spec. Harmless; dead at HEAD.
- **SO 5.3's premise is false in the code.** It describes the summary as generated "from URAT answers"; `UratQuestionAnswer` is CRUD-only and no AI call reads it — the summary is built from the capsule-proposal DTO. Out of scope, recorded so it is not discovered during a demo.
- **`CLAUDE.md` is wrong about the model.** It says `GEMINI_MODEL` "still defaults to `gemini-2.5-flash-lite`" and warns that model is unsuitable for bias work. Both `.env` and `ai-config.service.ts:21` say **`gemini-3.6-flash`**, and the switch is already recorded above. Flagged for John rather than edited.

### Fixes landed alongside

`seed-demo-full.js` hardcoded `./dist/src/` for the capsule proposals while building a layout-agnostic resolver four lines earlier; `recordSummaryProvenance`'s comment and `console.error` claimed the proposal was "already committed" when `flush()` inside `em.transactional()` only issues SQL — the commit happens when `create()`'s callback returns. `.superpowers/sdd/.../task-3-report.md` was untracked (`.gitignore:30` lists `.superpowers/` as scratch).

---

## 2026-08-18 (later) — the SO 4.4 flag rule, calibrated

Branch `fix/so-4-4-flag-threshold` off `master` at `70a66c4`. One predicate, one file, TDD + mutation testing. **No Gemini quota spent** — `analyzeTone` is pure.

`summary-tone.ts` ships `flagged = ratio < 0.75`, replacing `criticalCount === 0`. The calibration was read out of `results/2026-08-18-summary-bias.json` directly rather than from these notes: baseline `0.333 ×4, 0.500 ×2`, adversarial `1.000 ×4`, all ten `flagged: false`. 0.75 is the midpoint of the (0.50, 1.00) gap.

**The checklist item's title stated the predicate backwards.** It said "replace with `ratio >= 0.75`", but a *high* ratio means *more* critical, so flagging the lenient baseline is `ratio < 0.75`. Read as naming the balanced condition it was right; read as the flag rule it inverts the objective. Corrected in the checklist.

**Exactly 0.75 is balanced**, decided rather than measured — both arms sit far from it. This is the one place the module does not resolve ambiguity toward flagging: a 3-of-4-critical summary is not the leniency SO 4.4 polices, and flagging it would train the reviewing Manager to ignore the flag. Pinned by a test so a later "tightening" to `<=` has to re-open the trade-off.

**The old rule is subsumed** — `criticalCount === 0` forces `ratio 0`, so the new rule flags a strict superset and can trade away no existing detection. That is why the `criticalCount === 0` branch was dropped rather than OR'd in.

**Mutation testing changed the tests, not the code — and this is the transferable bit.** Five mutants; two survived a green suite. Both pointed at the same hole: the "measured shapes" test covered baseline's *modal* ratio (0.333, ×4) and not its *maximum* (0.500, ×2), so mutating the threshold to 0.5 passed while silently unflagging **two of the six** baseline summaries the change exists to catch. **Testing against the most frequent observed value felt like testing against the data; the value that constrains a threshold is the one nearest the boundary.** Added that case, re-ran, 5/5 killed, each asserted as landed per the 2026-08-09 lesson. The mutation script restores in a `finally`.

**Four of six fingerprints invalidated, not one as first assumed** — `tone|*` *and* `differentiation|*`, because `summary-fingerprint.js:60-64` embeds `toneSrc` in differentiation too (it is computed from `analyzeTone`'s counts). `criteria|*` is untouched, so **SO 4.2's result — 4 unmet criteria, 3.75 critical risks — stays poolable**. Verified by hashing HEAD's file text against the working copy with every other input held to a placeholder, so the delta is attributable to this file alone.

⚠️ **0.75 is calibrated, not validated.** It was set on the same 10 summaries it now scores, and re-scoring that file under it is the post-hoc move the fingerprint guard exists to forbid. Validation needs a **held-out** run.

**Gates:** jest **249 passing / 1 failing** (baseline 247/1; +2 net tests, and the single failure is the documented pre-existing `AiService › passes valid task responses through unchanged` — confirmed by name, not by count). Measurement **210/210**. `tsc --noEmit` exit 0.

### Then: the verdict reaches the Manager

Same branch. `GET /startups/all` now carries a `summaryVerdict` per startup, and one `SummaryToneBadge` renders it in all four dialogs a Manager opens from `/applications`. `PendingTab.svelte` renders those dialogs too and was **not** wired — it is imported nowhere and §4 already lists it for deletion.

**The specified design would have shipped an empty badge, and only a live probe showed it.** `ai_recommendations` holds RNA 6 / RNS 8 / Roadblock 3 and **zero** `analysis_summary` rows: the persistence path only runs for proposals created through `createStartupProposal`, and both demo proposals were written directly by `seed-demo-full.js`. A row-only badge would render nothing on the only two startups a demo opens — the same "alert nobody sees" one layer out. So the verdict is recorded-row-first with a live recompute fallback, and `source` is shown in the UI rather than smoothed over. A recorded row **wins over a disagreeing fresh reading**: it is attributable to a generation run and a fresh reading is not. Verified live — with a temporary row in place, AgroLink reported `recorded`/flagged while its text reads balanced at ratio 1.0.

**Two things the unit tests structurally cannot see, both live-verified:**
- **Serialization.** MikroORM builds `toJSON()` from *declared* properties, so the 9/9 green service tests — which assert on the in-memory entity — would have passed with the field never reaching the browser. Declared as `@Property({ persist: false })` and confirmed through `toObject`/`toJSON`/`JSON.stringify` and a real HTTP round-trip.
- **Schema.** `main.ts` runs `updateSchema()` on every boot, so a persisted property would silently add a column to whatever DB is configured. `getUpdateSchemaSQL()` (dry run) returns **0** statements.

**A false negative that nearly became a bug report.** The first serialization probe reported the field ABSENT. The cause was the probe, not the code: **`mikro-orm.config.ts` hardcodes `entities: ['./dist/**/*.entity.js']`**, so a build emitted anywhere else silently loads *stale* entities from `dist/`. Any out-of-dist probe must override `entities`, or it is measuring the last build. Same family as the known `seed-admin.js` hardcoded-`./dist/` breakage.

**Login without the login form.** Browser automation still cannot drive the SvelteKit login form (open item 6), and typing passwords into forms is off the table anyway. `hooks.server.ts` verifies the `Access` cookie locally with `jose`, so a token from `POST /auth/signin` set as a cookie via `javascript_tool` produces a fully authenticated Manager session. This is the cheap way to browser-test any role. **Item 6 is NOT closed** — a human click-through is still owed.

**Also worth knowing:** dark mode is **class-based** (`html.dark`, mode-watcher), so `prefers-color-scheme` does not drive it and a colour-scheme toggle in devtools proves nothing. Toggle the class. Both palettes verified (amber-100/900 light, amber-900/100 dark).

**Gates:** jest **262 passing / 1 failing** (+6 service tests, +7 resolver tests; same single documented failure). `tsc --noEmit` exit 0. `svelte-check` **160 errors / 16 warnings / 46 files — byte-identical to the baseline measured with the changes stashed**, and none in the touched files. That baseline was not recorded anywhere before; it is large and pre-existing, so `pnpm check` can only be read as a delta here.

---

### Then: the threshold validated on held-out generations

`results/2026-08-18-threshold-validation.json`, `gemini-3.6-flash`, temp 0,
reps=3. **Partial: 9/12 calls, 12 API requests** — three cells lost to 503 model
overload (not quota), deliberately not re-run. Pre-registered in
`docs/superpowers/specs/2026-08-18-threshold-validation-design.md` and committed
**before** the first call.

| arm | n | meanCritical | meanPositive | meanRatio | flagged | flagRate |
|---|---|---|---|---|---|---|
| baseline | 5 | 1 | 2 | 0.33 | **5** | **1.00** |
| adversarial | 4 | 2.25 | 0 | 1.00 | **0** | **0.00** |

**`ratio < 0.75` separates the arms perfectly on generations it has never seen.**
Every baseline summary flagged, no adversarial summary did. And the original
defect reproduced independently: every baseline summary again scored exactly
`criticalCount: 1`, so **the old `criticalCount === 0` rule would have fired 0/9
here too**.

**What this does and does not establish.** Held out is the *generations*, not the
documents — same two startups, same prompts. It rules out the weakest failure
(resampling) and says nothing about other source material. **Baseline ratio was
0.333 on all five calls — zero variance.** The margin to 0.75 is wide, but the
distribution is degenerate: the legacy prompt reliably yields two positive
sentences and one risk sentence. So this is robustness to resampling of a very
stable structure, not evidence the threshold survives a different prompt. The
2026-08-18 calibration run had *some* spread (0.333 and 0.500); this one had
none, which is weaker in that one respect.

**A pre-registered prediction was wrong, in the direction that matters.** I
predicted the differentiation guard would fail again for both arms. Baseline did
fail (`FAIL - uniform`). **Adversarial read `PASS`** — but on `nEarly=1` vs
`nMid=3`, an unbalanced pool the project's own rule says not to quote from, so
the PASS is an artifact, not a result. The stated *reason* for the prediction also
failed: the adversarial arm was **not** saturated this time (`criticalCount`
2, 2, 2, 3 against the previous run's uniform 3), so "saturated at the ceiling of
a three-sentence summary" does not reproduce as a general property.

**Correction to the pre-registration, made after the run.** It claimed `--merge`
would refuse to pool tone across the fingerprint boundary. **`--merge` does not
exist on this harness** — it is `measure-grounding.js` only. `measure-summary-bias.js`
records fingerprints but nothing acts on them, so the guard here is documentary
rather than mechanical. The four changed fingerprints were verified against the
real stored values (`tone|baseline` `bbb846c48639` → `d193238ccc86`), and
`criteria|*` is unchanged, so the SO 4.2 criteria result can still legitimately
gain n.

**Quota note that cost time.** `ai_generation_runs` is **not** a usable quota
ledger for measurement runs — the harness header says this path "opens no
`ai_generation_runs` row and touches no EntityManager", and the table's most
recent rows are from 2026-07-31. Budget from `apiRequests` in results files plus
UI-driven generation. Also: Neon went unreachable for ~40 minutes mid-session
(TCP accepted, then `ECONNRESET`) and recovered on its own; the harness needs
Neon reachable even for `--dry-run`.

---

### Then: metric 3 diagnosed, not yet rebuilt

No quota spent — the diagnosis came from re-scoring both stored runs.

**The differentiation guard is itself the defect**, not merely saturating.
`differentiationTable` decides `separates = (critGap !== 0) || (unmetGap !== 0)`
— an exact-inequality test on a mean of 1–3 small integers. Three defects, worst
last:

1. **Saturation** (the recorded concern): `criticalCount` ceilings at 3 in a
   three-sentence summary; adversarial early `[3,3]` vs mid `[3,3]` is the
   ceiling, not agreement.
2. **No noise floor:** the validation run's adversarial `PASS` came from
   `criticalGap −0.33` — **one** early call against a 3-call mean.
3. **No sign check:** that −0.33 means the arm criticised the *mid*-stage
   proposal more than the early-stage one. **A PASS can be earned by
   differentiating backwards.**

**The finding that decides the redesign:** both columns are degenerate for
different reasons. `criticalCount` is ceiling-bound; `unmetCriteria` is
structurally unbounded (prompt says "list *every*", schema sets no `maxItems`)
yet its **means coincide**: AgroLink `4,4` vs MediSync `3,5` on the calibration
run, `4` vs `4,4,4` on the validation run. (⚠️ This block originally read
"exactly 4 on all 8 successful adversarial calls" — **wrong**, corrected
2026-08-19 from the results files. Six of eight are 4, with a 3 and a 5. The
column is unsigned variance whose means coincide, not a constant; the conclusion
survives, since variance with no direction still cannot separate arms.) **So no count-based metric can
separate these two startups** — a better statistic over the same numbers cannot
help. What may differ is *which* criteria are cited, and the harness stores
`unmetCriteria` as a **count only**, discarding `criterion`/`proposalField`
before the results file.

Design agreed, implementation not started — see the metric 3 item in
`TODO_CHECKLIST.md` for the three parts.

### Branch state at close

`fix/so-4-4-flag-threshold`, **7 commits, local, nothing pushed.** Assessed
mergeable: `master` is an ancestor (fast-forwardable), `merge-tree` reports no
conflicts, working tree clean, 16 files all intentional. Gates **re-run at the
tip**, not carried over: jest **262/1**, measurement **210/210**, `tsc` 0,
`svelte-check` **160/16/46 — identical to master's baseline**. The single jest
failure is the documented `AiService › passes valid task responses through
unchanged`, and the branch touches neither `ai.service.ts` nor its spec.

Two notes for whoever merges: the branch is **wider than its name** (flag rule →
`0b92c86`, Manager UI → `7507490`, measurement → `282294e`, if they want
splitting), and **no migration is needed** — `summaryVerdict` is `persist: false`
and produces 0 DDL statements.

---

## 2026-08-19 — metric 3 rebuilt, parts 1 and 2

Branch `measure/non-saturating-differentiation` off `master` at `67f6071`.
**Zero Gemini quota** — every number below is re-scored from stored runs or from
pure functions.

### The count-based verdict was retired, not hardened

The checklist prescribed hardening `separates` with direction, magnitude and a
minimum n. Once field overlap owns the verdict that is the wrong move: hardening
a rule over columns diagnosed as unable to separate these two startups makes a
broken instrument stricter, not fixed. So `separates` and its PASS/FAIL are
gone. The counts stay as descriptive columns, cells below `MIN_CELL_N = 2` carry
`underpowered`, and each gap prints `criticalFavours` / `unmetFavours`
(`early` / `mid` / `neither`) — defect 3 made legible rather than tested for.

### `lib/field-overlap.js`

`crossOverlap` (Jaccard over early-rep × mid-rep normalised proposal-field sets)
read against `withinOverlap` (same-startup rep pairs, pooled) as an **intrinsic
noise floor**; `separation = within − cross`. The old guard had no floor at all,
which is how one call produced a PASS.

**Two decisions that carry the metric's validity:**

- **Jaccard of two empty sets is `null`, never `1`.** The baseline arm cites no
  proposal fields anywhere — `legacySummaryOnly` has no criteria field to fill,
  which `criteriaTable` already guards as `structuralZero`. Scoring `0/0` as
  perfect agreement would have reported that arm as **maximally uniform**: a
  damning-looking finding manufactured entirely from a missing schema field.
- **Normalisation is load-bearing, not cosmetic.** `proposal_field` is a bare
  `STRING` in the response schema (`ai.service.ts:178`), *not* an enum over the
  DTO's fields — the observed values only look like a controlled vocabulary
  because the prompt names the DTO. Without normalising, one field in two
  spellings reads as two fields and every overlap number is low for a formatting
  reason.

### No PASS/FAIL is issued, by decision

`separation` needs a margin; none has been observed, and setting one from the
run it would score is the post-hoc move the fingerprint guard forbids. The
verdict reads `n/a` with a reason (`underpowered`, `no scoreable field
citations`, `margin not pre-registered`). Part 3 pre-registers it. **This was
John's call** — the alternative on the table was shipping `0.15` as a pinned
judgement.

### What the stored runs would have said

A *rule* correction on the same generations, never a new result. Overlap cannot
be replayed: the criteria detail was never stored, which is the defect part 2
fixes.

| run | arm | was | now |
|---|---|---|---|
| calibration | baseline | `FAIL - uniform` | `n/a - no scoreable field citations` |
| calibration | adversarial | `FAIL - uniform` | `n/a - no scoreable field citations` |
| validation | baseline | `FAIL - uniform` | `n/a - no scoreable field citations` |
| validation | **adversarial** | **`PASS`** | **`n/a - underpowered`** |

The withdrawn PASS also now prints `criticalGap −0.33 (favours mid)` — the arm
criticised the *mid*-stage proposal harder, and that direction is visible in the
output instead of buried in an absolute test.

### Fingerprints, verified rather than assumed

Computed against both stored files: `criteria|*` **byte-identical to both**, so
SO 4.2's result stays poolable; `tone|*` identical to the validation run and
differing from the calibration run only by the pre-existing 0.75 threshold
change; `differentiation|*` moved for both arms against both runs, which is
correct — it gained `overlapSrc` and its definition changed.

### The harness that produced every published SO 4.2/4.4 number had no tests

`measure-summary-bias.js` and `lib/summary-fingerprint.js` had **zero** test
coverage. The measurement suite's 210 tests all cover the *grounding* harness;
the `differentiationGap` hits in `metrics.test.js` belong to
`measure-grounding.js`, a different metric. 27 tests added (field-overlap 17,
summary-differentiation 8, summary-fingerprint 2). **Still untested:**
`toneTable`, `criteriaTable`, `validity`, `sourceBreakdown`, `callDescriptors`.

### Mutation testing changed the tests, not the code — again

9/9 killed. The one survivor was `favours` mutating `gap > 0` → `gap >= 0`,
because no test covered a gap of **exactly 0** — the uniform-harshness case the
metric exists to detect, which the mutant relabels as differentiating in the
expected direction. It is also the modal reading in the real data: 7 of 8 gap
readings across both runs are 0. Identical shape to the 2026-08-18 lesson.

**A scripted edit silently failed to apply mid-session, and the suite went green
anyway.** A Python replacement whose anchor contained `
` reached the
interpreter with the backslash collapsed, so it matched a real newline and found
nothing; the follow-up test run printed 24/24 pass, indistinguishable from
success. Only `assert s.count(old) == 1` caught it. **Every scripted edit here
needs a landed-assertion** — the 2026-08-09 mutation lesson generalises beyond
mutation.

### Correction carried into the older blocks

The 2026-08-18 diagnosis said `unmetCriteria` "came back exactly 4 on all 8
successful adversarial calls". **Wrong** — it is 4,4 / 3,5 / 4 / 4,4,4. Six of
eight are 4, with a 3 and a 5, so the column is unsigned variance whose means
coincide rather than a constant. The conclusion holds (variance with no
direction cannot separate arms), but "convergent model behaviour at temp 0" was
overstated. Corrected in place in both documents.

**Gates:** jest **262 passing / 1 failing** — the documented pre-existing
`AiService › passes valid task responses through unchanged`, confirmed **by
name**; this branch touches only `measurement/`. Measurement **237/237**
(baseline 210, +27). `npx tsc --noEmit` exit 0.

### Then: the margin pre-registered, and both prerequisites built

`docs/superpowers/specs/2026-08-19-differentiation-margin-design.md`, committed
**before** any generation it scores. Rule: **complete separation** —
`min(within-startup pair) > max(cross-startup pair)`. **No constant**, which is
the point: the same logic that made `ratio < 0.75` quotable, stated as a
condition rather than encoded as a number. Strict `>`, so a **tie FAILS** — the
rule does not resolve ambiguity toward PASS, because PASS is the claim being
made.

**The n bar needs both conditions, and writing the spec is what showed why.**
`nEarly >= 3 && nMid >= 3` alone is satisfiable while **null pairs shrink the
scoreable grid underneath it** — reachable whenever a call returns
`unmet_criteria: []`, which the schema permits. The chance reference
`1/C(nCross+nWithin, nWithin) <= 0.001` alone admits a lopsided 4×2 grid with a
single mid-side within-pair. Each covers the other's hole. That test is also the
only thing that kills the `MAX_CHANCE_REFERENCE` mutant.

**The spec self-review found a defect in the spec I had just written.** The rule
is defined on `min`/`max` of raw pair values, and `overlapStats` returned only
means — so the rule I had pre-registered **could not have been evaluated from a
stored run**, the identical defect that left both 2026-08-18 runs un-rescoreable
for overlap. Fixed as prerequisite 1, and verified on a dry run: recomputing
`min(within) > max(cross)` from the written JSON reproduces the recorded
`separated`.

**Prerequisite 2, `--only-arm`,** matching `measure-grounding.js`'s semantics
(exact beats prefix, unmatched is a hard error, ambiguous is refused). Metric 3
is scoreable on the **adversarial arm only** — the baseline cites no proposal
fields, so all its pairs are `null` by construction — so a full run spent 6
baseline calls that could not contribute. `--only-arm=adversarial --reps=5` = 10
cells, verified from real `argv`, and results files now record `armsRun` so a
filtered file is self-describing.

**Three things the dry run caught that no unit test could.** It printed
*"No PASS/FAIL is issued"* directly beneath a table reading `FAIL - uniform` —
the guidance text had become false the moment the margin was pre-registered. The
table had grown to 24 columns with the pair arrays truncated to `... 6 more
items`, so it is now split into "Counts — DESCRIPTIVE ONLY" and "Field overlap —
SCORED", with the raw arrays going to the results file rather than a console
that mangles them. And `console.table` was the only place the descriptive/scored
distinction was invisible.

**Mutation testing 16/16, and the guard earned its keep a second time.** One
mutant's anchor no longer existed — `verdictFor` had been rewritten to return an
object — and **without the landed-assertion it would have reported as KILLED**.
That is the 2026-08-09 lesson recurring within a single session: a mutation that
cannot apply is indistinguishable from a decorative guard.

**Also worth knowing:** `node -e "..."` cannot be given `--flag=value`
arguments — node parses them as its own options and exits. Probing a harness
whose config comes from `process.argv` needs a real script file.

**Gates:** measurement **257/257** (baseline 210). `npx tsc --noEmit` exit 0.
jest unchanged at **262/1** — this work touches only `measurement/`.

**What remains for metric 3 is the run itself**, `--only-arm=adversarial
--reps=5`, one full quota window. Predicted FAIL, with the informative failure
mode named in the spec.

**Branch state:** local, nothing pushed.

---

## 2026-08-20 — metric 3, part 3: the run

`results/2026-08-20-differentiation-overlap.json`. `--only-arm=adversarial
--reps=5`, **10 API requests, 10/10 succeeded, zero degradations** — the first
full grid this harness has produced (5 early / 5 mid, 25 cross pairs, 20 within).
No 503s, unlike both prior runs.

**Provenance is as clean as it gets here:** the rule was committed 2026-08-19
08:04 +0800 and the first call went out 2026-08-20 ~15:10 Manila, so the
pre-registration precedes the data by over a day, in git.

### The verdict: `FAIL - uniform`, quotable

| statistic | value |
|---|---|
| `crossOverlap` | 0.303 (range 0 – 0.500) |
| `withinOverlap` | 0.612 (range 0.125 – 1.000) |
| `separation` | +0.309 |
| chance reference | 3.2e-13 |

**The prediction was right in outcome and wrong in mechanism** — the third time
on this project a pre-registered prediction has landed that way. FAIL was
predicted *because* cross-overlap would be high (0.35–0.65) with small separation
(0.05–0.25). Cross-overlap came in **below** the band, separation **above** it.

**What failed is the noise floor, not the signal.** Cross-overlap never exceeds
0.5 — the arm never cites more than half the same fields for both startups, which
is the opposite of uniform harshness. Complete separation fails on one *within*
pair at 0.125. Split by startup: **AgroLink 0.800, MediSync 0.424.** The arm
cites the same four fields for AgroLink nearly every time (reps 0/1/2 produce
**identical** field sets) and wanders on MediSync.

**So the design flaw is mine, and it is worth carrying forward: pooling the
within-startup floor across both documents hid that one document is stable and
the other is not.** A per-startup floor would have separated them. It stays an
observation — re-scoring this run under a per-startup rule is precisely the
post-hoc move the pre-registration forbids, and the temptation was real, because
the means separate cleanly (+0.309) and a margin rule would have passed.

**The positive result: the instrument is not degenerate.** The pre-registered
"field identity is too coarse" failure mode needed `crossOverlap > 0.5` **and**
`separation < 0.1`; neither holds. Field overlap carries real signal — unlike the
count columns it replaced, which stayed degenerate here too (`criticalGap` 0,
`unmetGap` −0.2 favouring mid).

**Stability came in under prediction:** 0.612 against a predicted >0.7, and
bimodal rather than uniformly mid. The model is less deterministic on MediSync
than temperature 0 implies — worth remembering before treating temp 0 as a
guarantee of repeatability anywhere else in this project.

### Free n, fingerprint-verified

`criteria|adversarial` `82fc2961c7ff`, identical to both prior runs → SO 4.2
gains 10 calls: **3.9** mean unmet criteria, **3.2** critical risks (against 4 /
3.75 at n=4). `tone|adversarial` `e6304665e036`, identical to the validation run
→ **0/10 flagged, ratio 1.00 on every call**, a third independent confirmation
that `ratio < 0.75` does not fire on the arm that is behaving.
`differentiation|adversarial` is new (`2ddb92a91be5`), as it must be.

### A documentation hazard found while filing this

**Two different metrics are called "metric 3"** and both are discussed in
`measurement/README.md`: the grounding harness's differentiation *gap* over
readiness levels (declared unresolvable 2026-08-03) and this harness's
overcorrection *guard* over summaries. Different quantities, different harnesses,
opposite-looking sign conventions. A disambiguation note now sits at the head of
the `measure-summary-bias.js` section.

**Quota:** 10 of 20 spent in the window that opened 15:00 Manila 2026-08-20;
~10 remain.

---

## Open at end of 2026-08-20

**Branch state.** `fix/so-4-4-flag-threshold` **merged via PR #26** (merge commit `67f6071`) — the block above was written before that landed and describes it as unmerged; stale, left as written. `feat/adversarial-summary` merged via PR #25 (`70a66c4`), `measure/assertion-classifier-gaps` via PR #24 (`2195df8`). Not in `master`:
- **`measure/non-saturating-differentiation` — local.** Metric 3 parts 1 and 2.
- `docs/trim-notes-and-status-table` — pushed, needs a PR.
- `backup/rag-corpus-preflight` — disposable, holds 13.7 MB of PDF blobs; safe to delete.

**13 local branches have `[gone]` remotes** and are fully merged — worth a `clean_gone` sweep.

**Next step — in order.**
1. **Review `measure/non-saturating-differentiation`** (John tests first). Zero-quota, self-contained, gates green.
2. **Metric 3 is done** — rebuilt, pre-registered, run, `FAIL - uniform` recorded. If it is pursued further, the next step is a *separately* pre-registered rule with a **per-startup** noise floor, scored on new data. This run supplies the first observed overlap distribution to design against; calibrating on it and reporting the fit is the forbidden move.
3. **A cheaper test than part 3 exists and is still unclaimed:** `ratio < 0.75` is validated against one prompt whose output structure barely varies. A *different* summary prompt or a third document is more informative than a fourth rep of the same two.

**A cheaper validation than more reps:** `ratio < 0.75` is now tested against one prompt whose output structure barely varies. The informative next test is a *different* summary prompt or a third document, not a fourth rep of the same two.

**Quota at close:** the 2026-08-19 session spent **zero**. The window has reset since the 12-of-20 recorded on 2026-08-18, so budget part 3 against a fresh count — confirm from `apiRequests` in the results files, never from `ai_generation_runs` (the harness opens no rows there).

**Superseded next steps, kept so the trail is legible.** 2026-08-09 retired "add `exists` to the assertion cues" — both halves were wrong; the gaps were mostly *recommendation* detection, and AgroLink's zero was chance. 2026-08-18 retired "the live next step is 4b" — SO 4.2 is delivered and measured on the summary path. 2026-08-19 retired "harden the verdict rule" — with overlap owning the verdict, the count rule was retired rather than hardened, and the margin was deliberately left unset. 2026-08-18 (later) retired the threshold swap itself (correcting its stated predicate direction) and the Manager-surfacing task — the badge ships, so what is left is an action on the flag, not its visibility.

**Open decisions, not blocking:**
1. **Production cookie policy** (`sameSite: 'strict'` breaks cross-site once deployed) — checklist §1.
2. **RNS correlation-key uniqueness** and **stale verdicts on artifact edit** — the two 1c design decisions above.
3. **Tier thresholds uncalibrated** against ÷9 scores; `tier_configs` empty on Neon.
4. **`readiness_evaluations` holds mixed-scale rows** — 16 legacy ÷5 rows beside ÷9 rows, now also pre-correction composites. Database cleanup, not code.
5. **`mikro-orm.config.ts` disables TLS verification against Neon** (`rejectUnauthorized: false`); Neon uses a public CA, so this is probably just tightenable.
6. **One manual login + click-through of the auth-guard work is still owed** — browser automation could not drive the SvelteKit login form.
7. **Check VS Code's `git.postCommitCommand`.** Two branches reached GitHub with no `git push` issued in-session; a `push`/`sync` setting would quietly defeat the local-first rule.
8. **One checklist claim still needs confirming rather than trusting.** §1's "Guard the remaining unauthenticated modules" names exactly the six controllers the P0 fix above says it guarded and live-verified — left open with a warning rather than ticked. *(The suite baseline half of this item was closed 2026-08-18: re-run, 247/1 and 210/210.)*

**Still unmeasured:** RNA *generation* quality. Every grounding figure is the levels probe; production's RNA path retrieves 12 rubric rows rather than 54, and metric 2 has never produced a signal on any arm. Needs a **harder probe, not more reps** — longer documents, plausible distractors, partially-supported fields.

**Suite baselines (re-run 2026-08-18):** jest **247 passing / 1 failing** — the documented pre-existing `AiService › passes valid task responses through unchanged`; a *second* jest failure is a real regression. Measurement **210/210** (some docs said 207). `npx tsc --noEmit -p tsconfig.json` exit 0, and it is the only gate covering `startup.service.ts` — no spec imports it, so ts-jest never type-checks it.
