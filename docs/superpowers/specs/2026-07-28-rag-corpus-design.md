# Verified-knowledge RAG corpus (Objective 1b)

**Date:** 2026-07-28
**Status:** design, approved for planning
**Objective:** 1b — "RAG pipeline grounding calls in retrieved context"

---

## 1. Problem

The retrieval pipeline built on 2026-07-27 works. What it retrieves does not support the claim being made about it.

**The corpus is peer text.** `rag_contexts` is written from exactly one place — `startup.service.ts:158`, storing each startup's AI-parsed capsule proposal. So "retrieval-augmented against a verified knowledge base" currently means "retrieval against other students' AI-parsed application forms." Peer text is not verified knowledge, and because it is itself model output, extraction errors propagate into the grounding of the next generation. With two seeded startups there is also almost nothing to retrieve.

**Two of the three declared context channels have never existed.** `RAGContext` (`rna/rag-query.service.ts:8-13`) declares `verifiedFrameworks`, `businessModels`, and `similarProfiles`. Only the third was implemented; the first two are hardcoded `[]` at `:105-106` and have been since the file was written.

**The two headline generation paths receive no retrieved text at all.** This is the finding that changes the scope of the work, and it was not known when `TODO_CHECKLIST.md` recorded this item as needing "no code change."

There are two retrieval paths in the backend, and they are not equivalent:

| Path | Entry point | Callers | Injects retrieved *content*? |
|---|---|---|---|
| 1 | `AiService.getRelevantRagContexts` → `createBasePrompt` | `initiative.service.ts` (×3), `roadblock.service.ts` (×2), `rna.service.ts:331` (refine only) | **Yes** — `ai.service.ts:877-881` |
| 2 | `RagQueryService.queryVectorDatabase` → `GroundedPromptBuilderService.buildGroundedPrompt` | **RNA generation** (`rna.service.ts:138`), **RNS generation** (`rns.service.ts:211`) | **No** |

Path 2 fails in three separate ways:

1. `buildGroundedPrompt` prints each similar profile as **ID, similarity score, and metadata only** (`grounded-prompt-builder.service.ts:28-36`). The retrieved row's `content` is never emitted. The model receives a numeric similarity and a title.
2. `verifiedFrameworks` and `businessModels` are printed via `JSON.stringify` of whatever they hold — which is nothing, because they are always `[]`.
3. `queryVectorDatabase`'s SQL filters `rc.startup_id is not null` (`rag-query.service.ts:74`), so any corpus row not owned by a startup is excluded before ranking.

Seeding `rag_contexts` alone would therefore reach initiatives, roadblocks and the refine routes — and would leave RNA and RNS generation, the two paths the demo leads with and the ones Objective 1 is measured on, exactly as ungrounded as they are today.

### Related defect, in scope because it is the same code

`rna.service.ts:151` guards the grounded path with `if (ragContext)`. `queryVectorDatabase` always returns an object and never `null`, so this condition is always true and the legacy fallback prompt beneath it (`:160-194`) is dead code. RNS's equivalent guard (`rns.service.ts:282`) is written correctly — it checks `!ragContext.lowConfidence && ragContext.similarProfiles?.length > 0`.

---

## 2. Where the corpus content comes from

The five dimensions in the proposal, SRS and SDD — TRL, MRL, RRL, ARL, ORL — are the **Balanced Readiness Level assessment (BRLa)** framework, published in *Technological Forecasting and Social Change* (2021), which supplements TRL with market, regulatory, acceptance and organisational readiness and visualises the five as a pentagon. The spec adopted a published framework rather than inventing dimensions.

Two consequences:

- The corpus can cite a real framework rather than assert authority.
- `TODO_CHECKLIST.md` §0's claim that the code "scores Investment, which is not in the spec" is **wrong**. `docs/SDD.md:14` names all six: "TRL, MRL, ARL, ORL, RRL, IRL". The genuine defect is narrower — the scorer omits **Regulatory**. That correction belongs in the checklist.

**The BRLa paper is paywalled.** The dimension set and the general shape of its nine-level scales are confirmed from open sources; verbatim level-by-level descriptors for MRL/RRL/ARL/ORL are not available. TRL 1–9 is fully public (NASA, ISO 16290, Horizon Europe Annex G).

This is why every corpus row records its own provenance rather than the corpus claiming a single verification status:

| `metadata.provenance` | Meaning | Applies to |
|---|---|---|
| `standard` | Transcribed from a published standard, quoted or closely paraphrased | TRL 1–9 |
| `framework-derived` | Authored against a named published framework's stated criteria, citing it | MRL, RRL, ARL, ORL |
| `authored` | Written for LaunchUp; no external source claimed | IRL, and any business framework without a canonical text |

