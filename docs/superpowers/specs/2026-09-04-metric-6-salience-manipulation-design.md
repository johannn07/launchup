# Metric 6, second design — salience manipulation and a split control

Status: pre-registered 2026-09-04, amended 2026-09-05, unrun.
Supersedes the run plan and control rule in
`2026-08-23-rna-redundancy-probe-design.md`. The detector itself
(`lib/redundancy.js`, `lib/satisfactions.js`) is unchanged by this design.

## Amendment 1 — 2026-09-05, before any call was spent

**Changed:** G1's pass rule drops the "at least 2 startups" clause. It now reads
*at least 8 paired cases, drawn from at least 2 dimensions, and every pair
scores mutant-fires / original-silent.* Nothing else changes — the pair rule,
the mutation rule, the expected-silent cases and the blocking behaviour are all
as written below.

**Why.** The clause is unsatisfiable from the source this design names, and the
reason is a property of the data rather than a sampling accident. Harvesting
every `recommended`/`scoped` clause from the three named files yields **11
clauses, all AgroLink PH**, in 2 dimensions (10 Technology, 1 Acceptance).
MediSync produced six classified clauses and every one is descriptive —
*"user acceptance is demonstrated by expansion to 6 facilities"* — never the
recommendation register. AgroLink's satisfied artifacts are things the model
recommends moving **beyond**; MediSync's are things it reports as **done**.

**Why the alternatives were declined:**

- *Use more of the 12 startups in the database.* Ten of the twelve are thin
  intake records — `historical_timeline: []`, `intellectual_property_status:
  "Pending AI Generation"`, `members: []`. They evidence a target market and
  nothing else, so they cannot supply Technology or Acceptance evidence, which
  is where all 11 clauses live.
- *Add a third document anyway.* G1's cases are the model's **own generated
  text**, harvested from stored runs. No RNA has ever been generated for those
  ten, so a new document creates zero G1 cases until quota is spent generating
  for it — which is the spend G1 exists to gate. Doing it properly costs a
  document with derived ground-truth levels, ~6 calls to generate, then the
  12-call run: two quota days. And `common.startups` hashes the whole
  `STARTUPS` map into every fingerprint key, so adding a document moves all 45
  hashes and refuses pooling with every historical run.
- *Hand-write MediSync cases to satisfy the clause.* Declined outright. It
  reintroduces the hand-written-fixture defect G1 exists to remove.

**The bound this buys, and it travels with every G1 claim.** G1 validates the
detector against **AgroLink's register only**. Half the run's observations come
from MediSync, whose register G1 never tested — and MediSync's descriptive
register is precisely what the `unlabelled` manipulation is aimed at moving. So
G1's blind spot sits exactly where the manipulation acts. A `redundant` verdict
on a MediSync clause in the run is therefore **not** covered by G1 and must be
hand-read before it is quoted.

**Second bound, from mutation-testing G1 itself** (4 mutants, 3 killed):
removing the `PROGRESSION_VERB` veto changes no G1 verdict, because it is the
sole silencer on zero cases — the model wrote the origin frame with a
preposition every time. G1 establishes nothing about that regex and no quotable
claim may rest on it. Recorded, not patched.

## Why there is a second design

The 2026-08-23 run was void by its own pre-registered rule: the `deflated`
positive control did not fire, so no arm comparison could be read. The recorded
next step was "a stronger manipulation, or a document/level pair where the
rubric criterion is unambiguously already met, pre-registered before it runs."

Before designing that, the stored text was re-scored at zero quota. It says more
than the run reported.

## Finding 1 — the record is wrong about what the run showed

`measurement/README.md` says of the 2026-08-23 run:

> no clause was binned `recommended` and then rejected by the acquisition gate;
> the gate never had a `recommended` verdict to act on in this run

**That is false.** Re-scoring `results/2026-08-23-rna-redundancy.json` through
the same `lib/redundancy.js` reproduces all four recorded columns exactly
(`redundant`, `mentioned`, `unclassified`, `denied`) and adds a fifth the
harness never emitted:

| arm | condition | redundant | mentioned | unclassified | denied | **scoped** |
|---|---|---|---|---|---|---|
| `baseline` | truth | 0/6 | 2/6 | 2/6 | 0/6 | **1** |
| `baseline` | deflated | 0/6 | 1/6 | 1/6 | 0/6 | **1** |
| `sdd-semantic` | truth | 0/6 | 2/6 | 2/6 | 0/6 | 0 |
| `sdd-semantic` | deflated | 0/6 | 2/6 | 2/6 | 0/6 | **1** |
| `deviation-deterministic` | truth | 0/6 | 1/6 | 1/6 | 0/6 | 0 |
| `deviation-deterministic` | deflated | 0/6 | 1/6 | 1/6 | 0/6 | **1** |

Four clauses were binned `recommended` by `classifyClause` and then downgraded
to `scoped` by the acquisition gate. All four are AgroLink / Technology and all
four have one shape — the satisfied artifact as the origin being left behind:

- *"Needs to move **from paper prototype** testing to full software development…"* — `baseline`, truth
- *"Needs technical development to move **from paper prototype** to a functional mobile-first platform…"* — `baseline`, deflated
- *"To advance, the project needs to transition **from a paper prototype** to building and validating actual functional software…"* — `sdd-semantic`, deflated
- *"Needs: Transition **from paper prototype** testing to building and testing functional software/code…"* — `deviation-deterministic`, deflated

Independently, the same run's metric-5 `flaggedClauses` holds **14 clauses
classified `recommended`** and 5 `negated`.

**What this establishes, on real generated text rather than fixtures:**

1. `classifyClause` reads the model's recommendation register. It is not blind
   to `"Needs to…"`, `"Needs:"`, `"needs to transition"`.
2. The acquisition gate receives real `recommended` verdicts and acts on them —
   4 for 4, every one a correct rejection.
3. What remains unproven is only the **true-positive path**: no real generated
   clause has yet been a genuine redundancy for the gate to keep.

The README's stated ambiguity — "consistent both with the model never making
this error, and with the classifier being unable to read these constructions" —
is **resolved in favour of the first reading** for the `recommended` bin. The
classifier read them; the model did not make the error.

## Finding 2 — why the record was wrong: `scoped` is invisible

`scoreRedundantNeeds` computes `scoped` and drops it. It is deliberately not
folded into `unclassified` (the code says why), but it is also not aggregated in
`measure-grounding.js`, not printed, and not persisted. The gate's entire
activity is unobservable from a results file.

**Required change 1: report `scopedCount` per (arm, condition)** alongside
`mentioned` / `unclassified` / `deniedCount`, and persist the scoped clauses the
way metric 5 persists `flaggedClauses`. A gate whose rejections cannot be
counted cannot be audited — this design's first finding was invisible for eleven
days because of it.

## Finding 3 — the control rule conflated two different things

The 2026-08-23 rule was: *if `deflated` redundancy is not substantially above
`truth`, the run is void and reports a detector problem.* Two distinct claims
sit inside that:

- **Can the detector see the behaviour?** A property of the code and the model's
  register. Testable at zero quota.
- **Does the condition induce the behaviour?** A property of the model. Only
  testable by spending calls.

Collapsing them meant a well-behaved model voided the run, and the
pre-registration's own stated inference ("reports a detector problem") was wrong
— as the README already records. Findings 1 and 2 make the fix concrete.

**Required change 2: split the control.**

- **G1 — detector control.** Zero quota, runs before any call, blocking. Fails →
  the run does not happen.
- **G2 — manipulation check.** Part of the run. Fails → the run is **not void**;
  it reports a narrow model result, provided G1 passed.

**The reporting rule that travels with the split.** If G1 passes and G2 does not
fire, the only sentence that may be written is *"the model did not make this
error under this manipulation, in these N observations."* Not "the detector
works" — G1 is a bound, not a proof over all constructions. Not "the model is
robust" — two uncaught classes remain untested and n is small.

