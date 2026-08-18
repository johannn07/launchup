# Adversarial readiness summary — design

**Date:** 2026-08-11
**Objectives:** SO 4.2 primary (adversarial prompting). SO 4.4 secondary — currently tracked by nothing.
**Status:** approved, not implemented.

## Problem

`TODO_CHECKLIST.md` maps objective "4b" to `AiService.reviewBiasScore()` and calls it *mislabelled — post-hoc where the objective wants pre-scoring*. Reading the source document instead of the checklist's paraphrase shows the mismatch is larger than that.

**SO 4.2, verbatim** (`LaunchUp_Enhanced_Objectives.pdf`, under General Objective 4):

> "Design and implement adversarial prompt strategies that instruct the AI evaluator to actively seek weaknesses, gaps, and unmet criteria in a startup's submission **before generating a readiness summary**, counterbalancing the model's natural tendency toward agreement and positive framing."

The target is the **readiness summary**, not a score.

### `reviewBiasScore` is attached to different artifacts entirely

| call site | what it reviews | is it a readiness summary? |
|---|---|---|
| `rns.service.ts:373` | an RNS task's target readiness level (1–9) | no |
| `roadblock.service.ts:224` | a roadblock's risk number (0–5) | no |

Those are its only two call sites. So it is not the right mechanism in the wrong pipeline position — it operates on artifacts SO 4.2 does not mention. It stays where it is and keeps doing its job; only its **label** is wrong, and this spec does not change its behaviour.

### The artifact SO 4.2 actually names has no bias mitigation at all

`AiService.generateStartupAnalysisSummary()` (`ai.service.ts:665`) is the only summary-shaped AI artifact. It runs on application submit (`startup.controller.ts:95`, operation `analysis_summary`), is stored as `capsule_proposals.ai_analysis_summary`, and is what the Manager reads when evaluating.

Its instruction asks for:

> "1. Overall **viability** assessment (market potential and solution **strength**)
> 2. Key competitive **advantages** and growth strategy **feasibility**
> 3. Critical risks and primary recommendations"

Positive framing is written into the instruction, and criticism is item 3 of 3. **`reviewBiasScore` is never applied to it.** This is the leniency surface that reaches a human decision, and nothing guards it.

### Two further findings, recorded rather than fixed here

- **SO 4.4 is tracked by nothing.** It requires flagging summaries with "predominantly positive language with insufficient critical observations" to alert the reviewing manager. The checklist maps 4a/4b/4c to SO 4.1/4.2/4.3 and omits SO 4.4 entirely. This spec implements it, because it is also the instrument that measures SO 4.2.
- **SO 5.3's premise is false in the code.** It describes the summary as generated "from URAT answers". `UratQuestionAnswer` is CRUD-only — no AI call reads it. The summary is built from the capsule-proposal DTO. Out of scope here; recorded so it is not discovered during a demo.

## Design

### 1. Field order is the mechanism, not the instruction

`generateStartupAnalysisSummary` moves to `responseMimeType: 'application/json'` + `responseSchema`:

```
{
  unmet_criteria: [{ criterion, proposal_field, why_unmet }],
  critical_risks: [{ risk, severity }],
  summary: string
}
```

Return type changes from `string` to `{ summary, unmetCriteria, criticalRisks }`. `proposal.aiAnalysisSummary` still receives a string, so the entity, the column and the Manager's view are untouched.

**Why ordering rather than instruction.** The current prompt *already* asks for critical risks — it is item 3 of 3 — yet nothing in the prompt stops the model leading with viability, because an instruction the model can reorder is not a constraint. Generation is autoregressive and the schema fixes field order, so the model cannot emit `summary` before it has emitted `unmet_criteria`. "Before" becomes a property of the generation rather than a request.

**Unmeasured, and this is the origin of the claim.** Earlier drafts of this line asserted that the model *does* still lead with viability. Nothing in the repo measures the summary path — no summary arm in `measurement/README.md`, no summary results file, and the only stored `ai_analysis_summary` strings are hand-written seed prose that `demo-capsule-proposals.ts` deliberately excludes from measurement. Whether the legacy prompt's ordering biases output is precisely what §7's 12-call comparison exists to answer. The design argument above stands on the *structural* point (an instruction is reorderable, a schema is not) and does not need the empirical one. Corrected here rather than only downstream, because this sentence had already propagated into the plan twice and into `ai.service.ts`'s committed doc comment.

This also retires the standing §5 item — `responseSchema` in place of `extractJsonPayload`'s regex fence-stripping — at the call site where it matters most.

**Prompt direction:** treat the proposal as overstating readiness until its own text proves otherwise; name the proposal field each unmet criterion comes from; treat an **absent** field as a finding, not a neutral.

### 2. The overcorrection guard

"Counterbalancing" fails in two directions. Uniform harshness is still bias, and this repo has the cautionary case: `gemini-2.5-flash-lite` read as lenient but was **floor-bound and blind**, collapsing both demo startups to 1–3, and the real defect was differentiation rather than leniency (2026-07-27).

So the measurement asks two questions, not one:

1. Did the adversarial arm produce more critical observations?
2. **Does it still separate AgroLink (early) from MediSync (mid)?**

An arm that criticises both equally has failed. Recorded before the run, not added after.

