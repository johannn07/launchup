# Metric 3 differentiation margin — pre-registered

Written and committed **before** the run. A prediction reported only when it
lands is not a prediction (2026-08-09 precedent, where both pre-registered
predictions were wrong in opposite directions and saying so was the finding).

## What is being tested

Metric 3 was rebuilt on 2026-08-19 (`measure/non-saturating-differentiation`).
It ships deliberately **without a margin**: `differentiationTable` returns
`n/a - margin not pre-registered` even on well-powered separating data, because
no overlap number has ever been observed and setting a threshold from the run it
would score is the post-hoc move this whole line of work exists to avoid.

This document fixes the rule. The run then applies it.

The statistic is Jaccard overlap of normalised `proposalField` sets:

- **`crossOverlap`** — mean over every (early rep × mid rep) pair. How much the
  arm says the same things about two *different* startups.
- **`withinOverlap`** — mean over every same-startup rep pair, pooled across both
  startups. How much the arm repeats *itself*. This is the noise floor the old
  guard never had.
- **`separation`** = `withinOverlap − crossOverlap`.

## The decision rule

**PASS iff `min(within-startup pair) > max(cross-startup pair)`** — the two pair
distributions must not overlap at all.

No constant. This is the same logic that made `ratio < 0.75` defensible: that
threshold was quotable because the two arms' ratios sat in a gap with no
overlap, not because 0.75 was independently justified. Complete separation
states that condition directly instead of encoding it as a number.

**Three things this sentence has to pin down, or it is ambiguous:**

- **`min` and `max` are over the raw per-pair Jaccard values, not the means.**
  The means (`crossOverlap`, `withinOverlap`) stay descriptive.
- **Strict `>`. A tie is a FAIL.** Same call as `ratio < 0.75` treating exactly
  0.75 as balanced: the rule does not resolve ambiguity toward PASS, because a
  PASS is the claim being made and it should cost something.
- **Unscoreable (`null`) pairs are excluded** before `min`/`max`, exactly as they
  are excluded from the means. A `null` pair is an absent observation, not a
  low one.

**The n bar. Both conditions are required:**

1. `nEarly >= 3` **and** `nMid >= 3`
2. the chance reference `1 / C(nCross + nWithin, nWithin) <= 0.001`

| grid | nCross | nWithin | chance reference | at bar |
|---|---|---|---|---|
| 3 × 3 | 9 | 6 | 1/5005 = 0.0002 | yes |
| 4 × 2 | 8 | 7 | 1/6435 = 0.00016 | **no** — fails `nMid >= 3` |
| 3 × 2 | 6 | 4 | 1/210 = 0.005 | no |
| 2 × 2 | 4 | 2 | 1/15 = 0.067 | no |

Condition 2 alone would admit the lopsided 4 × 2 grid, which carries a single
mid-side within-pair. Condition 1 alone would admit grids whose chance reference
is weak. Hence both.

Below the bar the comparison is still **reported** — and explicitly **not
quotable**. A verdict that cannot be quoted is not a failure of the run; it is
the run declining to overclaim.

## Why only the adversarial arm

The baseline arm cites no proposal fields anywhere: `legacySummaryOnly` has no
criteria field to fill, which `criteriaTable` already guards as
`structuralZero`. Every one of its Jaccard pairs is `0/0`, which
`lib/field-overlap.js` returns as `null` by construction — deliberately, since
scoring `0/0` as `1` would report that arm as *maximally uniform* on the
strength of a missing schema field.

Metric 3 has always been a **within-arm** test — "has this arm overcorrected
into uniform harshness?" — so an adversarial-only run loses nothing the metric
was measuring.

## Prerequisites, before any generation call

Both are zero quota and TDD.

**1. `overlapStats` must expose the per-pair values.** It currently returns only
means and pair counts (`crossOverlap`, `nCrossPairs`, `withinOverlap`,
`nWithinPairs`, `separation`). The rule above is defined on `min`/`max` of the
raw pairs, so those arrays have to reach the results file — otherwise the
pre-registered rule cannot be evaluated from a stored run, which is the same
defect that made the two 2026-08-18 runs un-rescoreable for overlap in the first
place. Persist them.

**2. `--only-arm` on `measure-summary-bias.js`.** It has no such filter; that
exists only on `measure-grounding.js`, where it was added on 2026-08-03 for
exactly this reason ("refilling one cell costs 2 calls, not 12"). Without it a
run spends 6 baseline calls that cannot contribute to this metric.

**Small but not risk-free:** `validity()` looks up the adversarial arm by name
and `differentiationTable` iterates the arm list, so both need checking under a
filtered run, and a filter matching nothing must hard-error before any network
call (the `measure-grounding.js` precedent).

