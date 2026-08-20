# LaunchUp — Remaining Work Checklist

Prioritized backlog from a full read of the codebase (see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)), plus a verification pass hunting broken frontend→backend calls, missing guards, and dead code.

**Type legend**

| Tag | Meaning |
|---|---|
| 🔒 **SEC** | Security fix — do it regardless of scope decisions |
| 🐞 **BUG** | Broken code with an unambiguous correct behaviour — just fix it |
| ❓ **SCOPE** | Unfinished feature. Needs *your* decision: **fix it / cut it / leave it hidden**. |
| 🧹 **DEBT** | Cleanup. No user-visible impact. |
| 🎯 **DEMO** | Demo-critical. Breaks the live demo, or is a deletion that removes an easy line of panel questioning. Do these even if nothing else in §1–§5 gets done. |

**Effort:** S ≈ under an hour · M ≈ half a day · L ≈ multiple days

> **Suggested order:** §0 is the capstone itself and outranks everything else. Then the 🎯 items below, then stop — see **Capstone triage**.

---

## Recently completed

| Work | Where |
|---|---|
| AI pipeline config flags + per-run provenance (`ai_generation_runs`) | PR #7 |
| RNS/RNA generation bug fixes | PR #8 |
| Supabase storage + presigned uploads | PR #9 |
| Model tiering (`gemini-3.6-flash`) + semantic RAG pipeline | PR #10 |
| Verified-knowledge RAG corpus (64 rows, provenance-tagged) | PR #13 |
| Security P0 — JWT secret, 11 unguarded controllers | PR #15 |
| Output validation layer (1c), scope-limited | PR #18 |
| Sector-aware weighted scoring (2b) + ÷9 correction | PR #19 |
| Grounding measurement, ground-truth audit, fabrication probe | unmerged branches — see `SESSION_NOTES.md` |

---

## Status summary

| Objective | Status |
|---|---|
| **Capstone objectives (§0)** | In progress — 1b/1c/2a/2b/2c/4c built and measured; SO 4.2 delivered and measured on the **application-summary** path 2026-08-18 (the scoring path is untouched, so 4b stays 🟡); SO 4.4 **delivered 2026-08-18** — flag rule recalibrated to `ratio < 0.75` (shipped rule measured unfirable), **validated on a held-out run**, and the verdict now reaches the reviewing Manager; what remains is an *action* on the flag; **metric 3 rebuilt and run (2026-08-19/20)** — the count-based verdict is retired, field-overlap scoring ships against a rule pre-registered a day before the run, and the run returned a quotable **FAIL** whose cause is noise-floor instability on one document rather than uniform harshness; 1a partial, 3b minimal, 3c and 4a are research tasks |
| **Security issues (§1)** | In progress — all P0 fixed except the cookie policy (blocked — needs decision); 1 🎯 item, 5 P1 deferred |
| **Broken functionality (§2)** | In progress — 4 of 13 fixed; 3 🎯 items, 6 deferred |
| **Incomplete features (§3)** | Decision made 2026-08-07 — **cut, don't defer**; 6 scope calls resolved as *cut cleanly* |
| **Cleanup / tech debt (§4)** | Not started — 1 of 19 done; 3 🎯 items, 15 deferred |
| **Infrastructure decisions (§5)** | In progress — storage and model settled; 1 🎯 item, 3 deferred |

---

## Capstone triage — 2026-08-07

**The decision:** finish §0, do the 🎯 items, cut §3 cleanly, defer the rest. Recorded so the cut is a choice rather than something that just didn't get done.

**Why the boundary isn't simply "§0 only":** a panel judges §0 **through a live demo**, so anything that breaks the demo is a §0 risk wearing a §2 label — and several §1/§4 items are deletions that take minutes and remove an easy line of questioning.

### 🎯 Demo-critical — do these even if nothing else does (~1 day, mostly deletions)

| Item | § | Effort |
|---|---|---|
| Readiness-level rubric submission posts to endpoints that don't exist | 2 | M — **verify first**, may collapse to a deletion |
| Verify the `GEMINI_API_KEY` format | 5 | S — cheapest catastrophic-risk removal on the list |
| Elevate page queries a non-existent `/startup-rna/` | 2 | S |
| Assessment preview dialog calls a non-existent `/fields` route | 2 | S |
| Delete the raw-SQL debug endpoints | 1 | S — deletion |
| Remove committed scratch files | 4 | S — deletion |
| Delete the three orphaned Tab components (and their expired JWT literal) | 4 | S — deletion, closes two items |
| Remove the Cebuano comment in `status.enum.ts` | 4 | trivial |

### Judgement call — not automatic

**IDOR ownership checks (§1, M).** Any logged-in founder can read any other startup's full record by changing a URL id. Worth doing *only* if your panel asks security questions. **If skipped, name it as known and scoped-out** — that answers far better than being surprised by it.

### Deferred

Everything in §1–§5 not marked 🎯 above. Each section carries a **Deferred** note recording what that means for it. Deferred means *decided not to do before submission*, not *forgotten* — the items stay with their full diagnosis so they survive the capstone.

### Inside §0, if time is squeezed there too

- ~~**4b is the one to fix.**~~ **Superseded 2026-08-18.** SO 4.2 is delivered and measured on the application-summary path — the artifact the objective text actually names. The *scoring* path is still unadversarial, so the remaining 4b work is a separate, larger job than "a prompt change". See the 4b and 4.4 rows in §0.
- **3b is the one to descope explicitly.** The `sketchDetected`/`sketchConfidence`/`visionLabels` columns exist with no canvas-mapping logic. "We shipped OCR and instrumented the vision path; sketch-section mapping was scoped out" is defensible. 3c and 4a aren't code at all — they need datasets, so they are write-ups regardless.
- **The position being protected is good, not desperate:** 1b, 1c, 2a, 2b, 2c and 4c are built and measured, and 1b has a reference-free result (baseline 61% unsupported claims vs corpus 0%).

---

## 0. Capstone objectives — actual implementation status

Mapped from `Team_07_LaunchUpEnhanced_Software Proposal.pdf` (Part 2) against the code. **This is the section that determines whether you pass.**

| Objective | Status | Evidence |
|---|---|---|
| **1a** Structured prompt template constraining output to DB fields | 🟡 Partial | `groundPrompt()` appends a fixed instruction string (`ai.service.ts:307`); `GroundedPromptBuilderService` exists. Toggleable via `AI_GROUNDING_ENABLED` |
| **1b** RAG pipeline grounding calls in retrieved context | 🟢 **Built, live-verified, measured positive (2026-08-05)** | Corpus arm places readiness levels at **0.22 MAE vs baseline 0.69**, **36/36 within one rung vs 29/36**, and is *exactly* right on Organizational/Regulatory/Investment where both corpus-free arms inflate. Read against the byte-identical null control, whose spread is 0.25 MAE / 1 rung. **The reference-free figure is the one to quote:** baseline asserts evidence absent from the source document in **61%** of checked placements, the corpus arm in **0%**. This **reverses** the negative result carried 2026-07-30 → 2026-08-04, which was scored against demo fixtures contradicted by their own documents in ten of twelve cells. **Limit: the levels probe only** — a result about *assessment*, not RNA generation quality. Detail below and in `measurement/README.md` |
| **1c** Output validation layer flagging inconsistent recs | 🟢 Built, scope-limited | `OutputValidatorService.validate()` checks retrieval confidence and declared length limits. Wired into RNA, RNS, roadblock generation. Groundedness and stage-appropriateness deliberately excluded on saturation grounds — **that rationale is now partly refuted**, see the fabrication probe below |
| **2a** Multi-tier classification schema | 🟢 Built | `TierConfig` entity + `/admin/tiers` UI + threshold logic (`readiness.service.ts:159-180`) |
| **2b** Weighted composite scoring by sector / business model | 🟢 Built | `WeightProfileService.resolve()` cascade over `weight_profiles`, ending at `DEFAULT_WEIGHTS`. Six dimensions scored as a fraction of 9. Live-verified against Neon. **The sector effect is ~1 point** — a correctness and configurability deliverable, not a differentiation win. See §3 and §5 |
| **2c** Gap analysis engine | 🟢 Built | `ReadinessGap` rows with per-dimension shortfall (`readiness.service.ts:225-240`) |
| **3a** OCR of handwritten text | 🟡 Partial | Tesseract.js module + Gemini vision path (`ai.service.ts:445`); `OcrDocument` stores `fieldConfidence` |
| **3b** Sketch / canvas recognition (BMC, lean canvas fields) | 🟡 Minimal — **descope explicitly (2026-08-07)** | `sketchDetected`, `sketchConfidence`, `visionLabels` columns exist; no canvas-section mapping logic. Present as "OCR shipped and the vision path is instrumented; sketch-section mapping was scoped out" rather than leaving it ambiguous |
| **3c** Accuracy evaluation (Character Error Rate + SUS) | ⚪ Research task | Not a code deliverable — needs a ground-truth dataset |
| **4a** Controlled bias measurement vs expert ratings | ⚪ Research task | Needs expert-rated profiles; `data/ai-baseline.json` is the intended home |
| **4b** **Adversarial** prompting (SO 4.2, find weaknesses *before* the readiness summary) | 🟡 Partial — **delivered on the summary path, not the scoring path (2026-08-18)** | **Delivered:** `generateStartupAnalysisSummary` now runs a field-ordered `responseSchema` (`unmet_criteria` → `critical_risks` → `summary`) behind `AI_ADVERSARIAL_SUMMARY_ENABLED`, measured against the shipped prompt — 100% schema adherence, 3 vs 1 mean critical observations, 4 mean unmet criteria where the baseline has no criteria field at all. **Not delivered:** the readiness-*scoring* path is unchanged — `createBasePrompt`, `reviewBiasScore` and `normalizeAiScore` are all untouched on this branch. Different pipeline stages, so this row stays 🟡. **`reviewBiasScore` (`ai.service.ts:339`) is mislabelled, not misplaced:** its only two call sites review an RNS *target level* (`rns.service.ts:373`) and a roadblock *risk number* (`roadblock.service.ts:224`), neither of which is a readiness summary. Behaviour deliberately unchanged |
| **4.4** Flag predominantly-positive summaries to alert the reviewing Manager | 🟡 **Detection built and measured; alerting NOT delivered (2026-08-18)** | Was tracked by nothing until now. `src/ai/summary-tone.ts` computes the verdict and `startup.service.ts` persists it as an `analysis_summary` `AiRecommendation`. **Both gaps closed 2026-08-18:** (1) ~~the shipped rule `flagged = criticalCount === 0` is **measured wrong**~~ — now `flagged = ratio < 0.75`, calibrated on the run that measured the old rule firing 0/10 and **validated on a held-out run the same day — baseline 5/5 flagged, adversarial 0/4, perfect separation**. (2) ~~**No Manager can see the verdict**~~ — `summaryVerdict` now rides on `GET /startups/all` and renders as a badge in all four Manager dialogs, recorded-row-first with a live recompute fallback (Neon has no `analysis_summary` rows, so a row-only badge would have been empty). **What remains for this objective is an *action* on the flag, not its visibility** — nothing in `frontend/src` reads `confidenceStatus` / `positive-language-flagged` / `analysis_summary`, and the only two `AiRecommendation` queries filter `recommendationKind` `'RNA'` / `'RNS'`. An alert nobody sees is not an alert |
| **4c** Score normalization against a baseline distribution | 🟢 Built | `BaselineService` + `normalizeAiScore()` + `ai_bias_audits` + `/admin/ai/bias-audits`. Now independent of 4b |