### 3. SO 4.4 tone check — safety direction reversed from `lib/assertions.js`

A pure module, `src/ai/summary-tone.ts`, exporting `analyzeTone(text) -> { positiveCount, criticalCount, ratio, flagged, clauses }`.

**One copy, imported by both consumers** — the service (which must flag the Manager) and the measurement script. Duplicating a shared definition is how the grounding study drifted for a week; `src/demo-readiness-levels.ts` and `measurement/lib/hard-absences.js` exist for this reason.

**The direction is the mirror image of the fabrication classifier, and must be stated so the wrong precedent is not applied from the module next door:**

| | `measurement/lib/assertions.js` | `summary-tone.ts` |
|---|---|---|
| costly error | false **positive** — inflates a reported fabrication rate | false **negative** — an inflated summary reaches the Manager unflagged |
| ambiguity resolves | **away from** flagging | **toward** flagging |
| so the reported figure is | a lower bound on fabrication | an **over**-count of flags |
| which makes trustworthy | a non-zero rate | an **un**flagged summary |

**No calibrated threshold, deliberately.** It flags only when `criticalCount === 0` — a boundary requiring no calibration — and reports the ratio as data. The 12-call run then supplies the distribution from which a real threshold can be set, which is the order `RAG_MIN_SIMILARITY = 0.78` was established in (measured over 36 pairs, after a guess of 0.70 leaked 78% of cross-domain pairs). The tier thresholds, still uncalibrated against ÷9 scores, are the counterexample.

### 4. Persistence — no schema change

`recordAiRecommendation()` already writes `ai_recommendations` with `content`, `validationStatus`, `confidenceStatus`, `notes` and an `AiGenerationRun` FK.

| field | value |
|---|---|
| `recommendationKind` | `analysis_summary` |
| `dimensionKey` | `overall` — the summary is not per-dimension |
| `content` | the summary text |
| `confidenceStatus` | the SO 4.4 verdict |
| `notes` | serialized `unmetCriteria` + `criticalRisks` + tone counts |

One summary per generation run, so §3's open `(generationRun, dimensionKey)` collision cannot occur on this path.

### 5. Config and arms

New `AI_ADVERSARIAL_SUMMARY_ENABLED`, resolved through `AiConfigService` alongside the existing four flags, overridable per-request via `X-Ai-Pipeline-Config` under the same Manager/Admin gate.

**Disabled restores the current prompt verbatim.** The baseline arm must be what actually shipped, not a reconstruction of it — otherwise the comparison measures two new prompts against each other.

Concretely: the existing prompt body is extracted **unchanged** into a named constant (`LEGACY_SUMMARY_PROMPT`) in the same commit that adds the adversarial one, and a test asserts the disabled path emits exactly that string. Extracting it and editing it in one step is how a "baseline" quietly becomes a third arm nobody labelled.

### 6. Failure path — an explicit non-regression

§5 records that `getCapsuleProposalInfo`'s parse failure sets `parsedPayload = {}` and the founder gets a blank extraction screen with only a `console.error`. This must not be repeated on the summary path.

Order: `callAiExpectJson`'s existing `correctivePrompt` retry → on continued failure, fall back to the **legacy free-text call**, so a schema failure degrades to today's behaviour rather than to nothing. Normal path 1 call; pathological path bounded at 3.

### 7. Measurement — 12 calls

`measurement/measure-summary-bias.js`, 2 arms × 2 startups × 3 reps, one call each. Fits a single day's 20-call window, unlike the RNA probes which spend 16 on one rep-pair.

Reports per arm: tone counts, flag rate, unmet-criteria counts, and the AgroLink/MediSync separation from §2. Carries its own comparability key over model, temperature, prompt source and `summary-tone.ts` source — the same discipline as `lib/fingerprint.js`, not the same file, because the metric families do not overlap.

**Unresolved, and the plan must settle it before implementation:** the demo startups exist in the measurement harness as capsule-proposal *documents*, but this path needs a `StartupApplicationDto`. If they do not map cleanly the options are to build the two DTOs as fixtures or to drive the real `POST /startups/apply`. Flagged here rather than discovered mid-implementation.

## Testing

TDD throughout.

- `summary-tone.ts`: unit tests per cue, plus a **mutation pass** — remove each cue and the flag rule individually and confirm a test fails. Mutation testing has caught three decorative guards on this project (`is429`, `placed > ceiling`, `ipo`/`IPOPHL`). Any mutation harness must assert the mutation actually landed: on 2026-08-09 two mutants reported as survivors had silently failed to apply.
- Guard against vacuous assertions — a test whose subject returns `null` and asserts `notEqual(…, flagged)` pins nothing. This was a real finding on the classifier work.
- Service: flag on/off produce different prompts; structured output parses; the fallback chain reaches the legacy call.
- The baseline arm's prompt is asserted byte-identical to the shipped one.

## Out of scope

- Changing `reviewBiasScore`'s behaviour. Only its documentation is wrong; that correction is a checklist edit, not code.
- SO 5.3's URAT premise.
- A calibrated tone threshold — deliberately deferred until the run produces a distribution.
- Re-scoring any existing `ai_analysis_summary` rows. Retroactively computing a verdict would fabricate provenance, the same rule the 1c validator followed.
