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

## Compressed history — 2026-07-26 → 2026-08-05

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

## 2026-08-06 — supplied-level fabrication probe

Branch `measure/supplied-level-fabrication`, 22 commits off `master` at `41afeb4`, **nothing pushed**. Spec and plan under `docs/superpowers/`, 7 subagent tasks with an independent review after each, then a whole-branch review.

Closes the gap named as the highest-value measurement left: every grounding number to date is the **levels** probe, where the model *infers* the level. Production does the opposite — mentors set levels and the RNA path consumes them.

### Why it needed a manipulation

The fabrication was observed while the seeded levels were still wrong (MediSync IRL 3). The 2026-08-05 correction moved MediSync to IRL 1, so retrieval now pulls IRL 1/2 and the funding-plan text never enters the prompt. **The fix removed the trigger without touching the vulnerability** — an observational re-run measures 0 and proves nothing. So `--level-condition=truth|inflated|both` runs the RNA probe per condition, inflating O/R/I to 3 while T/M/A stay at truth as a within-call control. `lib/assertions.js` scores each RNA per (call, dimension) for clauses that *assert* an absent artifact, separating that from correctly *recommending* it — at IRL 1, "draft a funding plan" is the RNA doing its job; "the venture has drafted a funding plan" is the defect.

### Three design defects, none findable by testing

All three were in the spec, not the implementation — the tests were written from the same mistaken model that produced the spec.

1. **The classifier admitted bare copulas.** "Investor interest is growing" scored as fabrication, inverting the lower-bound property the whole claim rests on.
2. **`absentTokens` had `contractor` but not `contributor`** — the word ORL 3's own rubric uses. Organizational would have read 0 for the wrong reason, and 0 is the conclusion favourable to the corpus. Caught by the quota-free pre-flight, not by any unit test.
3. **Inflating to 4 skipped the row the probe was about.** Retrieval pulls `(L, L+1)`, so 4 pulls 4–5 and IRL 3 — the literal source of the observed instance — lands in neither condition. Changed to **3**.

A fourth, a real Critical: `--level-condition=inflated` let the **levels** probe run rubric-less under an *unchanged* fingerprint, so degraded calls would have pooled into the six collected levels files.

### The result (`measurement/results/2026-08-06-supplied-level.json`, 16/16 calls, n=2)

| arm | condition | asserted | mentioned | unclassified |
|---|---|---|---|---|
| baseline | truth | 0/12 | 2/12 | 1/12 |
| baseline | inflated | **0/12** | 2/12 | 2/12 |
| corpus | truth | 0/12 | 8/12 | 4/12 |
| corpus | **inflated** | **2/12 (17%)** | 11/12 | 4/12 |

**Only corpus+inflated fabricates; the wrong number alone produces nothing** — baseline is 0/12 under both conditions. Both flagged clauses weld a fabricated artifact to a true document fact, which is the insidious form:

> "Currently at RRL 3, with **legal counsel engaged** and a trademark application pending with IPOPHL."
> "Currently at IRL 3, with **a drafted funding plan** and PHP 5,000 in monthly recurring revenue achieved by February 2026."

The second reproduces the 2026-08-05 instance almost verbatim.

**Reading `flaggedClauses` by hand changed the finding.** Two more genuine fabrications sat in `unclassified` — *"A basic funding plan **exists**…"* and *"…alongside a **first non-founder contributor**"* — missed because `exists` is not an assertion cue and clause fragments lose their subject. So the effect reproduced across **both** reps and Organizational fabricated too. **The measured 17% is a floor**; the lower-bound property held, and the audit dump is the only reason it is visible.

**The level-isolating cell is the strongest part.** Truth pulls ORL 2+3, inflated pulls ORL 3+4 — so ORL 3 reaches the model under *both*. Same rubric text, only the supplied level differs: *"Needs: Advance to ORL 3 by engaging the first non-founder contributor"* under truth, asserted as present under inflation. **That rules out "the corpus added new text" as the explanation.** Investment and Regulatory confound level with text; Organizational separates them. Recorded in the spec *before* the run.

**Limits:** n=2, 16 calls, and **every fabrication came from MediSync** — AgroLink produced none. `unclassified` is 4/12 on corpus arms, and the design says do not quote a rate when that column is large. The Organizational finding is qualitative. Inflation is one rung above the ceiling, not two, so a null would have supported only "a one-rung error did not induce fabrication" — the interpretation table was rescoped for that before the run.

**Deliberately not done: the classifier was not patched and this data not re-scored.** That is the post-hoc move, and the fingerprint guard enforces it — editing the classifier changes the `assertion*` hash, so re-scored results refuse to pool. A fixed classifier means a fresh run as a separate experiment.