### Objective 1b — what was built and what it's worth

- [x] ✅ **OBJECTIVE · L · Semantic retrieval pipeline** — done 2026-07-27
  - `EmbeddingService` (`gemini-embedding-2`, 768 dims) + `EmbeddingIndexService` writing `vector_embeddings` on every `recordRagContext`, plus a boot-time backfill.
  - Similarity computed by **pgvector `<=>` in SQL**, not JavaScript — the old code loaded every vector into Node to pick three.
  - **`vector_embeddings` pinned to `vector(768)`.** It was a dimensionless `vector`, which pgvector cannot index at all; 768 rather than the native 3072 because hnsw/ivfflat refuse anything above 2000 (verified).
  - **`RagQueryService` was looking for a source type nothing writes** (`source_type = 'startup'`), so it returned `lowConfidence: true` on literally every call.
  - **Three arms, not two.** `AI_RAG_STRATEGY=keyword|semantic` alongside `AI_RAG_ENABLED`; an unknown value is rejected at boot so a typo cannot mislabel an arm.
  - **A startup can no longer retrieve itself** — its own capsule proposal was eligible as a "verified prior profile".

  **Arm comparison** (`measurement/measure-retrieval.js`, nine documents, three domains):

  | arm | returned | correct | precision | top hit correct | same-domain recall |
  |---|---|---|---|---|---|
  | keyword | 27 | 15 | 56% | 7/9 | 15/18 (83%) |
  | semantic | 21 | 16 | **76%** | 8/9 | 16/18 (89%) |

  Semantic returned **fewer** documents and surfaced **more** correct ones, so precision was not bought with recall. Caveats in `measurement/README.md`: composed rather than sampled documents, ground truth is domain membership, N is 9.

  **`RAG_MIN_SIMILARITY = 0.78`**, calibrated over 36 pairs. The distributions **overlap** (same-domain down to 0.7295, cross-domain up to 0.8036), so this is a trade-off, not a boundary: keeps 8/9 true neighbours, leaks 11%. A first guess of 0.70 leaked **78%**. Re-run the calibration if the embedding model changes.

- [x] ✅ **OBJECTIVE · M · Verified-knowledge corpus** — done 2026-07-28. `verifiedFrameworks`/`businessModels` are no longer hardcoded `[]`.

  64 rows in `rag_contexts`, seeded idempotently by `backend/seed-rag-corpus.js` (`RagCorpusSeederService`), embedded like everything else. **Every row carries a `provenance` field — read it before calling any of this externally validated:**
  - **54 `readiness_rubric` rows** (9 levels × 6 dimensions):
    - **9 `standard`** (Technology/TRL only) — transcribed from the EU Horizon Europe TRL definitions, consistent with ISO 16290:2013.
    - **36 `framework-derived`** (Market/Acceptance/Organizational/Regulatory) — authored *against* BRLa (2021, *Technological Forecasting and Social Change*), not transcribed from it, because BRLa defines dimensions and criteria rather than nine numbered per-level descriptions.
    - **9 `authored`** (Investment/IRL) — IRL is in neither BRLa nor any cited standard.
  - **10 `business_framework` rows** — 3 `framework-derived` (Osterwalder & Pigneur, Maurya, Blank, each citing a named work), 7 `authored`. Market sizing and unit economics were retagged to `authored` after review found their citations named no framework at all.

  **So only 1 of 6 scored dimensions has externally-sourced level text.** This is the honest limit on any 1b/4a claim.

  **A real defect found along the way (`91da49d`):** `buildGroundedPrompt` printed retrieved docs as id/similarity/metadata and never emitted their `content` — **retrieved text was never reaching any prompt**, regardless of what retrieval returned. It predates the corpus work and would have silently defeated it.

  **Live-verified 2026-07-28:** a real assembled prompt contained `--- Verified Readiness Rubrics (authoritative) ---` with TRL 2 and TRL 3 verbatim; `AI_RAG_CORPUS_ENABLED=false` removed the section entirely. Re-seeding reported all-unchanged.

  ⚠️ **The business-framework channel retrieves nothing in practice.** It is always semantic and its top-2 never clears the 0.78 floor, so the 10 framework rows are seeded and embedded but reach no prompt — "64 rows grounding the model" is really 54. Three options: lower the floor for that channel alone, make it deterministic like rubrics, or drop the channel and the rows. Not a regression; it has never worked otherwise.

- [x] ✅ **OBJECTIVE · S · Grounding measurement** — done 2026-08-05. **The rubric corpus measurably improves readiness-level placement.** The earlier negative result was an artifact of a broken reference.

  **The result** (`measurement/results/2026-08-05-corrected-reference.json`, n=3, 36 balanced observations per arm, levels probe, 18/18 calls):

  | arm | MAE | exact | within 1 rung |
  |---|---|---|---|
  | `baseline` | 0.69 | 20/36 (56%) | 29/36 |
  | `sdd-semantic` *(null control)* | 0.94 | 15/36 (42%) | 28/36 |
  | `deviation-deterministic` | **0.22** | **28/36 (78%)** | **36/36** |

  **Read it against the control, never against baseline alone.** `baseline` and `sdd-semantic` send byte-identical prompts (semantic rubric retrieval returns 0 rows), so their difference *is* the noise floor: 0.25 MAE, **1** on `within1`. The corpus arm beats baseline by 0.47 MAE — 1.9× that spread — and by **7** on `within1`. `within1` is the discriminating number.

  **The mechanism is per-dimension.** Mean signed error, + = placed too high:

  | arm | Tech | Mark | Acce | Orga | Regu | Inve |
  |---|---|---|---|---|---|---|
  | `baseline` | +0.33 | +0.00 | +0.00 | **+1.67** | **+0.67** | **+1.17** |
  | `sdd-semantic` | +0.00 | −0.33 | −0.33 | **+1.33** | **+0.83** | **+1.83** |
  | `deviation-deterministic` | +0.50 | +0.83 | +0.00 | **0.00** | **0.00** | **0.00** |

  Exactly right on O/R/I across all 36 observations. The whole residual is Technology and Market on MediSync, where it places `T7 M6` on all three reps — **exactly the permissive reading of those two cells**. Scored permissive: corpus **0.19**, baseline 0.94. The direction survives either reading.

  **The strongest claim needs no reference at all.** Every reference is contestable and a *model*-set one is worse — an adjudicator reading the document with the full rubric ladder is approximately the `deviation-deterministic` condition, so agreement is near-circular. Three rungs require an artifact class **neither document mentions anywhere**: ORL 3+ a non-founder contributor, RRL 3+ counsel engaged, IRL 3+ a written funding plan. `verifyAbsences` asserts those absences at run time rather than trusting the list, and the ceilings are one rung more generous than the documents support, so these are lower bounds:

  | arm | placements asserting absent evidence | rate |
  |---|---|---|
  | `baseline` | 11/18 | **61%** |
  | `sdd-semantic` *(control)* | 10/18 | 56% |
  | `deviation-deterministic` | **0/18** | **0%** |
  | `deviation-titles` | 1/18 | 6% |
  | `deviation-bare` | 1/18 | 6% |

  Baseline places MediSync's Investment at 4–5 — *"initial investor conversations"*, *"angel funding secured"* — for a document containing no funding token of any kind. **This is an unsupported-claim rate measured directly against the source document**, which is Objective 1b's actual claim and doubles as an Objective 4 leniency result. Directional: silent on under-placement.

  **What was retracted, and why it matters more than the numbers.** From 2026-07-30 to 2026-08-04 this item reported the opposite conclusion (corpus 1.36 MAE vs baseline 0.78) across three reps and five arms. All of it was scored against the seeded `StartupReadinessLevel` rows — demo fixtures written for the UI, **contradicted by the model's own source documents in ten of twelve cells** (seeded Market 4 requires *"no prospect has yet indicated a specific willingness to pay"* beside a stated PHP 5,000 MRR; seeded Organizational 4 requires a *"first full-time hire beyond the founders"* beside *"team grew to 3 founders"*). `metrics.js` justified that reference as *"independent of the prompt"* — true, and a sound fix for a real problem, but independence and correctness are different properties and only the first was secured. **Three reps agreeing in direction is not evidence when the reference is wrong; they agreed because the reference was consistently wrong.**

  **The reference is fixed in the app and the harness.** `src/demo-readiness-levels.ts` is the single source both seeders read (they previously held separate copies — that duplication is how they drifted), and a test parses the TS source so harness and app cannot move apart. AgroLink `T2 M3 A3 O2 R1 I1`, MediSync `T6 M5 A5 O2 R1 I1`, derived per cell in `measurement/data/ground-truth-adjudication.md`. Applied to Neon: 8 rows changed. Composites moved AgroLink **17 → 26** (crossing the 25 tier threshold) and MediSync **40 → 41**.

  **Pooling:** levels sit inside `common`, so every fingerprint changed and the pre-correction runs are a closed historical set — verified, not assumed (`--merge` refuses the new file on all 15 (metric, arm) pairs). `audit-ground-truth.js`'s `SEEDED` is deliberately **frozen** at the old values, with a test asserting it does not track the harness.

  **Settled and still true — the SDD §3.2 deviation.** Neither semantic mechanism retrieves this corpus: the code's substitute (embedding the bare `readinessType` name) scores **0/12** correct-dimension, and SDD §3.2 as written (embedding the whole startup profile) scores **0/2**. `deterministic` scores 12/12 by construction. The shipped default is not a preference — it is the only one of the three that works at all.

  **Limits to quote:**
  - Every number is the **levels probe**, a harness construct. Production does not ask the model to assign readiness levels — mentors set them. Positive for 1b's **assessment** claim; says nothing about RNA generation quality.
  - n=3, two startups, one model (`gemini-3.6-flash`), one 20/day window.
  - **Metric 3 (differentiation gap) cannot resolve these arms and should not be quoted** — the byte-identical control pair's spread (0.62) exceeds the corpus arm's deficit against baseline (0.38).
  - Metric 2 is **n/a, not 0%** on this run — `--only-probe=levels` generated no RNA to score.
  - **One caveat cutting the other way:** on the RNA probe, where the level is *supplied* rather than inferred, the corpus made the model assert the rubric's evidence requirement as fact. See the fabrication probe below.

  **The O/R/I rubric recalibration this item used to prescribe is cancelled**, not deferred. It existed to make the corpus reproduce the seeded levels; those levels were the error, and O/R/I is now exactly right.

  **Operational:** the free-tier window resets **15:00 Philippine time**. A filtered file is a partial rep — its tables read n=0 for everything unselected, so merge it rather than reading it alone.

- [x] ✅ **OBJECTIVE · M · Output validation layer (1c)** — done, scope-limited (`feat/output-validation`)
  `OutputValidatorService.validate()` replaces the old stubs (`validateEach()`, `flagInconsistencies()`, `markUnverifiable()`) and the dead `recommendation-storage.service.ts`, both deleted. It checks (a) retrieval confidence from `ragContext.lowConfidence` — a signal already computed and previously discarded, and (b) whether generated content violates the length limit each prompt already declares to the model (`RNA_/RNS_/ROADBLOCK_MAX_LENGTH`, all 500). Wired into RNA, RNS and roadblock generation, writing a real verdict to `ai_recommendations`.
  **Deliberately excluded:** groundedness/fabrication and stage-appropriateness checks — both probes measured saturated (0/15 fabrication, 0% stage-inappropriate at n=3), so there was no observed failure mode to validate against.
  **Caveat:** **not backfilled.** Pre-existing rows keep the old hardcoded `'validated'`/`'high-confidence'` literals, so that status on an old row is not evidence the validator ran.

