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

### Quota-free paths

- `pnpm test:measurement` — `node --test measurement/tests/*.test.js`, 64 tests,
  no network at all. Every scorer and prompt builder runs as a pure function.
- `--dry-run` and `--fingerprint` — no generation calls. `--dry-run` still calls
  `embedContent` for the `sdd-semantic` arm, a separate and far higher ceiling.
- `--retrieval-only` — no generation calls; Step A only.

`--dry-run` exists because unit tests cannot tell you whether an assembled
prompt *looks* right, and this harness has twice measured a property of the
prompt rather than of the model (see the confounds below).

### `--merge`

Re-runs the report over the concatenated raw per-call records, so N days of one
rep is arithmetically identical to one N-rep run. It refuses to merge files
whose model, embedding model, corpus size, similarity floor **or probe design**
differ, rather than averaging two different experiments.

The glob works on any shell, including PowerShell. Neither PowerShell nor a
plain `child_process` spawn expands globs — only a POSIX shell does. So any
`--merge` argument containing `* ? [ ] { }` is expanded internally with Node
22's `fs.globSync` instead.

- Explicit file lists are never glob-expanded, so a typo surfaces as a plain
  "file not found" rather than as "no matches".
- A glob matching nothing, or a bare `--merge`, is a hard error (exit 1) rather
  than falling through to a live 12-call run.

### Why probe design is fingerprinted

Both confounds below changed what a "rep" measures without changing its shape.
A model-and-corpus check alone would pool a pre-fix levels probe — which leaked
the answer to the deterministic arm — with a post-fix one asking a different
question.

`lib/fingerprint.js`'s `fingerprintMap` hashes **per (metric, arm)**, not once
per metric: the grounding instruction, the dimension list, each startup's
document/levels/field lists, the arm's rubric mode, and its rubric *scope*
(`'full-ladder'` / `'current-and-next'` / `'none'`).

It does not stop at the top-level builder's source text. `.toString()` omits the
body of anything a function calls, and `rnaPrompt` and `levelsPrompt` both
delegate to helpers — so a helper change would move zero fingerprints while
changing every affected prompt. Each metric hashes the helpers that reach it:

- **`levels`** — `levelsPrompt`, `renderRubricBlock` and `fullLadderRubrics`
  sources, the rubric scope, and for corpus arms a content hash of the full
  `RUBRICS` corpus (per-row title/content/keyTerms/key/readinessType/level, not
  the row *count*, which a same-length edit leaves unchanged).
- **`rna`** — `rnaPrompt`, `readinessLevelBlock` (every arm gets this block, not
  only corpus arms — see confound 1) and `renderRubricBlock` sources, the rubric
  scope, the stage-marker lexicon, and the same corpus hash.
- **`fabrication`** — the hallucination prompt's source and the field lists.

Per-arm granularity matters because a rubric-scope change alters what a corpus
arm receives while leaving `baseline` untouched. One hash per metric would
discard `baseline`'s still-valid data along with the arm that changed. The
corpus-content hash is likewise folded in only for arms with `ragCorpus: true`.

`--fingerprint` prints what a run today would stamp — a 9-entry map (3 probes ×
3 arms) — so you can check an existing results file is mergeable for free.

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
that spent the entire budget inside the first arm. **Both were addressed:**
`REPS` defaults to 1 (one rep is what a day's quota buys, whatever a rep
currently costs — see below), reps are the **outermost** loop so a 429
costs precision rather than the comparison itself, and `--out` / `--merge`
accumulate raw per-call records across days. See the header comment in
`measure-grounding.js`.

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

A full rep is **2 calls per (arm, startup, probe)**. With five arms and two
startups that is 20 calls — a whole day's cap — so full reps are no longer the
normal way to run this. Use `--only-arm=` and `--only-probe=` to buy the cell
you actually need; see below.

### Result, 2026-08-05 — the reference was broken; corrected, and the direction reverses