**Process notes:** the 15 pinned fingerprints held across 22 commits, verified byte-identical rather than claimed. A subagent reported RED-phase test figures that were arithmetically impossible (131 + 8 = 132) — the code was fine, the transcript was reconstructed from memory. **Assume reconstruction whenever reported numbers don't reconcile.**

### Documentation maintenance pass (same day, later)

`SESSION_NOTES.md` 1106 → 262 lines, `TODO_CHECKLIST.md` 602 → 527 with a new **Objective | Status** table between "Recently completed" and §0. Sessions before 2026-08-04 compressed to outcome-only paragraphs; cross-session gotchas hoisted into one standing-notes block rather than re-narrated per session. All 48 open checklist items survive. Rules recorded in `CLAUDE.md` under **Documentation maintenance** so this happens proactively.

Three checklist changes that are state claims, not wording:
- **Closed two §5 items** the document already described as done — storage provider (code + credentials live-verified) and model selection (default raised and verified).
- **Added three items previously buried in prose:** `responseSchema` (marked "still unaddressed" inside the model item), and the two 1c design decisions (RNS correlation-key uniqueness, stale verdicts on edit) that existed only in these notes.
- **Failing-test count corrected to 216/1** from the 2026-08-04 notes — *not* from a run in this session.

Branch `docs/trim-notes-and-status-table` (`5e844b0`), pushed, **PR not yet opened**.

---

## 2026-08-09 — the classifier repair, and five cues that did not survive review

Branch `measure/assertion-classifier-gaps`, 19 commits off `master` at `69a9387`, **nothing pushed**. Spec and plan under `docs/superpowers/`, executed task-by-task with an independent review after each and a whole-branch review at the end.

### The recorded diagnosis was a third of the picture

The standing next step named two gaps: `exists` missing from the assertion cues, and `splitClauses` yielding subject-less fragments. Dumping all 35 classified clauses from the 2026-08-06 run showed something different. Of the 14 `unclassified` clauses, **12 were recommendations mis-binned** — seven via the model's `Needs:`/`Need:` label form (`RECOMMENDATION` required `need\s+to`), five via coordination splits stranding a fragment from its governing modal. Only 2 were missed assertions. **The dominant defect was recommendation detection, not assertion detection.**

The fragment diagnosis was also wrong in mechanism: the split happened at **`Dr.`** inside a founder name, not at a coordination.

### A counterexample to the lower-bound guarantee was sitting in the collected data

`"and maintain an active log of investor pitches conducted."` had been stranded from the `must` in its head clause and scored `asserted` on `ASSERTION`'s `maintains?`. The module's header claims every ambiguity resolves *away* from fabrication; this was one resolving toward it. It did not move the published 2/12 — that call's Investment was already asserted on a legitimate clause — but the guarantee was a claim rather than a property.

Fixed by **scope inheritance**: a continuation fragment inherits its governing clause's negation/recommendation cues and **never** its assertion. Inheritance is of *cues*, not of a verdict, because head clauses frequently carry no artifact token and so classify as `null`.

### Five assertion cues were built or specified, and all five were cut

This is the substantive outcome. `require`, `existed`, `existing`, `exists`, and an entire accompaniment predicate were each written into the spec or plan by me and each removed after review. **Every one failed the same way: the artifact token turned out to be an attributive modifier rather than the head of its phrase**, so the cue fired on clauses asserting nothing.

- `existing` — *"Existing investor sentiment remains cautious"* scored as fabrication.
- accompaniment (`alongside`, `as well as`, …) — **14 of 14** constructed realistic clauses false-positived; *"The pilot ran alongside barangay officials to obtain a permit"* fires on a clause saying the permit is **not** obtained. Hardening with a determiner requirement was measured at 14 → 2 and rejected.
- `exists` — the killer: *"Investor interest exists"* and *"A basic funding plan exists"* are **structurally identical**. The genuine detection worked only because `plan` happens to be the head noun. No syntactic restriction separates them.

**So the assertion branch ships byte-identical to before this work.** All recovery came from the recommendation side. Both genuine missed assertions are now **known uncaught classes with tests** — a lower-bound statement, so it costs the headline claim nothing.

### The re-run

`measurement/results/2026-08-09-supplied-level.json`, 16/16 calls, n=2, every parameter identical to 2026-08-06 except the classifier.

| arm | condition | asserted | mentioned | unclassified |
|---|---|---|---|---|
| `baseline` | truth | 0/12 | 4/12 | 0/12 |
| `baseline` | inflated | **0/12** | 4/12 | 0/12 |
| `deviation-deterministic` | truth | 0/12 | 8/12 | 0/12 |
| `deviation-deterministic` | **inflated** | **3/12 (25%)** | 11/12 | 3/12 |

