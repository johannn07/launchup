# Supplied-level fabrication probe — design

**Date:** 2026-08-06
**Objective:** 1b primary (RAG grounding on the production path), 1c secondary (gives output validation an observed failure mode, or better evidence for excluding one).
**Status:** approved, not implemented.

## Problem

Every grounding number collected to date is the **levels probe**, where the model *infers* the readiness level. Production never does that — mentors set levels and the RNA path consumes them. Objective 1b therefore has a strong measured result about a path that is not shipped, and none about the path that is.

The 2026-08-05 work also recorded a specific risk on the shipped path: with the level *supplied*, the corpus made the model assert a rubric's evidence requirement as fact —

> "The venture has drafted a funding plan (IRL 3)"

A wrong supplied level turns rubric text into fabricated evidence. The existing absent-field probe (metric 2 / `--with-fabrication-probe`) does not catch this class: it has read 0/15 on every arm since 2026-07-29.

**The trigger is currently gone, and that is why this needs a manipulation.** The fabrication was observed while the seeded levels were still wrong (MediSync IRL 3). The 2026-08-05 correction moved MediSync to IRL 1, so deterministic retrieval now pulls the IRL 1/2 rows, the funding-plan text never enters the prompt, and the mechanism cannot fire. An observational re-run would measure 0 and prove nothing. The fix removed the trigger without touching the vulnerability.

## What is measured

Whether an RNA **asserts as fact** an artifact class the source document never mentions, when the supplied readiness level is wrong.

Reference-free by construction. It reuses `HARD_ABSENCES`, whose `absentTokens` are asserted absent from both documents at run time by `verifyAbsences` rather than trusted. No ground-truth level is needed, so the probe survives the reference objection that retired the seeded reference on 2026-08-05.

## Design

### A condition on the RNA probe, not a new prompt

`rnaPrompt` is reused verbatim. Only the supplied levels differ. No prompt-builder source changes, so no existing fingerprint moves.

New flag, following `--only-probe`'s conventions — exact names, unknown value hard-errors rather than defaulting:

```
--level-condition=truth|inflated|both     (default: truth = current behaviour exactly)
```

### The manipulation

| | Tech | Market | Accept | Org | Regu | Invest |
|---|---|---|---|---|---|---|
| AgroLink truth | 2 | 3 | 3 | 2 | 1 | 1 |
| MediSync truth | 6 | 5 | 5 | 2 | 1 | 1 |
| **Inflated (both)** | *unchanged* | *unchanged* | *unchanged* | **3** | **3** | **3** |

- Both startups share `O2 R1 I1`, so one override map covers both and the manipulated cells pool.
- T/M/A stay at truth: every call carries three manipulated and three unmanipulated dimensions, a free within-call negative control.
- +1/+2/+2 is plausible as a real mentor error, so the finding reads as a shipped-path risk rather than a contrived worst case.
- All three stay above `HARD_ABSENCES`' ceiling of 2, so no dimension stops being scoreable.

**The manipulation drives retrieval, not only the prompt text.** `retrieveRubricsForArm` keys deterministic lookup on the supplied level and pulls `(L, L+1)`, so an inflation of 3 pulls rows 3-4: ORL 3 (a non-founder contributor under contract), RRL 3 (counsel engaged, preliminary opinion received), IRL 3 (*"A funding plan has been drafted specifying a target raise amount"*). IRL 3 is the literal source of the observed instance. An inflation of 4 would pull rows 4-5 and leave row 3 in neither condition — the manipulation would never present the rubric text it exists to reproduce. The wrong level and the dangerous rubric text arrive together, exactly as a mentor's mis-set level does in production.

**`STARTUPS` is never mutated.** `common` contains the startups' levels, so an in-place edit would change all 15 existing fingerprints and orphan the 2026-08-05 data. Inflated levels live in a separate override applied at call time.

### Run shape

2 arms (`baseline`, `deviation-deterministic`) × 2 startups × 2 conditions = **8 calls/rep**. Two reps = 16 calls, leaving 4 spare for 503 retries inside one 20-call window.

`sdd-semantic` is dropped here. It is byte-identical to `baseline` on the RNA probe, and the paired correct-level condition already supplies a within-arm control — which the levels probe never had.

## The scorer — `lib/assertions.js`

Pure. No I/O, no model calls, testable standalone, like `lib/metrics.js`.

Consumes only `absentTokens` and `requires` from `HARD_ABSENCES`. **`ceiling` is not used.** `ceiling` scores *placements*; this probe scores *text*. Whether a funding plan exists is a property of the document, not of the supplied level — so all three dimensions are scoreable in **both** conditions, and the control measures a real base rate. Gating on `suppliedLevel > ceiling` would have made the control score zero observations.

