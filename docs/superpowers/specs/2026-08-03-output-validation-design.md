# Output validation layer (Objective 1c) — design

**Date:** 2026-08-03
**Branch:** `feat/output-validation` (off `master` at `e9d391c`)
**Objective:** SRS 1c — "output validation layer flagging inconsistent recommendations"

## The defect

`ai_recommendations` already carries `validationStatus`, `confidenceStatus` and
`notes`. Both generation call sites — `rna.service.ts:198` and the RNS
equivalent — pass those as **hardcoded literals**:

```ts
validationStatus: 'validated',
confidenceStatus: 'high-confidence',
```

So every row asserts a validation that never ran. Worse, `ragContext.lowConfidence`
— a real signal, computed by `RagQueryService`, already used ~50 lines above to
decide whether the grounded prompt is used at all — is **discarded** rather than
recorded.

Two further facts shape the design:

- `OutputValidatorService` and `RecommendationStorageService` are injected into
  `RnaService` but **never called**. `rna.service.spec.ts` annotates them
  `unused by generateRNA`.
- `RecommendationStorageService` targets the `recommendations` table, which has
  **no writer anywhere in the codebase**. `TODO_CHECKLIST.md` §4 already flags it
  as duplicating `ai_recommendations`.

Implementing the stubs as written would therefore produce working code that
still changes nothing, and would create a second parallel recommendation store.

## Scope decisions

| Decision | Choice | Why |
|---|---|---|
| Target store | `ai_recommendations` | Already written on the live path, already has the columns |
| What is checked | Retrieval confidence + declared-schema violations | The only mechanical signals that are in scope and can actually fire |
| How far up the stack | Backend + API, no frontend badge | Frontend has 160 pre-existing `svelte-check` errors; badge is a separate pass |

### Why not groundedness or stage-appropriateness

Both were measured and are **saturated**:

- Fabrication probe: 0/15 invented absent fields, across every arm and two
  models (2026-07-27, 2026-07-29).
- Stage-inappropriate recommendation rate: 0% on every arm at n=3 (2026-07-30
  through 2026-08-03).

A validator built on either would pass everything — behaviourally identical to
today's unconditional `isValid: true`, with more code to maintain. They can be
added later if a harder probe ever shows headroom.

### Why no model-judged validation

Model leniency is the thing under investigation (Objective 4). Grading output
with a model folds the property being measured into the measurement. This is the
same commitment `measure-grounding.js` already makes: *"Metrics are mechanical,
not LLM-judged."*

## `OutputValidatorService` — new contract

Pure. No injected dependencies, no model call, no DB access.

```ts
export type ValidationStatus = 'validated' | 'flagged';
export type ConfidenceStatus = 'high-confidence' | 'low-confidence';

export interface ValidationVerdict {
  validationStatus: ValidationStatus;
  confidenceStatus: ConfidenceStatus;
  notes: string | null;
}

validate(input: {
  content: string;
  maxLength?: number;   // omitted when the prompt declares no limit — see below
  retrievalLowConfidence: boolean;
}): ValidationVerdict
```

**Rules**

1. `confidenceStatus` is `'low-confidence'` when `retrievalLowConfidence` is
   true, else `'high-confidence'`. This is the existing discarded signal.
2. `validationStatus` is `'flagged'` when the content violates the contract the
   prompt itself declared:
   - empty or whitespace-only after trim, or
   - longer than `maxLength`, **when one was declared**.
3. `notes` states the reason, `null` when validated.

**`maxLength` is only checked when the prompt actually declared a limit.** The
validator must not invent a constraint the model was never given — flagging on
an undeclared limit would flag correct output. The two paths differ, and the
asymmetry is real rather than an oversight to normalise away:

| | declared length limit | empty guard upstream | so the live check is |
|---|---|---|---|
| RNA | `max 500 chars`, unenforced today | yes, `generatedRNA.rna?.trim()` | the length check |
| RNS | **none** | **none** — `newRns.description = task.description` unchecked | the empty check |

So `maxLength` is passed for RNA and omitted for RNS. Adding a declared limit to
the RNS prompt would make the length check meaningful there too; that is a
prompt change, out of scope here, and noted below.

Confidence and validation are **independent**: a low-confidence recommendation
can still be well-formed, and a flagged one can come from high-confidence
retrieval. Both are recorded.

`flagInconsistencies()` and `markUnverifiable()` are deleted rather than
implemented — the verdict object replaces both, and neither had a caller.

## Hook points

- `rna.service.ts` — build a verdict from `ragContext.lowConfidence` and the
  generated text, pass it to `recordAiRecommendation` in place of the literals.
- `rns.service.ts` — same, at its equivalent call site.
- Delete `recommendation-storage.service.ts`, `entities/recommendation.entity.ts`,
  and their `app.module.ts` / `rna.module.ts` registrations.

For RNA, `maxLength` is taken from the same constant the prompt string is built
from, so the enforced limit and the declared one cannot drift apart. RNS passes
no `maxLength` (see above).

## API exposure

RNA and RNS list payloads gain `validationStatus`, `confidenceStatus`, `notes`.

Correlated on `(generationRun, dimensionKey)` — both the artifact row and its
`ai_recommendations` row are written in the same block with the same `ctx.run`.

Rows with no `generationRun` (manual entries, and pre-provenance legacy rows)
return `null` for all three. That is correct: those are not AI recommendations,
and `null` is distinguishable from `'validated'`.

## Testing

- Table-driven unit tests on `validate()`, written first and watched fail.
- Mutation pass over each flag condition — this repo has repeatedly shipped
  decorative guards that a green suite did not catch.
- `rna.service.spec.ts` and `rns.service.spec.ts` currently assert the hardcoded
  `'validated'`, so they pass against a broken implementation. Both must be
  updated to assert a computed verdict, including a low-confidence case.
- Jest baseline is 167 passing / 2 failing. A third failure is a regression.

## Explicitly out of scope

- The frontend Validated / Flagged / Low-Confidence badge.
- Groundedness and stage-appropriateness checks (saturated, see above).
- The parse-retry signal. `callAiExpectJson` runs a 2-attempt corrective loop
  but returns only the parsed value; the retry is recorded via
  `metrics.recordFailure`, not returned. Surfacing it would change that
  function's return type across every caller — a separate change.
- Declaring a length limit in the RNS prompt. That is a prompt change, and
  changing a production prompt mid-measurement would invalidate the arm
  comparison currently in flight on `measure/grounding-rep2`.
- Backfilling existing `ai_recommendations` rows. They keep their hardcoded
  `'validated'`; only new rows carry a real verdict. Noted so nobody reads the
  old rows as validated output.
