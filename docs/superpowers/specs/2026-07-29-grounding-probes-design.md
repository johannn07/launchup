# Grounding measurement probes — redesign

**Date:** 2026-07-29
**Status:** design, approved for planning
**Scope:** `backend/measurement/measure-grounding.js` only. No `backend/src/` changes.
**Supersedes:** the metric 1 and metric 2 definitions used in `measurement/results/2026-07-29-rep1.json`.

## Why

Step B of the grounding harness ran for the first time on 2026-07-29 (n=1, 16 of
18 calls). It produced numbers, and inspecting them showed three of the four
things it measured were not the things it claimed to measure:

- **Metric 2 (absent-field probe) is saturated.** 0/15 invented, 15/15 recalled,
  identical across all three arms — reproducing the 2026-07-27 model comparison's
  0/9 and 9/9 on two different models. `groundPrompt()` already handles this
  probe completely. There is no headroom for the corpus to demonstrate anything.
- **Metric 2 is also aimed at the wrong target.** It asks whether the model
  invents a burn rate or an investor name. **The corpus contains no information
  about burn rates or investor names** — it is 54 readiness rubrics and 10
  business frameworks. Even unsaturated, this probe tests something the corpus
  has no mechanism to influence.
- **Metric 1 (rubric-term grounding) measures vocabulary reuse, not grounding.**
  1/12 under the deterministic arm, but inspecting the misses shows on-target
  text: with `TRL 2`/`TRL 3` verbatim in the prompt, the model wrote *"Tested a
  paper prototype of the lot-aggregation flow with 3 cooperatives in September
  2025"* — a correct TRL-2/3 characterization sharing no wording with
  `keyTerms: ["concept formulated", "speculative application", ...]`. The RNA
  prompt demands specificity to the source document, which structurally
  conflicts with echoing abstract rubric phrasing.

Two further problems surfaced from reading production's prompt builder rather
than the harness. **These are the load-bearing reasons for this redesign** — they
invalidate the arm contrast at any N, so more reps would not have helped.

## Confound 1 — the arms differ by more than the treatment

`ai.service.ts:937-943`: production's `createBasePrompt` emits the startup's
levels **for every arm, unconditionally**:

```
Initial Readiness Level:
TRL 2  MRL 2  ARL 1  ORL 2  RRL 1  IRL 1
```

Only `rubricBlock` varies with `ragCorpus`. The harness's `rnaPrompt` includes no
levels at all. So the two contrasts are not the same experiment:

| arm | production | harness (current) |
|---|---|---|
| baseline | knows its levels | knows nothing |
| deterministic | knows its levels **+ rubric text** | knows nothing **+ rubric text, which states the level** |

The harness has been measuring *"told the level" vs "not told the level"*. That
is not a retrieval effect and production never presents that contrast.

**Fix:** emit the `Initial Readiness Level:` block in the RNA prompt for all
three arms, matching production verbatim in shape. The rubric text then becomes
the only difference between arms — the actual treatment.

## Confound 2 — metric 3 asks the deterministic arm to predict what it was handed

Deterministic retrieval keys on `(readinessType, level)` using the startup's
**actual** level. The arm receives `TRL 2 — Technology concept formulated` and is
then asked to assess the startup's technology level. It is shown the answer. Any
differentiation-gap advantage for that arm is leakage, not grounding, and no
number of reps changes that.

**Fix:** for the levels probe only, retrieve the **full nine-level ladder** for
each dimension instead of `(L, L+1)`. The model receives the rubric vocabulary
without being told which rung applies and must place the startup itself. This
also makes a sharper metric available (metric 1 below).

Note the asymmetry is deliberate and must not be "tidied": the **RNA** probe
keeps the `(L, L+1)` lookup because that is what production ships; the **levels**
probe uses the full ladder because it is a measurement instrument, not a
reproduction of production. They are different instruments and the spec treats
them as such.

## Metric definitions

### Metric 1 — level-placement accuracy *(replaces rubric-term grounding)*