**Unit of observation:** binary per (call, dimension) — "did this dimension's RNA text assert at least one absent artifact as present?" Not a token count, which would reward verbosity; the corpus arm writes longer RNAs.

Per arm, per condition, at 2 reps: 2 startups × 3 dimensions × 2 reps = **12 observations**.

### Pipeline

1. Split the RNA text into sentences, then into clauses on `, and` / `, but` / `;`. *"The venture has no funding plan and should draft one"* holds two clauses with opposite meanings; only clause-level classification gets it right.
2. Keep clauses containing a verified-absent token.
3. Classify, in this precedence order:

| Class | Cues | Fabrication? |
|---|---|---|
| **Negated** | `no`, `not`, `n't`, `lacks`, `without`, `yet to`, `absence of`, `none` | No — *"has not engaged counsel"* is correct |
| **Recommended** | `should`, `must`, `need(s) to`, `recommend`, `consider`, `begin`, `next step`, `prioritise`/`prioritize`, clause-initial imperative (`Draft`, `Engage`, `Secure`) | No — the RNA doing its job |
| **Asserted** | `has`/`have`/`had` + participle, `is`/`are`/`was`/`were`, `secured`, `obtained`, `in place`, `established`, `already`, `currently`, possessive | **Yes** |
| **Unclassified** | nothing matched | No — reported separately |

Precedence runs negation → recommendation → assertion, so an ambiguous clause resolves *away* from fabrication.

### Reported numbers

- **`mentions`** — any absent token appeared. Upper bound.
- **`asserted`** — the headline. Lower bound.
- **`unclassified`** — the honesty column. If large, the classifier is too weak to read the headline, and that is visible in the table rather than merely suspected.

Every flagged and unclassified clause is written verbatim into the results JSON with arm, startup, dimension and rep. The classifier is auditable after the fact, not taken on faith.

**The lower-bound property is conditional, not automatic.** `HARD_ABSENCES`' ceilings are one rung more generous than the documents support and the classifier's precedence resolves ambiguity away from fabrication — both understate. But the token list runs the other way: `absentTokens` was authored as a *substring guard over the documents*, where breadth is a stronger guarantee, and reused as an artifact detector over generated text it fires on abstract usage. *"has compliance obligations"*, *"has limited runway"*, *"has significant regulatory exposure"* name no artifact and all scored `asserted`.

So `asserted` is a lower bound only with the narrow `artifactTokens` list (`lib/hard-absences.js`), derived from the broad one by dropping topic words and adding multiword refinements. `verifyAbsences` keeps the broad list. Whatever residual over-count survives is auditable rather than assumed: `flaggedClauses` writes every flagged clause verbatim into the results JSON with arm, startup, condition, rep, dimension and class.

### Known limitations

Three under-count channels, all pushing the reported rate toward 0:

1. **Paraphrase.** Detection is token-based, so text avoiding the vocabulary entirely is invisible — *"the team has brought in outside expertise"* dodges every Organizational token.
2. **Morphology.** Token matching is stem-plus-optional-plural. Other inflections and compounds still escape.
3. **Same-clause negation.** `NEGATION` has precedence, so a balanced sentence that collapses into one clause is scored `negated` even where it also asserts. `splitClauses` breaks on sentence and semicolon boundaries, comma-joined coordination, bare `but`/`though`/`while`, a leading subordinator's comma, and `and` before a modal or a negation — but not on every bare `and`, which would shred coordinated noun phrases into cue-less fragments. *"Assessment of X, absence of Y"* is the modal shape of an RNA, so this channel is probably larger than the paraphrase one.

`asserted` is a floor, not a census. This probe can under-report and **cannot prove the absence of fabrication**.

## Shared constants

`HARD_ABSENCES` and `verifyAbsences` move from `audit-ground-truth.js` into `lib/hard-absences.js`; both consumers import it.

Two copies of a shared constant drifting apart is the bug that produced the inverted result retired on 2026-08-05, and `src/demo-readiness-levels.ts` exists to stop exactly that. Re-creating the pattern the day after fixing it is not acceptable.

The move is guarded by an existing test: `audit-ground-truth.js`'s reproduction test reproduces the published figures exactly, so any behaviour change fails it.

## Fingerprints and pooling

Two new key families, in the existing `metric|arm` shape so the merge parser needs no change:

- `assertion|<arm>` — truth condition
- `assertion-inflated|<arm>` — inflated condition

Both hash what `rna|<arm>` hashes (prompt source, `readinessLevelBlock`, `renderRubricBlock`, `common`, scope, `rubricMode`, corpus hash) **plus** the classifier source and the `HARD_ABSENCES` content. The inflated family additionally hashes the override map.

Intended consequences: editing the classifier or a token list refuses to pool re-scored data with old data, and the two conditions can never pool with each other.