**Read this before any result section below it.** Every "Result" section that
follows scored metric 1 against the seeded `StartupReadinessLevel` rows. Those
were demo fixtures written for the UI and never checked against the documents the
model is shown — and they are contradicted by those documents in **ten of twelve
cells**. Seeded Market 4 requires *"no prospect has yet indicated a specific
willingness to pay"* beside a document stating PHP 5,000 monthly recurring
revenue; seeded Organizational 4 requires a *"first full-time hire beyond the
founders"* beside *"team grew to 3 founders"*; seeded Investment 3 requires a
written funding plan beside a document mentioning no funding activity at all.

`lib/metrics.js` justified that reference as *"independent of the prompt"*. True,
and a sound fix for a real problem — a rubric-similarity metric would just reward
parroting. But independence and correctness are different properties, and only
the first was ever secured.

The reference is now derived per cell from the documents
(`data/ground-truth-adjudication.md`, single source `src/demo-readiness-levels.ts`).
Re-running the three arms against it, n=3, 36 balanced observations per arm,
levels probe, 18/18 calls
(`results/2026-08-05-corrected-reference.json`):

| arm | MAE | exact | within 1 rung |
|---|---|---|---|
| `baseline` | 0.69 | 20/36 (56%) | 29/36 |
| `sdd-semantic` *(null control)* | 0.94 | 15/36 (42%) | 28/36 |
| `deviation-deterministic` | **0.22** | **28/36 (78%)** | **36/36** |

The byte-identical control pair differs by 0.25 MAE and **1** on `within1`, so the
corpus arm's margins over baseline — 0.47 MAE and **7** on `within1` — sit
outside the noise floor. Mean signed error shows the mechanism: the corpus arm is
*exactly* right on Organizational, Regulatory and Investment across all 36
observations (0.00 / 0.00 / 0.00) while `baseline` inflates them by +1.67 / +0.67
/ +1.17 and `sdd-semantic` by +1.33 / +0.83 / +1.83.

The corpus arm's whole residual is Technology and Market on MediSync, where it
places `T7 M6` on all three reps — exactly the *permissive* reading of those two
cells. Scored against permissive instead of strict: corpus **0.19**, baseline
0.94. The direction survives either reading.

**The claim that needs no reference at all.** Three rungs require an artifact class
neither document mentions anywhere — ORL 3+ a non-founder contributor, RRL 3+
counsel engaged, IRL 3+ a written funding plan — so any placement above them
asserts evidence that does not exist, whatever the true level is. `verifyAbsences`
in `audit-ground-truth.js` asserts those absences at run time rather than trusting
the list, and the ceilings are one rung more generous than the documents support,
making these lower bounds: `baseline` 11/18 (**61%**), `sdd-semantic` 10/18,
`deviation-deterministic` **0/18 (0%)**, titles 1/18, bare 1/18. This is an
unsupported-claim rate measured directly against the source document, and it is
the figure to quote, because it survives the reference being contested.

**What this does and does not change below.**

- The **negative conclusion is withdrawn.** Three reps agreeing in direction was
  not evidence — they agreed because the reference was consistently wrong.
- The **volume ladder result stands in direction**: stripping the rubric bodies
  still sends MediSync to TRL 9 on every rep, so the bodies are load-bearing
  restraint. Its magnitudes are scored against the broken reference.
- The **O/R/I rubric recalibration those sections prescribe is cancelled**, not
  deferred. It existed to make the corpus reproduce the seeded levels; those
  levels were the error, and O/R/I is now exactly right.
- **Pooling:** levels sit inside `common`, so every fingerprint changed and the
  pre-correction runs are a closed set. Verified rather than assumed — `--merge`
  refuses the new file on all 15 (metric, arm) pairs. `audit-ground-truth.js`'s
  `SEEDED` stays frozen at the old values, with a test asserting it does not track
  the harness, because that is what the historical runs were scored against.

**Scope limit, unchanged and still the one to quote.** This is the *levels* probe,
a harness construct. Production does not ask the model to assign readiness levels
— mentors set them. So this is a positive result for Objective 1b's *assessment*
claim and says nothing about RNA generation quality, where metric 2 has never
produced a signal on any arm. Metric 3 remains unresolvable: baseline 1.94,
control 2.56, corpus 1.56, and the control pair's own spread (0.62) exceeds the
corpus arm's deficit against baseline (0.38).

