# SO 4.4 threshold validation — pre-registered

Written and committed **before** the run. A prediction reported only when it
lands is not a prediction (2026-08-09 precedent, where both pre-registered
predictions were wrong in opposite directions and saying so was the finding).

## What is being tested

`summary-tone.ts` now ships `flagged = ratio < 0.75`. That threshold was
calibrated on the ten summaries in `results/2026-08-18-summary-bias.json` —
the same data it then scored. This run asks whether it holds on summaries it
has never seen.

**Not a new experiment in design, only in data.** Same harness, same two
startups, same prompts, same model, temp 0. What is held out is the
*generations*, not the documents. A threshold that fails here fails on
resampling alone, which is the weakest thing that could break it and therefore
worth ruling out first. It cannot tell us the threshold generalises to other
documents — that needs different source material and is out of scope.

## Why this is a separate experiment by construction

`tone|*` and `differentiation|*` fingerprints changed when `summary-tone.ts`
was edited (verified: `bbb846c48639` → `d193238ccc86` on `tone|baseline`), so
`--merge` will refuse to pool tone across the boundary. `criteria|*` is
unchanged (`77b5fec7b535`, `82fc2961c7ff`), so the SO 4.2 criteria result
legitimately gains n.

## Predictions

Committed before any call is made.

1. **Primary — the threshold separates the arms cleanly.** Every baseline
   summary flags, no adversarial summary flags. Baseline ratios land in
   0.25–0.60, adversarial at 1.00.
   Confidence: high for adversarial (it was saturated at `criticalCount: 3`,
   the ceiling of a three-sentence summary, so 1.00 is structural not
   incidental); **lower for baseline**, because 0.50 was only 0.25 from the
   threshold and n was 6.

2. **The most likely way this fails is a baseline summary at or above 0.75.**
   The legacy prompt mandates a risk sentence; a rep where the model writes two
   risk sentences and one positive lands at 0.67, and three risk sentences to
   one positive lands at exactly 0.75 — which this rule calls balanced. That is
   a false negative, the dangerous direction for this module.

3. **Differentiation will still fail the guard.** Nothing about it changed; the
   adversarial arm is expected to saturate again. Recorded so a repeat failure
   is not read as new information.

4. **503s are likely.** Two of twelve cells failed on model overload on the
   previous run. Partial results will be reported as partial, never padded.

## Interpretation, fixed in advance

| outcome | reading |
|---|---|
| all baseline flag, no adversarial flag | threshold survives resampling; still unvalidated across documents |
| any baseline ≥ 0.75 | false negative — the calibration was too tight; report and do **not** silently re-tune |
| any adversarial < 0.75 | false positive — worse, since it flags the arm that is behaving |
| both | the ratio does not separate these arms and the instrument needs rethinking |

**No post-hoc re-tuning.** If the threshold misses, the finding is that it
misses. Moving it to fit two runs at once and reporting the fit as validation
is the move this whole line of work exists to avoid.

## Budget

12 planned calls at `--reps=3`, capped with `--max-api-calls`. Window opened
15:00 Manila 2026-08-18 with zero generation spend recorded against it.
