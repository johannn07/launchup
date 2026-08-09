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
- **`pnpm lint` runs `eslint --fix`** and rewrites the whole tree over a CRLF/prettier conflict (checklist §4). Check `git status` before committing after anyone runs it.
- **A fired scheduled task is not evidence it ran.** One fired, started its MCP servers, and never ran the command. Check for the artifact.
- **Use Node, not PowerShell, for storage probes.** PS 5.1's `Invoke-WebRequest` reported a *successful* Supabase PUT as failed with no status code.
- **`node inspect-prompt.js <startupId> [--dimension T]`** prints a real assembled prompt and stops before `sendToGemini` — zero quota.

---

## Compressed history — 2026-07-26 → 2026-08-03

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

---

## 2026-08-04 — three streams

| stream | outcome | where |
|---|---|---|
| Output validation (1c) | merged | `master` via PR #18 |
| Sector-aware weighted scoring (2b) | merged | `master` via PR #19 |
| Grounding n=3 + volume ladder | **not merged** | `measure/grounding-rep2`, 8 commits, unpushed |

### Output validation (Objective 1c)

`OutputValidatorService.validate({content, retrievalLowConfidence, maxLength?})` replaces three stub methods and the dead `recommendation-storage.service.ts` + `recommendation.entity.ts` (both deleted, along with the orphaned `recommendations` table). It checks exactly two things: **retrieval confidence** (`ragContext.lowConfidence` — a signal RAG already computed and the code was throwing away) and **length** against the limit each prompt itself declares to the model. Wired into RNA, RNS **and roadblock** generation, writing a real verdict to `ai_recommendations` in place of hardcoded literals.

**Scope decisions, and why:**
- **Groundedness and stage-appropriateness checks deliberately excluded** — both probes measured saturated (0/15 fabrication, 0% stage-inappropriate at n=3), so there was no observed failure mode to validate against. This is a length-and-confidence validator, not "full output validation". *(Partly refuted 2026-08-06 — see below.)*
- **No model-judged validation** — deterministic only, so the validator is testable without a live call.
- **Three separate `*_MAX_LENGTH` constants, not one shared limit** — separate contracts to separate prompts, no reason to move together.
- **No backfill, by design.** Pre-existing rows keep their old `'validated'`/`'high-confidence'` literals, so a `'validated'` status on an old row is **not** evidence the validator ran. Retroactively computing a verdict would be fabricating provenance.

**Two open design decisions, escalated rather than patched:**
1. **The RNS correlation key `(generationRun, dimensionKey)` is not unique** when `no_of_tasks_to_create` produces more than one task per dimension per run — the lookup `Map` keeps only the last, so a flagged task can be invisible in the payload. A proper fix needs an artifact FK on `ai_recommendations`, unavailable at record time (persist-then-flush) — schema change, not a patch.
2. **The verdict goes stale** if `update()` or `refineRna()` later rewrites the text. Revalidate-on-write vs null-the-stale-verdict is a design choice.

**Caught along the way:** `roadblock.service.ts` was a third hardcoded writer the spec's own final grep missed (the spec assumed only two generation call sites). The RNA list payload was spreading the entire `AiGenerationRun` — model, config, tokens, error — into the response; the plan's own reference snippet did that.

### Sector-aware weighted scoring (Objective 2b)

New `weight_profiles` table + `WeightProfileService.resolve(sector, businessModel)` walking `(sector, businessModel)` → `(sector, null)` → global `(null, null)` → `DEFAULT_WEIGHTS`. `Startup` gained `sector`/`businessModel`. Invalid profiles (missing a dimension, or not summing to 1.0 ±0.001) are **skipped with a warning and the cascade continues** — returning zeros would be a silent scoring failure.

**Weights are keyed by sector/business model, not by tier — and `TierConfig.weights` was deleted.** The checklist had instructed reading weights from `TierConfig`; that column was keyed per **tier**, so a startup crossing a boundary would have its weight vector swapped underneath it and the composite could *fall* as a dimension improved. Non-monotonic in its own inputs is indefensible in a readiness score.

**Two findings that correct earlier framing, and both matter before anyone cites them to a panel:**