Mean absolute error between the model's assigned level and the seeded
ground-truth level, per dimension, plus the share of dimensions placed exactly
right and within ±1.

- **Ground truth:** `STARTUPS[name].levels` — the same per-dimension levels
  `main.ts`'s `seedDemoStartups` writes (AgroLink T2/M2/A1/O2/R1/I1; MediSync
  T5/M4/A3/O4/R3/I3). Already present in the harness and already used for
  retrieval, so no new authored artifact.
- **Source call:** the existing levels call. **No additional quota.**
- **Non-circular** once the nine-level ladder replaces the `(L, L+1)` lookup.

**Why not embedding similarity to the retrieved rubric.** Any metric of the form
"did the output resemble the rubric it was given" structurally favours the arm
that was given that rubric. It measures parroting and cannot distinguish it from
grounding. Accuracy against independent ground truth has no such failure mode.

### Metric 2 — stage-inappropriate recommendation rate *(replaces the absent-field probe)*

For dimension D at ground-truth level L, an RNA is **stage-inappropriate** if it
contains a stage marker whose `minLevel` exceeds `L + 2`.

- **Rationale:** an RNA is a *recommended next action*, so the appropriate horizon
  is the current rung plus roughly two. Recommending beyond that is SO 1.3's own
  example of a hallucination — *"recommending commercialization steps to a TRL 2
  startup"* — and matches Problem Statement 1's "irrelevant, or contradictory
  recommendations that do not accurately reflect a startup's actual readiness
  profile."
- **Direction:** overshoot only. Undershoot is not a described failure mode, and
  conflating the two would blur this against Objective 4's leniency concern.
- **Source call:** the existing RNA call. **No additional quota.**

**Stage-marker lexicon.** A new file, `backend/measurement/data/stage-markers.json`,
of entries shaped:

```json
{ "phrase": "mass production", "minLevel": 8, "dimensions": null }
```

`dimensions: null` means the marker applies to every dimension; an array scopes it
(e.g. a regulatory-approval marker to Regulatory).

**Matching is whole-word and case-insensitive, not bare substring.** This
correction came out of implementation review: `ipo` is a substring of `IPOPHL`,
the Philippine Intellectual Property Office, which appears verbatim in **both**
seeded startup documents. Under substring matching an RNA recommending a
trademark filing — stage-appropriate at RRL 1 — would trip the `minLevel 9`
marker and score as the most severe stage-inappropriate recommendation there is.
The cost is recall on inflected forms (`franchise` no longer matches
`franchisee`), which is the safer direction: under-counting a failure beats
inventing one.

Both startups must be able to fail, or the metric is degenerate. Worked example:
AgroLink Technology L=2 → threshold 4, so `"pilot deployment"` (minLevel 4)
passes while `"paying customers"` (5) and `"commercialization"` (7) fail.
MediSync Technology L=5 → threshold 7, so `"commercialization"` passes while
`"mass production"` (8) and `"IPO"` (9) fail.

**The lexicon must not overlap the corpus.** It is authored independently of the
54 rubric rows' wording. If a marker phrase also appeared as a corpus `keyTerm`,
the corpus arm could score well purely by echoing text it was handed, which is
the exact failure metric 1 is being redesigned to escape. This is enforced as a
test, not a convention — see Verification.

**Initial marker set.** Authored as part of this work; extend only with the
non-overlap test green.

| phrase | minLevel | dimensions |
|---|---|---|
| `ipo` | 9 | null |
| `volume manufacturing` | 8 | null |
| `international expansion` | 8 | null |
| `franchise` | 8 | null |
| `series a` | 7 | null |
| `commercialization` | 7 | null |
| `national rollout` | 7 | null |
| `scale nationally` | 7 | null |
| `full market launch` | 7 | null |
| `clinical validation` | 6 | Technology, Regulatory |
| `certification granted` | 6 | Regulatory |
| `recurring revenue` | 5 | Market, Investment |
| `paying customers` | 5 | Market, Acceptance |
| `lead investor secured` | 5 | Investment |
| `deploy to live users` | 4 | null |
| `filed for approval` | 4 | Regulatory |

