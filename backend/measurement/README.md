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