- **The ÷5 → ÷9 fix *narrows* differentiation, it doesn't widen it.** Levels run 1–9 but the old code clamped to 5 and divided by 5, so any level ≥5 read as 100% — inflating both scores and the *stronger* one more. AgroLink/MediSync gap fell **44 → 24** (32→17, 76→41). This is a **correctness** fix, full stop.
- **The measured sector effect is about one point** (MediSync 41 → 40 under healthtech). A weighted mean diverges from an unweighted one only in proportion to the spread of its inputs, and MediSync's per-dimension percentages are 33/44/56/44/33/33. Sector weighting would move a genuinely lopsided startup; it cannot manufacture separation between two internally flat ones. **2b is a correctness and configurability deliverable, not a differentiation win.**

**Live-verified against Neon** (real server, authenticated): schema landed, `tier_configs.weights` gone, four composites exactly as hand-predicted, six dimensions including `regulatory`. **The null-matching proof needed strengthening** — `DEFAULT_WEIGHTS` is numerically identical to the seeded global row, so `fintech → 41` was equally consistent with "IS NULL matched" and "IS NULL silently failed and we fell back to the constant". Closed with a query-logged read-only probe showing the real `is null` SQL. Worth recording: that coincidence would have hidden a broken cascade indefinitely.

**`backend/update-demo-tiers.js` deleted** — it carried its own copy of the old five-dimension weights and `/5` divisor and would have silently invalidated the 17/41 figures the fixtures and docs depend on. Also: `tier_configs` is **empty on Neon**, so the hardcoded 85/70/55/40/25 ladder is what actually runs, and it is now effectively harsher against ÷9 scores — a deliberate calibration question left open, not quietly retuned.

### Grounding measurement — n=3 and the volume ladder

n=3 complete and balanced. Two new arms tested the standing volume hypothesis by holding level coverage fixed while stripping rubric text:

| arm | levels block | MAE | within1 |
|---|---|---|---|
| `baseline` | none | 0.78 | 30/36 |
| `deviation-deterministic` | 31,850 ch | 1.36 | 13/36 |
| `deviation-titles` | 12,552 ch | 1.69 | 15/36 |
| `deviation-bare` | 4,002 ch | 1.78 | 12/36 |

An **87% cut in block size left aggregate placement flat**, refuting the volume hypothesis by experiment rather than by argument. Per-dimension, two effects were hiding inside one number: Organizational and Investment are **volume-invariant** (−1.17 / −1.00 signed, identical to two decimals across the whole cut), while Technology and Acceptance **do** track volume and get *worse* as text is stripped — a bare title is an aspirational label with no criteria attached, so the body was the restraint.

**The control kept earning its keep:** `sdd-semantic` "beat" baseline in all three reps despite byte-identical prompts, so a consistent direction across three reps is **not** evidence of an effect in this study.

**All of these numbers were later retracted** — see 2026-08-05. They were scored against a broken reference.

**Harness:** `--only-probe=<rna|levels>` (metric 2 had been saturated at 0% on every arm since the redesign, so half of every rep bought nothing); ambiguous `--only-arm` prefixes now hard-error, because over-selection costs as much as under-selection against a 20/day cap; three separate renderers kept deliberately un-parameterised, because every fingerprint hashes `renderRubricBlock`'s source and editing it in place would have stopped three reps of data from pooling.

### Branch hygiene lesson

`measure/grounding-rep2` forked from `master` and sat through **two** merges, so its copies of the shared docs were two work streams stale and the write-up landed on a checklist still describing 1c as a stub. Both merge conflicts had the same shape — **each branch held the current version of a different row** — so resolution was "best of both", not "take one side". **A long-lived measurement branch that edits shared docs should merge `master` before writing to them, not after.**

---

## 2026-08-05 — the ground-truth audit inverted Objective 1b

Branch `measure/ground-truth-audit`, 6 commits off `master` at `2fa24a9`, **nothing pushed**.

The session started on the stated next step: recalibrate the O/R/I rubric rows to match the seeded ground truth. **Checking that ground truth first is why the session didn't do the work it set out to do, and that was the right outcome.**

### The reference was contradicted by its own documents

Metric 1 scored placement against the seeded `StartupReadinessLevel` rows — demo fixtures written for the UI, never derived from the capsule documents the model is shown. `metrics.js` justified them as *"independent of the prompt"*: true, a sound fix for a real problem, but **independence and correctness are different properties and only the first was secured.** Five cells are negated by their own document with no judgement call required:

| startup | dim | seeded level's own rubric text | the document |
|---|---|---|---|
| MediSync | Market 4 | "no prospect has yet indicated a specific willingness to pay" | PHP 5,000 MRR |
| MediSync | Organizational 4 | "first full-time hire beyond the founders" | "team grew to 3 founders" |
| MediSync | Investment 3 | "a written funding plan document with a stated amount" | no funding activity |
| MediSync | Technology 5 | "has not yet gone live for actual users" | paid subscriptions, 6 live facilities |
| AgroLink | Acceptance 1 | "no user has interacted with the product in any form" | paper prototype, 3 cooperatives |