Per-row provenance is not bookkeeping. SRS §2.2 requires "a confidence/validity indicator in API responses," and a provenance tag plus citation is something a user and a panel can act on. A cosine distance is not.

### Dimension and level coverage

All **six** dimensions (`ReadinessType`: Technology, Market, Acceptance, Organizational, Regulatory, Investment) × **nine** levels = **54 rubric rows**. Six rather than BRLa's five because `ReadinessType`, the 54 seeded `readiness_levels` rows, `createBasePrompt` and `docs/SDD.md:14` all already carry six, and generation already emits IRL. Seeding six is a superset that costs one extra authoring pass and does not pre-empt §0's scoring decision.

---

## 3. Design: three channels, each retrieved the way its content behaves

Rubrics are reference data keyed by dimension and level. Peer profiles and business frameworks are genuine search problems. Using one retriever for both is what makes the current pipeline fragile.

| Channel | `sourceType` | Retrieval | Fills | Rows |
|---|---|---|---|---|
| Readiness rubrics | `readiness_rubric` | **Deterministic** — exact lookup by `(readinessType, level)` | `verifiedFrameworks` | 54 |
| Business & strategy frameworks | `business_framework` | **Semantic** over this subset | `businessModels` | 10 |
| Peer startup profiles | `capsule_proposal` | **Semantic**, existing path, 0.78 floor | `similarProfiles` | grows with startups |

The three map exactly onto `RAGContext`'s three declared fields. The interface has described this design since it was written; this implements it.

### Why the rubric channel is deterministic

When generating an RNA for Technology at level 3, the correct context is the TRL 3 and TRL 4 rubric — always, exactly, regardless of that text's cosine distance to the capsule proposal. Ranking it by similarity is worse on every axis that matters here:

- **Accuracy** — the retrieved rubric may be the wrong dimension.
- **Reproducibility** — SRS §2.3 requires the scoring algorithm be "documented and reproducible." A keyed lookup is; a floor-gated nearest-neighbour search over prose is less so.
- **Failure mode** — a keyed lookup either returns the row or raises. A similarity search that drops below the floor returns nothing and says nothing.
- **Measurement validity** — this is the decisive one. `RAG_MIN_SIMILARITY = 0.78` was calibrated on startup-vs-startup pairs, and the calibration record notes the same-domain and cross-domain distributions **overlap** (0.7295 to 0.8036). Rubric prose is a different genre. If it lands below the floor, the Objective 1 measurement returns "grounding did not help" for a retrieval reason, and nothing in the result distinguishes that from "grounding does not help."

The rubric channel is still retrieval-augmented generation. It uses an exact-match retriever because the query key is known.

### Retrieval window

Inject the rubric for the startup's **current level** and **current + 1**. RNA assesses where the startup is; RNS produces tasks to move it up. Both need the next rung described. Clamp at 9.

---

## 4. Components

### 4.1 Corpus data — `backend/data/rag-corpus/`

Checked-in JSON, one file per channel:

- `readiness-rubrics.json` — 54 entries: `{ key, readinessType, level, title, content, keyTerms, provenance, citation, sourceUrl? }`
- `business-frameworks.json` — 10 entries: `{ key, title, content, keyTerms, provenance, citation, sourceUrl? }`

The ten frameworks, fixed now so the deliverable is countable: Business Model Canvas, Lean Canvas, TAM/SAM/SOM sizing, unit economics (CAC/LTV), customer discovery and problem-interview practice, go-to-market motions, Philippine regulatory pathways for startups (SEC/DTI registration, sector permits, Data Privacy Act), IP basics via IPOPHL, pilot and letter-of-intent evidence standards, and founding-team and org-design readiness.

`keyTerms` is a short authored list of the criteria vocabulary that row introduces. It exists so measurement metric 1 (§5) has a non-circular term list defined with the content rather than reverse-engineered from generated output afterwards.

Data files rather than literals inside a script, because this content is the substance of the deliverable: it needs to be reviewable in a diff, correctable without touching code, and quotable in the capstone report.

`key` is a stable slug (`trl-3`, `bmc`) and is the idempotency handle.

### 4.2 Seeder — `backend/seed-rag-corpus.js`

Follows `seed-demo-full.js`'s conventions (standalone Node, resolves `dist/src`, additive and idempotent, safe to re-run).

- Upsert on `(sourceType, metadata.key)`.
- Re-embed **only** rows whose `content` changed. Embedding costs quota; a no-op re-run must cost nothing.
- Writes `metadata`: `{ key, readinessType?, level?, provenance, citation, sourceUrl? }`.
- Embeds through `EmbeddingIndexService` so vectors are written the same way as every other row, in one batch.

