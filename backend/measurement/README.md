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
node measurement/measure-grounding.js                  # full harness (1 rep = 18 calls)
node measurement/measure-grounding.js --retrieval-only  # Step A only, no generation quota spent

# One rep is what a free-tier day buys. Accumulate across days:
node measurement/measure-grounding.js --reps=1 --out=measurement/results/2026-07-30-rep2.json
node measurement/measure-grounding.js --merge measurement/results/*.json
```

`--merge` re-runs the report functions over the concatenated raw per-call
records, so N days of one rep is arithmetically identical to one N-rep run.
It refuses to merge files whose model, embedding model, corpus size,
similarity floor **or probe design** differ, rather than silently averaging
two different experiments.

The probe check matters because metrics 1 and 2 are both expected to be
rewritten (see (c) and (d) below) — a model-and-corpus check alone would
happily pool "how often did it invent a field under the old probe" with the
same question under a new one. `probeFingerprint` hashes the three prompt
builders, the grounding instruction, the dimension list and each startup's
present/absent field sets. `--fingerprint` prints what a run today would
stamp, so you can check an existing file is still mergeable without spending
a call.

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

**Step B — the three generation arms (metrics 1-3): first run 2026-07-29,
n=1, 16 of 18 calls completed.**

The 2026-07-28 attempts produced n=0 in every cell. The cause was a hard
daily cap — `generativelanguage.googleapis.com/generate_content_free_tier_requests`,
quota ID `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, **20 requests
per day** for `gemini-3.6-flash`, confirmed from the 429 body, not a
per-minute limit that re-pacing works around — combined with a loop order
that spent the entire budget inside the first arm. **Both were fixed:**
`REPS` now defaults to 1 (one rep = 18 calls = what a day actually buys),
reps are the **outermost** loop so a 429 costs precision rather than the
comparison itself, and `--out` / `--merge` accumulate raw per-call records
across days. See the header comment in `measure-grounding.js`.

Result, 2026-07-29 (`measurement/results/2026-07-29-rep1.json`), n=1 per
cell, quota exhausted on call 17 of 18:

| metric | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — rubric-term grounding | n/a (no rubric) | n/a (nothing retrieved) | **1/12 (8%)** |
| 2 — invented absent fields | 0/6 (0%) | 0/6 (0%) | 0/3 (0%) |
| 3 — differentiation gap | **+1.50** | **+2.50** | incomplete (n=0 MediSync) |

**Read these with the four caveats below before quoting any of them.**

**(a) `sdd-semantic` is not a distinct condition — it is a null-condition
replicate of `baseline`.** Semantic rubric retrieval returned **0 rows** for
both startups (`retrieved: []` in the results file), exactly as Step A
predicted, so `renderRubricBlock([])` produced an empty string — and
`baseline`, which retrieves nothing by construction, produced the same empty
string. **The two arms sent byte-identical prompts.** This is a direct
consequence of Step A's 0/12 finding and it means the harness currently runs
*two* conditions (corpus off / deterministic corpus) plus one accidental
control, not three conditions.

**(b) That control measured the noise floor, which is large.** Same prompt,
same `temperature: 0`, two independent samples: **8 of the 12 per-dimension
levels differed**, and the differentiation gap moved **+1.50 → +2.50**.

| | baseline | sdd-semantic (identical prompt) |
|---|---|---|
| AgroLink | T3 M3 A3 O3 R1 I1 | T2 M3 A2 O2 R1 I1 |
| MediSync | T5 M4 A5 O4 R2 I3 | T6 M5 A6 O4 R2 I3 |

So **±1.0 gap points is run-to-run variance at n=1** on this model.
`gemini-3.6-flash` is thinking-enabled and does not sample deterministically
at `temperature: 0` (already noted under Caveats, now quantified). **No
corpus effect smaller than about one gap point is detectable at this N** —
which is the strongest single reason to keep accumulating reps rather than
acting on the table above.

**(c) Metric 2 is saturated and cannot move.** 0 invented across every arm
and every call (0/15 absent fields), with 15/15 present fields recalled.
This reproduces the 2026-07-27 model comparison exactly, which also found
0/9 and 9/9 on both models. `groundPrompt()`'s "return null if uncertain"
instruction already handles this probe completely, so **there is no headroom
for the corpus to demonstrate an improvement.** A null result here is
evidence about the probe, not about the corpus. A harder probe — longer
documents, plausible-looking distractors, fields that are *partially*
supported — is needed before Objective 1's headline claim can be tested at
all.

**(d) Metric 1's 8% is mostly a measurement artifact, and inspection says
so.** Of AgroLink's 6 dimensions under `deviation-deterministic`, all 6
missed — yet the generated text is substantively on-target. For Technology,
with `TRL 2`/`TRL 3` verbatim in the prompt and `keyTerms: ["concept
formulated", "speculative application", "architecture sketch", "no
experimental proof"]`, the model wrote:

> "Tested a paper prototype of the lot-aggregation flow with 3 cooperatives
> in September 2025. Needs to move beyond paper testing to build and
> physically…"

That is a correct TRL-2/3 characterization that reuses none of the rubric's
vocabulary. The RNA prompt explicitly demands "Be specific and grounded
strictly in the provided data", which **structurally conflicts** with
echoing abstract rubric phrasing. The exact-substring caveat below was
already stated as a risk; this run shows it is the *dominant* case, not an
edge case. **Metric 1 measures vocabulary reuse, and on this corpus
vocabulary reuse is near zero even when the rubric is verbatim in the
prompt.** Treat it as a traceability signal that is currently failing to
trace, not as a grounding score.

**Still missing: `deviation-deterministic` / MediSync (levels +
hallucination probe), 2 calls.** That is why metric 3's headline arm reads
`n/a`. Next quota window, run another full rep and merge:

```bash
node measurement/measure-grounding.js --reps=1 --out=measurement/results/<date>-rep2.json
node measurement/measure-grounding.js --merge measurement/results/*.json
```

**Do not read Step A's failures as "therefore deterministic improves
grounding."** Step A establishes that neither the code's substitute nor
SDD §3.2's actual mechanism can retrieve this rubric corpus. Step B has now
run once, and it does **not** yet show the shipped deviation moving either
the unsupported-claim rate (saturated, (c)) or the differentiation gap
(incomplete, and below the noise floor measured in (b)). Objective 1's
headline claim remains untested in both directions.

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
- **Metric 1 (rubric-term grounding) measures whether retrieval reached the
  output, not whether the output is correct.** A generated RNA can contain a
  `keyTerm` while still describing the wrong readiness level, or omit every
  `keyTerm` while being an accurate paraphrase. It is a grounding-traceability
  signal, not a correctness score — by design, so it can't be gamed by
  fluent paraphrase.
- **`keyTerms` are exact-substring matched, case-insensitive.** A model that
  paraphrases a rubric concept instead of reusing its wording (e.g. "no
  working prototype" for `keyTerms: ["no prototype"]`) is not credited. That
  under-counts grounding rather than over-counting it, which is the safer
  direction for a metric meant to catch fabrication.
- **Metric 1's denominator excludes a dimension the model dropped entirely.**
  If an RNA-generation response omits a `readiness_level_type` the prompt
  asked for, that dimension is skipped rather than scored as a grounding
  failure — a missing field is a schema-compliance problem, not evidence the
  model ignored the rubric it was given. Schema compliance is not measured
  by this script; check `n=` for a low denominator as a sign it's happening.
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
