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

This is the only one of the three that decides a value used in production, so
re-run it if the embedding model changes.

## Reading the output

The trustworthy signal is the **gap and its direction**, not the absolute
levels — there is no expert ground truth here. A negative gap means the model
ranked the mid-stage venture *below* the early-stage one, which is what
`gemini-2.5-flash-lite` did.

Both scripts use `temperature: 0` and the verbatim `AI_GROUNDING_INSTRUCTION`
from `ai.service.ts`, so the only variable is the model.

## Caveats

- Small N by design (3 repetitions) — free-tier quota is the constraint and
  429 is the failure mode. Both scripts stop cleanly on quota exhaustion and
  report partial results; check the `n=` counts before comparing cells.
- The prompts mirror the production *shape* but are not `createBasePrompt`,
  so RAG context and startup history are absent.
- Thinking-enabled models still vary run to run at `temperature: 0`.

If you re-run these for the paper, raise `REPS`, record the date and the model
IDs actually returned by the API that day, and re-check the model list first —
`gemini-2.5-flash` disappeared between the checklist being written and the
measurement being taken.