Rubric rows are embedded even though channel 1 does not rank by similarity — so that the boot-time backfill stays consistent, and so channel 2's semantic search can be widened later without a re-index.

### 4.3 Retrieval — `rna/rag-query.service.ts`

`queryVectorDatabase(startupId, opts?)` gains an optional `{ readinessTypes: ReadinessType[], levels: Record<ReadinessType, number> }`:

- **`verifiedFrameworks`** — `em.find(RagContext, { sourceType: 'readiness_rubric' })`, then match the requested `(type, level)` and `(type, level+1)` pairs against `metadata.key` in JavaScript. The whole rubric set is 54 short rows; filtering in memory avoids a Postgres-specific JSON query for no measurable gain. No vectors, no similarity.
- **`businessModels`** — semantic search restricted to `sourceType = 'business_framework'`, top 2, reusing the existing `<=>` ordering.
- **`similarProfiles`** — unchanged, including the `rc.startup_id is not null` filter, which becomes *correct* rather than accidental: peers are exactly the startup-owned rows.
- **`lowConfidence`** — must be redefined. Today it means "no peer cleared the floor." Once rubrics are guaranteed present, a generation with rubrics but no peers is not low-confidence. New rule: `lowConfidence = verifiedFrameworks.length === 0`. Emitting a low-confidence warning while verified rubrics sit in the prompt would train users to ignore the indicator.
- Rows returned to callers carry `content`, not only metadata.

`logRetrieval` records per-channel counts so `rag_retrieval_logs` can distinguish "no rubric" from "no peer."

### 4.4 Prompt assembly — `rna/grounded-prompt-builder.service.ts`

- Print `content` for similar profiles. Currently omitted, which is the single highest-impact line in this design.
- Render `verifiedFrameworks` and `businessModels` as labelled prose with their provenance and citation — not `JSON.stringify`. A serialized object is measurably worse input than a sentence.
- Order sections **rubrics → frameworks → peers**, most authoritative first, with peers explicitly labelled as unverified peer applications rather than presented alongside standards.

### 4.5 Path-2 wiring

Both services choose between the grounded builder and a legacy fallback prompt, and **both guards are wrong once a corpus exists**:

- `rna.service.ts:151` — `if (ragContext)` is always true, because `queryVectorDatabase` never returns `null`. The fallback beneath it (`:160-194`) is dead code.
- `rns.service.ts:282` — `!ragContext.lowConfidence && ragContext.similarProfiles?.length > 0` requires a **peer** before it will use the grounded builder. With rubrics retrieved but no peer clearing the 0.78 floor, RNS would discard the verified rubrics and fall back to the ungrounded prompt. Given two seeded startups, that is the common case, not the edge case.

Both become the same condition: use the grounded builder when **any** channel returned something —
`verifiedFrameworks.length > 0 || businessModels.length > 0 || similarProfiles.length > 0`.

With the corpus enabled this is effectively always true, which is the intent; with `AI_RAG_CORPUS_ENABLED=false` and no peers it correctly falls through to the legacy prompt, preserving a clean baseline arm. Delete RNA's dead fallback; keep RNS's, since its guard can still legitimately fail.

Both services pass the dimension and level they are generating for, so the rubric channel has its key.

### 4.6 Path 1 — `ai.service.ts`

`createBasePrompt` gains the same deterministic rubric block, independent of `ragStrategy`, so initiatives, roadblocks and refine are grounded identically.

`getRelevantRagContexts` is scoped to `capsule_proposal` and `business_framework` rows only. Rubrics must not enter the keyword/semantic arm pool: they share generic readiness vocabulary with every query and would dominate the keyword arm's token-overlap score, silently invalidating the existing keyword-vs-semantic comparison.

### 4.7 Configuration

New flag `AI_RAG_CORPUS_ENABLED` (default `true`) on `AiPipelineConfig`, `aiEnvSchema` and `aiOverrideSchema`, gating channels 1 and 2 only.

This exists so the measurement can run corpus-on vs corpus-off **without deleting rows**, and so the arm is recorded in each `ai_generation_runs` config snapshot. Following the existing precedent that an unrecognised `AI_RAG_STRATEGY` is rejected at boot rather than defaulted, a run must never be mislabelled as to which arm produced it.

---

## 5. Measurement — `backend/measurement/measure-grounding.js`

Two arms (`corpus on` / `corpus off`), both seeded startups, six dimensions, 3 repetitions, `temperature: 0`, production prompt assembly.