**Existing keys get no new material.** A test pins all 15 current hashes to literal expected values, as was done when the titles and bare arms were added.

### Storage fields, and the double-push hazard

`mergeRuns`'s `FIELD` map is metric → results-field and pushes once per metric key. Two metrics sharing one field would push that field's calls twice, silently doubling n.

**Resolution: separate fields, one call, two records.**

| fingerprint key | results field |
|---|---|
| `rna\|<arm>` | `rnaCalls` (unchanged) |
| `assertion\|<arm>` | `assertionTruthCalls` |
| `assertion-inflated\|<arm>` | `assertionInflatedCalls` |

Under `--only-probe=rna --level-condition=both`, the truth-condition response is **one model call recorded into two fields** (`rnaCalls` and `assertionTruthCalls`). A wiring test asserts exactly one model call per (arm, startup, rep, condition), so the duplication can never become a duplicated call.

This keeps `mergeRuns`'s 1:1 metric→field invariant intact, which is load-bearing and heavily tested. The alternative — a seen-set guard inside the merge loop — was rejected as more risk in more fragile code for a few KB of saved storage.

### Historical files

`rnaCalls` entries gain a `condition` field. Entries lacking it are read as `truth`, with a test — the 2026-07-29 through 2026-08-04 files must keep loading.

`mergeRuns` builds its reference from the first file that *has* a fingerprint for a key, and refuses any key where either side is `undefined`. Historical files lack the new keys, so `--merge` will log a refusal line per historical file per new key. That is semantically correct, not a bug; a test pins the behaviour so the added noise is expected rather than alarming.

## Testing

TDD, matching the harness's existing 117-test discipline.

- **Classifier units**, driven by the real observed output:
  - *"The venture has drafted a funding plan (IRL 3)"* → asserted
  - *"Should draft a funding plan with a stated target raise"* → recommended
  - *"Has not engaged external counsel"* → negated
  - *"The venture has no funding plan and should draft one"* → two clauses, negated + recommended, **not** flagged
- **A mutant-killing test.** Reversing the precedence order (assertion before negation) is the plausible mutation and would silently inflate every rate. One test must fail against that mutant and pass against the original, verified by actually applying it — as was done for the `>` → `>=` case that passed all nine tests while inflating every arm's rate.
- **CLI:** unknown `--level-condition` hard-errors.
- **Wiring:** under `--level-condition=truth` the inflated call is *suppressed*, not generated-then-discarded. Against a 20/day cap a filtered-afterwards call still costs a call.
- **Dry-run parity:** both paths render through one helper. The harness has already shipped a `--dry-run` that printed a prompt the live run would not send.
- **Fingerprint stability:** the 15 existing hashes, pinned literally.

## Run plan

**Quota-free pre-flight, before spending anything:**

1. Suites green (`pnpm test:measurement`, `pnpm test`, `pnpm build`).
2. `--dry-run` — read both conditions' assembled prompts.
3. `--retrieval-only` — confirm the inflated condition actually pulls the ORL/RRL/IRL 3-4 rows. **If inflation does not change the retrieved rows the experiment is void**, and that must be learned for free rather than after 16 calls.

**Live run, after the ~15:00 PH window reset:**

```
node measurement/measure-grounding.js --only-arm=baseline,deviation-deterministic \
  --only-probe=rna --level-condition=both --reps=2 \
  --out=measurement/results/2026-08-06-supplied-level.json
```

**`--only-arm` is mandatory here and is not a detail.** `ARMS` holds five arms; omitting the filter runs all five, which at two startups × two conditions × two reps is **40 calls against a 20-call cap** — the run would die mid-experiment inside the third arm, exactly the failure that produced n=0 on 2026-07-29. Caught in spec review, before it could cost a window.

## Interpretation, pre-registered

Written before the run, not after. The study's own hard-won lesson is that agreement across reps tests sampling noise, not the reference — and post-hoc reading is what cost a week.

| Outcome | Reading |
|---|---|
| corpus-inflated ≫ baseline-inflated | The corpus converts a wrong supplied level into asserted evidence. A real risk in the shipped path; 1c gains a failure mode to validate against. |
| corpus-inflated ≈ baseline-inflated | The wrong number alone drives it; the corpus is not culpable. Bounds 1b. |
| both ≈ 0 | No fabrication even under adversarial supply. 1c's groundedness exclusion becomes better-evidenced than today. |
| `unclassified` large | The classifier is too weak to read any of the above. Report that; do not quote a rate. |

All three substantive outcomes are publishable.

## Out of scope

- Changing `OutputValidatorService`. This measures; whether 1c grows a groundedness check depends on the result.
- Objective 4b. The method is adversarial, but 4b asks for adversarial prompting *inside* the pipeline, pre-scoring. Conflating them is the error 4b is already flagged for.
- More reps of the levels probe.