### Result, 2026-08-04 — n=3 complete, and the volume hypothesis is refuted

Three files: `2026-08-04-rep3-refill.json` (2 calls, filling the cell a 503 cost
on 2026-08-03), `2026-08-04-titles-arm.json` (12 calls), `2026-08-04-bare-arm.json`
(6 calls). 20/20 of the day's quota.

**All five arms, n=3, pooled** — merge the six post-redesign files:

| arm | levels block | MAE | exact | within1 |
|---|---|---|---|---|
| `baseline` | *none* | **0.78** | 44% | **30/36** |
| `sdd-semantic` *(control — see below)* | *none* | 0.42 | 64% | 34/36 |
| `deviation-deterministic` | 31,850 ch | 1.36 | 33% | 13/36 |
| `deviation-titles` | 12,552 ch | 1.69 | 25% | 15/36 |
| `deviation-bare` | 4,002 ch | 1.78 | 25% | 12/36 |

**The recorded hypothesis is dead.** Since 2026-07-30 this file and
`TODO_CHECKLIST.md` have carried: *"the levels probe hands corpus arms all 54
rubric rows and that volume destabilises placement."* Two new arms test it as a
ladder — `deviation-titles` drops each row's body, `deviation-bare` drops the
provenance suffix too — holding level coverage fixed so exact placement stays
reachable and the true level is still never leaked.

An **87% cut in block size changes nothing** in aggregate. All three corpus arms
sit in a band (MAE 1.36–1.78, within1 12–15/36) far below an arm given no rubric
at all. Volume does not explain the net damage.

**But the per-dimension breakdown shows two different effects, responding to
volume in opposite ways.** Mean *signed* error, + meaning placed too high:

| arm | Tech | Mark | Acce | Orga | Regu | Inve |
|---|---|---|---|---|---|---|
| `baseline` | +0.50 | +0.67 | +2.00 | **+0.67** | −0.17 | **+0.67** |
| `sdd-semantic` | 0.00 | +0.17 | +1.33 | +0.50 | −0.33 | +0.17 |
| `deviation-deterministic` | +1.00 | +1.83 | +2.17 | **−1.17** | −1.00 | **−1.00** |
| `deviation-titles` | +2.50 | +1.50 | +3.00 | **−1.17** | −0.33 | **−1.00** |
| `deviation-bare` | +2.50 | +2.00 | +3.00 | **−1.17** | −0.33 | **−1.00** |

1. **Organizational and Investment are volume-invariant.** Every corpus arm sits
   at −1.17 and −1.00 — identical to two decimals across the whole 87% cut —
   while baseline places both *too high* at +0.67. The corpus flips the sign,
   and the size of the flip does not care how much text is sent. That is the
   signature of **rubric calibration**: those rungs demand more evidence than
   the model's unaided prior. It is correctable in the corpus rows, per
   dimension, and it is where the next work belongs.
2. **Technology and Acceptance move the other way and *do* track volume**:
   +1.00 → +2.50 and +2.17 → +3.00 as bodies are stripped. Removing text made
   over-placement **worse**. A bare title — *"TRL 5 — Technology validated in
   relevant environment"* — is an aspirational label with no criteria attached,
   so the model assigns it freely; the body was the thing restraining it.

So the honest statement is narrower than "volume destabilises placement" and
narrower than "volume is irrelevant". Volume does not drive the net error, and
cutting it is actively harmful on the dimensions where the body text was doing
the constraining. The dominant, volume-insensitive term is per-dimension rubric
calibration.

**Why trimming *levels* would have been the wrong experiment.** Cutting to
anchor rungs (1/5/9) would shrink the block far more — and remove the correct
answer for any startup at level 2, 3 or 4. Placement would degrade for a reason
unrelated to the hypothesis. Both new arms keep all 54 keys for exactly this
reason.