**This table is already validated against both constraints** (script run
2026-07-29): zero collisions with any of the 54 rubric rows' `keyTerms`, and
failure detectable in all 12 (startup, dimension) cells.

Four earlier candidates were **rejected by the non-overlap check** and are
recorded here so nobody reintroduces them: `mass production` (collides with
`production`, trl-9), `term sheet` (with `term sheet negotiation`, irl-7),
`pilot deployment` (verbatim, trl-6), and `regulatory submission` (verbatim,
rrl-5). Two were exact corpus keyTerms — a corpus arm handed rrl-5 would have had
its own retrieved text scored against it. That is contamination regardless of
which direction it pushes the number.

**Provenance.** The lexicon is **authored**, with no external source, and is
documented as such in `measurement/README.md`. This matches the honesty standard
already applied to the corpus's own `provenance` field: 45 of its 54 rubric rows
are authored or framework-derived rather than transcribed, and that caveat is
attached every time the corpus is described. The lexicon gets the same treatment.

**Saturation risk, and the contingency if it lands.** Confound 1's fix puts the
startup's actual levels into the RNA prompt for every arm. That is correct — it is
what production does — but it may also make stage-appropriateness easy for *all*
arms and saturate metric 2 the way the absent-field probe saturated.

**If that happens it is a result, not a failure:** it would mean the
`Initial Readiness Level:` block, not the rubric corpus, is what keeps
recommendations stage-appropriate. That is a directly useful finding about where
the grounding actually comes from, and it should be reported as such rather than
worked around.

To tell the two apart, add a fourth arm **only if metric 2 saturates**:
`baseline-no-levels`, identical to baseline but with the levels block omitted.
Comparing it against `baseline` isolates the levels block's contribution from the
corpus's. Deferred until the saturation is observed — it costs 2 calls per rep and
should not be spent speculatively.

### Metric 3 — differentiation gap *(retained, now uncontaminated)*

Unchanged in definition: mean assigned level for the mid-stage document minus the
early-stage one. Computed from the same de-leaked levels call as metric 1. Keeps
the +2.28 `measure-differentiation.js` anchor comparable.

### Metric 4 — absent-field probe *(retained, demoted)*

Kept verbatim but **not run every rep**. Gated behind `--with-fabrication-probe`.

It is saturated and non-discriminating, but 0/15 invented with 15/15 recalled is a
*passing* result against SRS §2.2's "return null or unknown for unverifiable
fields" criterion, and deleting it would discard that evidence. Running it once
per series is enough to confirm no regression.

## Prompt changes

| probe | change |
|---|---|
| RNA | prepend the production `Initial Readiness Level:` block for **all** arms |
| levels | rubric block becomes the full nine-level ladder per dimension; **no** levels block (it is the quantity under test) |
| fabrication | unchanged |

## Quota budget

Metrics 1, 2 and 3 all derive from two calls per (arm, startup): one RNA, one
levels. Dropping the per-rep fabrication call takes a rep from **18 to 12** calls.

| | calls/rep | reps/day at 20 |
|---|---|---|
| current | 18 | 1, with 2 spare |
| proposed | 12 | 1, with 8 spare |

The spare capacity absorbs a partial 429 or a retry without losing the rep, which
the 2026-07-29 run did not have — it lost the final cell by two calls.

## Per-metric fingerprinting

`probeFingerprint` currently hashes all three prompt builders together, so any
probe change refuses every prior file wholesale. Replace it with a map:

```json
"probeFingerprints": { "levels": "…", "rna": "…", "fabrication": "…" }
```

`--merge` compares **per metric** and pools only the metrics whose fingerprint
matches, reporting per metric which files contributed. Consequence:
`2026-07-29-rep1.json` **stays mergeable for metric 3** (its levels prompt is
unchanged by this work) while correctly refusing to pool metrics 1 and 2 across
the redesign.

