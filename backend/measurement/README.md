# Model measurement harnesses

Ad-hoc scripts used to decide the `GEMINI_MODEL` default, kept so the numbers
in `TODO_CHECKLIST.md` §5 can be reproduced rather than taken on trust. They
are **not** part of the test suite and are not run by `pnpm test`.

Both read `GEMINI_API_KEY` from `backend/.env` and call Gemini directly — they
do not need the server running, but they **do consume quota**.

```bash
node measurement/measure-models.js
node measurement/measure-differentiation.js
node measurement/calibrate-similarity.js
node measurement/measure-retrieval.js
node measurement/measure-grounding.js                  # full harness (1 rep = 12 calls, 18 with --with-fabrication-probe)
node measurement/measure-grounding.js --retrieval-only  # Step A only, no generation quota spent
node measurement/measure-grounding.js --dry-run         # assemble and print every arm's prompts, no model call at all
node measurement/measure-grounding.js --fingerprint     # print today's comparability fingerprints, no model call at all

# One rep is what a free-tier day buys. Accumulate across days:
node measurement/measure-grounding.js --reps=1 --out=measurement/results/2026-07-30-rep2.json
node measurement/measure-grounding.js --merge measurement/results/*.json
```

`--dry-run` and `--fingerprint` (and `--retrieval-only`, for the generation
endpoint specifically) are the quota-free paths, alongside `pnpm
test:measurement` (`node --test measurement/tests/*.test.js`, 49 tests as of
this writing, no network calls at all — every scorer and prompt builder is
exercised as a pure function). `--dry-run` exists because unit tests cannot
tell you whether an assembled prompt *looks* right, and this harness has
twice now measured a property of the prompt rather than of the model (see
the two confounds below) — a standing, quota-free eyeball path is the direct
defence against a third one. It still calls `embedContent` for the
`sdd-semantic` arm's retrieval (a separate, much higher-ceiling quota than
generation), which is why it isn't advertised as calling zero endpoints —
only zero *generation* calls.

`--merge` re-runs the report functions over the concatenated raw per-call
records, so N days of one rep is arithmetically identical to one N-rep run.
It refuses to merge files whose model, embedding model, corpus size,
similarity floor **or probe design** differ, rather than silently averaging
two different experiments.

The probe-design check matters because both confounds below changed what a
"rep" actually measures without changing its shape — a model-and-corpus
check alone would happily pool a pre-fix levels probe (which leaked the
answer to the deterministic arm) with a post-fix one asking a genuinely
different question. `lib/fingerprint.js`'s `fingerprintMap` hashes, **per
(metric, arm)** — not once per metric — each probe's prompt-builder source,
the grounding instruction, the dimension list, each startup's document/
levels/field lists, that arm's rubric mode, and the rubric *scope* it
receives (`'full-ladder'` / `'current-and-next'` / `'none'`); the `rna` key
additionally folds in the stage-marker lexicon, since metric 2 is scored
with it. Per-arm granularity matters because a rubric-scope change (like the
levels-probe fix below) alters what a corpus arm receives while leaving
`baseline` untouched — a single per-metric hash would discard `baseline`'s
still-valid data along with the arm that actually changed. `--fingerprint`
prints what a run today would stamp — currently a 9-entry map (3 probes ×
3 arms) — so you can check an existing results file is still mergeable
without spending a call.

## What each one measures

**`measure-models.js`** — one document, three probes:

- *leniency* — assign readiness levels 1–9 across six dimensions
- *hallucination* — ask for six fields, three of which are deliberately **not**
  in the document. The production grounding instruction says to return null
  when uncertain, so inventing a value is a measurable grounding failure.
- *schema* — did the response parse into the expected shape

**`measure-differentiation.js`** — the more useful one. Runs the same
assessment against an early-stage document (AgroLink: paper prototype, zero
revenue) and a mid-stage one (MediSync: six paying facilities, PHP 5k MRR),
and reports the **gap** between them. A model that cannot separate those two
cannot support Objective 2 no matter how the weights are tuned.