Re-scoring the same 30 calls (`audit-ground-truth.js`, zero quota) **reversed the direction**: corpus arm 1.36 → **0.28** MAE against a document-derived reference, within-one-rung 13/36 → **36/36**. The O/R/I "displacement" was the corpus **correcting** baseline, not drifting from truth. Independent corroboration: the byte-identical control pair differs by 0.36 MAE under the seeded reference and by 0.03–0.08 under derived ones.

### The claim was restated to need no reference at all

Adjudicating the cells personally exposed why a model-set reference cannot carry the positive claim: **an adjudicator reading the document with the full rubric ladder in front of it is approximately the `deviation-deterministic` condition**, so agreement is near-circular. So the load-bearing claim was rebuilt on document facts only. Three rungs require an artifact class **neither document mentions anywhere** — ORL 3+ a non-founder contributor, RRL 3+ counsel engaged, IRL 3+ a written funding plan. `verifyAbsences` asserts those absences at run time rather than trusting the list, and ceilings are one rung *more* generous than the documents support, so the rates are lower bounds:

| arm | asserts absent evidence | rate |
|---|---|---|
| `baseline` | 11/18 | **61%** |
| `sdd-semantic` *(control)* | 10/18 | 56% |
| `deviation-deterministic` | **0/18** | **0%** |
| `deviation-titles` | 1/18 | 6% |
| `deviation-bare` | 1/18 | 6% |

Baseline places MediSync's Investment at 4–5 (*"initial investor conversations"*, *"angel funding secured"*) for a document containing no funding token of any kind. **This is an unsupported-claim rate measured directly against the source document** — Objective 1b's actual claim, doubling as an Objective 4 leniency result — and it is the strongest number the study has produced *because* it survives the reference being contested. Directional: silent on under-placement.

A mutation pass earned its keep again — changing `placed > spec.ceiling` to `>=` passed all nine tests while silently inflating every arm's rate.

### Demo levels corrected, and the duplication fixed first

John adjudicated by choosing the **strict** reading: AgroLink `T2 M3 A3 O2 R1 I1`, MediSync `T6 M5 A5 O2 R1 I1`.

**The duplication was the actual bug.** `main.ts` and the harness each held their own copy of these levels and `seed-demo-full.js` held none — which is how the app and the study drifted apart unnoticed. New `src/demo-readiness-levels.ts` is the single source; a measurement test **parses the TS source** and fails if seeder and harness disagree. Because `seedDemoStartup` returns early on `if (existing)`, editing the constant alone would never reach an existing database, so `seed-demo-full.js` repoints rows — but **only rows still carrying the seeder's own remark**, since replacing a mentor's rating with a seed value would be worse than leaving it stale. `--check-levels` reports and exits *before step 1*; naming it `--dry-run` would have been a lie, because the seeder's other six steps still write.

Applied to Neon: 8 rows changed, 0 skipped, re-run reports 0, verified by querying `startups_readiness_level` directly. Composites moved **AgroLink 17 → 26** (crossing the 25 tier threshold) and **MediSync 40 → 41**.

**Fingerprint consequence, and it is correct.** Levels sit inside `common`, so all 15 fingerprints changed and pre-correction runs are a closed historical set. `audit-ground-truth.js`'s `SEEDED` is deliberately **frozen** at the old values — that is what the collected runs were scored against — with a test asserting it does *not* track the harness, so a well-meaning sync cannot land quietly.

### The measurement against the corrected reference

18/18 calls. `measurement/results/2026-08-05-corrected-reference.json`. **First measurement scored against a reference fixed *before* the generations existed**, so unlike the re-scoring it carries no post-hoc exposure.

| arm | MAE | exact | within 1 |
|---|---|---|---|
| `baseline` | 0.69 | 20/36 (56%) | 29/36 |
| `sdd-semantic` *(null control)* | 0.94 | 15/36 (42%) | 28/36 |
| `deviation-deterministic` | **0.22** | **28/36 (78%)** | **36/36** |

**Read it against the control, never against baseline alone.** The byte-identical pair's difference *is* the noise floor: 0.25 MAE and **1** on `within1`. The corpus arm beats baseline by 0.47 MAE (1.9× that spread) and by **7** on `within1` against a control spread of 1. `within1` is the discriminating number.