## G1 — the detector control, built from the model's own sentences

2026-08-23's fixtures were hand-written, so passing them proved nothing about
the model's syntax. G1 replaces them with **real generated clauses, minimally
mutated**.

**Construction, mechanical and recorded per case:**

- **Source.** Every clause the scorer bins `recommended` or `scoped` across
  `2026-08-06-supplied-level.json`, `2026-08-09-supplied-level.json` and
  `2026-08-23-rna-redundancy.json`. Each case records file, arm, startup,
  condition, rep, dimension and the original clause verbatim.
- **The mutation.** Replace the progression frame with an acquisition frame and
  change nothing else: drop the origin/scope preposition and the progression
  verb governing it, and put one `ACQUISITION_VERB` in front of the same
  satisfied token. *"Needs to move from paper prototype testing to full software
  development"* → *"Needs to develop a paper prototype of the lot-aggregation
  flow."* No token substitution, no new artifact.
- **Paired scoring.** The mutant **must** score `redundant`; its unmutated
  original **must not**. A pair where both fire is a false positive and is a G1
  failure, not a passing mutant.

**G1 passes when** at least 8 paired cases exist, drawn from at least 2 startups
and at least 2 dimensions, and **every** pair scores mutant-fires /
original-silent. One unpaired failure blocks the run.

> **Amended 2026-09-05 — the "at least 2 startups" clause is struck.** See
> Amendment 1 at the head of this file for why, what was declined, and the bound
> it buys. The rule as it now stands: at least 8 paired cases, at least 2
> dimensions, every pair mutant-fires / original-silent.