- [x] ✅ **OBJECTIVE · M · Supplied-level fabrication probe (1b on the production path)** — built and run 2026-08-06. **The corpus arm is the only arm that asserts absent evidence, and a wrong supplied level is what triggers it.**

  Every prior grounding number is the **levels** probe, where the model *infers* the level. Production does the opposite — mentors set levels and the RNA path consumes them. `--level-condition=truth|inflated|both` runs the RNA probe per condition, inflating O/R/I to 3 while T/M/A stay at truth as a within-call control; `measurement/lib/assertions.js` scores each RNA per (call, dimension) for clauses that *assert* an absent artifact rather than correctly *recommend* it.

  **Result** (`measurement/results/2026-08-06-supplied-level.json`, 16/16 calls, n=2):

  | arm | condition | asserted | mentioned | unclassified |
  |---|---|---|---|---|
  | `baseline` | truth | 0/12 | 2/12 | 1/12 |
  | `baseline` | inflated | **0/12** | 2/12 | 2/12 |
  | `deviation-deterministic` | truth | 0/12 | 8/12 | 4/12 |
  | `deviation-deterministic` | **inflated** | **2/12 (17%)** | 11/12 | 4/12 |

  **The wrong number alone does nothing** — baseline is 0/12 under both conditions. Both flagged clauses weld a fabricated artifact to a true document fact: *"Currently at RRL 3, with **legal counsel engaged** and a trademark application pending with IPOPHL"*, and *"Currently at IRL 3, with **a drafted funding plan** and PHP 5,000 in monthly recurring revenue"*. The second reproduces the 2026-08-05 instance almost verbatim.

  **Reading `flaggedClauses` by hand raised the finding.** Two more genuine fabrications sat in `unclassified` — *"A basic funding plan **exists**…"* and *"…alongside a **first non-founder contributor**"* — missed because `exists` is not an assertion cue and clause fragments lose their subject. The effect reproduced across **both** reps, and the measured 17% is a floor.

  **The strongest cell is Organizational**, because ORL 3 reaches the model under *both* conditions (truth pulls 2+3, inflated pulls 3+4). Same rubric text, only the supplied level differs: *"Needs: Advance to ORL 3 by engaging the first non-founder contributor"* under truth, asserted as present under inflation. **That rules out "the corpus added new text" as the explanation.** Investment and Regulatory confound level with text; Organizational separates them. Recorded in the spec *before* the run.

  **Limits:** n=2, 16 calls, and **every fabrication came from MediSync** — AgroLink produced none. `unclassified` is 4/12 on corpus arms, and the design says do not quote a rate when that column is large. The Organizational finding is qualitative. Inflation is one rung above the ceiling, not two.

  **Deliberately not done:** the classifier was not patched and this data not re-scored — that is the post-hoc move, and the fingerprint guard enforces it mechanically.

- [x] ✅ **OBJECTIVE · S · Close the measured classifier gaps, then re-run** — *done 2026-08-09* (`measure/assertion-classifier-gaps`, 19 commits, **unpushed**)

  **The diagnosis in this item was a third of the picture.** Dumping all 35 classified clauses from the 2026-08-06 run showed that of its 14 `unclassified` clauses, **12 were recommendations mis-binned** — via the model's `Needs:` label form, which `RECOMMENDATION` missed because it required `need\s+to`, and via coordination splits that strand a fragment from its governing modal. Only 2 were the missed assertions this item named.

  **A live counterexample to the lower-bound guarantee was found in the collected data**: `"and maintain an active log of investor pitches conducted."` had been stranded from its governing `must` and scored `asserted` on `maintains?`. Fixed by scope inheritance — a continuation fragment inherits its governing clause's negation/recommendation cues but never its assertion.

  **The assertion branch ships unchanged, and that is the finding.** Five candidate assertion cues were built or specified and then cut: `require`, `existed`, `existing`, `exists`, and a whole accompaniment predicate. Each failed the same way — the artifact token turned out to be an **attributive modifier** rather than the head of its phrase, so the cue fired on clauses asserting nothing. `"Investor interest exists"` and `"A basic funding plan exists"` are structurally identical; the accompaniment predicate false-positived on 14 of 14 constructed realistic clauses. Both genuine missed assertions are now recorded as **known uncaught classes with tests**, which is itself a lower-bound statement.

  **The re-run** (`measurement/results/2026-08-09-supplied-level.json`, 16/16 calls, n=2, every parameter identical to 2026-08-06 except the classifier):

  | arm | condition | asserted | mentioned | unclassified |
  |---|---|---|---|---|
  | `baseline` | truth | 0/12 | 4/12 | 0/12 |
  | `baseline` | inflated | **0/12** | 4/12 | 0/12 |
  | `deviation-deterministic` | truth | 0/12 | 8/12 | 0/12 |
  | `deviation-deterministic` | **inflated** | **3/12 (25%)** | 11/12 | 3/12 |

  **The core finding reproduced independently:** only corpus+inflated fabricates, baseline is 0/12 under both conditions, and all three clauses are the same IRL 3 funding-plan mechanism. **`--merge` correctly refused** to pool into any `assertion|*` group while pooling `levels|*`/`rna|*`/`fabrication|*` — a separate experiment, not more n.

  **Instrument effect, which is the deliverable:** `unclassified` 14 → 3, `recommended` 13 → 28. **The rate rose 2/12 → 3/12 and the instrument cannot explain it** — the assertion branch is byte-identical and every landed change can only move clauses *out of* `asserted`, so a stricter instrument reading higher is sampling. **Both pre-registered predictions were wrong in opposite directions** (spec: higher, because of cues that were then cut; revised: same or lower). Recorded because they were committed in writing before the run.

  **Quote the hand count, not the table.** All three `unclassified` clauses are genuine fabrications sitting in the deliberately-uncaught classes, so the by-hand rate is **6/12** and the reported 3/12 is a floor.

  **AgroLink fabricated this time**, closing the open question from 2026-08-06: its zero was chance, not a property of the document. Adding AgroLink-specific reps was correctly declined — both startups sit at `O2 R1 I1`, so the manipulation is identical on both and extra reps could not have isolated the document.

  Detail in `measurement/README.md`, including the nine-mutant log (nine killed) and a harness caveat: two mutants first read as survivors had silently failed to apply.

### Objectives SO 4.2 / SO 4.4 — measured 2026-08-18

`results/2026-08-18-summary-bias.json`, `gemini-3.6-flash`, temp 0, reps=3.
**Partial: 10/12 calls, 12 API requests spent.** Two adversarial cells 503'd on
model overload (not quota) and were deliberately not re-run; every mean is over
surviving rows. Validity gate passed — all 4 completed adversarial calls used
`source=schema`, so no control output wears the adversarial label.

| arm | n | meanCritical | meanPositive | meanRatio | flagged | flagRate | meanUnmetCriteria | meanCriticalRisks |
|---|---|---|---|---|---|---|---|---|
| baseline | 6 | 1 | 1.67 | 0.39 | 0 | 0 | 0 (structural) | 0 (structural) |
| adversarial | 4 | 3 | 0 | 1.00 | 0 | 0 | 4 | 3.75 |

`structural` = the baseline arm has no criteria field at all
(`legacySummaryOnly` returns `[]` by construction), so its zero is not a
measurement.

- [x] 🟢 **OBJECTIVE · M · SO 4.2 adversarial summary** — the mechanism works.
  What was tested is the mechanism (field-ordered `responseSchema` +
  `propertyOrdering`), not prompt wording, and Gemini honouring
  `propertyOrdering` is now supported by this run rather than assumed.

- [x] 🟢 **OBJECTIVE · S · Replace the SO 4.4 flag rule** — *done 2026-08-18*
  (`fix/so-4-4-flag-threshold`). `summary-tone.ts` now ships
  `flagged = ratio < 0.75`.
  `flagged = criticalCount === 0` fired **0 times in 10 summaries, in both
  arms**. Every baseline summary scored exactly `criticalCount: 1` — the legacy
  prompt mandates *"3. Critical risks and primary recommendations"*, so every
  baseline summary ends with a risk sentence. **The rule cannot fire against
  the prompt it exists to police.** The baseline summaries are plainly lenient
  (they open *"demonstrates strong market viability"*) with a token risk
  sentence appended, so the bias is positive framing, not absent critical
  language — the instrument tested for the wrong property. Per-call `ratio`
  separates the arms with **no overlap**: baseline `0.33 0.33 0.33 0.33 0.50
  0.50`, adversarial `1.00 1.00 1.00 1.00`, so 0.75 is the midpoint of the gap.
  This is exactly what spec §3 planned — ship uncalibrated, let the run supply
  the distribution.
  **This item's old title said `ratio >= 0.75`, which states the predicate
  backwards** — a high ratio means *more* critical, so flagging the lenient arm
  is `ratio < 0.75`. Read as naming the *balanced* condition it was right;
  read as the flag rule it inverts the objective. Corrected here.
  **Exactly 0.75 is balanced** (strict `<`) — the one place this module does not
  resolve ambiguity toward flagging, because 3-of-4-critical is not the leniency
  SO 4.4 polices and flagging it would train Managers to ignore the flag.
  Unobserved in the run, so a judgement, not a measurement.
  **The old rule is subsumed** (`criticalCount === 0` forces `ratio 0`), so the
  new rule flags a strict superset and trades away no existing detection.
  **Mutation testing changed the tests, not the code:** with only baseline's
  *modal* 0.333 covered, mutating the threshold to 0.5 survived a green suite
  while silently unflagging the **two measured baseline rows at exactly 0.500**.
  The constraining value is the observed one nearest the boundary, not the most
  frequent. 5/5 mutants killed, each verified as landed.
  ✅ **Validated on a held-out run, 2026-08-18** (`results/2026-08-18-threshold-validation.json`,
  9/12 calls, 3 lost to 503). **Baseline 5/5 flagged (flagRate 1.00), adversarial
  0/4 flagged — perfect separation on generations the threshold had never seen.**
  The original defect reproduced independently too: every baseline summary again
  scored `criticalCount: 1`, so the old rule would have fired **0/9** here.
  **Held out is the *generations*, not the documents** — same two startups, same
  prompts — so this rules out resampling and nothing more. **Baseline ratio was
  0.333 on all five calls, zero variance**, so the wide margin to 0.75 reflects a
  very stable prompt structure rather than a demonstrated robustness. The
  informative next test is a *different prompt or third document*, not more reps.
  **Four of six fingerprints changed** — `tone|*` *and* `differentiation|*`, both
  embedding the file text (`summary-fingerprint.js:60-64`), verified against the
  real stored values; `criteria|*` unchanged, so SO 4.2's result gains n.
  ⚠️ **The fingerprint guard is documentary here, not mechanical** — `--merge`
  exists only on `measure-grounding.js`; `measure-summary-bias.js` records
  fingerprints but nothing acts on them.

