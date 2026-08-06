# Assertion classifier gaps — design

**Date:** 2026-08-07
**Objective:** 1b. Repairs the instrument the 2026-08-06 supplied-level fabrication probe is scored with, then re-runs it.
**Status:** approved, not implemented.

## Problem

The 2026-08-06 run reported the corpus+inflated cell at **2/12 (17%)** asserted, and recorded the figure as a floor because reading `flaggedClauses` by hand found two genuine fabrications sitting in `unclassified`. Two causes were named: `exists` is absent from the assertion cue list, and `splitClauses` yields subject-less fragments.

Dumping all 35 classified clauses shows the second diagnosis is only a third of the picture.

```
unclassified: 14   recommended: 13   negated: 5   asserted: 3
```

Hand-classifying the 14 `unclassified` clauses: **12 are recommendations that were mis-binned. Only 2 are the genuine missed assertions.** The dominant defect in this classifier is recommendation detection, not assertion detection.

### The three mechanisms, with their measured instances

| # | mechanism | example clause | should be | count |
|---|---|---|---|---|
| 1 | `Needs:` / `Need:` / `Needs a…` / `needed` — `RECOMMENDATION` requires `need\s+to` | `"Needs: Advance to ORL 3 by engaging the first non-founder contributor…"` | recommended | 7 |
| 2 | coordination strands the modal; `IMPERATIVE` is `^`-anchored so a leading `and` defeats it | `"and prepare for its first full-time hire beyond the founding team."` | recommended | 5 |
| 3 | `exists` is not an assertion cue | `"A basic funding plan exists alongside PHP 5,000 MRR."` | asserted | 1 |
| 4 | `Dr.` splits a sentence, and no cue covers accompaniment (§3 — **not fixed**, see below) | `"Elena Reyes, Marco Villanueva, Joy Tabotabo) alongside a first non-founder contributor."` | asserted | 1 |

Mechanism 2 also accounts for one clause outside the `unclassified` set — the false positive below — so six clauses in total are coordination-stranded.

### A live counterexample to the lower-bound guarantee

The module's header states that every ambiguity resolves away from fabrication, so the reported rate is a lower bound. There is a counterexample in the collected data.

The third `asserted` clause is `"and maintain an active log of investor pitches conducted."` Its source RNA:

> "To reach IRL 4, the startup **must** convert its funding plan into an investor pitch deck or one-pager, initiate warm-intro investor meetings, **and maintain an active log of investor pitches conducted.**"

The `,\s+(?=and)` split stranded the fragment from its governing `must`, and `ASSERTION`'s `maintains?` fired. This is mechanism 2 firing in the direction that *breaks* the guarantee rather than the direction that merely loses detections.

**It does not move the published 2/12.** Observations are binary per (call, dimension) and that call's Investment was already `asserted` on the legitimate `"a drafted funding plan"` clause. But the lower-bound property is currently a claim rather than a guarantee, and repairing that is independently worth the change.

### Boundary held

The audit dump was used to **design** this fix and to size the re-run. The 2026-08-06 data is **not** re-scored and no corrected rate is quoted from it. That is the post-hoc move the fingerprint guard exists to block, and the 2026-08-06 session declined it deliberately. This spec does not reverse that decision.

## The asymmetry the design rests on

`classifyClause` tests **negation → recommendation → assertion**, in that order.

- Improving `NEGATION` or `RECOMMENDATION` is **monotonically safe**: it can only move clauses out of `asserted`/`unclassified` and into `recommended`. It can never inflate the fabrication rate.
- Widening `ASSERTION` is the only edit that can inflate the rate, and is the only one owing a lower-bound argument.

So the two categories are budgeted differently: recommendation cues are widened freely, assertion cues are added one at a time with a refusal recorded for each near-miss considered and rejected.

## Design

Scope is **`backend/measurement/lib/assertions.js` only.** `lib/hard-absences.js` is untouched — the artifact-token lists and the run-time absence guarantee are unaffected, so `verifyAbsences` keeps its meaning.

### 1. Abbreviation-safe sentence split

`splitClauses`' `/(?<=[.!?])\s+/` gains a lookbehind chain refusing to split after a known abbreviation (`Dr. Mr. Mrs. Ms. Prof. Inc. Corp. Ltd. Co. St. No. vs. e.g. i.e.`) or a bare initial (`J.`).

`Dr.` is the only observed case. The rest are the same class and cost nothing to include. Variable-length lookbehind is supported in V8; confirm at implementation rather than assuming.

This change alone repairs mechanism 4's fragment.

### 2. `ASSERTION` gains existential predicates — one family only

Add **`exists?`** — `exist` and `exists` only.