**What still cannot be concluded, and why.** `baseline` and `sdd-semantic` send
**byte-identical** prompts (semantic retrieval returns nothing: 0/12 rubric,
0/2 profile). Their spread is therefore pure sampling noise — and `sdd-semantic`
"beats" `baseline` in **all three reps**, by 0.25–0.42 MAE. So *a consistent
direction across three reps is not evidence of an effect here*: the null pair
does it too, at a similar magnitude. Any argument of the form "the corpus arm
lost 3/3, therefore it is real" is refuted by this study's own control.

What survives that objection is `within1`, where the control pair differs by
0, −2, −2 while the corpus arms differ from baseline by −7, −6, −4 — two to
three times larger, every rep, non-overlapping. The corpus arms are not slightly
miscalibrated; they miss by more than one level in roughly two thirds of
placements against baseline's one sixth. MAE understates this because the
ungrounded arms accumulate many small errors while the corpus arms make fewer,
much larger ones.

**Scope limit, stated plainly.** This is the *levels* probe, a harness
construct. Production does not ask the model to assign readiness levels this
way — mentors set them.

⚠ **Superseded — see "Result, 2026-08-05" above.** The "direct negative result"
this section reported is withdrawn: every figure in it is scored against the
seeded reference, which the documents contradict in ten of twelve cells. Against
a document-derived reference the direction reverses. The section is kept because
its volume ladder still holds in direction and because the retraction is part of
the record.

**Two data artifacts, recorded rather than hidden:** the refill re-ran the RNA
probe for a cell that already had one, so `deviation-deterministic` reports 42
RNA observations against 36 elsewhere (harmless — metric 2 is 0% universally and
metrics 1 and 3 read `levelCalls` only); and `deviation-bare` has **no** metric-2
data at all, because it was run `--only-probe=levels` deliberately.

### `--only-probe=` — added 2026-08-04

Metric 2 has been saturated at 0% on every arm since the 2026-07-30 redesign, so
half of every rep bought nothing. `--only-probe=rna|levels` narrows which probes
run, halving the cost of the only metric that discriminates. The bare arm cost
**6 calls where it would have cost 12** — which is the only reason a third point
on the volume ladder fit inside the day's cap.

Exact names only, no prefix matching: there are two fixed values, so a prefix
would buy nothing and could select the wrong one. An unrecognised name errors
rather than being dropped — silently running fewer probes than asked for looks
identical to a quota hit in the output.

The wiring test asserts the call is **suppressed**, not filtered afterwards: an
option that issued both calls and discarded one would leave every reporting test
green while buying nothing.

**Ambiguous `--only-arm` prefixes now error.** Adding `deviation-titles` made
`--only-arm=deviation` match two arms, which would have silently run both and
doubled the spend against a 20/day cap. Over-selection is as costly here as
under-selection: the filter now refuses and names the candidates. An exact name
always wins, so one arm's name prefixing another's never makes it unselectable.

### Result, 2026-08-03 evening — rep 3, partial; metric 3 declared unresolvable

`measurement/results/2026-08-03-rep3.json`. 11 of 12 calls landed. The twelfth
failed on a **503 "high demand" — not a quota 429** — and it failed on the one
cell that carries the finding: `deviation-deterministic / MediSync / levels`.

**Two conclusions, and the second is the more useful one.**

**1. Metric 1 separates the arms; metric 3 does not, and probably cannot at any
N reachable on this quota.** `baseline` and `sdd-semantic` send byte-identical
prompts, so every gap reading they produce is one draw from the same
distribution. Six such draws now exist — 2.83, 1.67, 3.33 (baseline) and 2.33,
1.83, 1.83 (sdd) — spanning **1.67 to 3.33, a spread of 1.66 gap points.** The
corpus arm's pooled deficit is −1.19. **The deficit is smaller than the control
arms' own spread**, so metric 3 cannot resolve it. The 2026-07-29 "±1.0 noise
floor" was an underestimate, and the n=2 section below quoting a 0.17 control
spread was a small-sample artifact — it grew to 0.61 with one more rep, which is
exactly what a single paired difference of two means was warned not to support.