**`calibrate-similarity.js`** — picks the retrieval similarity floor
(`RAG_MIN_SIMILARITY` in `ai.service.ts`). Embeds nine startup descriptions
across three domains, compares all 36 pairs, and reports what each candidate
threshold keeps and leaks. Needed because embeddings score same-register prose
high across the board: the same-domain and cross-domain distributions
**overlap**, so the floor is a trade-off rather than a boundary. The first
guess of 0.70 let 78% of cross-domain pairs through.

This is the only one that decides a value used in production, so re-run it if
the embedding model changes.

**`measure-retrieval.js`** — the Objective 1b arm comparison. Runs the two
retrieval strategies `AI_RAG_STRATEGY` selects between over the same nine
documents, using their production scoring functions (`scoreRagMatch` verbatim
for keyword; embeddings + the 0.78 floor for semantic). A hit counts as correct
if it shares the query's domain. Result on 2026-07-27:

| arm | returned | correct | precision | top hit correct | same-domain recall |
|---|---|---|---|---|---|
| keyword | 27 | 15 | 56% | 7/9 | 15/18 (83%) |
| semantic | 21 | 16 | **76%** | 8/9 | 16/18 (89%) |

The shape matters more than the headline: semantic returned **fewer** documents
and still surfaced **more** correct ones, so this is not precision bought with
recall. Keyword's `score > 0` floor admits anything sharing a common token,
which is why it returns the full top-3 every time regardless of relevance.

Both arms miss the same case (ClassKit Iloilo retrieves TeleKonsulta Leyte —
both are rural low-connectivity public services, so the confusion is at least
reasonable).

**`measure-grounding.js`** — does the verified corpus (54 readiness rubrics,
10 business frameworks, built in tasks 1-8) actually reduce hallucination and
improve differentiation? Three arms:

| arm | `ragCorpus` | `rubricMode` | question |
|---|---|---|---|
| baseline | `false` | — | does a verified corpus help at all? |
| sdd-semantic | `true` | `semantic` | does the *code's* semantic-mode substitute deliver the rubric? |
| deviation-deterministic | `true` | `deterministic` | is the shipped deviation justified? |

Two steps, run in that order because quota is the binding constraint:

**Step A — rubric-retrieval accuracy (quota-free of the generation endpoint,
full N, reproduces exactly).** Two separate questions, and they are **not
the same mechanism** — worth stating plainly, because an earlier draft of
this write-up conflated them:

1. **The code's current `semantic` substitute.** For each of the 2 seeded
   startups × 6 dimensions (12 queries), embed the bare dimension name
   (`"Technology"`, `"Regulatory"`, …) — what
   `dimensions.map(d => d.readinessType).join(' ')` degenerates to for a
   single missing dimension — and check the returned rubric's
   `readinessType` against `rubricKey(type, level)` as ground truth. This is
   **not** what SDD §3.2 specifies; it is the stand-in `rag-query.service
   .ts:126` actually runs.
2. **SDD §3.2 as written**: *"queries the vector database using the
   startup's profile data as the search embedding."* This is tested
   separately below by embedding each startup's own profile text
   (`STARTUPS[name].doc`) whole and checking the result against the union of
   all 12 valid `(dimension, current-or-next-level)` keys for that startup —
   the code never actually does this for the rubric channel, so this query
   exists only in this measurement, to test the specified mechanism on its
   own terms.

Result, 2026-07-28:

| mode | queries | correct dimension | wrong dimension | empty |
|---|---|---|---|---|
| deterministic | 12 | 12 | 0 | 0 |
| code's dimension-name substitute | 12 | 0 | 0 | **12** |

Deterministic is 12/12 by construction — it is an exact `(type, level)` key
lookup, it cannot retrieve the wrong dimension. **The code's substitute
returned nothing for every single query.** It embeds only the bare dimension
name and compares it against corpus rows whose title and content use the
SDD's abbreviations (`TRL 3 — …`, `RRL 1 — …`) rather than the enum's
human-readable names. Every one of the 12 top-2 nearest-neighbour scores
fell below the 0.78 floor. **This settles the narrower claim it can
settle**: the code's current stand-in for semantic retrieval does not
deliver the rubric it's trying to retrieve, for this corpus and this query
shape — not "retrieves a worse rubric," but "retrieves nothing, every
time." **It does not, by itself, say anything about whether SDD §3.2's
actual mechanism works** — that is a different query, tested next.