Per-dimension signed error (+ = placed too high):

| arm | Tech | Mark | Acce | Orga | Regu | Inve |
|---|---|---|---|---|---|---|
| `baseline` | +0.33 | +0.00 | +0.00 | **+1.67** | **+0.67** | **+1.17** |
| `sdd-semantic` | +0.00 | −0.33 | −0.33 | **+1.33** | **+0.83** | **+1.83** |
| `deviation-deterministic` | +0.50 | +0.83 | +0.00 | **0.00** | **0.00** | **0.00** |

Exactly right on O/R/I across all 36 observations; both corpus-free arms inflate them. The corpus arm's entire residual is Technology/Market on MediSync, where it places `T7 M6` on all three reps — **exactly the permissive reading of those two cells**. Scored permissive: corpus **0.19**, baseline 0.94. The direction survives either reading.

**Limits to quote:** this is the **levels probe, a harness construct** — production does not ask the model to assign readiness levels, mentors set them. n=3, two startups, one model. **Metric 3 is unresolvable and should not be quoted** (control pair spread 0.62 exceeds the corpus arm's 0.38 deficit). Metric 2 is **n/a, not 0%** — `--only-probe=levels` generated no RNA to score.

**The O/R/I rubric recalibration is cancelled, not deferred.** It existed to make the corpus reproduce the seeded levels; those levels were the error, and O/R/I is now exactly right. Editing them would break what works.

### The methodological lesson

A reference can be *independent of the prompt* and still be *wrong*. Three reps across five arms agreed in direction for a week — not because the effect was real, but because the reference was consistently wrong. **Agreement across reps tests sampling noise, not the reference.** The study's own null control had been quietly reporting this all along.

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

## Open at end of 2026-08-06

**Branch state — verified with `git branch --no-merged master`, not transcribed.** Earlier notes claimed four measurement branches were unmerged and unpushed; **all four are merged** (`measure/grounding-arms`, `measure/grounding-rep2`, `measure/ground-truth-audit`, `measure/supplied-level-fabrication` — the last via PR #22). Only two branches are not in `master`:
- `docs/trim-notes-and-status-table` — pushed, needs a PR.
- `backup/rag-corpus-preflight` — disposable, holds 13.7 MB of PDF blobs; safe to delete.

**13 local branches have `[gone]` remotes** and are fully merged — worth a `clean_gone` sweep.

**Next step (superseded — done 2026-08-09, see above).** Both parts of this were wrong: the gaps were mostly *recommendation* detection rather than assertion detection, and AgroLink's zero was chance, not a property of the document. **The live next step for 1b is now 4b** (adversarial prompting), per the capstone triage.

**Open decisions, not blocking:**
1. **Production cookie policy** (`sameSite: 'strict'` breaks cross-site once deployed) — checklist §1.
2. **RNS correlation-key uniqueness** and **stale verdicts on artifact edit** — the two 1c design decisions above.
3. **Tier thresholds uncalibrated** against ÷9 scores; `tier_configs` empty on Neon.
4. **`readiness_evaluations` holds mixed-scale rows** — 16 legacy ÷5 rows beside ÷9 rows, now also pre-correction composites. Database cleanup, not code.
5. **`mikro-orm.config.ts` disables TLS verification against Neon** (`rejectUnauthorized: false`); Neon uses a public CA, so this is probably just tightenable.
6. **One manual login + click-through of the auth-guard work is still owed** — browser automation could not drive the SvelteKit login form.
7. **Check VS Code's `git.postCommitCommand`.** Two branches reached GitHub with no `git push` issued in-session; a `push`/`sync` setting would quietly defeat the local-first rule.
8. **Two checklist claims need confirming rather than trusting.** §1's "Guard the remaining unauthenticated modules" names exactly the six controllers the P0 fix above says it guarded and live-verified — left open with a warning rather than ticked. And the 216 passing / 1 failing baseline was carried from the 2026-08-04 notes, not re-run.

**Still unmeasured:** RNA *generation* quality. Every grounding figure is the levels probe; production's RNA path retrieves 12 rubric rows rather than 54, and metric 2 has never produced a signal on any arm. Needs a **harder probe, not more reps** — longer documents, plausible distractors, partially-supported fields.

**Suite baselines:** jest **216 passing / 1 failing** (the documented pre-existing `AiService › passes valid task responses through unchanged`); measurement **207/207** at 2026-08-09 (178 before the classifier branch — the 117 figure carried here predated the 2026-08-06 branch and was never re-run). A *second* jest failure is a real regression.