Safe by ordering: `"No funding plan exists at all"` hits `NEGATION` first, and `"a funding plan should exist"` hits `RECOMMENDATION` first.

**Deliberately refused, so this is not re-litigated:**

| candidate | counterexample | verdict |
|---|---|---|
| `remains` | `"a permit remains outstanding"` — asserts nothing, would score `asserted` | refused |
| `includes` | `"the plan includes hiring a contractor"` — a plan, not an artifact in existence | refused |

Both were floated in `SESSION_NOTES.md`. Neither has a measured instance.

### 3. Accompaniment — designed, built, measured, and CUT

Mechanism 4's repaired sentence still has no assertion cue:

> `"Currently at ORL 3, led by 3 founders (Dr. Elena Reyes, …) alongside a first non-founder contributor."`

No negation, no recommendation, no imperative, and no possession or achievement participle. It asserts by accompaniment. The original design added a positional predicate: a token qualifies when an accompaniment preposition (`alongside | along with | together with | accompanied by | as well as`) ends within 40 characters before it, with no clause punctuation in the span.

**It was implemented, reviewed under attack, and removed on 2026-08-07.** The predicate has no requirement that the token be the **head** of the governed phrase, and no restriction is available that supplies one. Under adversarial review, **14 of 14** constructed realistic clauses flipped `unclassified → asserted`, and **5 of 6** realistic RNA dimension texts flipped end to end. Two distinct failure shapes:

| shape | clause | why it is not an assertion |
|---|---|---|
| token used attributively, not as head | `"Customer adoption grew steadily as well as investor interest."` | `investor` modifies `interest`. This is *verbatim* the case `ASSERTION`'s own comment excludes bare copulas for |
| preposition governs an earlier noun; token lands in the window by coincidence | `"The pilot ran alongside barangay officials to obtain a permit."` | `alongside` governs `barangay officials`; the permit is the goal of a purpose clause — explicitly **not** obtained |

The second shape is the worse one: it fires on a *recommendation*, and no cue gates it, because the corpus's own gerund style (`expanding`, `acquiring`, `addressing`) is not in `RECOMMENDATION`. `as well as` is a coordinating conjunction rather than an accompaniment preposition and contributed 6 of the 14 uniquely.

Hardening was considered and rejected. Requiring a determiner at the head of the span was measured at 14 → 2 false positives, but ~2 survive — including the purpose-clause shape — and the restriction would be tuned against constructed cases rather than measured ones.

**The trade this cuts:** the plan recovers **1 of the 2** genuine misses instead of 2. That is the right side of the trade. §3 was the only change that could raise the measured rate, and the lower-bound guarantee is what lets the study's reference-free 61%-vs-0% result survive a contested reference. Buying one detection with a predicate that fires on 14 of 14 constructed non-assertions inverts the property the result rests on.

**What is recorded instead:** accompaniment-only assertion is a **known uncaught class**, kept in the tests as the ORL 3 clause scoring `unclassified` with a comment saying why. A known uncaught class is itself a lower-bound statement, so it costs the claim nothing.

**`with` was excluded even in the original design** and stays excluded — it is pervasive and unrestrictable. It cost nothing measured: both already-detected assertions use `with` but are caught through their participle (`engaged`, `drafted`).

### 4. `RECOMMENDATION` and `IMPERATIVE` widen

`need\s+to|needs\s+to` → `\bneed(?:s|ed|ing)?\b`, covering all seven mechanism-1 instances.

**`IMPERATIVE` gains nothing.** The earlier draft of this section added the stranded verbs (`bring`, `initiate`, `advance`, …) and a leading-coordinator strip. Both are withdrawn: §5 handles every stranded fragment by inheriting its governing clause's modal, which is the principled rule, and patching a verb list alongside it would make §5 reachable on only one of the six clauses — leaving the mutation pass unable to show it is load-bearing. One mechanism, tested.

### 5. Coordination scope inheritance

A clause matching `^(?:and|or|then)\b` is a **continuation fragment**. `classifyClause` gains an optional third parameter, `scope` — the preceding non-fragment clause — and `scoreAssertedAbsences` passes it for continuation fragments only.

**`NEGATION`, `RECOMMENDATION` and `IMPERATIVE` are tested against `scope + clause`. The token test and `ASSERTION` are tested against the clause alone.** Only the two gates that resolve away from fabrication get the wider window, so the change is monotonically safe. A fragment can never become `asserted` because of something in its neighbour.

Inheritance is scoped to *cues*, not to `classifyClause`'s output. That distinction is load-bearing: the head clause frequently contains no artifact token — `"To achieve ORL 4, the startup must draft formal role definitions…"` has none — so it classifies as `null`, and a verdict-inheriting design would find nothing to inherit. Testing the cue regexes against the concatenation reconstructs the original sentence scope instead.