**SDD §3.2 as specified — profile-data query.** Both startups' full profile
text, embedded whole, against the same 54-row corpus:

| query | queries | correct (any of the 6 dimensions) | wrong | empty |
|---|---|---|---|---|
| profile-data (SDD §3.2) | 2 | 0 | 0 | **2** |

**Also empty, for both startups.** So the specified mechanism does not fare
better than the code's substitute here — but for a plausibly different
reason: a profile is several sentences of narrative business prose, and the
rubric rows are short, abbreviation-heavy definitional text (`TRL 3 —
Experimental proof of concept: …`). The two have little shared vocabulary
or register, so **a low score here is a structural property of comparing a
startup's narrative profile against short definitional rubric text**, not
an artifact of a badly-chosen query string the way the bare dimension name
arguably was. Taken together: **neither the mechanism SDD §3.2 specifies
nor the code's actual substitute for it can retrieve this rubric corpus**,
for reasons that look different but land on the same 0.78 floor. This is
the result that actually settles the SDD deviation question — measured
against the mechanism SDD §3.2 describes, not a proxy for it — and it costs
embedding calls only, not the exhausted generation quota.

**Step B — the three generation arms, redesigned after two confounds.**

The 2026-07-28 attempts produced n=0 in every cell. The cause was a hard
daily cap — `generativelanguage.googleapis.com/generate_content_free_tier_requests`,
quota ID `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, **20 requests
per day** for `gemini-3.6-flash`, confirmed from the 429 body, not a
per-minute limit that re-pacing works around — combined with a loop order
that spent the entire budget inside the first arm. **Both were fixed:**
reps are the **outermost** loop so a 429 costs precision rather than the
comparison itself, and `--out` / `--merge` accumulate raw per-call records
across days. See the header comment in `measure-grounding.js`.

The first full run, 2026-07-29, surfaced two further problems that were not
quota-related — the harness ran cleanly, it just measured the wrong thing.
Both are fixed now; each is worth stating on its own because neither was
fixable by running more reps.

**Confound 1 — the levels block was withheld from every arm.**
`ai.service.ts:937-943` emits the startup's current per-dimension levels
(`Initial Readiness Level: TRL … MRL … ARL … ORL … RRL … IRL …`) into the
production RNA prompt for **every** arm; only the rubric block varies with
`ragCorpus`. The harness omitted that block for every arm, so it was
contrasting "told its levels" against "not told its levels" — a difference
production never presents, and not a retrieval effect at all. `rnaPrompt`
now takes `levels` and emits production's block (`readinessLevelBlock`) for
every arm, matching what `RnaService.generateRNA` actually sends.

**Confound 2 — the levels probe leaked its own answer to the deterministic
arm.** Deterministic retrieval keys on `(readinessType, level)` using the
startup's *actual current level*, so handing that retrieved rubric to a
probe that then asks the model to assess the level was asking
`deviation-deterministic` to read back a number it had just been given —
any differentiation "advantage" for that arm was leakage, not grounding.
The levels probe now receives the **full nine-rung ladder** for every
dimension (`fullLadderRubrics()`) instead of the (current, current+1)
lookup, so the model gets rubric vocabulary without being told which rung
applies. The RNA probe deliberately keeps the (L, L+1) lookup, because that
is what production ships for that call — the asymmetry between the two
probes is intentional, not an oversight.

Fixing these also forced a rewrite of what "metric 1" and "metric 2" mean
(the terms-reuse and invented-field metrics scored below no longer exist in
the code):

- **Metric 1 — level-placement accuracy**, mean absolute error between the
  levels probe's assigned level and the startup's actual seeded level
  (`lib/metrics.js`'s `levelPlacement`). The metric it replaces —
  "did the generated RNA reuse the retrieved rubric's exact vocabulary" —
  scored 1/12 (8%) on the 2026-07-29 run, and inspection showed why that
  number was mostly artifact, not signal: the model produced a
  substantively correct TRL-2/3 characterization of AgroLink's technology
  that reused none of the rubric's wording, because the RNA prompt's own
  "be specific and grounded in the provided data" instruction structurally
  discourages echoing abstract rubric phrasing. It measured vocabulary
  reuse, not grounding, so it is gone.
- **Metric 2 — stage-inappropriate recommendation rate**, SO 1.3's own
  worked example of a hallucination ("recommending commercialization steps
  to a TRL 2 startup") made mechanical (`lib/metrics.js`'s
  `stageAppropriateness`, scored with `lib/stage-markers.js`'s
  `isStageInappropriate`). It replaces the absent-field probe, which had
  saturated at 0/15 invented across every arm and was aimed at something
  the corpus cannot influence anyway — burn rate and investor name are not
  readiness rubrics. The lexicon behind it lives in
  `data/stage-markers.json` and **is authored, with no external source** —
  say this plainly, the same way the corpus beside it carries a
  `provenance` field per row. It is held disjoint from every corpus row's
  `keyTerms` by `tests/stage-markers.test.js`, not by convention, so a
  corpus arm cannot score well on metric 2 merely by echoing text metric 1
  used to reward.
- **Metric 3 — differentiation gap** is unchanged in definition (mid-stage
  mean minus early-stage mean across the levels probe) but was the metric
  Confound 2 leaked into: any gap difference favouring
  `deviation-deterministic` in the 2026-07-29 numbers below cannot be
  trusted, because that arm's levels probe was seeing its own answer.
- **Metric 4 — the absent-field probe**, unchanged, now opt-in behind
  `--with-fabrication-probe` rather than run by default. It stays in the
  harness as SRS §2.2 evidence ("return null for unverifiable fields")
  even though it is saturated and discriminates nothing between arms.

A rep is now **12 calls** (RNA + levels, × 2 startups × 3 arms), or **18**
with `--with-fabrication-probe` added back in — against the same 20/day cap.

**The 2026-07-29 result below is superseded, not merely old.** It was
produced with both confounds still present, and its own metric 1 and 2
definitions (rubric-term reuse, invented-absent-fields) no longer exist in
the code — there is no way to re-express that table in current terms. It is
kept in this file, and the results file itself
(`measurement/results/2026-07-29-rep1.json`) is kept on disk, for one
reason only: caveat (b) below measured the model's own sampling noise at
`temperature: 0`, which is a fact about `gemini-3.6-flash`, not about
either confound, and it survives the redesign intact.

Result, 2026-07-29 (`measurement/results/2026-07-29-rep1.json`), n=1 per
cell, quota exhausted on call 17 of 18, **under the old (confounded) probe
design and the old metric definitions** — do not treat metrics 1 and 2 in
this table as measuring what the current code measures:

| metric | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — rubric-term grounding *(retired)* | n/a (no rubric) | n/a (nothing retrieved) | **1/12 (8%)** |
| 2 — invented absent fields *(now metric 4)* | 0/6 (0%) | 0/6 (0%) | 0/3 (0%) |
| 3 — differentiation gap | **+1.50** | **+2.50** | incomplete (n=0 MediSync) |

**(a) `sdd-semantic` is not a distinct condition — it is a null-condition
replicate of `baseline`.** Semantic rubric retrieval returned **0 rows** for
both startups (`retrieved: []` in the results file), exactly as Step A
predicted, so `renderRubricBlock([])` produced an empty string — and
`baseline`, which retrieves nothing by construction, produced the same empty
string. **The two arms sent byte-identical prompts.** This is a direct
consequence of Step A's 0/12 finding and it means the harness currently runs
*two* conditions (corpus off / deterministic corpus) plus one accidental
control, not three conditions. This is a property of the corpus and the
code's semantic substitute, not of either confound, so it still applies
under the redesigned probes.

**(b) That control measured the noise floor, which is large — this finding
survives the redesign.** Same prompt, same `temperature: 0`, two independent
samples: **8 of the 12 per-dimension levels differed**, and the
differentiation gap moved **+1.50 → +2.50**.

| | baseline | sdd-semantic (identical prompt) |
|---|---|---|
| AgroLink | T3 M3 A3 O3 R1 I1 | T2 M3 A2 O2 R1 I1 |
| MediSync | T5 M4 A5 O4 R2 I3 | T6 M5 A6 O4 R2 I3 |

So **±1.0 gap points is run-to-run variance at n=1** on this model.
`gemini-3.6-flash` is thinking-enabled and does not sample deterministically
at `temperature: 0` (already noted under Caveats, now quantified). **No
corpus effect smaller than about one gap point is detectable at this N** —
which is the strongest single reason to keep accumulating reps once
generation quota is spent on the redesigned probes, and it is a fact about
the model's sampling behaviour, not about either confound, so it is not
invalidated by the rest of this table being superseded.

**Next quota window**, run a full rep under the current (fixed) code and
merge:

```bash
node measurement/measure-grounding.js --reps=1 --out=measurement/results/<date>-rep2.json
node measurement/measure-grounding.js --merge measurement/results/*.json
```

`--merge` will refuse to pool that new file with `2026-07-29-rep1.json` —
their fingerprints differ, by design, because the probe design changed.
That refusal is correct, not a bug: metric 1 and metric 2 in the old file
answer questions the current code no longer asks.

**Do not read Step A's failures as "therefore deterministic improves
grounding."** Step A establishes that neither the code's substitute nor
SDD §3.2's actual mechanism can retrieve this rubric corpus. Objective 1's
headline claim — does the corpus reduce hallucination and improve
differentiation — remains untested under the current, confound-free probe
design; the 2026-07-29 numbers above cannot answer it either way.

## Reading the output

The trustworthy signal is the **gap and its direction**, not the absolute
levels — there is no expert ground truth here. A negative gap means the model
ranked the mid-stage venture *below* the early-stage one, which is what
`gemini-2.5-flash-lite` did.

The two generation scripts use `temperature: 0` and the verbatim
`AI_GROUNDING_INSTRUCTION` from `ai.service.ts`, so the only variable is the
model.

## Caveats

Generation scripts (`measure-models`, `measure-differentiation`):

- Small N by design (3 repetitions) — free-tier quota is the constraint and
  429 is the failure mode. Both scripts stop cleanly on quota exhaustion and
  report partial results; check the `n=` counts before comparing cells.
- The prompts mirror the production *shape* but are not `createBasePrompt`,
  so RAG context and startup history are absent.
- Thinking-enabled models still vary run to run at `temperature: 0`.

Retrieval scripts (`calibrate-similarity`, `measure-retrieval`) — read these
before quoting the numbers:

- **The documents are written, not sampled.** Nine descriptions composed for
  this test, deliberately three clean domains. Real capsule proposals are
  longer, messier, and cluster less neatly, so the separation here is an
  optimistic case.
- **Ground truth is domain membership, not human relevance judgement.** Two
  health startups are assumed to be useful context for each other. That is
  coarse — the correct answer is sometimes a same-stage startup in a different
  sector. The saving grace is that neither arm can see the labels.
- **N is 9 documents / 36 pairs.** Enough to reject a threshold of 0.70; not
  enough to fine-tune between 0.78 and 0.80.
- Embeddings are deterministic here, so unlike the generation scripts a re-run
  reproduces exactly — which also means repetition buys nothing.

If you re-run these for the paper, raise `REPS`, record the date and the model
IDs actually returned by the API that day, and re-check the model list first —
`gemini-2.5-flash` disappeared between the checklist being written and the
measurement being taken.

`measure-grounding.js`:

- **Step A is quota-free of the generation endpoint, not quota-free
  outright.** It still calls `embedContent`, which has its own free-tier
  ceiling (`embed_content_free_tier_requests`) — hit once during this
  measurement, independent of any `generateContent` usage, and recovered on
  its own within a minute. Embeddings are deterministic, so a re-run
  reproduces the 12/12 vs 0/12 result exactly; it is not a small-N number
  that needs more repetitions.
- **Step B's ceiling is a hard daily cap, not `DELAY_MS`.** It is
  `GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20` for
  `gemini-3.6-flash`, confirmed from the 429 body. No pacing value works
  around it; only a fresh day's quota (or a paid tier) does. The window
  resets at **midnight US Pacific**, which is **15:00 Philippine time** — so
  a run started in the PH morning is drawing on the *previous* window and may
  find it already spent. The 2026-07-29 run got 16 calls, not 18, for exactly
  this reason.
- **N is the binding constraint on every Step B conclusion, and the noise
  floor is now measured rather than assumed** — ±1.0 differentiation-gap
  points between two byte-identical prompts (see Step B above). Accumulate at
  least three reps with `--merge` before treating any between-arm difference
  in metric 3 as real.
- **Metric 1 (level-placement accuracy) replaced the old rubric-term
  metric because that one measured whether retrieval's exact wording
  reached the output, not whether the output was correct.** A generated
  RNA could contain a `keyTerm` while describing the wrong readiness level,
  or omit every `keyTerm` while being an accurate paraphrase — on the
  2026-07-29 run it scored 1/12 (8%) even though inspection showed the
  underlying text was substantively on-target, because the RNA prompt's own
  "be specific and grounded in the provided data" instruction discourages
  echoing abstract rubric phrasing. Level-placement MAE is scored against
  the seeded ground truth instead, which cannot be gamed by fluent
  paraphrase or defeated by faithful paraphrase either.
- **Metric 1 and metric 3's denominators exclude a dimension the model
  dropped entirely.** If a levels-generation response omits a `dimension`
  the prompt asked for, that dimension is skipped (`levelPlacement`'s
  `typeof assigned !== 'number'` check) rather than scored as an error — a
  missing field is a schema-compliance problem, not evidence of a bad
  placement. Schema compliance is not measured by this script; check `n=`
  for a low denominator as a sign it's happening.
- **Metric 2's markers are exact word-boundary matched, case-insensitive,
  against the RNA text — not against the rubric.** `isStageInappropriate`
  flags a dimension only when an authored marker phrase for a level well
  above the startup's actual rung appears in the generated recommendation
  (`\bphrase\b`, so "ipo" doesn't false-positive inside "IPOPHL"). A model
  that recommends an advanced action in words the lexicon doesn't contain
  is not flagged — that under-counts the failure rather than over-counting
  it, the same safer-direction trade-off the old exact-substring metric
  made.
- **Metric 2's denominator excludes a dimension the model dropped from the
  RNA entirely**, the same convention as metric 1: a missing
  `readiness_level_type` is a schema-compliance gap (`stageAppropriateness`
  skips it), not evidence the recommendation was stage-appropriate.
- **The two seeded startups' per-dimension levels are real, not
  approximated** — `main.ts`'s `seedDemoStartups` (AgroLink: T2/M2/A1/O2/R1/I1;
  MediSync: T5/M4/A3/O4/R3/I3), not a uniform guess per startup. The
  documents themselves are `measure-differentiation.js`'s verbatim early/mid
  pair.
- **The code's `semantic` rubric mode's Step B query is startup-invariant.**
  When every dimension is missing (`RnaService.generateRNA`'s normal case for
  a fresh startup), `retrieveRubrics`'s semantic query is
  `dimensions.map(d => d.readinessType).join(' ')` — the same six-word string
  regardless of which startup or what level it's actually at. AgroLink
  (early) and MediSync (mid) would therefore receive an *identical* retrieved
  rubric set in that arm, a structural property of the production code being
  measured, not an artifact of this harness — and a second, independent way
  this substitute cannot deliver a level-appropriate rubric, beyond Step A's
  per-dimension accuracy finding. This is still the code's substitute, not
  SDD §3.2's mechanism — see the profile-data query below for that.
- **The profile-data query's ground truth is deliberately loose.** "Correct"
  means every returned row's key is among the startup's 12 valid
  `(dimension, current-or-next-level)` pairs across *all six* dimensions, not
  one targeted dimension — a whole-profile query per SDD §3.2 isn't aimed at
  a single dimension the way a per-dimension query is. That makes "correct"
  easier to satisfy than Step A's per-dimension check, not harder, so the 0/2
  empty result is not an artifact of an unfairly strict bar.
- **N is 2 startups** for the profile-data query, same as the differentiation
  arms — enough to check whether the mechanism clears the floor at all, not
  enough to characterize a partial-hit rate.