Files written before per-metric fingerprints carry no fingerprint map at all.
**They pool with nothing — not even with each other.**

An earlier draft of this section said they "can pool with each other". That was
written before the confound fixes existed. `2026-07-29-rep1.json` is the only
such file, and it predates both of them, so its numbers came from a different
experiment in the strict sense — summing two copies of it would produce a
larger-n version of a result that is not comparable to anything the redesigned
harness produces. Refusing outright is the safer and more honest behaviour.

This is load-bearing in the implementation: with both sides `undefined`, a
plain `mine !== ref` test is **false**, so two legacy files would pool silently
unless the `undefined` cases are checked explicitly.

## Verification

Everything below is quota-free except the final item.

1. **Lexicon/corpus non-overlap** — assert no `stage-markers.json` phrase appears
   in any of the 54 rubric rows' `keyTerms`, in either direction, case-insensitive.
   Fails the build if the lexicon drifts into corpus wording.
2. **Lexicon non-degeneracy** — for each of the 12 (startup, dimension) cells,
   assert at least one marker applies to that dimension with
   `minLevel > L + 2`, so a stage-inappropriate recommendation is *detectable*
   there. A cell with no applicable marker above its threshold scores 0 forever
   and silently dilutes the rate.

   Passing needs no equivalent guarantee — an RNA that mentions no marker at all
   passes by construction — so the test asserts reachability of failure only.

   The initial marker set satisfies this for all 12 cells (verified: AgroLink
   thresholds T4/M4/A3/O4/R3/I3, MediSync T7/M6/A5/O6/R5/I5; every cell has at
   least one applicable marker above it).
3. **Metric scorers on synthetic input** — a known stage-inappropriate RNA scores
   1, a known appropriate one scores 0; metric 1's MAE computes correctly against
   a hand-checked level vector.
4. **Per-metric merge** — fixtures where the levels fingerprint matches and the
   RNA fingerprint does not must pool metric 3 and refuse metrics 1 and 2, in one
   run. Extends the existing synthetic-fixture approach.
5. **`--dry-run`** — assemble and print all three arms' prompts without calling
   the model, so the levels block, the nine-level ladder and the rubric block can
   be eyeballed before any quota is spent. Same philosophy as `inspect-prompt.js`.
6. **One real rep** on a fresh quota window, then merge with the existing file for
   metric 3.

## What this still cannot claim

- **SO 1.5 names mentor expert ratings as the ground truth** for the before/after
  evaluation of factual accuracy, relevance and coherence. Every metric here is a
  mechanical proxy. The README and any write-up must say so; these numbers
  complement an expert-rated study, they do not substitute for one.
- **N stays small.** The measured run-to-run noise floor is ±1.0 differentiation-gap
  points between byte-identical prompts (8 of 12 per-dimension levels differed).
  Three reps is the minimum before any between-arm difference in metric 3 is
  interpretable, and metrics 1 and 2 need the same treatment.
- **`sdd-semantic` remains a null-condition replicate of `baseline`**, because
  semantic rubric retrieval returns nothing against this corpus (Step A: 0/12;
  SDD §3.2's own profile-embedding mechanism: 0/2). This redesign does not change
  that and does not try to — it is a settled finding. The arm is retained
  precisely because it is a free noise control, and the spec labels it as one
  rather than as a third condition.
- **The two documents are composed, not sampled.** Real capsule proposals exist in
  the capstone folder and would strengthen this, but adopting them requires
  ground-truth levels assigned by a domain expert, which is out of scope here.

## Out of scope

- Any change under `backend/src/`. Production behaviour is not modified.
- Switching to the real sample capsule proposals (needs expert-assigned levels).
- The business-framework retrieval channel, which returns 0 rows in practice and
  is a separate open decision.
- Objective 4 (leniency) metrics. Problem Statement 4 explicitly separates
  leniency from hallucination, and mixing them here would blur both.