Three metrics, chosen because each is mechanical and reproducible — no LLM-as-judge, given this project's own finding that model leniency is the thing under investigation:

1. **Rubric-term grounding rate** — proportion of generated RNAs containing `keyTerms` from the rubric level actually retrieved (§4.1). The term list is authored with the corpus content, not derived from generated output, so the metric cannot be fitted to its own results. Directly measures whether retrieval reached the output.
2. **Unsupported-claim rate** — reuses `measure-models.js`'s absent-field probe: fields deliberately not present in the document. Inventing a value is a measurable grounding failure. This is the Objective 1 headline number.
3. **Differentiation gap** — reuses `measure-differentiation.js`'s early-vs-mid gap (currently +2.28 on `gemini-3.6-flash`). If rubrics anchor level assignment, the gap should widen or hold; a collapse would mean rubric text is displacing document evidence, which is a failure worth catching.

`measurement/README.md` gains a section following the existing caveat conventions: small N, no expert ground truth, corpus authored rather than sampled, and gap direction being the trustworthy signal rather than absolute values.

**A null or negative result is a valid outcome and gets written up as one.** Every prior measurement in this project overturned an assumption — the model comparison killed the "lite tier is sycophantic" premise, and the similarity calibration killed a 0.70 floor that leaked 78%.

---

## 6. Testing

**Unit** (`pnpm test`):
- Rubric lookup returns the right rows for `(type, level)` and clamps `level+1` at 9.
- Empty rubric set ⇒ `lowConfidence: true`; rubrics present but no peers ⇒ `lowConfidence: false`.
- `buildGroundedPrompt` emits profile `content`, and framework provenance and citation.
- `getRelevantRagContexts` excludes `readiness_rubric` rows under both strategies.
- Seeder is idempotent: second run writes nothing and embeds nothing.

**Live**, against Neon and live Gemini — mocked tests in this repo have repeatedly passed while the real path was broken, most recently the boot-time backfill that failed on every startup with a MikroORM global-EntityManager error no mock could see:
- Seed the corpus; assert 64 rows and 64 vectors at 768 dims.
- Generate an RNA for AgroLink; capture the assembled prompt and assert the TRL rubric text is present.
- Confirm rows persist with a `generation_run_id`, and that the run's config snapshot records `ragCorpus: true`.
- Re-run the seeder; assert zero writes and zero embedding calls.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Authored rubric text is vague, so grounding is vague | Provenance tags make the weak rows visible; TRL is anchored to a real standard as the quality bar |
| Rubric text displaces document evidence, flattening differentiation | Metric 3 is there to catch exactly this |
| Embedding quota | 64 rows, one batch, only on change |
| Corpus rows polluting the existing arm comparison | §4.6 scopes `getRelevantRagContexts` away from rubrics |
| Prompt length growth on a thinking model | Two rubric levels + two frameworks + three peers; measure token delta in the harness and report it |

---

## 8. Out of scope

- **`level_criteria` population.** The rubric UI table (`criteria`, `excellent`/`good`/`fair`/`poor`/`very_poor` descriptions) is unpopulated and could be fed from the same source. Real value, different feature — a follow-up, noted so the shared source is not forgotten.
- **Objective 1c output validation.** `output-validator.service.ts` and `recommendation-storage.service.ts` remain stubs. This design gives that work something concrete to validate against (provenance and citation per grounded element) but does not implement it.
- **§0 dimension alignment.** Adding Regulatory to the scorer is a separate change. This corpus covers all six either way.
- **Seeding more peer startups.** Orthogonal to corpus quality.

---

## 9. Deliverables

1. `backend/data/rag-corpus/readiness-rubrics.json` — 54 rows with provenance
2. `backend/data/rag-corpus/business-frameworks.json` — 10 rows
3. `backend/seed-rag-corpus.js` — idempotent, change-aware embedding
4. `rag-query.service.ts` — three channels, redefined `lowConfidence`, content in results
5. `grounded-prompt-builder.service.ts` — emit content, prose rendering, authority ordering
6. `rna.service.ts` / `rns.service.ts` — pass dimension and level; replace both grounded-path guards with the any-channel condition; delete RNA's dead fallback
7. `ai.service.ts` — rubric block in `createBasePrompt`; scope `getRelevantRagContexts`
8. `AI_RAG_CORPUS_ENABLED` through config, env schema, override schema and `.env.example`
9. `backend/measurement/measure-grounding.js` + README section
10. Doc updates: `TODO_CHECKLIST.md` (§0 1b, and the §0 dimension-mismatch correction), `SESSION_NOTES.md`, `CLAUDE.md`'s "there is no RAG pipeline" note