Metric 1 behaves the opposite way. Per-rep MAE: baseline 0.67 / 0.75 / 0.92,
sdd 0.42 / 0.33 / 0.50, deviation 1.50 / 1.33 / (rep 3 incomplete). The
deviation readings sit outside the baseline range and the ranges do not overlap.
**Report metric 1; treat metric 3 as unresolved and say why.**

**2. The AgroLink half of the reproducibility finding now holds three times.**
Corpus-arm deltas on AgroLink: `+0 +2 +3 +0 +0 +0`, `+0 +2 +2 +0 +0 +0`,
`+0 +1 +2 +0 +0 +0` — Market and Acceptance pushed up, the other four exact,
three reps running. The MediSync half (the −2 collapse on O/R/I) still rests on
two observations, because rep 3 is precisely the one that 503'd.

**The missing cell biases the pooled numbers in the corpus arm's favour, so do
not quote the n=3 pooled MAE.** Adding rep 3 moved deviation's pooled MAE from
1.42 to **1.23** — not because the arm improved, but because rep 3 contributed
6 AgroLink calls (its low-error startup) and 0 MediSync calls (where all of its
error is). Deviation's pool is now 18 AgroLink / 12 MediSync against baseline's
18 / 18. **The balanced n=2 figure below is the like-for-like comparison.**
Metric 3 is barely affected by the same imbalance (deviation's AgroLink mean
moves 2.25 → 2.17, shifting the gap by 0.09), but metric 3 is unresolvable
anyway.

**Next:** one run to fill the missing `deviation / MediSync / levels` cell —
now **2 calls rather than a 12-call rep**, see below.

### Cell filtering and 503 retry — added 2026-08-03 in response to the above

Two harness gaps the partial rep exposed, both now closed (26 new tests, all
four guards mutation-verified):

**`--only-arm=` / `--only-startup=`** narrow which cells run. Case-insensitive
prefix match, comma-separated for several, so the space in `MediSync Cebu`
never needs quoting:

```bash
node measurement/measure-grounding.js --only-arm=deviation \
  --only-startup=MediSync --out=measurement/results/<date>-refill.json
```

A filter matching nothing **hard-errors before any network call** and lists the
real names, rather than falling through to the full 12-call run — the same
reasoning as `validateArgs`' refusal to fall through on an empty `--merge`.
Unselected arms still get an empty results entry, so reports and `--merge` stay
well-formed.

**A filtered file is a partial rep.** Its own tables show n=0 for everything
unselected; `--merge` it with a full run rather than reading it alone.

**Transient 503s are now retried** — 3 attempts at 15s then 30s. A 503 is the
model being busy; a **429 is never retried**, because the daily cap does not
reopen for ~24h and a retry loop would only burn wall-clock to earn another
429. That separation is the whole point, and it is the one guard that needed a
dedicated test: a plain 429 body contains neither `503` nor `UNAVAILABLE`, so
removing the quota check passed every other test. The test that pins it uses a
body naming both.

### Result, 2026-08-03 — second rep, n=2 pooled

`measurement/results/2026-08-03-rep2.json`, all 12 calls, no quota hit on the
generation endpoint. Pooled with the 2026-07-30 rep below via
`--merge`; all nine (metric, arm) fingerprint groups matched, so both reps
pool. **n=2.**

| metric (direction) | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — level-placement MAE (lower better) | 0.71 | 0.38 | **1.42** |
| 1 — exact placements | 11/24 | 16/24 | 8/24 |
| 1 — within one rung | 21/24 | 23/24 | **8/24** |
| 2 — stage-inappropriate rate (lower better) | 0% | 0% | 0% |
| 3 — differentiation gap (higher better) | 2.25 | 2.08 | **1.33** |

**The headline change is not the pooled means — it is that the corpus arm's
error turned out to be reproducible.** Per-dimension signed deltas against
seeded truth, both reps:

| MediSync (truth) | T5 | M4 | A3 | O4 | R3 | I3 |
|---|---|---|---|---|---|---|
| deterministic, rep 1 | +2 | +2 | +2 | −3 | −2 | −2 |
| deterministic, rep 2 | +2 | +2 | +2 | −2 | −2 | −2 |
| baseline, rep 1 | +1 | +1 | +3 | 0 | 0 | +1 |
| baseline, rep 2 | 0 | 0 | +2 | 0 | −1 | +1 |

