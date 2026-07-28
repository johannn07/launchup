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
node measurement/measure-grounding.js                  # full harness
node measurement/measure-grounding.js --retrieval-only  # Step A only, no generation quota spent
```

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
| sdd-semantic | `true` | `semantic` | does the SDD §3.2's specified mechanism deliver the rubric? |
| deviation-deterministic | `true` | `deterministic` | is the shipped deviation justified? |

Two steps, run in that order because quota is the binding constraint:

**Step A — rubric-retrieval accuracy (quota-free of the generation endpoint,
full N, reproduces exactly).** For each of the 2 seeded startups × 6
dimensions (12 queries), both rubric modes retrieve against the 54-row
corpus and are checked against `rubricKey(type, level)` as ground truth —
whether the returned rubric's `readinessType` matches the dimension actually
asked for. Result, 2026-07-28:

| mode | queries | correct dimension | wrong dimension | empty |
|---|---|---|---|---|
| deterministic | 12 | 12 | 0 | 0 |
| semantic | 12 | 0 | 0 | **12** |

Deterministic is 12/12 by construction — it is an exact `(type, level)` key
lookup, it cannot retrieve the wrong dimension. **Semantic returned nothing
for every single query.** `RagQueryService.retrieveRubrics`'s semantic path
embeds only the bare dimension name (`dimensions.map(d => d.readinessType)
.join(' ')` — for a single missing dimension that degenerates to the string
`"Technology"`, `"Regulatory"`, etc.) and compares it against corpus rows
whose title and content use the SDD's abbreviations (`TRL 3 —
…`, `RRL 1 — …`) rather than the enum's human-readable names. Every one of
the 12 top-2 nearest-neighbour scores fell below the 0.78 floor. **This
settles the SDD deviation before any generation quota was spent**: the
SDD-specified mechanism does not deliver the rubric it was designed to
retrieve, for this corpus and this query shape — not "retrieves a worse
rubric," but "retrieves nothing, every time."

**Step B — the three generation arms (metrics 1-3): blocked, n=0.** The
harness attempted 2 startups × 6 dimensions × 3 reps × 3 arms (up to 54
`gemini-3.6-flash` calls — RNA text, a 1-9 level assessment, and the
absent-field hallucination probe, per cell) and is built to stop cleanly on a
429 and report whatever completed. What actually stopped it, on every
attempt on 2026-07-28, was `generativelanguage.googleapis.com
/generate_content_free_tier_requests`, quota ID
`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, **limit 20 requests per
day** for `gemini-3.6-flash` — a hard daily cap, confirmed from the 429
response body, not a per-minute rate limit that re-pacing works around. One
run got 7 calls in before hitting it; two subsequent attempts (including one
with the delay widened to 9s) 429'd on the very first call, because the
day's 20-request budget was already exhausted by then. **Metrics 1-3 were
not measured** — every cell is n=0. This is reported as a real result, not
elided: the differentiation baseline (+2.28 on `gemini-3.6-flash`,
`measure-differentiation.js`) was itself measured on a different day's
quota, and 54 calls to this specific model is not achievable inside one
free-tier day. Re-run when a fresh daily window is available — ideally
spread across more than one day, or with `REPS` lowered — before treating
metrics 1-3 as answered either way.

**Do not read Step A's semantic failure as "therefore deterministic
improves grounding."** It only establishes that the SDD's specified
mechanism cannot be what delivers a headline result, if the shipped
deviation ever produces one. Whether the deviation itself moves the
unsupported-claim rate or the differentiation gap is exactly what Step B
was for, and Step B did not run.

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
- **Step B's blocker is a hard daily cap, not underpowered N.** `n=0` across
  every cell in metrics 1-3 is not "ran out of time" or "hit a transient rate
  limit" — it is `GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20`
  for `gemini-3.6-flash`, confirmed from the 429 body. No `DELAY_MS` value
  fixes this; only a fresh day's quota (or a paid tier) does.
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
- **The `semantic` rubric mode's Step B query is startup-invariant.** When
  every dimension is missing (`RnaService.generateRNA`'s normal case for a
  fresh startup), `retrieveRubrics`'s semantic query is
  `dimensions.map(d => d.readinessType).join(' ')` — the same six-word string
  regardless of which startup or what level it's actually at. AgroLink
  (early) and MediSync (mid) would therefore receive an *identical* retrieved
  rubric set in that arm, a structural property of the production code being
  measured, not an artifact of this harness — and a second, independent way
  the semantic mechanism cannot deliver a level-appropriate rubric, beyond
  Step A's per-dimension accuracy finding.
- **N is 2 startups.** Same ceiling every other script in this directory
  states plainly: enough to check direction, not enough to publish an effect
  size.