Note that prerequisite 1 edits `lib/field-overlap.js`, which the
`differentiation|*` fingerprint hashes. Do it **before** the run, not after, or
the run's own data is fingerprinted against a scorer that no longer exists.

## Predictions

Committed before any call is made.

1. **Primary — complete separation will NOT be achieved.** The DTO exposes a
   small shared field vocabulary and both documents genuinely lack the same
   things (revenue, registered IP, a funding plan), so cross-overlap should be
   high. Expected `crossOverlap` 0.35–0.65, `withinOverlap` 0.55–0.85,
   `separation` positive but small, ranges overlapping. **Predicted verdict:
   FAIL.**

2. **The failure mode that would matter most: field overlap may be structurally
   high for the same reason `criticalCount` was structurally capped.** If
   `crossOverlap > 0.5` *and* `separation < 0.1`, field *identity* is also too
   coarse, and what differs between the two startups is the criterion **text**,
   not the field it is attached to. That points at text similarity — a
   materially bigger job than this rebuild. Recorded in advance so a null result
   is informative rather than a third "the metric did not work".

3. **Instrument stability, distinct from a FAIL.** At temp 0 the arm should
   repeat itself, so `withinOverlap` should exceed 0.7. If `withinOverlap < 0.4`
   the noise floor swamps everything and no cross reading means anything. This
   is a different problem from failing to differentiate and must be reported as
   one.

4. **503s are likely.** Two of twelve cells failed on model overload on the
   calibration run and three of twelve on the validation run — neither achieved
   a full 3 × 3 adversarial grid. Partial results reported as partial, never
   padded, every mean over surviving rows.

5. **Confidence.** Moderate on prediction 1, low on the specific ranges in it —
   no overlap number has ever been observed on this corpus, so those bounds are
   reasoning about the DTO's field vocabulary, not extrapolation from data.

## Interpretation, fixed in advance

| outcome | reading |
|---|---|
| complete separation, grid at bar | the arm differentiates the two startups by more than its own rep-to-rep noise. Quotable. |
| complete separation, grid below bar | reported as underpowered; **not** quotable |
| the pair distributions overlap | no demonstrated differentiation. FAIL. |
| `withinOverlap < 0.4` | instrument unstable — not a FAIL, a different problem |
| `crossOverlap > 0.5` and `separation < 0.1` | field identity too coarse; same failure family as the count columns |

**No post-hoc re-tuning.** If the rule yields FAIL, the finding is that it
yields FAIL. Relaxing complete separation to a margin that happens to fit the
observed numbers, and reporting that fit as a result, is precisely the move the
fingerprint guard exists to forbid.

## Limits, stated before the data

- **Direction is formally unmeasured.** Jaccard is symmetric, so overlap answers
  "did the arm say the same things about both?" and cannot answer "did the
  early-stage proposal get harsher treatment?". The count gaps were the only
  direction signal and they are the degenerate columns; `criticalFavours` /
  `unmetFavours` make the sign *legible*, not *tested*.
- **Adversarial arm only**, by construction (see above).
- **Same two startups, same documents, one model, one prompt.** A third document
  remains the more informative test, here as for the 0.75 threshold.
- **The chance reference is optimistic.** It assumes the pair values are
  exchangeable and independent; they share reps and are not. This is a
  pre-registered *decision rule*, not a significance test, and must not be
  reported as a p-value.
- **The fingerprint guard is documentary on this harness.** `--merge` exists only
  on `measure-grounding.js`; `measure-summary-bias.js` records fingerprints but
  nothing acts on them. `differentiation|*` changed with the rebuild, so this
  run's differentiation data is a fresh pool by construction; `criteria|*` is
  unchanged, so SO 4.2's criteria result legitimately gains n from the
  adversarial calls.

## Budget

`--only-arm=adversarial --reps=5` = 10 cells, capped with `--max-api-calls`. A
degraded cell costs 3 requests, not 1. Leaves roughly 10 requests in the window
for refills.

At the observed adversarial success rate (8 of 12 across both prior runs, so
p ≈ 0.67), five attempts per startup give `P(n >= 3) ≈ 0.79` per startup and
**≈ 0.62 that both reach it**. Three attempts give 0.30 and **≈ 0.09**. That
gap — 62% against 9% — is why the harness change comes first.

Both figures assume 503s are independent across calls. They are probably not:
model overload is bursty, and on the validation run all three losses fell in one
session. Treat 0.62 as an upper bound.

Budget from `apiRequests` in the results files plus UI-driven generation —
**never** from `ai_generation_runs`, which this path does not write.