The corpus arm returns nearly the same wrong placement twice; `baseline` moves
around more between reps than the corpus arm does. **So the working hypothesis
recorded below — that 54 rubric rows *destabilise* placement — is not what the
data shows, and is retracted.** The corpus arm is, if anything, the *more*
stable of the two. What it does is **displace placement systematically**:
on the mid-stage startup, +2 on Technology/Market/Acceptance and −2 on
Organizational/Regulatory/Investment, in both reps. On AgroLink the same upward
push appears on Market (+2.0) and Acceptance (+2.5) while the other four sit
exact — the bottom three are already at level 1 and cannot collapse further, so
the downward half of the pattern is only observable on MediSync.

That distinction matters because the two defects have different fixes.
Instability would be a prompt-volume problem. A reproducible per-dimension
displacement points at the **rubric text's own calibration**: the rungs for
O/R/I appear to demand more evidence than the model's unaided prior, and those
for T/M/A less. That is measurable per dimension and correctable in the corpus
rows, and it is a live hypothesis rather than a demonstrated cause.

**The `within one rung` row is the sharpest single number here.** Baseline
lands within one rung 21/24 times; the corpus arm 8/24 — and its exact count is
also 8, so **every non-exact corpus placement is off by more than one rung.**
The error is large-grained, not a drift.

**Separate finding, not a corpus effect: every arm overshoots Acceptance.**
Pooled mean signed delta on Acceptance is +1.0 to +2.5 for *all three* arms on
*both* startups — including the two that receive no rubric text at all. Since it
is present in the controls it cannot be attributed to the corpus, and because it
lands on every arm roughly equally it inflates all three MAEs without biasing
the between-arm contrast. The likeliest explanations are the seeded Acceptance
ground truth being set too low, or the seeded documents carrying more adoption
evidence than their assigned ARL rung implies. Worth checking against
`seed-demo-full.js` before the Acceptance ground truth is used for anything
else.