The third parameter defaults to `''`, so all existing two-argument call sites and tests are unaffected.

This covers all six coordination-stranded clauses — the five `unclassified` ones and the false positive in §"A live counterexample".

The subordinator split at `assertions.js:74` is unaffected: in `"While no term sheet exists, the team has secured angel funding"` the asserting clause does not begin with a coordinator, so it inherits nothing and still scores `asserted`.

### 6. Fingerprint

The file's "add any new regex or helper here at the same time you add it above" comment is exactly the kind of instruction that gets missed, and the consequence is re-scored data pooling with data scored by a different classifier.

Replace it with structure: collect the cue regexes into a `CUES` object and **build `CLASSIFIER_SOURCE` from `Object.values(CUES)`**, so a regex in `CUES` cannot be left out of the hash. Then add one test that reads the module source, extracts every module-level `SCREAMING_CASE` constant, and asserts each is either a `CUES` key or a named non-cue (`CLASSIFIER_SOURCE`) — that catches a *new* regex declared outside `CUES`, which building from `CUES` alone cannot.

`assertion|*` will change. The re-run must therefore **refuse** to pool with `2026-08-06-supplied-level.json`. That refusal is verified, not assumed.

## Tests

TDD. RED first.

**Fixtures are the 17 real clause strings from the audit dump** — actual model output, verbatim, not invented cases. Each of the 14 `unclassified` clauses gets a test asserting its corrected class; the 3 `asserted` clauses get tests asserting 2 stay `asserted` and the stranded `"and maintain an active log…"` becomes `recommended`.

Additional required tests:

| test | guards |
|---|---|
| `"While no term sheet exists, the team has secured angel funding"` → `asserted` | the subordinator split isn't re-masked by §5 |
| `"a permit remains outstanding"` → not `asserted` | the §2 refusals stay refused |
| `"Currently at ORL 2 with founders committed full-time"` → not `asserted` | `with` stays excluded from §3 |
| every module regex appears in `CLASSIFIER_SOURCE` | §6 |
| all 178 existing measurement tests | no regression |

**Mutation pass.** Remove each new cue and the §5 inheritance rule individually; confirm at least one test fails for each. Mutation testing has caught decorative guards three times on this work (`is429`, `placed > ceiling`, `ipo`/`IPOPHL`), and §3 in particular must be shown to be load-bearing rather than merely present.

## Re-run

After 15:00 Philippine time on 2026-08-07 — a fresh quota window. The 16-call matrix cannot start before then.

```
node measurement/measure-grounding.js --only-arm=baseline,deviation-deterministic \
  --only-probe=rna --level-condition=both --reps=2 \
  --out=measurement/results/2026-08-07-supplied-level.json
```

2 arms × 2 conditions × 2 startups × 2 reps = 16 calls. Then confirm `--merge` refuses to pool with 2026-08-06.

**AgroLink reps are not added, and the recorded rationale for adding them is withdrawn.** `SESSION_NOTES.md` reasons that AgroLink's zero fabrications may be a property of "the document or of its lower levels". `src/demo-readiness-levels.ts` shows both startups at **O2 R1 I1** — identical on all three manipulated dimensions — so `--level-condition=inflated` applies the same manipulation to both and "its lower levels" cannot be the explanation. The observed mechanism is welding a fabricated artifact onto a true document fact (`PHP 5,000 MRR`, the IPOPHL trademark), and AgroLink's proposal offers fewer such anchors. More reps would test whether the zero is stochastic; they would not test that. AgroLink's zero stays an open observation.

## Expected consequence, stated before the number exists

The fix recovers two assertions that sat in `unclassified`, so the fresh run will very likely read **higher** than 2/12 on the corpus+inflated cell, and `unclassified` will fall sharply — 14 clauses to roughly 2.

That is the lower bound tightening on a repaired instrument, not a new defect appearing in the pipeline. Recording it here, before the run, so the write-up cannot present a predictable instrument effect as a discovery.

The `unclassified` shrinkage also retires `measurement/README.md`'s standing caveat against quoting a rate while that column is large.

## Out of scope

- Re-scoring `2026-08-06-supplied-level.json`.
- `remains` / `includes` / `existed` / `existing` assertion cues, and the accompaniment predicate of §3 in any form — hardened or otherwise.
- Any change to `lib/hard-absences.js`, `lib/metrics.js`, or the harness.
- The RNA-generation-quality probe (`SESSION_NOTES.md`'s "still unmeasured") — that needs a harder probe, not this instrument fix.