**The core finding reproduced independently.** Only corpus+inflated fabricates; the wrong supplied level alone still produces nothing. All three clauses are one mechanism — IRL 3's funding plan asserted as drafted. `--merge` **refused** to pool into any `assertion|*` group while pooling the untouched metrics: a separate experiment, not more n.

**Instrument effect:** `unclassified` 14 → 3, `recommended` 13 → 28.

**The rate rose 2/12 → 3/12, and the instrument cannot explain it.** The assertion branch is unchanged and every landed change can only move clauses *out of* `asserted`. A stricter instrument reading higher is sampling.

**Both pre-registered predictions were wrong, in opposite directions** — the spec predicted *higher* on the strength of cues that were then all cut; the revised prediction was *same or lower*. Recording this because they were committed in writing before the run, and a prediction reported only when it lands is not a prediction.

**Quote the hand count.** All three `unclassified` clauses are genuine fabrications, and all three sit in the classes deliberately left uncaught (coordination, accompaniment, `with`). By hand the rate is **6/12**; the reported 3/12 is a floor. The known-uncaught classes are why the floor is trustworthy.

**AgroLink fabricated this time**, closing 2026-08-06's open question: its zero was chance, not a property of the document. Declining extra AgroLink reps was right — both startups sit at `O2 R1 I1`, so the manipulation is identical on both and reps could not have isolated the document.

**Metric 2 returned non-zero for the first time** (baseline 2/24, corpus 1/24, unchanged `stage-markers.js`, truth-condition text). Confirm against earlier files before quoting — at n=2 this is a hint.

### Process notes worth keeping

- **Nine mutants, nine killed** — but **two first read as survivors and had silently failed to apply**: `String.replace(string, string)` takes only the first occurrence and the doc comment quotes the regex above it, and a multi-line anchor used `\n` against a CRLF file. **A mutation that fails to apply reports a green suite, which is indistinguishable from a decorative guard.** Assert the mutation landed.
- Reverting the `RECOMMENDATION` widening also breaks three continuation fixtures — those fragments inherit a `Needs:` head, so the two changes are coupled and the suite now shows it.
- **Nearly every review finding was a defect in my planning documents, not in implementation.** Three fixture-provenance defects (one truncated, one **spliced from two startups' outputs** and present in no results file), plus the five cues. The splice manufactured a RED failure neither source sentence produces.
- A subagent was killed mid-run by a session limit and **left a live mutation in the working tree**. Nothing was committed; the pass was redone as a script with a `finally` restore.
- The whole-branch review attributed a lost detection to the `baseline` arm; the implementer disputed it and was right — it is `deviation-deterministic`. **Reviewers are not automatically right either.**
- Suite 178 → **207 passing / 0 failing**. `assertion|baseline` fingerprint `4c1429815dc7` → `529dd55beb2c`.

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

## Open at end of 2026-08-18

**Branch state.** `feat/adversarial-summary` **merged via PR #25** (merge commit `70a66c4`) — the 2026-08-18 block above was written before that landed and said "25 commits, unpushed"; it is stale and left as written. `measure/assertion-classifier-gaps` merged via PR #24 (`2195df8`). Not in `master`:
- **`fix/so-4-4-flag-threshold` — 7 commits, local.** The flag rule, the Manager-facing verdict, and the held-out validation run.
- `docs/trim-notes-and-status-table` — pushed, needs a PR.
- `backup/rag-corpus-preflight` — disposable, holds 13.7 MB of PDF blobs; safe to delete.

**13 local branches have `[gone]` remotes** and are fully merged — worth a `clean_gone` sweep.

**Next step.** A **non-saturating differentiation metric**. Two runs have now failed that guard on the baseline arm, and the second showed the adversarial arm is not reliably saturated either — so the instrument, not the arm, is what needs work, and no number of reps fixes it. After that, SO 4.4 has a validated flag and a visible verdict but **no Manager action attached to it** — decide whether that is in scope before submission.

**A cheaper validation than more reps:** `ratio < 0.75` is now tested against one prompt whose output structure barely varies. The informative next test is a *different* summary prompt or a third document, not a fourth rep of the same two.

**Superseded next steps, kept so the trail is legible.** 2026-08-09 retired "add `exists` to the assertion cues" — both halves were wrong; the gaps were mostly *recommendation* detection, and AgroLink's zero was chance. 2026-08-18 retired "the live next step is 4b" — SO 4.2 is delivered and measured on the summary path. 2026-08-18 (later) retired the threshold swap itself (correcting its stated predicate direction) and the Manager-surfacing task — the badge ships, so what is left is an action on the flag, not its visibility.

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