**Metrics 1 and 3 are still one finding read two ways, not two.** Both derive
from the same `levelCalls` array; the displacement pattern above mechanically
raises MAE *and* compresses the early-vs-mid gap (it lifts AgroLink's Market and
Acceptance while lowering MediSync's O/R/I). Do not present them as
corroborating each other.

**Noise floor at n=2.** `baseline` vs `sdd-semantic` remains the control — the
two send byte-identical prompts, re-verified this rep by diffing the assembled
prompts from `--dry-run` (identical, same md5). Their pooled spread is 0.33 MAE
and 0.17 gap points. Note this is still a single paired difference of two means,
not a variance estimate; it does not license an "N× the noise" multiplier. Note
also that `sdd-semantic` scored better than `baseline` on metric 1 in *both*
reps — with byte-identical prompts that is a coin flip landing the same way
twice, and it is a useful reminder of how little a consistent direction proves
at n=2.

**Still not established.** Whether the corpus helps or harms *in production*.
Every number here comes from the levels probe, which hands corpus arms all 54
rubric rows; production's RNA path retrieves 12 (current rung + next). The
displacement is a property of the corpus text as read under the probe's
conditions. A third rep is still worth running for metric 3, whose per-arm
rep-to-rep swing (baseline 2.83 → 1.67) remains comparable to the effect.

### Result, 2026-07-30 — the first clean rep

*Pooled into the n=2 result above; kept for the per-rep detail.*

`measurement/results/2026-07-30-redesign-rep1.json`. All 12 calls completed,
no quota hit. **This is the first rep in which the arms differ only by the
rubric text** — every prior run compared "told its levels" against "not told".
n=1 throughout.

| metric (direction) | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — level-placement MAE (lower better) | 0.67 | 0.42 | **1.50** |
| 1 — exact placements | 6/12 | 8/12 | 4/12 |
| 2 — stage-inappropriate rate (lower better) | 0% | 0% | 0% |
| 3 — differentiation gap (higher better) | 2.83 | 2.33 | **1.17** |

**Read `baseline` vs `sdd-semantic` as a noise measurement, not a comparison.**
Semantic retrieval returns nothing against this corpus, so those two arms send
byte-identical prompts. Their spread is therefore pure run-to-run variance at
`temperature: 0`, and it calibrates everything else in the table: **0.25 MAE on
metric 1, 0.50 gap points on metric 3** in this rep.

**The corpus arm did worse on both scored metrics, and both readings sit
outside the noise measured above — but metrics 1 and 3 are not independent
evidence of that, and this rep should not be read as if they were.**
Deterministic is +0.83 MAE above baseline and −1.66 gap points below it
(the latter also outside the ±1.0 floor measured on 2026-07-29). Both numbers,
though, are two different summaries of the *same* twelve `levelCalls` values —
metric 1 is the mean absolute distance of those assignments from the seeded
truth, metric 3 is (MediSync's mean of those same assignments) minus
(AgroLink's). Concretely: this rep's deterministic arm overshoots three of
MediSync's dimensions and collapses the other three to level 1 (see the table
below) — those same twelve numbers are mechanically what both raises MAE and
shrinks the gap. So this is one internally-consistent pattern of unusual
placements, read two ways, not two separate lines of evidence that happen to
agree. The "~3×" comparison to the metric-1 noise floor in an earlier version
of this section also overstated what a single paired difference can say:
0.25 MAE between two byte-identical-prompt arms is one number, not a
distribution, and it does not by itself establish how variable that noise
actually is. At n=1, the honest statement is that the corpus arm's placements
look unusual in this one rep — not that two independent metrics corroborate
each other.

The per-dimension assignments show why, and the failure is **not** uniform
inflation:

| MediSync (truth) | T5 | M4 | A3 | O4 | R3 | I3 |
|---|---|---|---|---|---|---|
| baseline | 6 | 5 | 6 | 4 | 3 | 4 |
| deterministic | 7 | 6 | 5 | **1** | **1** | **1** |

The deterministic arm overshoots on three dimensions and collapses the other
three to level 1. ~~Working hypothesis: the levels probe hands corpus arms all
54 rubric rows, and that volume destabilises placement rather than grounding
it.~~ **Retracted by the second rep** — the corpus arm reproduced this pattern
almost exactly, and reproducibility is the opposite of destabilisation. See the
n=2 section above. The probe-vs-production caveat still stands: this is a
property of the measurement instrument's confound-2 fix, and production's levels
never come from this probe.

This also demonstrates why metric 1 uses absolute error. MediSync's
deterministic deltas are `+2 +2 +2 −3 −2 −2`: a signed mean of **−0.17**, which
would have read as near-perfect, against a true MAE of **2.17**.

**Metric 2 saturated at 0% on every arm, and that is a finding.** The probe is
live — injecting `"Move to full market launch and prepare an IPO."` at
AgroLink's Technology level 2 correctly flags both `ipo` and
`full market launch` — so 0/12 means the model genuinely made no
stage-inappropriate recommendations anywhere. Since fixing confound 1 gives
**all three arms** the `Initial Readiness Level` block, the most economical
reading is that **the levels block, not the rubric corpus, is what keeps
recommendations stage-appropriate.** Isolating that needs the
`baseline-no-levels` fourth arm the spec holds in reserve; it is not
demonstrated here.

**What this rep does not establish.** n=1. It does not show the corpus is
harmful — one rep cannot, and the differentiation baseline to beat (+2.28) was
itself measured across 3 reps. It shows the instrument is now clean and that
the first clean reading runs against the corpus rather than for it. Accumulate
two more reps and `--merge` before quoting any of this as a result.

---

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

Trust the **gap and its direction**, not the absolute levels — there is no
expert ground truth here. A negative gap means the model ranked the mid-stage
venture *below* the early-stage one, as `gemini-2.5-flash-lite` did.

Both generation scripts use `temperature: 0` and the verbatim
`AI_GROUNDING_INSTRUCTION`, so the only variable is the model.

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
  this test across three clean domains. Real capsule proposals are longer and
  messier, so this separation is an optimistic case.
- **Ground truth is domain membership, not human judgement.** Two health
  startups are assumed useful context for each other. That is coarse — the
  right answer is sometimes a same-stage startup in another sector. Neither arm
  sees the labels, which is what keeps it honest.
- **N is 9 documents / 36 pairs.** Enough to reject a threshold of 0.70; not
  enough to fine-tune between 0.78 and 0.80.
- Embeddings are deterministic here, so unlike the generation scripts a re-run
  reproduces exactly — which also means repetition buys nothing.

If you re-run these for the paper, raise `REPS`, record the date and the model
IDs actually returned by the API that day, and re-check the model list first —
`gemini-2.5-flash` disappeared between the checklist being written and the
measurement being taken.

`measure-grounding.js`:

- **Step A is free of the generation endpoint, not free outright.** It calls
  `embedContent`, which has its own ceiling (`embed_content_free_tier_requests`)
  — hit once here, independent of `generateContent`, and recovered within a
  minute. Embeddings are deterministic, so the 12/12 vs 0/12 result reproduces
  exactly; it is not a small-N number needing more reps.
- **Step B's ceiling is a hard daily cap, not `DELAY_MS`.**
  `GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20` for
  `gemini-3.6-flash`, confirmed from the 429 body. Only fresh quota or a paid
  tier helps. The window resets at **midnight US Pacific = 15:00 Philippine
  time**, so a PH-morning run draws on the *previous* window and may find it
  spent — that is why the 2026-07-29 run got 16 calls, not 18.
- **N is the binding constraint on every Step B conclusion, and the noise
  floor is now measured rather than assumed** — ±1.0 differentiation-gap
  points between two byte-identical prompts (see Step B above). Accumulate at
  least three reps with `--merge` before treating any between-arm difference
  in metric 3 as real.
- **Metric 1 replaced the old rubric-term metric**, which measured whether
  retrieval's exact wording reached the output rather than whether the output
  was correct. An RNA can contain a `keyTerm` while describing the wrong level,
  or omit every `keyTerm` and still be an accurate paraphrase. It scored 1/12
  on 2026-07-29 despite the text being substantively on-target, because the RNA
  prompt discourages echoing abstract rubric phrasing. Level-placement MAE is
  scored against seeded ground truth, which paraphrase can neither game nor
  defeat.
- **Metrics 1 and 3 exclude dimensions the model dropped.** An omitted
  `dimension` is skipped (`levelPlacement`'s `typeof assigned !== 'number'`),
  not scored as an error — a missing field is a schema problem, not a bad
  placement. This script does not measure schema compliance; watch `n=`.
- **Metric 2 word-boundary matches, case-insensitively, against the RNA text —
  not the rubric.** `isStageInappropriate` flags a dimension only when a marker
  phrase for a level well above the startup's rung appears in the
  recommendation (`\bphrase\b`, so "ipo" doesn't match inside "IPOPHL"). An
  advanced action phrased outside the lexicon goes unflagged, under-counting
  rather than over-counting.
- **Metric 2 excludes dropped dimensions too.** A missing
  `readiness_level_type` is a schema gap (`stageAppropriateness` skips it), not
  evidence the recommendation was stage-appropriate.
- **The seeded per-dimension levels are real, not approximated** — from
  `seedDemoStartups` (AgroLink T2/M2/A1/O2/R1/I1, MediSync T5/M4/A3/O4/R3/I3).
  The documents are `measure-differentiation.js`'s verbatim early/mid pair.
- **The `semantic` mode's Step B query is startup-invariant.** With every
  dimension missing (the normal case for a fresh startup), `retrieveRubrics`
  queries `dimensions.map(d => d.readinessType).join(' ')` — the same six-word
  string whatever the startup or level. AgroLink and MediSync therefore receive
  an *identical* rubric set in that arm. That is production code's property,
  not a harness artifact, and a second independent reason this substitute
  cannot deliver a level-appropriate rubric. Still the code's substitute, not
  SDD §3.2's mechanism.
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