**Expected-silent cases, asserted rather than fixed.** One case for each named
uncaught class — passive/postposed acquisition (*"A paper prototype should be
created…"*) and an out-of-list verb (*"should gather user feedback…"*). Both
asserted **silent**. They are the standing record that metric 6 is a lower
bound; a change that makes either fire must move them deliberately, not by
accident.

**G1 is a bound, not a proof.** It shows the detector fires on the model's own
syntax when that syntax carries a redundancy. It cannot show the detector
catches every redundancy the model could write.

## The manipulation — `unlabelled` documents

### Why not another level manipulation

`deflated` failed because the level never overrode the document. Every arm read
the evidence and correctly framed it as an origin. Both source documents put
each fact under an explicit label — `Target Market:`, `Revenue:`, `Timeline:` —
and `Target Market:` *names the artifact class the rubric asks for*. Matching is
free; there is nothing for the model to miss.

Redundancy requires the artifact to be **evidenced but not salient**. That is a
document property, not a level property.

### The rule, mechanical

For each startup, an `unlabelled` variant in which, for the three dimensions
`lib/satisfactions.js` specifies (Technology, Market, Acceptance):

- the `evidence` phrase stays **byte-identical**;
- its field label is deleted and the phrase is carried as prose by an existing
  narrative field (`Description`, `Problem Statement` or `Solution`);
- nothing else changes — no fact added, dropped, reordered within a sentence, or
  reworded.

Dimensions outside T/M/A and every other field are untouched.

### Machine checks on the variant, not authorial care

Both blocking, both before any call:

1. `verifySatisfactions(variantDocs)` passes — every `evidence` phrase is still
   present verbatim. The existing function, unchanged.
2. **Fact preservation:** the multiset of numerals, dates and capitalised proper
   nouns extracted from the variant equals the original's. A variant that adds,
   drops or alters a number fails the run.

Check 2 is the guard against authoring the variant into producing the effect.
It is weaker than a careful human reading and it is machine-enforced, which the
reading is not.

### What `unlabelled` is and is not

A **salience** manipulation: the fact is present, the signpost is gone.
Production's capsule proposal is a structured DTO, so `unlabelled` is *less*
production-like than the labelled form. It buys a condition under which the
error can plausibly occur — the same standing `deflated` had, and the same limit
stated the same way.

### Axis and fingerprinting

`--level-condition` is the wrong flag: this varies the document, not the level.
It gets its own, `--doc-variant=original,unlabelled`, defaulting to `original`,
with comma lists and a hard error before any network call on an unrecognised
entry — the semantics `--only-arm` and `--only-probe` already have.

Documents are already fingerprint material: `measure-grounding.js` hashes the
whole `STARTUPS` map. **Required change 3: variants live in a separate map,
hashed only into variant-condition fingerprint keys**, so `original` cells stay
poolable with 2026-08-23 and only `unlabelled` cells are new. Hashing variants
into the shared map would silently refuse every historical pool over a document
the historical run never saw.

## Reported numbers

Headline unchanged: `redundantRate`, binary per (call, dimension), with
`mentioned` and `unclassified` as the honesty columns and `deniedCount`
secondary, never folded in. Plus `scopedCount` (required change 1).

## Predictions, pre-registered

Both falsifiable, recorded before any call:

1. **G2 fires.** `unlabelled` redundancy is above `truth` on at least one arm.
2. **The corpus arm rises most.** `deviation-deterministic` shows the largest
   `original` → `unlabelled` increase, because it is handed rubric vocabulary
   (*"identify the target market segment"*) that no longer matches a document
   label, giving it a template to echo where the baseline arm has none.

Prediction 2 predicts the corpus looks bad, deliberately — the same posture as
2026-08-23's, and the reason a result in either direction is worth recording.

**Null-control reading rule, unchanged.** `sdd-semantic` sends a byte-identical
prompt to `baseline` on the RNA probe. Any arm difference smaller than the
baseline / `sdd-semantic` spread is noise and must not be quoted.

## The stopping rule

Pre-registered so the next result is not another open-ended "try a stronger
manipulation":

**If G1 passes and `unlabelled` still produces 0 redundancy on every arm, metric
6 is retired** — unable to produce a positive on this model, these two documents
and this instrument. That is the reported result, with the uncaught classes
still named as untested. No third manipulation is designed.

Retiring on a rule is the honest end, and it is the end metric 3 was given.

## Run plan

```
node measurement/measure-grounding.js \
  --only-arm=baseline,sdd-semantic,deviation-deterministic \
  --only-probe=rna --level-condition=truth --doc-variant=original,unlabelled \
  --reps=1 --out=measurement/results/<date>-rna-salience.json
```

3 arms × 2 startups × 2 variants × 1 rep = **12 calls**, one quota day
(~20/day on `gemini-3.6-flash`, window resets 15:00 Philippine time).

`--level-condition=truth` only: `deflated` answered its question on 2026-08-23,
and re-running it would spend 6 calls to reproduce a known 0.

**Before the first call:** G1 green, both variant checks green, and a
`--dry-run` inspected to confirm the `unlabelled` prompts carry the evidence
phrases and no label. Derive the call count as
`arms × startups × variants × reps` — the dry-run printer ignores
`--only-probe` and does not reflect `--reps`, so its block count is not a stand-in.

## Limits that travel with every figure

Carried unchanged: **directional** (catches recommending what exists, silent on
failing to recommend what is missing); `artifactTokens` **authored with no
external source**; **lower bound**, with passive/postposed acquisition and
out-of-list verbs as the named uncaught classes; n=2 documents, one model, one
quota window.

New to this design:

- **`unlabelled` is a manipulation production does not produce.** Only the
  `original` cells speak to what users receive.
- **G1 bounds the detector, it does not prove it.** Mutants are built from
  clauses the detector already reaches, so constructions it never reaches cannot
  appear among them.

## Out of scope

- Any change to `lib/assertions.js` cues or `CLASSIFIER_SOURCE`.
- Widening `ACQUISITION_VERB` or teaching the gate grammatical voice. Both
  uncaught classes stay uncaught, and stay asserted silent in G1.
- Scoring coverage in the positive direction — needs an adjudicated reference;
  declined during the first design and still declined.
- The RNS path.