- [x] 🟢 **OBJECTIVE · M · Surface the SO 4.4 verdict to the Manager** — *done
  2026-08-18* (`fix/so-4-4-flag-threshold`). `GET /startups/all` carries a
  `summaryVerdict` per startup, and one `SummaryToneBadge` renders it in all
  four dialogs a Manager reviews from `/applications`.
  Previously nothing in `frontend/src` read `confidenceStatus`,
  `positive-language-flagged` or `analysis_summary`, and the only two
  `AiRecommendation` queries filter `recommendationKind` `'RNA'` / `'RNS'`, so
  the `analysis_summary` row was never read.
  **The row-only design specified here would have shipped an empty badge.**
  Neon has **zero** `analysis_summary` rows: the persistence path only runs for
  proposals created through `createStartupProposal`, and both demo proposals
  were written directly by `seed-demo-full.js`. So the verdict resolves from a
  recorded row *when one exists* and is otherwise recomputed live from the
  summary text, with `source` shown in the UI. A recorded row always wins over a
  disagreeing fresh reading — it is attributable to a generation run and a fresh
  reading is not.
  **Live-verified end to end**, because neither risk is visible to the suite:
  the `persist: false` property produces **0** schema DDL statements (`main.ts`
  runs `updateSchema()` on every boot) and survives `toJSON()`; both branches
  render correctly in both themes; a temporary `ai_recommendations` row proved
  the recorded+flagged path and was removed.
  **`PendingTab.svelte` deliberately not wired** — it renders these dialogs but
  is imported nowhere. See the 🎯 deletion item in §4.
  **Still open:** no Manager *action* is attached to the flag. (The threshold
  behind it was validated on a held-out run 2026-08-18 — see the item above.)

- [x] 🟢 **OBJECTIVE · M · Rebuild the differentiation guard (metric 3)** —
  *rebuilt 2026-08-19, run 2026-08-20* (`measure/non-saturating-differentiation`).
  **All three parts done.** Result: **`FAIL - uniform`, quotable**, on the first
  full grid this harness has produced (5×5, 10/10 calls, zero degradations) —
  see the run below and `measurement/README.md`.
  ⚠️ **Two different metrics are called "metric 3" in this project.** The
  *grounding* harness's metric 3 is the differentiation **gap** over readiness
  levels (declared unresolvable 2026-08-03, §0 above). This one is the
  overcorrection **guard** over generated summaries. Unrelated; never pooled.
  Originally logged as "the guard did not pass". **The guard itself was the
  defect** — `differentiationTable` decided `separates = (critGap !== 0) ||
  (unmetGap !== 0)`, an exact-inequality test on a mean of 1–3 small integers.
  **Three defects, in ascending order of severity:**
  1. **Saturation** (the originally recorded concern). `criticalCount` ceilings
     at 3 in a three-sentence summary. Calibration run: adversarial early `[3,3]`
     vs mid `[3,3]` — that is the ceiling, not agreement.
  2. **No noise floor.** Validation run passed the adversarial arm on
     `criticalGap −0.33`, produced by **one** early-stage call against a 3-call
     mean. A single call flips the verdict.
  3. **No sign check — the worst of the three.** That −0.33 means the arm
     criticised the *mid*-stage proposal **more** than the early-stage one, the
     opposite of the guard's own rationale. **A PASS could be earned by
     differentiating in the wrong direction.**

  **The deeper finding: both columns are degenerate, for different reasons.**
  `criticalCount` is ceiling-bound. `unmetCriteria` is *structurally* unbounded
  — the prompt says "list **every** unmet criterion", the schema sets no
  `maxItems` — yet its **means coincide**: AgroLink `4,4` vs MediSync `3,5` on
  the calibration run, `4` vs `4,4,4` on the validation run. ⚠️ **These docs
  previously said "exactly 4 on all 8 successful adversarial calls"; that is
  wrong** — corrected 2026-08-19 by reading the two results files. Six of the
  eight are 4, with a 3 and a 5. The column is not degenerate-constant, it is
  **unsigned variance whose means happen to coincide**, which weakens the
  "convergent model behaviour" reading without changing the conclusion: variance
  with no direction still cannot separate arms. What differs, if anything, is
  *which* criteria are cited — and the harness stored `unmetCriteria` as a
  **count only**, discarding the `criterion` / `proposalField` text before it
  reached the results file.

  **Part 1 — done. The count-based verdict was retired, not hardened.** Once
  overlap owns the verdict, hardening a count rule would only make a broken
  instrument stricter. `separates` and the count-derived PASS/FAIL are gone;
  the count columns remain, descriptive only. Cells below `MIN_CELL_N = 2`
  report `underpowered` and can feed no verdict, and each gap now carries a
  `criticalFavours` / `unmetFavours` label (`early` / `mid` / `neither`) so a
  backwards gap is legible without mental arithmetic.

  **Part 2 — done. `lib/field-overlap.js`** stores `unmetCriteriaDetail`
  (criterion, proposalField, whyUnmet — `whyUnmet` kept as the hand-check audit
  trail) and scores **Jaccard overlap of normalised proposal-field sets**:
  `crossOverlap` (early reps × mid reps) against `withinOverlap` (same-startup
  rep pairs, pooled) as an **intrinsic noise floor**, with
  `separation = within − cross`. Normalisation is load-bearing, not cosmetic:
  `proposal_field` is a bare `STRING` in the response schema
  (`ai.service.ts:178`), not an enum, so `historicalTimeline` and
  `historical_timeline` would otherwise count as two fields.
  **Two decisions worth keeping:** a Jaccard of two *empty* sets returns `null`,
  never `1` — the baseline arm cites no fields at all (no criteria field in its
  schema), so scoring `0/0` as perfect agreement would report that arm as
  maximally uniform on the strength of a missing schema field; and unscoreable
  pairs are **dropped** from the means rather than averaged in as 0.

  **The margin is now pre-registered** —
  `docs/superpowers/specs/2026-08-19-differentiation-margin-design.md`, committed
  before any generation it scores. The rule is **complete separation**:
  `min(within-startup pair) > max(cross-startup pair)`, so the two pair
  distributions must not overlap. **No constant** — the same logic that made
  `ratio < 0.75` quotable. Strict `>`, so a **tie FAILS**; `null` pairs are
  excluded; `min`/`max` are over raw pair values, not means.
  **The n bar requires both** `nEarly >= 3 && nMid >= 3` **and** a chance
  reference `1 / C(nCross + nWithin, nWithin) <= 0.001`. Neither alone suffices:
  the chance bar alone admits a lopsided 4×2 grid carrying one mid-side
  within-pair, and the reps bar alone can be satisfied while **null pairs shrink
  the scoreable grid underneath it** — reachable whenever a call returns
  `unmet_criteria: []`, which the schema permits (see the open item below).
  Below the bar the comparison is still reported, as `PASS - not quotable` /
  `FAIL - not quotable`.
  ⚠️ **The chance reference is optimistic and is not a p-value** — it assumes the
  pair values are exchangeable and independent, and they share reps.

  **Both zero-quota prerequisites are done (2026-08-19).**
  1. **`overlapStats` persists the per-pair values.** It returned only means, so
     the pre-registered rule could not have been evaluated from a stored run —
     the same defect that left both 2026-08-18 runs un-rescoreable. Verified on a
     dry run: recomputing `min(within) > max(cross)` from the written JSON
     reproduces the recorded `separated`.
  2. **`--only-arm` on `measure-summary-bias.js`**, matching
     `measure-grounding.js`'s semantics (exact beats prefix; an entry matching
     nothing is a hard error, an ambiguous prefix is refused). Metric 3 is
     scoreable on the **adversarial arm only** — the baseline cites no proposal
     fields, so all its pairs are `null` by construction — and a full run spent 6
     baseline calls that could not contribute. `--only-arm=adversarial --reps=5`
     resolves to 10 cells, verified from real `argv`. Results files record
     `armsRun`, so a filtered file is self-describing rather than looking like a
     run whose other arms all failed.

  **What the two stored runs would have said** under the corrected rule (a
  *rule* correction on the same generations — never quotable as a new result;
  overlap cannot be replayed because the detail was never stored):

  | run | arm | was | now |
  |---|---|---|---|
  | calibration | baseline | `FAIL - uniform` | `n/a - no scoreable field citations` |
  | calibration | adversarial | `FAIL - uniform` | `n/a - no scoreable field citations` |
  | validation | baseline | `FAIL - uniform` | `n/a - no scoreable field citations` |
  | validation | **adversarial** | **`PASS`** | **`n/a - underpowered`** |

  The validation run's PASS is withdrawn on `nEarly=1`, and its `criticalGap
  −0.33` now prints `favours mid` — the backwards direction is visible in the
  output rather than hidden inside an absolute test.

  **Fingerprints:** `differentiation|*` gains `overlapSrc` and moved for **both
  arms against both runs** (correct — the metric's definition changed).
  `criteria|*` is **byte-identical to both stored runs**, so SO 4.2's result
  (4 unmet criteria, 3.75 critical risks) keeps its poolability; `tone|*` is
  identical to the validation run and differs from the calibration run only by
  the pre-existing 0.75 threshold change. Verified by computing current
  fingerprints against both files, not assumed.

  ⚠️ **`measure-summary-bias.js` and `lib/summary-fingerprint.js` had NO tests
  before this** — the measurement suite's 210 tests all cover the *grounding*
  harness, so the harness that produced every published SO 4.2 and SO 4.4 number
  was itself unexercised. 27 tests added here (`field-overlap` 17,
  `summary-differentiation` 8, `summary-fingerprint` 2), which covers the
  rebuilt metric and the fingerprint contract but **not** `toneTable`,
  `criteriaTable`, `validity`, `sourceBreakdown` or `callDescriptors`. Those
  remain untested.

  **Mutation testing: 16/16 killed, and it changed the tests, not the code.** The
  first survivor was `favours` mutating `gap > 0` → `gap >= 0`, uncovered because
  no test exercised a gap of **exactly 0** — the *uniform harshness* case the metric
  exists to detect, which the mutant relabels as differentiating in the expected
  direction. It is also the modal reading in the real data (7 of 8 gap readings
  across both runs are 0). Same shape as the 2026-08-18 lesson: the constraining
  value is the one on the boundary, not the most frequent.

  **3. Run — done 2026-08-20** (`results/2026-08-20-differentiation-overlap.json`,
  10 API requests, **10/10 succeeded**, zero degradations, first full grid:
  5 early / 5 mid, 25 cross pairs, 20 within).

  | statistic | value |
  |---|---|
  | `crossOverlap` | 0.303 (range 0 – 0.500) |
  | `withinOverlap` | 0.612 (range 0.125 – 1.000) |
  | `separation` | +0.309 |
  | chance reference | 3.2e-13 |
  | **verdict** | **`FAIL - uniform`**, quotable |

  **The prediction was right in outcome, wrong in mechanism.** FAIL was
  predicted *because* cross-overlap would be high (0.35–0.65) and separation
  small (0.05–0.25). Cross-overlap came in **below** that band and separation
  **above** it — the arm differentiates more than predicted.

  **What failed is the noise floor, not the signal.** Cross-overlap never exceeds
  0.5, so the arm never cites more than half the same fields for both startups.
  Complete separation fails on a single *within* pair at 0.125. Split by startup:
  **AgroLink 0.800, MediSync 0.424** — the arm cites the same four fields for
  AgroLink nearly every time (reps 0/1/2 **identical**) and wanders on MediSync.
  So the `- uniform` label misdescribes this instance. **Pooling the within-startup
  floor across both documents hid that one is stable and the other is not.** A
  per-startup floor would have separated them — recorded as an observation only,
  since re-scoring this run under it is the post-hoc move the pre-registration
  forbids.

  **The positive result: the instrument is not degenerate.** The pre-registered
  "field identity is too coarse" failure mode required `crossOverlap > 0.5` **and**
  `separation < 0.1`; neither holds. Field overlap carries real signal, unlike the
  count columns it replaced — which stayed degenerate here too (`criticalGap` 0
  favours neither, `unmetGap` −0.2 favours mid).

  **Stability came in below prediction:** `withinOverlap` 0.612 against a predicted
  >0.7, and **bimodal** rather than uniformly mid. The model is less deterministic
  on MediSync than temperature 0 implies.

  **Two fingerprint-verified n gains.** `criteria|adversarial` `82fc2961c7ff`,
  identical to both prior runs → SO 4.2 gains 10 calls (**3.9** mean unmet
  criteria, **3.2** critical risks, against 4 / 3.75 at n=4).
  `tone|adversarial` `e6304665e036`, identical to the validation run → **0/10
  flagged, ratio 1.00 on all ten**, a third confirmation that `ratio < 0.75` does
  not fire on the arm that is behaving.

  **Next, if metric 3 is pursued further:** a *separately* pre-registered rule
  with a **per-startup** noise floor, scored on new data. This run supplies the
  first observed overlap distribution to design it against — but calibrating on
  this run and reporting the fit as a result is exactly the forbidden move.

  The precedent that motivated the guard stands: `gemini-2.5-flash-lite` read as
  lenient but was floor-bound and blind, and the real defect was differentiation.

- [ ] ❓ **OPEN · `propertyOrdering` enforces sequence, not substance.**
  `unmet_criteria: []` is a valid response — `required` requires the key, not a
  non-empty array — and nothing cross-checks the summary against the criteria.
  A model could emit empty findings then a glowing summary. The tone check is
  the only guard against that, and it is the one that goes nowhere.

- [x] ✅ **NOT A BUG · The literal-JSON-`null` silent degradation does not
  exist** — *diagnosis refuted 2026-08-20 by probe, no production change made.*
  This item claimed `analysisSummarySchema.nullable()` let a literal `null`
  parse successfully, return `null`, and degrade to legacy "costing 2 calls
  instead of 3 and emitting no failure metric", with `notes.source === 'legacy'`
  as its only trace. **Measured, all three claims are false:**

  | model returns | calls | source | failures recorded |
  |---|---|---|---|
  | bare `null` | **3** | `legacy` | `no_json`, `no_json` |
  | `{"result": null}` | **3** | `legacy` | `schema_invalid`, `schema_invalid` |

  **The null branch is unreachable at runtime.** `extractJsonPayload` requires a
  `{` or `[` **and** a matching closer, so a bare `null` never reaches
  `safeParse`; and a payload that *does* start with a brace can never
  `JSON.parse` to `null`. **`.nullable()` is a compile-time accommodation, not a
  runtime permission** — `callAiExpectJson<T>` pairs `schema: z.ZodType<T>` with
  `fallback: T`, so passing `fallback: null` requires `T` to include `null`. It
  was read as the latter.
  **Consequence for a claim elsewhere:** "its only trace is `notes.source`" is
  wrong — two `recordFailure` rows accompany every degradation. `source` is
  still load-bearing, but for the *validity gate* (schema vs rate-limit
  degradation), which is a different and valid reason.
  **Pinned by two tests** in `ai.service.spec.ts`, because the silent
  degradation *would* become real if `extractJsonPayload` were relaxed to accept
  bare scalars. Mutation-verified: making that change kills the bare-null test.
  ⚠️ **The first mutation attempted was semantically inert** — disabling the
  guard makes `'null'.substring(-1, 0)` return `''`, still falsy, still
  `no_json`. It landed textually and changed nothing, and reported SURVIVED.
  **Asserting a mutation landed in the file is necessary but not sufficient;
  confirm it changed behaviour.**

- [ ] 🧹 **DEBT · S · `measurement/tests/demo-proposals.test.js` asserts on
  source text, not behaviour.** It regex-matches the `.ts` file rather than
  importing `toApplicationDto`, so a `title:` inside a comment satisfies it and
  a changed *value* is undetectable. `pnpm test:measurement` baseline is **210**
  (some docs said 207).

- [ ] ❓ **OPEN · SO 5.3's premise is false in the code.** It describes the
  summary as generated "from URAT answers". `UratQuestionAnswer` is CRUD-only
  and no AI call reads it — the summary is built from the capsule-proposal DTO.
  Out of scope; recorded so it is not discovered during a demo.

### Spec mismatch — resolved as documentation

- [x] ✅ **OBJECTIVE · S · Scored dimensions vs the specification** — confirmed 2026-07-28; the repo's own `docs/SDD.md` was the thing that was wrong.
  The source documents (proposal PDF + the team's SRS/SDD, held outside this repo) specify **five** dimensions: TRL, MRL, **RRL**, ARL, ORL. No IRL. The code scores six, the extra being Investment.
  `docs/SDD.md` had claimed six including IRL — matching the code rather than the source — so that 19/18-line summary pair was **deleted** rather than corrected: a short in-repo summary that quietly disagrees with the source on the first fact a reviewer checks is worse than no summary.
  **Decision still open in principle:** align the code to five dimensions, or amend the real documents to a six-dimension model and justify Investment's inclusion. A panel comparing the SDD to a live demo will see the mismatch.

- [x] 🟢 **OBJECTIVE · M · Sector-aware composite weights (2b)** — *done 2026-08-04*
  New `weight_profiles` table (`sector?`, `businessModel?`, `weights` json) + `WeightProfileService.resolve()`'s four-step cascade ending at `DEFAULT_WEIGHTS`, `Startup.sector`/`.businessModel`, six scored dimensions, three seeded profiles. Shipped with the ÷9 clamp fix in §3.
  **Correction to this item's original instruction.** It said to read weights from `TierConfig`. That was the wrong axis and was **not** done: `TierConfig.weights` was keyed per **tier**, so a startup crossing a boundary would have its weight vector swapped underneath it and the composite could *fall* as a dimension improved. The column was **deleted**; `/admin/tiers` now edits label and threshold only.

---

## 1. Security issues

### P0

- [x] 🔒 **SEC · S · Remove the hardcoded JWT secret fallback** — *fixed 2026-07-27*
  Both call sites go through `requireJwtSecret()` (`backend/src/auth/jwt-secret.ts`), which throws at boot. The frontend's matching fallback is gone too, checked at **module scope** — putting the throw at the point of verification would have been useless, because that code sits inside a `try` whose `catch` redirects to `/login`, so a misconfigured deployment would have presented as "your password is wrong". The old `||` also treated a whitespace-only secret as valid; `requireJwtSecret` trims.

- [x] 🔒 **SEC · M · Guard the coaching core** — *fixed 2026-07-27*
  Class-level `JwtGuard` on `rna`, `rns`, `initiative`, `roadblock`, `chat-history`, `readiness`, `progress`, `elevate`, `ocr`; `JwtGuard + AdminGuard` on `ai/metrics` and `ai/baseline` — `POST /ai/baseline/update` rewrites the distribution score normalization (4c) measures against.
  **The scope was wider than this item recorded** — it named 4 controllers; 11 were unguarded.
  **Verified live:** all 11 return 401 with no credentials and authenticate under both a Bearer header and an `Access` cookie.

- [x] 🔒 **SEC · S · Un-comment the guard on chat history** — *fixed 2026-07-27*

- [x] 🔒 **SEC · S · Guard the file-upload endpoints** — *fixed 2026-07-27*
  `JwtGuard` on `upload.controller.ts`, covering the new presign routes. `test-connection` no longer echoes raw SDK error text naming the bucket and endpoint. Verified live: all three routes 401 unauthenticated.
  **Correction:** this item previously claimed there was no file-type or size validation. Wrong — `validateFile()` already enforces a 10 MB cap and an 8-entry MIME allowlist before the object is written. The real gap was authentication only. Note the allowlist trusts client-supplied `file.mimetype`, so it stops honest mistakes, not a determined uploader.

- [ ] 🔒 **SEC · S · Decide the production cookie policy before deploying** — **blocked, needs a decision**
  Guarding the controllers required the backend to accept the `Access` cookie, because it is `httpOnly` and the shared axios instance sent **no credentials at all**. That works locally: `localhost:5173` and `localhost:3000` are the *same site* (cookie "site" ignores the port), so `sameSite: 'strict'` permits it.
  **It will not work deployed.** `launchup.vercel.app` → `launchup.onrender.com` are different sites; the browser will not attach the cookie and every client-side call will 401.
  **Decision:** either `sameSite: 'none'; secure: true` on the login cookie (`routes/(auth)/login/+page.server.ts:50`) and accept the CSRF exposure, or proxy client-side calls through SvelteKit server routes so they are same-origin.

### P1 — before any real deployment

> **Deferred (2026-08-07)** except the 🎯 item below. IDOR is the judgement call — see **Capstone triage**. The rest are real pre-deployment work that a capstone demo does not reach.

- [ ] 🔒 **SEC · M · Add ownership checks to startup detail endpoints (IDOR)** — *judgement call, see triage*
  `startup.controller.ts:135-137` (`GET /startups/:startupId`) and every sibling route are `JwtGuard`-only. Row-level filtering exists **only** in the list endpoint (`StartupService.getStartups()`).
  **Why it matters:** any logged-in founder can read any other startup's full record — capsule proposal, members, waitlist messages — by changing the id in the URL.
  **Fix:** a reusable guard or service helper asserting the requester owns / is a member of / mentors the startup, unless Manager or Admin.

- [ ] 🔒 **SEC · S · Restrict the admissions endpoints to Manager/Admin**
  `POST /startups/:id/approve-applicant`, `PATCH /:id/waitlist-applicant`, `POST /:id/appoint-mentors`, `PATCH /:id/change-mentor`, `PATCH /:id/mark-complete` are all `JwtGuard`-only (`startup.controller.ts:30`).
  **Why it matters:** any authenticated founder can approve their own application, assign themselves a mentor, and mark themselves complete. The UI hides these; the API doesn't.
  **Fix:** a `RolesGuard` + `@Roles(...)` decorator — generalize `AdminGuard` rather than copying it.

- [ ] 🔒 **SEC · S · Guard the remaining unauthenticated modules**
  ⚠️ **Probably already done** — the P0 guard fix above names exactly these six controllers (`readiness`, `progress`, `elevate`, `ocr`, `ai/baseline`, `ai/ai-metrics`) and was live-verified 2026-07-27. Confirm and close rather than re-doing.

- [ ] 🎯 🔒 **SEC · S · Delete the raw-SQL debug endpoints**
  `startup.controller.ts:62` (`GET /startups/debug-evals`) and `admin.controller.ts:157` (`GET /admin/tiers/check-evals`) both execute hand-written SQL via `em.getConnection().execute()`. The first is reachable by any logged-in user and dumps every startup's score.
  **Fix:** delete both. Neither is called from the frontend (verified).

- [ ] 🔒 **SEC · S · Align cookie lifetime with token lifetime**
  Cookie `maxAge` = **5 hours** (`(auth)/login/+page.server.ts:54`, mirrored in `(auth-admin)/admin-login/+page.server.ts:57`) vs JWT `expiresIn: '24h'` (`auth.module.ts:19`). The token stays valid for 19 hours after the browser stops sending it, so a leaked token outlives the visible session. See the matching bug in §2.

- [ ] 🔒 **SEC · S · Fix `@GetUser('sub')`, which silently ignores its argument**
  `auth/decorator/get-user.decorator.ts:5-7` returns the whole `request.user` regardless of the key passed, so `updateProfile(userId, …)` (`user.controller.ts:33`) receives a full `User` entity, not a number. It works only because MikroORM coerces an entity to its PK inside a filter.
  **Fix:** `return data ? request.user?.[data] : request.user`, and correct the call site — `sub` is not a property of `User`, so it should be `'id'`.

- [ ] 🔒 **SEC · S · Reconsider client-side role checking on the admin login**
  `(auth-admin)/admin-login/+page.server.ts:41-49` base64-decodes the JWT payload and rejects non-Admins *without verifying the signature*. It runs server-side and `/admin/*` is separately guarded, so it isn't directly exploitable — but it reads as "we trust an unverified JWT". Verify with `jose` (already a dependency) or call a `/auth/me` endpoint.

---

## 2. Broken functionality

Each verified by reading **both** sides of the call.

> **Deferred (2026-08-07)** except the three 🎯 items. The deferred ones are real breakage on paths a capstone demo does not have to touch — but they are breakage, so they keep their full diagnosis.

- [ ] 🎯 🐞 **BUG · M · Readiness-level rubric submission posts to two endpoints that don't exist** — *highest-value item in this section*
  `(app)/startups/[id]/readiness-level/+page.server.ts:64` posts to `/readiness-level-criterion-answers/bulk-create/` and `:78` to `/startup-readiness-levels/bulk-create/`. **Neither route exists.** The block sits in a `try` whose `catch` is empty (`:104`), so it fails silently, and on "success" it redirects to `/mentor/startups/qualified/:id` — also not a route.
  **Why it matters:** this is the mentor's core task and the gate for the entire coaching chain (`allow-rnas` depends on `StartupReadinessLevel` rows existing).
  **Fix:** confirm whether the working path is really `POST /readinesslevel/startup/:startupId/rate`, then rewrite or delete this action. Remove the empty `catch` either way.

- [ ] 🐞 **BUG · S · Removing a team member uses the wrong verb and payload shape**
  `.../overview/members/+page.svelte:155` calls `axiosInstance.delete('/startups/remove-member/:memberId/')` with `{startupId}` in the body; the backend is `@Post('remove-member')` reading `userId` **and** `startupId` from the body (`startup.controller.ts:97-103`). Removing a member always fails.
  **Fix:** `axiosInstance.post('/startups/remove-member', { userId: memberId, startupId })`.

- [ ] 🎯 🐞 **BUG · S · Assessment preview dialog calls a non-existent `/fields` route**
  `dashboard/sub/AssessmentPreviewDialog.svelte:30` fetches `/assessments/:id/fields`; no such route exists. The component *is* mounted (`QualifiedDialog` → `/applications`, `ApprovalDialog` → `Pending`/`Waitlisted`), so a Manager opening an applicant's assessment preview gets an empty or erroring dialog.
  **Fix:** point at `GET /assessments/:id`, or add the endpoint if per-field data is genuinely needed.

- [ ] 🐞 **BUG · S · Re-uploading a capsule proposal during edit hits a commented-out endpoint**
  `(app)/startups/+page.server.ts:63` calls `PATCH /startups/:id/with-capsule-proposal`; the handler is commented out at `startup.controller.ts:231`. Editing *and* attaching a new proposal PDF silently fails; editing without a file works (different branch), so this is easy to miss.
  **Fix:** restore the handler, or route the file through `POST /startups/parse-capsule-proposal` + `PATCH /startups/:id/capsule-proposal`.

- [ ] 🐞 **BUG · S · Admin "create assessment type" posts to a GET-only route**
  `(app)/admin/assessments/+page.server.ts:47` does `POST /assessments/types`; the backend only declares `@Get('types')`. Note `AssessmentType` is a **TypeScript enum**, not a table, so creating a type at runtime isn't possible without a schema change — this may be a ❓SCOPE item in disguise.
  **Fix:** decide whether types are fixed (remove the UI) or dynamic (new table + endpoints — that's L, not S).

- [ ] 🎯 🐞 **BUG · S · Elevate page queries a non-existent `/startup-rna/` endpoint**
  `.../overview/elevate/+page.svelte:71` calls `getData('/startup-rna/?startup_id=…')`; the real prefix is `/rna`. The RNA panel on the Elevate tab never populates.
  **Fix:** `/rna?startupId=…` to match `@Get()` + `@Query('startupId')`.

- [ ] 🐞 **BUG · S · Approve-applicant is two non-transactional calls**
  `(app)/applications/+page.svelte:80-113` fires `approve-applicant`, then `appoint-mentors`, with no rollback. If the second fails, the startup is `QUALIFIED` with no mentor — a state no screen is designed to show, and the Manager gets no error.
  **Fix:** a single backend endpoint doing both in one `em.transactional()`, or explicit partial-failure handling in the UI.

- [ ] 🐞 **BUG · S · `GET /readiness/:startupId` writes to the database on every read**
  `readiness.service.ts:196-241` persists a new `readiness_evaluations` row plus one `readiness_gaps` row per dimension on every call — 6 rows per page view. Any "evaluation history" feature built on it is meaningless noise, and `readinessEvaluations` is eagerly populated in several `getStartups` queries, so payloads grow unboundedly.
  **Fix:** move persistence to the explicit `POST /readiness/score` endpoint and make the `GET` pure. *(`ReadinessDashboard.svelte` already calls `/readiness/score`, so the write may simply be redundant.)*

- [ ] 🐞 **BUG · S · Logout clears a `Refresh` cookie that is never set**
  `(auth)/logout/+page.server.ts:19-22`. The refresh interceptor in `lib/axios.ts:13-45` is fully commented out and no `/tokens/refresh/` endpoint exists. Harmless alone, but it implies a refresh flow that doesn't exist — combined with the 5h cookie, users are silently logged out mid-session with no renewal path.
  **Fix:** delete the dead cookie clear, and decide whether refresh tokens are in scope (❓SCOPE if yes — M–L).

- [x] 🔴 **BUG · M · AI-generated RNS are persisted but no screen can display them** — **FIXED & live-verified** (`fix/rns-generation-bugs`)
  Both RNS display surfaces filtered `isAiGenerated === false` while generation wrote `true`. `rns.service.ts generateTasks` now writes `false` — **the only code change the fix required.** `initiative.service.ts` and `roadblock.service.ts` already wrote `false`.
  **DECIDED (2026-07-26):** generated rows go straight into the board and table rather than into a review panel. Safe because provenance no longer depends on the flag — every AI row carries a `generation_run_id` FK recording operation, model and full pipeline config. **Knowingly traded away:** the human-in-the-loop accept/discard gate the SRS describes. The pieces remain if a panel is wanted later (`addToRNS()` is the accept action; the `card` snippet's `ai` variant renders an add button).

  ❗ **CORRECTION — the RNA module was never affected, and the flip there was reverted.**
  The RNA page renders every row unfiltered (`rna/+page.svelte:255`). The `rna/+page.svelte:77` hit is inside `addToRNA()` — an accept-action dedup lookup, not a display filter. Flipping RNA to `false` was **actively harmful**: it erases the dialog's "AI Generated" provenance field, and it makes `addToRNA()`'s `find(d => d.isAiGenerated === false && same type)` match **the row being accepted itself**, deleting it and then PATCHing a deleted id (reachable from the Startup role). `rna.service.ts` keeps `true`, with a comment recording why it differs from the other three generators.

  ⚠️ **Two live-verification findings that qualify the decision:**
  1. **The fix is not retroactive.** 22 `rns` + 24 `rna` rows predating the provenance work have `is_ai_generated = true` with `generation_run_id IS NULL`, so they stay permanently invisible. They need a one-off backfill or a purge. *(Largely moot — the 2026-07-26 DB wipe cleared them; re-check before relying on either statement.)*
  2. **`generation_run_id IS NOT NULL` is not a complete "AI rows" predicate.** The two populations are disjoint, so a correct query needs `generation_run_id IS NOT NULL OR is_ai_generated = true`.

  ✅ **All display surfaces browser-verified** (2026-07-26, fresh DB): RNS ✅ after the flip; RNA ✅ (no filter, always did); Initiatives 2/2; Roadblocks 2/2; Progress report all sections.
  **`progress-report:299`'s `status === 7` filter is not a bug** — it drives the "RNS — Long Term" section and 7 *is* the long-term status.
  ⚠️ **Progress report is unreachable, not merely unlinked.** With it commented out of `access.ts:36-40` the route **redirects away** to the RNA page, so the §3 re-enable is a prerequisite for using the page at all.

- [x] 🐞 **BUG · S · `targetLevelScore` is `-1` on every RNS row** — **FIXED & live-verified**
  `Rns.getTargetLevelScore()` returns `this.targetLevel.level` directly; the stale hardcoded id→level map in `backend/src/utils.ts` (its only caller) was deleted with the file. All 6 broken rows now return real levels.

- [x] 🐞 **BUG · S · Bulk initiative generation sets `requestedStatus`, single generation doesn't** — **FIXED & live-verified**
  The single-`rnsId` branch now sets `requestedStatus = 1`, matching the bulk branch.

- [x] 🐞 **BUG · S · `generateRoadblocks` always returns `[]` despite persisting rows** — **FIXED & live-verified**
  Added the missing `roadblocks.push(roadblock)` after `persistAndFlush`.

---

## 3. Incomplete features — decisions made 2026-08-07

> **Decided: cut, don't defer.** Deletion is *faster* than leaving these in place, and it removes a whole category of "why doesn't this work?" — half-built UI that calls endpoints which don't exist is the worst state to demo from. Three exceptions, called out per item:
> - **Progress Report → re-enable, not cut.** It is fully working and the re-enable is a five-line uncomment.
> - **The two output-validation design decisions → deferred, not cut.** They are decisions about built code, not unfinished features; nothing to delete.
> - **Refresh-token flow → *leave* and document**, per the recommendation already in the item.

- [ ] ❓ **SCOPE · L · Analytics and Cohorts pages have no backend at all**
  `(app)/analytics/+page.svelte:16,31,46` and `.../cohorts/+page.svelte:16,31,46` call `/analytics/startups/`, `/analytics/elevate-logs/`, `/cohorts`. **No analytics controller, no cohorts controller, no cohort entity.** Both pages are ~190 lines of finished UI, Manager-gated, commented out of the nav (`access.ts:104-113`).
  **Decision:** *Cut* (delete both routes + nav entries — recommended; cohorts are a whole domain concept that doesn't exist), or *Fix* (cohort entity + controller + aggregation service — genuinely large).

- [ ] ❓ **SCOPE · M · `ManageAssessmentTypes.svelte` is orphaned and every call in it is broken**
  Not imported anywhere (verified). All 8 fetches target `/assessment/*` (singular); the real prefix is `/assessments`, and no `fields` routes exist.
  **Decision:** *Cut* (recommended), or *Fix* (needs the dynamic assessment-type work from §2 first). *Decide together with the "create assessment type" bug.*

- [ ] ❓ **SCOPE · S · Three finished features are hidden from navigation**
  Commented out in `access.ts`: Progress Report (`:36-40`), Analytics (`:104-108`), Cohorts (`:109-113`).
  **Confirmed 2026-07-26:** Progress Report is fully working (UI + `GET /progress/:startupId/progress-report`) and the re-enable really is a five-line uncomment — temporarily uncommenting rendered it completely and correctly against live data. Analytics/Cohorts fold into the first item above.

- [ ] ❓ **SCOPE · M · "Rate applicant" was designed but never built**
  `admin/PendingTab.svelte:105-107` — a commented-out call to `/startups/:id/rate-applicant/` noting *"NEED TO IMPLEMENT BACKEND FIRST"*. `RatedTab` and a `rated` tab in `/applications` both exist, so there's a visible state with no way to reach it.
  **Decision:** *Cut* the rated tab and the three orphaned Tab components, or *Fix* by building the scoring endpoint.

- [ ] ❓ **SCOPE · M · `overview` module is an empty shell**
  `overview.controller.ts` declares `@Controller('overview')` with **zero routes**, yet the module is imported in `app.module.ts:69`. The frontend's four Overview tabs get their data from `/startups/:id`.
  **Decision:** *Cut* (recommended — the tabs work without it), or *Fix* by moving overview aggregation here.

- [ ] ❓ **SCOPE · L · No refresh-token flow**
  See the logout bug in §2. Deliberate omission or missing feature?
  **Decision:** *Leave* (document that sessions are fixed-length — fine for a capstone), or *Fix* (refresh endpoint + rotation + interceptor).

- [ ] ❓ **SCOPE · M · RNS validation correlation key is not unique** — *open design decision from the 1c work*
  `(generationRun, dimensionKey)` collides when `no_of_tasks_to_create` produces more than one task per dimension per run; `rns.service.ts`'s lookup `Map` keeps only the last, so a flagged task can be invisible in the payload. A proper fix needs an artifact FK on `ai_recommendations`, which isn't available at record time (persist-then-flush) — a schema change, not a patch.

- [ ] ❓ **SCOPE · S · Validation verdicts go stale on edit** — *open design decision from the 1c work*
  If `update()` or `refineRna()` later rewrites an artifact's text, the `ai_recommendations` row still reflects the original generation.
  **Decision:** revalidate on write, or null the stale verdict.

- [x] ✅ **SCOPE · S · Regulatory readiness is collected but never scored** — *fixed 2026-08-04*
  `regulatory` is now the sixth scored dimension, weights rebalanced to sum to 1.0 (default `0.10`; `0.20` healthtech, `0.06` agritech). Live-verified — `GET /readiness/1` and `/2` both return six dimensions.
  *The remaining spec mismatch is the opposite one now* — the source documents list five dimensions and the code scores six, the extra being Investment. See §0.

- [x] ✅ **SCOPE · S · Readiness scores were clamped to 0–5 but levels run 1–9** — *fixed 2026-08-04*
  Now clamped to `MAX_LEVEL = 9` and divided by 9.
  **Correction — this item's stated rationale was wrong.** It claimed the clamp "undermines differentiation" and implied fixing it would widen the spread. **It does the opposite:** dividing by 5 inflated both scores (any level ≥5 read as 100%) and inflated the *stronger* startup more. The AgroLink/MediSync gap fell **44 → 24** (32→17, 76→41). This is a **correctness** fix — a level-9 startup no longer scores identically to a level-5 one. Do not cite it as a differentiation win.
  **Tier boundaries unchanged, and `tier_configs` is empty on Neon** (verified 2026-08-04), so the hardcoded 85/70/55/40/25 ladder applies. Scores now sit lower, making those thresholds harsher — a deliberate calibration question left open.

---

## 4. Cleanup / tech debt

> **Deferred (2026-08-07)** except the three 🎯 items, which are deletions a reviewer would notice. Everything else here is invisible to a panel and survives the capstone unchanged.

- [ ] 🎯 🧹 **DEBT · S · Three components carry a hardcoded, expired JWT from the previous team's app**
  `admin/PendingTab.svelte:19`, `AcceptedTab.svelte:19`, `RatedTab.svelte` each declare `const access = 'eyJ...'` and send it as `Authorization: Bearer`. Decoded, it is a **Django SimpleJWT** token (`token_type`, `jti`, `user_id`) that **expired 2024-09-06** — a payload shape this backend has never issued.
  **Why it matters:** it looks like working auth and is not, which is how the "the frontend already sends Bearer tokens" assumption survived. *These three are also unimported, so deleting them resolves both items.*

- [ ] 🎯 🧹 **DEBT · S · Delete three orphaned admin Tab components**
  `PendingTab.svelte`, `AcceptedTab.svelte`, `RatedTab.svelte` — none imported anywhere (verified). `RatedTab.svelte` also calls `/readinesslevel/:id/calculator-final-scores/`, which doesn't exist. *Coupled to the "rate applicant" scope decision — resolve that first.*

- [ ] 🧹 **DEBT · S · `GET /ocr/parse` reads an arbitrary server-side path**
  `ocr.controller.ts` passes a `file` query parameter straight to `parseImageFile` with no confinement to an upload directory. It is behind `JwtGuard` now, so any *authenticated* user can read files the server process can read. Its own comment calls it a "Quick test endpoint" — deleting it is probably right; otherwise resolve against a fixed root and reject escapes.

- [ ] 🧹 **DEBT · S · Delete `ReadinessCard.svelte`**
  Orphaned (verified). Note `ReadinessDashboard.svelte`, which it wraps, *is* used in three places — delete only the card.

- [ ] 🧹 **DEBT · S · `ai_generation_runs` cannot see thinking-token cost**
  The table records `prompt_tokens`/`completion_tokens` but has no column for **thinking tokens**, ~780 per call on `gemini-3.6-flash` — more than twice the visible output. The provenance table systematically under-reports the true cost of every run, which matters for any "was the enhanced pipeline worth it?" comparison.
  **Fix:** add `thinking_tokens`, populated from `usageMetadata.thoughtsTokenCount`. Cheap now; expensive to backfill once a study's worth of rows exists without it.

- [ ] 🧹 **DEBT · S · `pnpm lint` is unusable because of a CRLF-vs-prettier conflict**
  No `.gitattributes` and `core.autocrlf=true`, so files check out CRLF while prettier (defaulting to `"lf"`) flags **every line of every file** as `Delete ␍` — 727 errors repo-wide, almost all this one rule. Real findings are buried, and `pnpm lint` runs `eslint --fix`, so a casual run rewrites the entire `src/` tree.
  **Fix:** `.gitattributes` with `* text=auto eol=lf`, or `"endOfLine": "auto"` in `.prettierrc`. Consider splitting `lint` (check) from `lint:fix`.

- [ ] 🐞 **BUG · S · A unit test fails on `master` — the suite is red before anyone starts**
  As of 2026-08-05: **216 passing / 1 failing**. The `ReadinessService › returns a weighted score…` failure was resolved by the 2b work; `AiService › passes valid task responses through unchanged` remains — the test's own context sets `scoreNormalization: true` and mocks `normalizeScore` to return `{ scaled: 5, z: 0 }`, so the service correctly emits `target_level_normalized: 5` plus `target_level_z: 0` while the assertion still expects `3` and no `_z`. **The expectation is wrong, not the code.**
  **A second failure is a real regression.** Fix this one so the suite is a usable signal.

- [ ] 🧹 **DEBT · S · Removing an uploaded file orphans the object in the bucket**
  `FileUploadField.svelte`'s "Remove file" only rewrites `answerValue`. `UploadService.deleteFile()` works, but the only route calling it is **commented out** (`upload.controller.ts`, the `@Delete(':key(*)')` block), so removed attachments stay in storage forever with nothing pointing at them.
  **Fix:** uncomment the route (the controller now has `JwtGuard`) and have `removeUploadedFile()` call it with `file.key` before rewriting. Ignore a 404. *Legacy rows store `url` rather than `key` and can't be resolved — skip those.*

- [ ] 🧹 **DEBT · S · The SQLite fallback in `mikro-orm.config.ts` does not work**
  `:8` falls back to in-memory SQLite when `DB_HOST` is unset, and `CLAUDE.md` describes it as a usable no-Docker path. It isn't — `better-sqlite3`'s native bindings were never compiled, so it dies at connect (verified 2026-07-27). Note `dotenv` never overrides an existing `process.env` key, and PowerShell's `$env:DB_HOST=''` *deletes* rather than empties, so the fallback is unreachable from PowerShell regardless.
  **Fix:** make it work (`pnpm rebuild better-sqlite3`, and confirm pgvector-typed entities can even be created under SQLite) or delete the branch, the `@mikro-orm/sqlite` dependency, and the `CLAUDE.md` claim. Deleting is probably right — the entity set assumes Postgres.

- [ ] 🧹 **DEBT · S · Drop three unused entities and their tables**
  Never referenced by any service or controller (verified): `MentorAssignment`, `ConsultationRequest`, `ScoringGuide`. Mentor assignment actually writes to the `startups`↔`users` pivot (`startup.service.ts:942-963`), so `MentorAssignment` is actively misleading — it looks like the source of truth and even has an `assignedBy` audit field the real path lacks.
  **Fix:** delete the entities and add a migration to drop the tables. *If the `assignedBy`/`isActive` audit trail is wanted, that's a ❓SCOPE item instead.*

- [ ] 🧹 **DEBT · S · Consolidate duplicate enums** — *deferred, except one line*
  🎯 **The Cebuano comment in `Status` (`// basin pwede sa RNS…`) goes before submission** — that part is trivial and demo-critical; the consolidation itself is deferred.
  `RnsStatus` (integer-backed) and `Status` (string-backed) define the same seven states.
  *(The `recommendations` table half of this item is fully resolved — the entity and its service are deleted, and the table does not exist on Neon at all, verified 2026-08-04. No pending action.)*

- [ ] 🎯 🧹 **DEBT · S · Remove committed scratch files**
  Tracked: `backend/test-login.js` (0 bytes), `frontend/fix-page.cjs`, `.../admin/assessments/+page.svelte.backup`, `.../admin/assessments/temp_fix.txt`, `chumcheck_2025-03-04_025337.sql` (561 KB). Untracked but in the repo root: `backend.zip` (116 MB), `frontend.zip` (84 MB) — gitignore or delete.
  **Why it matters:** `.backup` and `temp_fix.txt` files next to the code they patch are the first thing a reviewer notices.

- [ ] 🧹 **DEBT · S · Purge `chumcheck` references**
  `scripts/reset_db.sh`, `reset_db.ps1`, `delete_db.sh` all target a database named `chumcheck` with user `postgres`, while the project uses Neon. Running any of them does nothing to your dev database — or worse, drops an unrelated one.

- [ ] 🧹 **DEBT · M · Resolve migrations vs. `updateSchema()`**
  `main.ts:292` calls `updateSchema()` on every boot while 93 migration files sit in `src/migrations/`. The migrations are inert, schema drift is invisible, and auto-sync on boot is unsafe against production.
  **Fix:** pick one. For a capstone, gating `updateSchema()` behind `if (process.env.NODE_ENV !== 'production')` is a reasonable compromise.

- [ ] 🧹 **DEBT · S · Move demo seeding out of `bootstrap()`**
  `main.ts:16-268` — ~250 lines of seeding (including a large commented-out block at `:97-148`) runs on every startup with `console.log` per record.
  **Fix:** move to a seeder script invoked by an npm script, gated on a `SEED_DEMO` flag.

- [ ] 🧹 **DEBT · S · Remove `console.log` debugging from request paths**
  `startup.controller.ts:216-226` logs full request and response bodies on every capsule-proposal PATCH — **writing startup proposal contents to logs**. Also `(app)/admin/+page.server.ts:14,19` on every admin page load.

- [ ] 🧹 **DEBT · S · Fix the doubled route segment `/startups/startups`**
  `startup.controller.ts:31` (`@Controller('startups')`) + `:38` (`@Get('/startups')`). Note `assessment/startup-assessment.controller.ts:16` *also* claims the `startups` prefix, so route ownership is already split across two files.
  **Fix:** change to `@Get()`; update the two frontend callers.

- [ ] 🧹 **DEBT · S · Delete commented-out dead code**
  Largest blocks: `startup.controller.ts:231-310` (the `with-capsule-proposal` handler — resolve the §2 bug first), `lib/axios.ts:13-45` (refresh interceptor), `app.controller.ts:75-89`, `(app)/startups/[id]/+layout.server.ts:12-40`.

- [ ] 🧹 **DEBT · S · README corrections**
  `README.md:29` lists `DISQUALIFIED` as a qualification status; the enum has `COMPLETED` instead. The README also doesn't mention that **`JWT_SECRET` must match across both `.env` files**, which is the most common setup failure.

- [x] 🐞 **BUG · S · The boot seeder gave startups to staff accounts and assigned no mentor** — *fixed 2026-07-27*
  `seedDemoStartups()` set a Manager as owner of one startup and a Mentor of the other, with no `startups_mentors` row on either.
  **Why it mattered beyond cosmetics:** any ownership/IDOR work in §1 would have been tested against data where the roles were already conflated, so a broken ownership check could look correct.
  **Fixed:** `seedLocalDemoData()` creates `founder.agrolink@` / `founder.medisync@` as `Role.Startup`, and a single `seedDemoStartup(em, spec)` helper sets the founder as `user`, adds them to `members`, and adds `mentor@launchup.local` to `mentors`. Same emails `seed-demo-full.js` uses, so the two seeders agree.
  **Deliberately creation-only** — the `if (existing)` guard stays, so branches seeded by the old code keep the wrong shape until `node seed-demo-full.js` is run. Verified on a genuinely cold throwaway Neon DB: all three assertions (non-`Startup` owners / self-mentoring / mentorless) returned 0.
  *Related: setting `qualificationStatus = QUALIFIED` directly anywhere skips `approve-applicant` → `appoint-mentors`, which is where the mentor is normally attached.*

---

## 5. Infrastructure decisions (open questions)

Neither the SRS nor the SDD names a storage vendor, a model version, or Docker — these are genuinely your call.

> **Deferred (2026-08-07)** except the 🎯 API-key check. Storage and model are settled; output caps, `responseSchema` and Docker are all invisible to a panel.

- [x] ✅ **SCOPE · S · File-storage provider** — *settled 2026-07-27: Supabase Storage*
  Cloudflare R2 was the original recommendation but requires a credit card even on the free tier. Supabase is S3-compatible, no card, ~1 GB free. Because `upload.service.ts` uses the generic `@aws-sdk/client-s3` `S3` class with a configurable `endpoint`, the swap was config, not a rewrite.
  `DO_SPACES_*` → `S3_*` + `forcePathStyle: true`; dropped `ACL: 'public-read'` (Supabase/R2/modern S3 all gate public access per *bucket*); **presigned PUT** so a 10 MB file no longer occupies an API request; **presigned GET** as the only read path against a private bucket; `JwtGuard` on the controller. `FileUploadField.svelte` stores `{key, fileName}` and still renders legacy `{url, fileName}`.
  **Two bugs the unit tests caught before they could ship:** the SDK signs a CRC32 checksum of the *empty* signing-time body by default, so every real upload would have been rejected at the bucket (`requestChecksumCalculation: 'WHEN_REQUIRED'`); and `getSignedUrl` signs only `host` unless given `signableHeaders`, which made the returned `Content-Type` requirement decorative.
  **Verified end to end against the live bucket:** presign → PUT → signed GET returns a byte-identical file; an **unsigned** GET on the same object returns **403**. Through the UI as a Startup-role founder, the stored `answerValue` is a **key, no URL**, as designed.

- [x] ✅ **SCOPE · M · Model selection** — *settled 2026-07-27: `gemini-3.6-flash`*
  The model is no longer a literal — `AiConfigService` resolves `model` and `temperature` from `GEMINI_MODEL`/`AI_TEMPERATURE`, so switching is an env change.

  ⚠️ **The earlier recommendation in this section was wrong, and measuring it is what caught that.** It named Gemini 2.5 Pro / 2.5 Flash:

  | Model | Latency | Output tok | **Thinking tok** | JSON |
  |---|---|---|---|---|
  | `gemini-2.5-flash-lite` *(was default)* | 2.3s | 326 | **0** | fenced |
  | `gemini-3.5-flash-lite` *(escape hatch)* | 1.9s | 280 | 0 | clean |
  | **`gemini-3.6-flash`** *(new default)* | 6.5s | 343 | **779** | clean |
  | `gemini-3.5-flash` | 12.1s | 362 | 965 | clean |
  | `gemini-2.5-flash` | — | — | — | **404 "no longer available to new users"** |
  | `gemini-2.5-pro`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview` | — | — | — | **429 — not on the free tier** |

  - **`gemini-2.5-flash` is gone.** Wiring the old recommendation would have 404'd every AI call.
  - **No Pro-tier model is reachable on the free key** (429 at 20s spacing = tier exclusion). Any plan putting Pro on scoring requires paid billing.
  - **The lite tiers spend zero tokens reasoning.** Asked for *Technology* readiness, `2.5-flash-lite` answered about revenue and product-market fit — the wrong dimension.
  - **Cost:** ~2.8× tokens and ~3× latency vs the old default.

  **Old-vs-new measurement (3 reps, two documents, only the model varied) — and it overturned this section's premise:**

  | | `gemini-2.5-flash-lite` | `gemini-3.6-flash` |
  |---|---|---|
  | AgroLink (early) mean level | 1.67 | 2.33 |
  | MediSync (mid) mean level | 1.50 | 4.61 |
  | **Gap** | **−0.17** | **+2.28** |
  | Invented values for absent fields | 0/9 | 0/9 |

  1. **The old model ranked the two startups backwards** — 5 of 6 dimensions returned identical scores for both.
  2. **"The lite tier is sycophantic / lenient" is not supported.** It was floor-bound and blind, collapsing everything to 1–3. The real defect was **differentiation (Objective 2)**, not leniency (Objective 4).
  3. **That reframes 2b** — weighting near-identical inputs could never have produced differentiation. The model was the binding constraint, not the formula.
  4. **Grounding did not improve** — both models refused all 9 absent fields and recalled all 9 present ones, so **no Objective 1 gain can be attributed to the model change**.

  **Instrumentation gap closed:** `capsule_extract` (covering Objective 3's Gemini Vision handwriting path, previously invisible to the study) and `analysis_summary` now open `ai_generation_runs` rows and honour `X-Ai-Pipeline-Config`.
  **Per-task tiering is deferred, not dropped** — there is no seam between scoring and generation today, and with Pro unreachable there is nothing stronger to point a seam at.
  **Limits:** N is small (3 reps × 6 dimensions × 2 documents), there is no expert ground truth so the trustworthy signal is the *gap and its direction*, and 1 of 3 AgroLink reps produced unparseable output.

- [ ] ❓ **SCOPE · S · Switch structured calls to `responseSchema`** — still unaddressed
  Use `responseMimeType: 'application/json'` + `responseSchema` instead of regex-stripping ```` ```json ```` fences (`extractJsonPayload`, `ai.service.ts:338`). Directly satisfies SRS §2.2's "all AI-generated structured outputs are validated against expected schemas."
  *(`temperature: 0` is done — `AI_TEMPERATURE` defaults to `0` and applies at every call site. **This was a real behaviour change, not a no-op:** the one call site that set it passed it at the *top level*, where the SDK dropped it, so every Gemini call previously ran at the API default. Baseline-arm results gathered before this are not sampling-comparable with results after.)*

- [ ] ❓ **SCOPE · M · Decide whether Gemini calls should have output caps at all**
  **No call in `ai.service.ts` sends `maxOutputTokens`, and none ever effectively did** — `callAiExpectJson` passed `1024` at the top level, where the SDK silently dropped it (an `as any` hid the type error); every other call passed nothing.
  **Why it is now explicitly absent:** moving sampling params into `config` (which is what made `temperature` take effect) would have *newly enforced* those caps for the first time. That is a user-visible regression — `getCapsuleProposalInfo` extracts eight prose fields from a whole document, and truncation makes `JSON.parse` throw at `startup.service.ts:355`, whose catch sets `parsedPayload = {}`, so the founder gets a blank extraction screen with only a `console.error`.
  **The decision:** if caps are wanted, choose a value **per call site** from the actual prompt shape and add a test per site that a realistic full-length response is not truncated. Do not reintroduce a blanket number. Note Gemini bills *thinking* tokens against `maxOutputTokens`, so a cap sized to the visible JSON can truncate before any answer is emitted.
  **Related under-count:** `ai_generation_runs.completion_tokens` sums only `candidatesTokenCount`, so recorded output spend is a floor. Fold in `thoughtsTokenCount` before using these columns for cost analysis (see §4).

- [ ] 🎯 ❓ **SCOPE · S · Verify the `GEMINI_API_KEY` format**
  The configured key starts with `AQ.Ab8RN6…`; AI Studio keys normally begin with `AIzaSy`. Confirm it is a valid AI Studio key and not a Vertex/OAuth credential, which `@google/genai` would need different auth for — a bad key makes every AI feature fail at demo time.

- [ ] ❓ **SCOPE · S · Drop Docker, give each developer a Neon branch**
  `docker-compose.yml` only ever provided local Postgres, and `backend/.env` points at Neon. **Neither the SRS nor the SDD mentions Docker** — there is no requirement to satisfy, nothing in the remaining work is containerization-shaped, and Vercel/Render don't build from a compose file.
  **But fix the real problem it masks:** `main.ts:292` runs `updateSchema()` and seeds demo data on every boot, and everyone points at the *same* Neon database — so every `pnpm dev` mutates shared schema. Use **Neon branching** (one branch per developer, free tier supports it), combined with gating the auto-sync behind `NODE_ENV !== 'production'` (§4).
  **Then:** delete `docker-compose.yml` or mark it unused, and correct `README.md` / `CLAUDE.md` / `PROJECT_OVERVIEW.md` §8.

---

## Quick reference — what's *not* broken

Checked and confirmed fine, so you don't re-investigate:

- ✅ `.env` files are **not** tracked in git — only `.env.example` (verified via `git ls-files`).
- ✅ Admin module guard coverage is correct — class-level `@UseGuards(JwtGuard, AdminGuard)` on all 18 routes.
- ✅ Assessment module guards are correct — class-level `JwtGuard` + method-level `AdminGuard` on create/update/delete.
- ✅ Password handling is sound — argon2 hashing, `@Property({hidden: true})` on `User.hash`, old-password verification on change.
- ✅ Cookies are `httpOnly` + `sameSite: 'strict'` + `secure` outside dev.
- ✅ The global `ValidationPipe` uses `whitelist: true`, so DTOs strip unknown properties.
