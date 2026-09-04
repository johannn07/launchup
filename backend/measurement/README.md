# Model measurement harnesses

Ad-hoc scripts, originally used to decide the `GEMINI_MODEL` default, kept so
the numbers in `TODO_CHECKLIST.md` can be reproduced
rather than taken on trust. **Not** part of the test suite; not run by
`pnpm test`. They read `GEMINI_API_KEY` from `backend/.env` and call Gemini
directly — no server needed, but they **consume quota**.

```bash
node measurement/measure-models.js
node measurement/measure-differentiation.js
node measurement/calibrate-similarity.js
node measurement/measure-retrieval.js
node measurement/measure-grounding.js                   # full harness (1 rep = 12 calls, 18 with --with-fabrication-probe)
node measurement/measure-grounding.js --retrieval-only  # Step A only, no generation quota
node measurement/measure-grounding.js --dry-run         # assemble and print every arm's prompts, no model call
node measurement/measure-grounding.js --fingerprint     # print today's comparability fingerprints, no model call
node measurement/measure-grounding.js --only-arm=baseline,deviation-deterministic \
  --only-probe=rna --level-condition=both --reps=2 \
  --out=measurement/results/<date>-supplied-level.json  # metric 5 — --only-arm is mandatory here

# The summary-bias probe (SO 4.2 / SO 4.4). 2 arms x 2 startups x 3 reps = 12
# calls. Unlike the others this boots a Nest context and calls the real
# AiService.generateStartupAnalysisSummary, so it needs Neon reachable.
node measurement/measure-summary-bias.js --fingerprint            # no calls
node measurement/measure-summary-bias.js --dry-run --degrade=2 \
  --out=<scratch>/x.json                                          # no calls; --degrade forces the schema-failure
                                                                  # path. Writing into results/ is refused under --dry-run.
node measurement/measure-summary-bias.js --reps=3 \
  --out=measurement/results/<date>-summary-bias.json

# One rep is what a free-tier day buys. Accumulate across days:
node measurement/measure-grounding.js --reps=1 --out=measurement/results/2026-07-30-rep2.json
node measurement/measure-grounding.js --merge measurement/results/*.json
```

### Quota-free paths

- `pnpm test:measurement` — `node --test measurement/tests/*.test.js`, **304
  tests** (2026-09-04), no network. Every scorer and prompt builder runs as a
  pure function. Known-weak: `tests/demo-proposals.test.js` regex-matches the
  `.ts` source instead of importing `toApplicationDto`, so a `title:` inside a
  comment satisfies it and a changed *value* is undetectable.
- `--dry-run` and `--fingerprint` — no generation calls. `--dry-run` still calls
  `embedContent` for the `sdd-semantic` arm, a separate and far higher ceiling.
- `--retrieval-only` — Step A only.
- `measure-summary-bias.js --dry-run` — stubs `generateContent` and nothing
  else, so the container, both DTOs, the arm override, the loop order,
  `analyzeTone`, every report and the results file are exercised for zero quota.
  It does append to `data/ai-metrics.json` when `--degrade` forces a schema miss.

`--dry-run` exists because unit tests cannot tell you whether an assembled
prompt *looks* right, and this harness has twice measured a property of the
prompt rather than of the model (confounds 1 and 2 below).

### `--merge`

Re-runs the report over concatenated raw per-call records, so N days of one rep
is arithmetically identical to one N-rep run. It refuses to merge files whose
model, embedding model, corpus size, similarity floor **or probe design** differ.

- Globs are expanded internally with Node 22's `fs.globSync`, so they work in
  PowerShell (neither PowerShell nor a bare `child_process` spawn expands them).
- Explicit file lists are never glob-expanded, so a typo surfaces as "file not
  found" rather than "no matches".
- A glob matching nothing, or a bare `--merge`, hard-errors (exit 1) rather than
  falling through to a live 12-call run.

### Why probe design is fingerprinted

Both confounds below changed what a "rep" measures without changing its shape. A
model-and-corpus check alone would pool a pre-fix levels probe — which leaked
the answer to the deterministic arm — with a post-fix one asking a different
question.

`lib/fingerprint.js`'s `fingerprintMap` hashes **per (metric, arm)**: the
grounding instruction, the dimension list, each startup's
document/levels/field lists, the arm's rubric mode, and its rubric *scope*
(`'full-ladder'` / `'current-and-next'` / `'none'`).

It does not stop at the top-level builder's source. `.toString()` omits the body
of anything a function calls, and both prompt builders delegate to helpers — so
a helper change would move zero fingerprints while changing every affected
prompt. Each metric hashes the helpers that reach it:

- **`levels`** — `levelsPrompt`, `renderRubricBlock`, `fullLadderRubrics`, the
  rubric scope, and for corpus arms a content hash of the full `RUBRICS` corpus
  (per-row title/content/keyTerms/key/readinessType/level — not the row *count*,
  which a same-length edit leaves unchanged).
- **`rna`** — `rnaPrompt`, `readinessLevelBlock` (every arm gets this block, not
  only corpus arms — confound 1), `renderRubricBlock`, the rubric scope, the
  stage-marker lexicon, and the same corpus hash.
- **`fabrication`** — the hallucination prompt's source and the field lists.

Per-arm granularity matters because a rubric-scope change alters what a corpus
arm receives while leaving `baseline` untouched; one hash per metric would
discard `baseline`'s still-valid data. The corpus-content hash is folded in only
for arms with `ragCorpus: true`.

`--fingerprint` prints what a run today would stamp — a 9-entry map (3 probes ×
3 arms) — so an existing results file can be checked for mergeability for free.

## What each one measures

**`measure-models.js`** — one document, three probes: *leniency* (assign levels
1–9 across six dimensions), *hallucination* (ask for six fields, three
deliberately not in the document — the production grounding instruction says
return null when uncertain, so inventing a value is a measurable failure), and
*schema* (did the response parse).

**`measure-differentiation.js`** — the same assessment against an early-stage
document (AgroLink: paper prototype, zero revenue) and a mid-stage one
(MediSync: six paying facilities, PHP 5k MRR), reporting the **gap**. A model
that cannot separate those two cannot support Objective 2 however the weights
are tuned.

**`calibrate-similarity.js`** — picks `RAG_MIN_SIMILARITY`. Embeds nine startup
descriptions across three domains, compares all 36 pairs, reports what each
candidate threshold keeps and leaks. Needed because embeddings score
same-register prose high across the board: the same-domain and cross-domain
distributions **overlap**, so the floor is a trade-off, not a boundary. A first
guess of 0.70 leaked 78% of cross-domain pairs. **The only script that decides a
production value — re-run it if the embedding model changes.**

**`measure-retrieval.js`** — the Objective 1b arm comparison. Runs the two
retrieval strategies `AI_RAG_STRATEGY` selects between over the same nine
documents, using production scoring (`scoreRagMatch` verbatim for keyword;
embeddings + the 0.78 floor for semantic). A hit is correct if it shares the
query's domain. 2026-07-27:

| arm | returned | correct | precision | top hit correct | same-domain recall |
|---|---|---|---|---|---|
| keyword | 27 | 15 | 56% | 7/9 | 15/18 (83%) |
| semantic | 21 | 16 | **76%** | 8/9 | 16/18 (89%) |

The shape matters more than the headline: semantic returned **fewer** documents
and surfaced **more** correct ones, so precision was not bought with recall.
Keyword's `score > 0` floor admits anything sharing a common token, which is why
it returns a full top-3 every time regardless of relevance. Both arms miss the
same case (ClassKit Iloilo retrieves TeleKonsulta Leyte — both rural
low-connectivity public services).

**`measure-grounding.js`** — does the verified corpus (54 readiness rubrics, 10
business frameworks) reduce hallucination and improve differentiation?

| arm | `ragCorpus` | `rubricMode` | question |
|---|---|---|---|
| baseline | `false` | — | does a verified corpus help at all? |
| sdd-semantic | `true` | `semantic` | does the *code's* semantic-mode substitute deliver the rubric? |
| deviation-deterministic | `true` | `deterministic` | is the shipped deviation justified? |

Two steps, in this order because quota binds.

### Step A — rubric-retrieval accuracy (no generation quota, full N, reproduces exactly)

Two questions, and **not the same mechanism**:

1. **The code's `semantic` substitute.** For 2 startups × 6 dimensions, embed
   the bare dimension name (`"Technology"`, …) — what
   `dimensions.map(d => d.readinessType).join(' ')` degenerates to for a single
   missing dimension — and check the returned rubric's `readinessType` against
   `rubricKey(type, level)`. This is **not** SDD §3.2; it is the stand-in
   `rag-query.service.ts:126` actually runs.
2. **SDD §3.2 as written** — *"queries the vector database using the startup's
   profile data as the search embedding."* Embed each startup's own profile text
   whole and check against the union of its 12 valid
   `(dimension, current-or-next-level)` keys. The code never does this for the
   rubric channel; the query exists only here, to test the specified mechanism
   on its own terms.

Result, 2026-07-28:

| mode | queries | correct dimension | wrong dimension | empty |
|---|---|---|---|---|
| deterministic | 12 | 12 | 0 | 0 |
| code's dimension-name substitute | 12 | 0 | 0 | **12** |
| profile-data (SDD §3.2) | 2 | 0 | 0 | **2** |

Deterministic is 12/12 by construction — an exact key lookup cannot retrieve the
wrong dimension.

**The substitute returned nothing for every query.** It embeds a bare dimension
name against rows whose title and content use the SDD's abbreviations (`TRL 3 —
…`), and all 12 top-2 scores fell below the 0.78 floor. Narrow claim only: the
stand-in does not deliver the rubric it is trying to retrieve — not "retrieves a
worse rubric", but "retrieves nothing, every time."

**SDD §3.2's own mechanism is also empty, for a plausibly different reason.** A
profile is several sentences of narrative business prose; rubric rows are short,
abbreviation-heavy definitional text. Little shared vocabulary or register, so a
low score here is **structural**, not an artifact of a badly-chosen query string
the way the bare dimension name arguably was. Together: **neither SDD §3.2's
mechanism nor the code's substitute can retrieve this corpus.** That is what
settles the SDD deviation question, and it costs embedding calls only.

### Step B — the three generation arms, redesigned after two confounds

The 2026-07-28 attempts produced n=0 in every cell: a hard daily cap
(`generativelanguage.googleapis.com/generate_content_free_tier_requests`, quota
ID `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, **20 requests/day** for
`gemini-3.6-flash`, confirmed from the 429 body — not a per-minute limit
re-pacing works around) combined with a loop order that spent the whole budget
inside the first arm. Fixed: `REPS` defaults to 1, reps are the **outermost**
loop so a 429 costs precision rather than the comparison, and `--out`/`--merge`
accumulate across days.

The first full run (2026-07-29) then surfaced two non-quota problems. The
harness ran cleanly; it measured the wrong thing. Neither was fixable by more
reps.

**Confound 1 — the levels block was withheld from every arm.** Production emits
the startup's current per-dimension levels (`Initial Readiness Level: TRL … IRL
…`) into the RNA prompt for **every** arm (`ai.service.ts:937-943`); only the
rubric block varies with `ragCorpus`. The harness omitted it everywhere, so it
contrasted "told its levels" against "not told" — a difference production never
presents, and not a retrieval effect. `rnaPrompt` now emits
`readinessLevelBlock` for every arm, matching what `RnaService.generateRNA`
actually sends.

**Confound 2 — the levels probe leaked its answer to the deterministic arm.**
Deterministic retrieval keys on `(readinessType, level)` using the *actual*
level, so handing that rubric to a probe that then asks for the level was asking
the arm to read back a number it had been given. The levels probe now receives
the **full nine-rung ladder** (`fullLadderRubrics()`). The RNA probe keeps the
(L, L+1) lookup because that is what production ships — **the asymmetry is
intentional; do not tidy them into agreement.**

Fixing these forced a rewrite of metrics 1 and 2:

- **Metric 1 — level-placement accuracy**, MAE between the levels probe's
  assignment and the reference level (`lib/metrics.js`). It replaces
  "did the RNA reuse the retrieved rubric's exact vocabulary", which scored 1/12
  (8%) on 2026-07-29 while the text was substantively correct — the RNA prompt's
  own "be specific and grounded in the provided data" structurally discourages
  echoing abstract rubric phrasing. It measured vocabulary reuse, not grounding.
- **Metric 2 — stage-inappropriate recommendation rate.** SO 1.3's own worked
  example ("recommending commercialization steps to a TRL 2 startup") made
  mechanical (`lib/stage-markers.js`). It replaces the absent-field probe, which
  saturated at 0/15 and was aimed at something the corpus cannot influence
  anyway. Its lexicon (`data/stage-markers.json`) is **authored, with no
  external source** — say so whenever it is quoted — and is held disjoint from
  every corpus row's `keyTerms` by `tests/stage-markers.test.js`, so a corpus
  arm cannot score well merely by echoing rubric text.
- **Metric 3 — differentiation gap**, unchanged in definition (mid-stage mean
  minus early-stage mean on the levels probe), but the metric confound 2 leaked
  into: any 2026-07-29 gap favouring `deviation-deterministic` is untrustworthy.
- **Metric 4 — the absent-field probe**, unchanged, now opt-in behind
  `--with-fabrication-probe`. Kept as SRS §2.2 evidence ("return null for
  unverifiable fields") though it is saturated and discriminates nothing.

A full rep is **2 calls per (arm, startup, probe)** — 20 calls at five arms and
two startups, a whole day's cap. Use `--only-arm=` and `--only-probe=` to buy
the cell you need.

### `--level-condition=` and metric 5 — added 2026-08-06

Every result above is the **levels probe**, where the model infers the level.
Production never does that — mentors set levels and the RNA path consumes them.
Metric 5 measures the shipped path: does a generated RNA **assert as fact** an
artifact class the source document never mentions, when the *supplied* level is
wrong.

**Why a manipulation, not an observational run.** The 2026-08-05 level
correction moved MediSync from IRL 3 to IRL 1, removing the *trigger*
(deterministic retrieval no longer pulls the funding-plan rubric) without
touching the vulnerability. An observational run measures 0 and proves nothing.
The probe supplies `Organizational: 3, Regulatory: 3, Investment: 3` — both
startups share `O2 R1 I1`, so one override covers both — and checks whether the
resulting rubric text turns into asserted fact. T/M/A stay at the true level in
the same call, so every observation carries its own control.

**Why 3 and not 4.** `(L, L+1)` retrieval means 3 injects rows 3–4: ORL 3's
non-founder contributor under contract, RRL 3's engaged counsel, IRL 3's drafted
funding plan. IRL 3 is the literal source of the observed *"The venture has
drafted a funding plan (IRL 3)"*; at 4 that row appears in neither condition's
prompt. All three stay above `HARD_ABSENCES`' ceiling of 2, so every dimension
is scoreable, and +1/+2/+2 is a likelier mentor error than +2/+3/+3.

Reference-free: `HARD_ABSENCES` (`lib/hard-absences.js`, shared with
`audit-ground-truth.js`) names artifact classes neither document mentions, and
`verifyAbsences` asserts that absence against the documents at run time rather
than trusting the list.

```bash
node measurement/measure-grounding.js --only-arm=baseline,deviation-deterministic \
  --only-probe=rna --level-condition=both --reps=2 \
  --out=measurement/results/2026-08-06-supplied-level.json
```

**`--only-arm` is not optional here.** `ARMS` holds five; omitting the filter is
**40 calls against a 20-call cap** — the run dies mid-experiment, the failure
mode that produced n=0 on 2026-07-29.

`--level-condition=truth|inflated|both` (default `truth`). `both` issues one
extra call per (arm, startup, rep); under `truth` the inflated call is never
generated, not generated-then-discarded.

**Three reported numbers, not one:**

- `mentioned` — any absent-artifact token appeared. Upper bound.
- `asserted` — the headline: the text asserted an absent artifact as already
  true, not merely raised or recommended it. Lower bound.
- `unclassified` — clauses that mentioned an absent token but matched no
  negation/recommendation/assertion cue. **The honesty column:** if it is large,
  the classifier cannot read this output and `asserted` should not be quoted.
  Reported `x/obs`, and `n/a` at obs=0 — a bare `0` for an arm that never ran
  reads as a clean bill of health.

**Limitation.** Detection is token-based (`artifactTokens`, the narrow list; the
broad `absentTokens` stays with `verifyAbsences`) and cue-based
(`has`/`secured`/`in place` vs. `no`/`not`/`should`). Three channels
push the rate down:

- **Paraphrase** avoiding the vocabulary — *"the team has brought in outside
  expertise"* dodges every Organizational token.
- **Morphology** — matching is stem-plus-optional-plural; other inflections and
  compounds escape.
- **Same-clause negation.** `NEGATION` has precedence, so a balanced sentence
  collapsing into one clause scores `negated` even where it also asserts.
  Splitting handles sentence and semicolon boundaries, comma-joined
  coordination, bare `but`/`though`/`while`, a leading subordinator's comma, and
  `and` before a modal or negation — but not every bare `and`, which would
  shred coordinated noun phrases into cue-less fragments. *"Assessment of X,
  absence of Y"* is the modal shape of an RNA, so this channel is probably the
  largest.

So `asserted` is a floor, not a census, and this probe **cannot prove the
absence of fabrication**. Every flagged clause is written verbatim to
`flaggedClauses`, so what it caught is checkable rather than trusted.

**Interpretation, pre-registered before any run:**

| Outcome | Reading |
|---|---|
| corpus-inflated ≫ baseline-inflated | The corpus converts a wrong supplied level into asserted evidence. A real risk in the shipped path. |
| corpus-inflated ≈ baseline-inflated | The wrong level alone drives it; the corpus is not culpable. |
| both ≈ 0 | A one-rung error did not induce detectable fabrication — not evidence about larger errors. |
| `unclassified` large | The classifier is too weak to read any of the above — report that, do not quote a rate. |

### Result, 2026-08-05 — the reference was broken; corrected, and the direction reverses

**Read this before any result section below it.** Every "Result" section that
follows scored metric 1 against the seeded `StartupReadinessLevel` rows — demo
fixtures written for the UI, never checked against the documents the model is
shown, and **contradicted by those documents in ten of twelve cells**. Seeded
Market 4 requires *"no prospect has yet indicated a specific willingness to
pay"* beside a document stating PHP 5,000 MRR; seeded Organizational 4 requires
a *"first full-time hire beyond the founders"* beside *"team grew to 3
founders"*; seeded Investment 3 requires a written funding plan beside a
document mentioning no funding activity.

`lib/metrics.js` justified that reference as *"independent of the prompt"*. True
— and a sound fix for a real problem, since a rubric-similarity metric would
reward parroting. But independence and correctness are different properties, and
only the first was secured.

The reference is now derived per cell from the documents
(`data/ground-truth-adjudication.md`, single source `src/demo-readiness-levels.ts`).
n=3, 36 balanced observations per arm, levels probe, 18/18 calls
(`results/2026-08-05-corrected-reference.json`):

| arm | MAE | exact | within 1 rung |
|---|---|---|---|
| `baseline` | 0.69 | 20/36 (56%) | 29/36 |
| `sdd-semantic` *(null control)* | 0.94 | 15/36 (42%) | 28/36 |
| `deviation-deterministic` | **0.22** | **28/36 (78%)** | **36/36** |

The byte-identical control pair differs by 0.25 MAE and **1** on `within1`, so
the corpus arm's margins over baseline — 0.47 MAE and **7** — sit outside the
noise floor. Mean signed error shows the mechanism: the corpus arm is *exactly*
right on Organizational, Regulatory and Investment across all 36 observations
(0.00 / 0.00 / 0.00) while `baseline` inflates them by +1.67 / +0.67 / +1.17 and
`sdd-semantic` by +1.33 / +0.83 / +1.83.

The corpus arm's whole residual is Technology and Market on MediSync, where it
places `T7 M6` on all three reps — the *permissive* reading of those cells.
Scored permissively instead of strictly: corpus **0.19**, baseline 0.94. The
direction survives either reading.

**The claim that needs no reference at all.** Three rungs require an artifact
class neither document mentions — ORL 3+ a non-founder contributor, RRL 3+
counsel engaged, IRL 3+ a written funding plan — so any placement above them
asserts evidence that does not exist, whatever the true level is.
`verifyAbsences` asserts those absences at run time, and the ceilings are one
rung more generous than the documents support, making these lower bounds:
`baseline` 11/18 (**61%**), `sdd-semantic` 10/18, `deviation-deterministic`
**0/18 (0%)**, titles 1/18, bare 1/18. **This is the figure to quote** — it
survives the reference being contested.

**What this changes below:**

- The **negative conclusion is withdrawn.** Three reps agreeing in direction was
  not evidence — they agreed because the reference was consistently wrong.
- The **volume ladder stands in direction**: stripping rubric bodies still sends
  MediSync to TRL 9 every rep, so the bodies are load-bearing restraint. Its
  magnitudes are scored against the broken reference.
- The **O/R/I rubric recalibration those sections prescribe is cancelled**, not
  deferred. It existed to make the corpus reproduce the seeded levels; those
  levels were the error, and O/R/I is now exactly right.
- **Pooling:** levels sit inside `common`, so every fingerprint changed and the
  pre-correction runs are a closed set — verified, not assumed: `--merge`
  refuses the new file on all 15 (metric, arm) pairs. `audit-ground-truth.js`'s
  `SEEDED` stays frozen at the old values, with a test asserting it does not
  track the harness, because that is what the historical runs were scored
  against.

**Scope limit, and it is the one to quote.** This is the *levels* probe, a
harness construct; production does not ask the model to assign levels. So it is
a positive result for Objective 1b's *assessment* claim and says nothing about
RNA generation quality, where metric 2 has never produced a signal. Metric 3
remains unresolvable: baseline 1.94, control 2.56, corpus 1.56 — the control
pair's own spread (0.62) exceeds the corpus arm's deficit against baseline
(0.38).

### Result, 2026-08-04 — n=3 complete, and the volume hypothesis is refuted

⚠ **Superseded by 2026-08-05 above.** The "direct negative result" is withdrawn:
every figure here is scored against the seeded reference. Kept because the
volume ladder holds in direction and because the retraction is part of the
record.

`2026-08-04-rep3-refill.json` (2 calls), `2026-08-04-titles-arm.json` (12),
`2026-08-04-bare-arm.json` (6). 20/20 of the day's quota. All five arms, n=3,
pooled over the six post-redesign files:

| arm | levels block | MAE | exact | within1 |
|---|---|---|---|---|
| `baseline` | *none* | **0.78** | 44% | **30/36** |
| `sdd-semantic` *(control)* | *none* | 0.42 | 64% | 34/36 |
| `deviation-deterministic` | 31,850 ch | 1.36 | 33% | 13/36 |
| `deviation-titles` | 12,552 ch | 1.69 | 25% | 15/36 |
| `deviation-bare` | 4,002 ch | 1.78 | 25% | 12/36 |

**The recorded hypothesis is dead.** Since 2026-07-30 these docs carried "the
levels probe hands corpus arms all 54 rubric rows and that volume destabilises
placement." `deviation-titles` drops each row's body and `deviation-bare` the
provenance suffix too, holding level coverage fixed so exact placement stays
reachable and the true level is still never leaked. **An 87% cut in block size
changes nothing** in aggregate — all three corpus arms sit in a band (MAE
1.36–1.78, within1 12–15/36) far below an arm given no rubric at all.

But mean *signed* error (+ = placed too high) shows two effects responding to
volume in opposite ways:

| arm | Tech | Mark | Acce | Orga | Regu | Inve |
|---|---|---|---|---|---|---|
| `baseline` | +0.50 | +0.67 | +2.00 | **+0.67** | −0.17 | **+0.67** |
| `sdd-semantic` | 0.00 | +0.17 | +1.33 | +0.50 | −0.33 | +0.17 |
| `deviation-deterministic` | +1.00 | +1.83 | +2.17 | **−1.17** | −1.00 | **−1.00** |
| `deviation-titles` | +2.50 | +1.50 | +3.00 | **−1.17** | −0.33 | **−1.00** |
| `deviation-bare` | +2.50 | +2.00 | +3.00 | **−1.17** | −0.33 | **−1.00** |

1. **Organizational and Investment are volume-invariant** — every corpus arm at
   −1.17 and −1.00, identical to two decimals across the whole 87% cut, while
   baseline places both *too high* at +0.67. The corpus flips the sign and the
   size of the flip does not care how much text is sent: the signature of
   **rubric calibration**, correctable per dimension in the corpus rows.
2. **Technology and Acceptance track volume the other way**: +1.00 → +2.50 and
   +2.17 → +3.00 as bodies are stripped. A bare title — *"TRL 5 — Technology
   validated in relevant environment"* — is an aspirational label with no
   criteria attached, so the model assigns it freely; the body was the restraint.

So: volume does not drive the net error, and cutting it is actively harmful
where body text was doing the constraining. **Why trimming *levels* would have
been the wrong experiment:** cutting to anchor rungs (1/5/9) shrinks the block
far more but removes the correct answer for any startup at level 2–4. Both new
arms keep all 54 keys for that reason.

**What cannot be concluded, and why.** `baseline` and `sdd-semantic` send
**byte-identical** prompts (semantic returns nothing: 0/12 rubric, 0/2 profile),
so their spread is pure sampling noise — and `sdd-semantic` "beats" `baseline`
in **all three reps**, by 0.25–0.42 MAE. *A consistent direction across three
reps is not evidence of an effect here: the null pair does it too.* What
survives is `within1`, where the control pair differs by 0, −2, −2 while the
corpus arms differ from baseline by −7, −6, −4 — two to three times larger,
every rep, non-overlapping. The corpus arms are not slightly miscalibrated: they
miss by more than one level in roughly two thirds of placements against
baseline's one sixth. MAE understates this because the ungrounded arms
accumulate many small errors while the corpus arms make fewer, much larger ones.

**Two data artifacts, recorded rather than hidden:** the refill re-ran the RNA
probe for a cell that already had one, so `deviation-deterministic` reports 42
RNA observations against 36 elsewhere (harmless — metric 2 is 0% universally and
metrics 1 and 3 read `levelCalls` only); and `deviation-bare` has **no** metric-2
data, having been run `--only-probe=levels` deliberately.

### `--only-probe=` — added 2026-08-04

Metric 2 had been saturated at 0% on every arm since the 2026-07-30 redesign, so
half of every rep bought nothing. `--only-probe=rna|levels` halves the cost of
the only metric that discriminates — the bare arm cost **6 calls instead of
12**, the only reason a third point on the volume ladder fit inside the cap.

Exact names only, no prefix matching: two fixed values, so a prefix buys nothing
and could select the wrong one. An unrecognised name errors rather than being
dropped — silently running fewer probes looks identical to a quota hit. The
wiring test asserts the call is **suppressed**, not filtered afterwards: an
option that issued both calls and discarded one would leave every reporting test
green while buying nothing.

**Ambiguous `--only-arm` prefixes error.** Adding `deviation-titles` made
`--only-arm=deviation` match two arms, which would have silently doubled the
spend. Over-selection is as costly as under-selection: the filter refuses and
names the candidates. An exact name always wins, so one arm's name prefixing
another's never makes it unselectable.

### Result, 2026-08-03 evening — rep 3, partial; metric 3 declared unresolvable

`results/2026-08-03-rep3.json`. 11 of 12 calls landed; the twelfth failed on a
**503 "high demand" — not a quota 429** — on the one cell carrying the finding
(`deviation-deterministic / MediSync / levels`).

**1. Metric 1 separates the arms; metric 3 does not, and probably cannot at any
N reachable on this quota.** `baseline` and `sdd-semantic` send byte-identical
prompts, so every gap reading is one draw from the same distribution. Six such
draws exist — 2.83, 1.67, 3.33 (baseline), 2.33, 1.83, 1.83 (sdd) — spanning
**1.67 to 3.33, a spread of 1.66 gap points**, against a corpus-arm pooled
deficit of −1.19. The deficit is smaller than the controls' own spread. The
2026-07-29 "±1.0 noise floor" was an underestimate, and the n=2 section below
quoting a 0.17 control spread was a small-sample artifact — it grew to 0.61 with
one more rep.

Metric 1 behaves the opposite way. Per-rep MAE: baseline 0.67 / 0.75 / 0.92, sdd
0.42 / 0.33 / 0.50, deviation 1.50 / 1.33 / (incomplete). The ranges do not
overlap. **Report metric 1; treat metric 3 as unresolved and say why.**

**2. The AgroLink half of the reproducibility finding holds three times.**
Corpus-arm deltas: `+0 +2 +3 +0 +0 +0`, `+0 +2 +2 +0 +0 +0`, `+0 +1 +2 +0 +0
+0`. The MediSync half (the −2 collapse on O/R/I) still rests on two
observations — rep 3 is precisely the one that 503'd.

**Do not quote the n=3 pooled MAE.** Adding rep 3 moved deviation's pooled MAE
from 1.42 to **1.23**, not because the arm improved but because rep 3
contributed 6 AgroLink calls (its low-error startup) and 0 MediSync calls (where
its error is): 18/12 against baseline's 18/18. **The balanced n=2 figure below
is the like-for-like comparison.** Metric 3 is barely affected by the imbalance
(deviation's AgroLink mean moves 2.25 → 2.17, shifting the gap by 0.09), but is
unresolvable anyway.

### Cell filtering and 503 retry — added 2026-08-03

Two gaps the partial rep exposed, both closed (26 tests, four guards
mutation-verified).

**`--only-arm=` / `--only-startup=`** narrow which cells run. Case-insensitive
prefix match, comma-separated, so the space in `MediSync Cebu` never needs
quoting:

```bash
node measurement/measure-grounding.js --only-arm=deviation \
  --only-startup=MediSync --out=measurement/results/<date>-refill.json
```

A filter matching nothing **hard-errors before any network call** and lists the
real names. Unselected arms still get an empty results entry, so reports and
`--merge` stay well-formed. **A filtered file is a partial rep** — its tables
show n=0 for everything unselected; `--merge` it with a full run rather than
reading it alone.

**Transient 503s are retried** — 3 attempts at 15s then 30s. A **429 is never
retried**: the daily cap does not reopen for ~24h, so a retry loop only burns
wall-clock to earn another 429. That separation needed a dedicated test — a
plain 429 body contains neither `503` nor `UNAVAILABLE`, so removing the quota
check passed every other test. The pinning test uses a body naming both.

### Result, 2026-08-03 — second rep, n=2 pooled

`results/2026-08-03-rep2.json`, all 12 calls. Pooled with the 2026-07-30 rep via
`--merge`; all nine (metric, arm) fingerprint groups matched.

| metric (direction) | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — level-placement MAE (lower better) | 0.71 | 0.38 | **1.42** |
| 1 — exact placements | 11/24 | 16/24 | 8/24 |
| 1 — within one rung | 21/24 | 23/24 | **8/24** |
| 2 — stage-inappropriate rate (lower better) | 0% | 0% | 0% |
| 3 — differentiation gap (higher better) | 2.25 | 2.08 | **1.33** |

**The headline is not the pooled means — it is that the corpus arm's error is
reproducible.** Per-dimension signed deltas against seeded truth:

| MediSync (truth) | T5 | M4 | A3 | O4 | R3 | I3 |
|---|---|---|---|---|---|---|
| deterministic, rep 1 | +2 | +2 | +2 | −3 | −2 | −2 |
| deterministic, rep 2 | +2 | +2 | +2 | −2 | −2 | −2 |
| baseline, rep 1 | +1 | +1 | +3 | 0 | 0 | +1 |
| baseline, rep 2 | 0 | 0 | +2 | 0 | −1 | +1 |

The corpus arm returns nearly the same wrong placement twice and `baseline`
moves around more, **so the "54 rubric rows destabilise placement" hypothesis is
retracted** — the corpus arm is the *more* stable one. What it does is
**displace placement systematically**: on the mid-stage startup, +2 on T/M/A and
−2 on O/R/I in both reps. On AgroLink the same upward push appears on Market
(+2.0) and Acceptance (+2.5) while the other four sit exact — the bottom three
are already at level 1 and cannot collapse further, so the downward half is only
observable on MediSync. Instability would be a prompt-volume problem;
reproducible displacement points at **rubric calibration** — a live hypothesis,
not a demonstrated cause.

**The sharpest single number:** baseline lands within one rung 21/24 times, the
corpus arm 8/24 — and its exact count is also 8, so **every non-exact corpus
placement is off by more than one rung.** Large-grained error, not drift.

**Separate finding, not a corpus effect: every arm overshoots Acceptance.**
Pooled mean signed delta is +1.0 to +2.5 for *all three* arms on *both*
startups, including the two receiving no rubric text. Present in the controls,
so not attributable to the corpus; roughly equal across arms, so it inflates all
three MAEs without biasing the contrast. Likeliest causes: the seeded Acceptance
truth set too low, or the documents carrying more adoption evidence than their
ARL rung implies. Check against `seed-demo-full.js` before that ground truth is
used for anything else.

**Metrics 1 and 3 are one finding read two ways, not two.** Both derive from the
same `levelCalls`; the displacement mechanically raises MAE *and* compresses the
early-vs-mid gap. Do not present them as corroborating each other.

**Noise floor at n=2.** `baseline` vs `sdd-semantic` — byte-identical prompts,
re-verified by diffing `--dry-run` output (same md5). Pooled spread 0.33 MAE and
0.17 gap points. Still a single paired difference of two means, not a variance
estimate; it licenses no "N× the noise" multiplier. `sdd-semantic` scored better
in *both* reps — a coin flip landing the same way twice.

**Still not established:** whether the corpus helps or harms *in production*.
Every number here is the levels probe, which hands corpus arms all 54 rows;
production's RNA path retrieves 12.

### Result, 2026-07-30 — the first clean rep

*Pooled into the n=2 result above; kept for per-rep detail.*
`results/2026-07-30-redesign-rep1.json`, all 12 calls. **The first rep in which
the arms differ only by the rubric text.** n=1 throughout.

| metric (direction) | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — level-placement MAE (lower better) | 0.67 | 0.42 | **1.50** |
| 1 — exact placements | 6/12 | 8/12 | 4/12 |
| 2 — stage-inappropriate rate (lower better) | 0% | 0% | 0% |
| 3 — differentiation gap (higher better) | 2.83 | 2.33 | **1.17** |

**Read `baseline` vs `sdd-semantic` as a noise measurement, not a comparison** —
byte-identical prompts, so their spread is run-to-run variance at
`temperature: 0`: **0.25 MAE on metric 1, 0.50 gap points on metric 3.**

The corpus arm did worse on both scored metrics, outside that spread — **but
metrics 1 and 3 are not independent evidence.** Both summarise the *same* twelve
`levelCalls`: metric 1 is their mean absolute distance from truth, metric 3 is
MediSync's mean minus AgroLink's. This rep's deterministic arm overshoots three
of MediSync's dimensions and collapses the other three to level 1, which is
mechanically what both raises MAE and shrinks the gap. One internally-consistent
pattern read two ways. (An earlier version's "~3× the noise floor" also
overstated what a single paired difference can say.)

| MediSync (truth) | T5 | M4 | A3 | O4 | R3 | I3 |
|---|---|---|---|---|---|---|
| baseline | 6 | 5 | 6 | 4 | 3 | 4 |
| deterministic | 7 | 6 | 5 | **1** | **1** | **1** |

**Why metric 1 uses absolute error:** MediSync's deterministic deltas are `+2 +2
+2 −3 −2 −2` — a signed mean of **−0.17**, near-perfect-looking, against a true
MAE of **2.17**.

**Metric 2 saturated at 0% on every arm, and that is a finding.** The probe is
live — injecting *"Move to full market launch and prepare an IPO."* at
AgroLink's Technology level 2 correctly flags both `ipo` and `full market
launch` — so 0/12 means the model made no stage-inappropriate recommendations.
Since confound 1's fix gives **all three arms** the levels block, the most
economical reading is that **the levels block, not the rubric corpus, keeps
recommendations stage-appropriate.** Isolating that needs the `baseline-no-levels`
fourth arm held in reserve; it is not demonstrated here.

**What this rep does not establish.** n=1. It does not show the corpus is
harmful — one rep cannot, and the differentiation baseline to beat (+2.28) was
itself measured across 3 reps.

### Result, 2026-07-29 — superseded, kept for one finding

**Superseded, not merely old.** Produced with both confounds present, and its
metric 1 and 2 definitions (rubric-term reuse, invented-absent-fields) no longer
exist in the code, so the table cannot be re-expressed in current terms. Kept —
with `results/2026-07-29-rep1.json` — for caveat (b), which is a fact about
`gemini-3.6-flash` rather than about either confound.

n=1 per cell, quota exhausted on call 17 of 18, **old probe design and old
metric definitions**:

| metric | baseline | sdd-semantic | deviation-deterministic |
|---|---|---|---|
| 1 — rubric-term grounding *(retired)* | n/a (no rubric) | n/a (nothing retrieved) | **1/12 (8%)** |
| 2 — invented absent fields *(now metric 4)* | 0/6 (0%) | 0/6 (0%) | 0/3 (0%) |
| 3 — differentiation gap | **+1.50** | **+2.50** | incomplete (n=0 MediSync) |

**(a) `sdd-semantic` is not a distinct condition — it is a null-condition
replicate of `baseline`.** Semantic rubric retrieval returned **0 rows** for
both startups (`retrieved: []`), so `renderRubricBlock([])` produced an empty
string, identical to `baseline`'s. The harness runs *two* conditions plus one
accidental control, not three. A property of the corpus and the code, not of
either confound, so it still applies under the redesigned probes.

**(b) That control measured the noise floor, and it is large — this survives the
redesign.** Same prompt, same `temperature: 0`, two independent samples: **8 of
12 per-dimension levels differed**, and the gap moved **+1.50 → +2.50**.

| | baseline | sdd-semantic (identical prompt) |
|---|---|---|
| AgroLink | T3 M3 A3 O3 R1 I1 | T2 M3 A2 O2 R1 I1 |
| MediSync | T5 M4 A5 O4 R2 I3 | T6 M5 A6 O4 R2 I3 |

So **±1.0 gap points is run-to-run variance at n=1** on this model.
`gemini-3.6-flash` is thinking-enabled and does not sample deterministically at
`temperature: 0`. **No corpus effect smaller than about one gap point is
detectable at this N.**

**Do not read Step A's failures as "therefore deterministic improves
grounding."** Step A establishes only that neither mechanism can retrieve this
corpus; the 2026-07-29 numbers cannot answer Objective 1's headline claim either
way.

## `measure-summary-bias.js` — SO 4.2 / SO 4.4

> ⚠️ **Two different metrics in this file are called "metric 3".** The grounding
> harness's is the **differentiation gap** over readiness *levels*, declared
> unresolvable 2026-08-03. This harness's is the **overcorrection guard** over
> generated *summaries*. Different quantities, different harnesses,
> opposite-looking sign conventions. Never pool or compare them.

A different probe family, so it carries its own fingerprints rather than
`lib/fingerprint.js`'s. Two arms — `adversarialSummary` off (the shipped
`LEGACY_SUMMARY_PROMPT`) and on (field-ordered `responseSchema`) — × 2 startups
× 3 reps, one call each. It boots a Nest context and calls the real
`AiService.generateStartupAnalysisSummary`, so it needs Neon reachable.

### Result, 2026-08-18 — partial run, 10/12 calls

`results/2026-08-18-summary-bias.json`. `gemini-3.6-flash`, temperature 0,
grounding on, reps=3, 12 requests spent, **10 succeeded**. Two adversarial cells
failed on **503 model overload, not quota**; deliberately not re-run, so every
mean is over surviving rows, never padded.

**Validity gate (metric 0) passed: zero degradations.** All 4 completed
adversarial calls used `source=schema`, so no control output wears the
adversarial label — the confound that invalidated the first grounding run.

| arm | n | meanCritical | meanPositive | meanRatio | flagged | flagRate | meanUnmetCriteria | meanCriticalRisks |
|---|---|---|---|---|---|---|---|---|
| baseline | 6 | 1 | 1.67 | 0.39 | 0 | 0 | 0 (structural) | 0 (structural) |
| adversarial | 4 | 3 | 0 | 1.00 | 0 | 0 | 4 | 3.75 |

`structural` = the baseline arm has no criteria field at all
(`legacySummaryOnly` returns `[]` by construction), so its zero is not a
measurement.

**1. SO 4.2's mechanism works.** The adversarial arm produces markedly more
critical observations and real structured findings where the baseline
structurally produces none, at **100% schema adherence**. What was tested is the
*mechanism* — a field-ordered `responseSchema` with `propertyOrdering` — not
prompt wording. Gemini honouring `propertyOrdering` is now supported by this run
rather than assumed.

**2. The SO 4.4 flag rule is measured WRONG, and the run supplies its
replacement.** `flagged = criticalCount === 0` fired **zero times in ten
summaries, both arms**. Every baseline summary scored exactly `criticalCount: 1`,
and not by chance: the legacy prompt mandates *"3. Critical risks and primary
recommendations"*, so every baseline summary ends with a risk sentence. **The
rule cannot fire against the prompt it exists to police.** The baseline
summaries are plainly lenient — *"demonstrates strong market viability"* — then
append one dutiful risk sentence. The bias is positive framing with a token risk
mention, not absence of critical language.

The replacement is in the same data. Per-call `ratio`:

```
baseline     0.33  0.33  0.33  0.33  0.50  0.50
adversarial  1.00  1.00  1.00  1.00
```

The arms do not overlap — a gap from **0.50 to 1.00** — so a threshold at
**~0.75** flags all six baseline summaries and none of the adversarial ones.
*(`ratio < 0.75` shipped in `summary-tone.ts` later the same day and was
validated on a held-out run — `results/2026-08-18-threshold-validation.json`:
baseline 5/5 flagged, adversarial 0/4, perfect separation.)*

**3. The differentiation guard did NOT pass — an open question, not a pass.**
Both arms returned `FAIL - uniform`, `criticalGap 0`. Specified pass/fail before
the run, so reported as failed:

- the adversarial arm is **saturated** — all four calls at `criticalCount: 3`,
  the maximum in a three-sentence summary, so that column cannot discriminate;
- `unmetGap` is 0 because AgroLink 4,4 and MediSync 3,5 have coinciding means
  while the underlying values differ in no consistent direction;
- the **baseline arm also fails**, uniformly at `criticalCount: 1`.

So this run **cannot distinguish genuine overcorrection from instrument
ceiling**; resolving it needs a non-saturating metric, not more reps. The
cautionary precedent stands: `gemini-2.5-flash-lite` read as lenient but was
floor-bound and blind, and the real defect was differentiation.
*(Rebuilt on field overlap and re-run 2026-08-20, below.)*

**Two structural limits, neither fixable by more calls:**

- **`propertyOrdering` enforces sequence, not substance.** `unmet_criteria: []`
  is a valid response — `required` requires the key, not a non-empty array — and
  nothing cross-checks the summary against the criteria. A model could emit
  empty findings then a glowing summary. The tone check is the only guard. Open.
- **The SO 4.4 verdict is unreachable by a Manager.** Nothing in `frontend/src`
  read `confidenceStatus`, `positive-language-flagged` or `analysis_summary`, and
  the only two backend queries against `AiRecommendation` filtered
  `recommendationKind` `'RNA'` / `'RNS'`. Detection was built and measured;
  alerting was not. ⚠️ **Superseded 2026-08-18/23** — `summaryVerdict` now rides on `GET /startups/all` and renders
  as a badge in all four Manager dialogs, and approving a flagged application
  requires an acknowledgement that writes an `activity_logs` row. Recorded
  because it was true when measured.

### Result, 2026-08-20 — metric 3 rebuilt and run, 10/10 calls

`results/2026-08-20-differentiation-overlap.json`. `--only-arm=adversarial
--reps=5`, **10 requests, 10 succeeded, zero degradations.** The first full grid:
5 early / 5 mid, 25 cross pairs, 20 within pairs.

Rule **pre-registered 2026-08-19**
(`docs/superpowers/specs/2026-08-19-differentiation-margin-design.md`, committed a
day before the first call): PASS iff `min(within-startup pair) > max(cross-startup
pair)` — complete separation, no constant.

| statistic | value |
|---|---|
| `crossOverlap` (early reps × mid reps) | 0.303 |
| `withinOverlap` (same-startup rep pairs, pooled) | 0.612 |
| `separation` | +0.309 |
| cross pair range | 0 – 0.500 |
| within pair range | 0.125 – 1.000 |
| chance reference | 3.2e-13 |
| **verdict** | **`FAIL - uniform`** (quotable) |

**The prediction was right in outcome and wrong in mechanism.** FAIL was
predicted *because* cross-overlap would run high (0.35–0.65) with small
separation (0.05–0.25). Cross-overlap came in **below** that band and separation
**above** it — the arm distinguishes the two startups more than predicted.

**The failure is instability on one document, not uniform harshness.**
Cross-overlap never exceeds 0.5. Complete separation fails because one *within*
pair sits at 0.125, below the cross maximum:

| startup | within-overlap | min pair |
|---|---|---|
| AgroLink (early) | **0.800** | 0.500 |
| MediSync (mid) | **0.424** | 0.125 |

The arm cites the same four fields for AgroLink almost every time (reps 0–2 give
**identical** sets) and wanders on MediSync. So the verdict *label* misleads
here: what failed is the noise floor, not the signal. **Pooling the
within-startup floor across both documents hid that one is stable and the other
is not.** Observation only — re-scoring under a per-startup rule is the post-hoc
move the pre-registration forbids.

**The instrument is not degenerate, which is the positive result.** The
pre-registered "field identity is too coarse" failure mode required
`crossOverlap > 0.5` **and** `separation < 0.1`; neither holds. Field overlap
carries real signal, unlike the count columns it replaced — those stayed
degenerate here too (`criticalGap` 0; `unmetGap` −0.2, favours mid).

**Instrument stability came in below prediction:** predicted `withinOverlap` >
0.7 at temperature 0; observed 0.612 pooled and **bimodal** (0.80 / 0.42). Above
the 0.4 "unstable" line, but markedly less deterministic on MediSync than
temperature 0 implies.

**No re-tuning.** The means separate clearly and a margin-based rule would have
passed — exactly what the pre-registration forbids claiming. What the run
legitimately provides is the **first observed distribution** of overlap values,
which a *separately* pre-registered rule could be calibrated on and scored on
new data.

**Two fingerprint-verified n gains.** `criteria|adversarial` is `82fc2961c7ff`,
identical to both prior runs, so SO 4.2's criteria result gains these 10 calls:
**3.9 mean unmet criteria, 3.2 mean critical risks** (against 4 and 3.75 at
n=4). `tone|adversarial` is `e6304665e036`, identical to the validation run:
**0/10 flagged, ratio 1.00 on all ten** — a third independent confirmation that
`ratio < 0.75` does not fire on the arm that is behaving.
`differentiation|adversarial` is `2ddb92a91be5`, new, as it must be.

**Also refuted again:** the "exactly 4 unmet criteria" claim these docs once
carried. AgroLink 4,5,4,3,3; MediSync 3,4,5,4,4.

## Assertion classifier — 2026-08-07 repair and mutation log

`lib/assertions.js` was repaired after hand-reading the 2026-08-06 run's
`flaggedClauses`. Of its 14 `unclassified` clauses, **12 were recommendations
mis-binned**, not missed assertions — the recorded "subject-less fragments"
diagnosis was a third of the picture. Full record in
`docs/superpowers/specs/2026-08-07-assertion-classifier-gaps-design.md`.

**Shipped:** abbreviation-safe sentence splitting; `RECOMMENDATION` widened to
`need(?:s|ed|ing)?` for the model's `Needs:` label form; coordination **scope
inheritance**, where a continuation fragment inherits its governing clause's
negation/recommendation cues but never its assertion; `CUES` with
`CLASSIFIER_SOURCE` built from it, plus a source scan catching a regex declared
outside it.

**Refused, and this is the point:** five candidate assertion cues were built or
specified and then cut — `require`, `existed`, `existing`, `exists`, and a whole
accompaniment predicate. **The assertion branch is unchanged.** Every cue that
could raise the measured rate failed the same test: the artifact token turned
out to be an attributive modifier rather than the head, so the cue fired on
clauses asserting nothing. *"Investor interest exists"* and *"A basic funding
plan exists"* are structurally identical; the accompaniment predicate
false-positived on 14 of 14 constructed clauses. Both genuine missed assertions
are recorded as **known uncaught classes** with tests.

**A live counterexample to the lower-bound guarantee was found and removed:**
*"and maintain an active log of investor pitches conducted."* had been stranded
from its governing `must` by a comma-and split and scored `asserted` on
`maintains?`.

**Whole-branch effect over the 330 stored dimension texts:** `unclassified`
36 → 2, `asserted` 14 → 11. Stricter about false positives, not more sensitive.

**Fingerprint:** `assertion|baseline` moved `4c1429815dc7` → `529dd55beb2c`, so
a re-run **cannot pool** with 2026-08-06 data. That is the guard working.

### The 2026-08-09 re-run on the repaired classifier

`results/2026-08-09-supplied-level.json`, 16/16 calls, n=2 — identical to
2026-08-06 in every parameter except the classifier. **A separate experiment,
not more n:** `--merge` correctly refused to pool it into any `assertion|*` or
`assertion-inflated|*` group while pooling `levels|*`, `rna|*` and
`fabrication|*`, whose fingerprints did not move.

| arm | condition | asserted | mentioned | unclassified |
|---|---|---|---|---|
| `baseline` | truth | 0/12 | 4/12 | 0/12 |
| `baseline` | inflated | **0/12** | 4/12 | 0/12 |
| `deviation-deterministic` | truth | 0/12 | 8/12 | 0/12 |
| `deviation-deterministic` | **inflated** | **3/12 (25%)** | 11/12 | 3/12 |

**The core finding reproduced independently.** Only corpus+inflated fabricates;
baseline is 0/12 under *both* conditions, so a wrong supplied level alone still
produces nothing. All three asserted clauses are the same mechanism — IRL 3's
funding plan asserted as drafted:

> "Currently at IRL 3 with a funding plan drafted"
> "MediSync Cebu is at IRL 3 with a drafted funding plan covering target raise and use of funds."
> "Currently at IRL 3 with a drafted funding plan outlining target raise and use-of-funds."

**AgroLink fabricated this time, closing an open question.** On 2026-08-06 every
fabrication came from MediSync and it was unresolved whether that was the
document or chance. It was chance — the first clause above is AgroLink. The
plan's decision *not* to buy that answer with extra AgroLink reps was right for
the wrong reason: re-running the same design answered it for free.

**The instrument repair is visible in the clause census:**

| | 2026-08-06 | 2026-08-09 |
|---|---|---|
| `recommended` | 13 | **28** |
| `unclassified` | **14** | **3** |
| `negated` | 5 | 5 |
| `asserted` | 3 | 3 |

**The measured rate rose, 2/12 → 3/12, and the instrument cannot explain it.**
The assertion branch is byte-identical and every landed change can only move
clauses **out of** `asserted`. A stricter instrument reading higher is sampling,
not measurement drift.

**Both pre-registered predictions were wrong, in opposite directions.** The spec
predicted higher because of added assertion cues; after those cues were cut the
prediction was revised to same-or-lower. It read higher, and neither reason was
the cause. Recorded because a prediction that only gets reported when it lands
is not a prediction.

**Read the hand count, not the table.** `unclassified` is 3/12 on the cell that
matters, and the design says not to quote a rate while that column is large. All
three are genuine fabrications, and all three fall in the deliberately-uncaught
classes:

> "At ORL 3, the core team comprises 3 founders (…) **and a first non-founder contributor**." — coordination, no participle
> "and Joy Tabotabo **along with a first non-founder contributor**." — accompaniment
> "Currently at RRL 3 with a pending IPOPHL trademark application **and preliminary counsel opinion**." — `with`-coordination

**The by-hand rate is 6/12, and the reported 3/12 is a floor** — the property
the probe is built on. The known-uncaught classes are the reason the floor is
trustworthy.

**Metric 2 returned a non-zero reading** for the first time: baseline 2/24 (8%),
corpus 1/24 (4%), on truth-condition text with an unchanged
`lib/stage-markers.js`. Recorded as saturated at 0% since 2026-07-29, so confirm
against the earlier files before quoting — at n=2 and 2 flagged, a hint.

**Limits:** n=2, 16 calls, one model, one window. Three of the four asserted
observations are MediSync. Inflation is one rung above the ceiling, not two.

### Mutation log

Nine mutants, nine killed, against 205 passing tests. Scripted rather than
hand-driven, restoring from an in-memory copy in a `finally` block — a first
hand-driven attempt was interrupted and left a live mutation in the tree.

| mutation | killed by |
|---|---|
| revert `SENTENCE_BREAK` to the naive split | `an abbreviation period is not a sentence end` |
| `RECOMMENDATION` back to `need\s+to` only | all 7 labelled-requirement tests **+ 3 continuation tests** |
| `classifyClause` ignores `scope` | `a stranded continuation does not assert off its own verb` + 4 more |
| `scope` passed unconditionally | `a leading "While" scopes its negation to its own clause` |
| `ASSERTION` tested against `scope + clause` | `a continuation fragment never inherits an assertion` |
| drop `exists?` (before it was cut outright) | `an existential predicate on an artifact is an assertion` |
| drop `CONTINUATION` from `CUES` | `every module-level constant is either a cue or a named non-cue` |
| resurrect an accompaniment disjunct | `accompaniment-only assertion is a known uncaught class` |
| readmit `existing` to `ASSERTION` | `"existing" is refused — an attributive adjective asserts no artifact` |

- **Reverting the `RECOMMENDATION` widening also breaks three continuation
  fixtures.** Those fragments inherit a `Needs:` head, so scope inheritance is
  only reachable through the widening. The two changes are coupled.
- **One genuine survivor, recorded not fixed:** removing `CONTINUATION` from
  `CUES` *and* allowlisting it in the test's `NON_CUES` survives green — the
  scan allows the name and the coverage test iterates `CUES`, so it passes
  vacuously. Closing it would mean guarding against an author who edits the
  guard to accept its own bypass.
- **Harness caveat:** two mutants first reported as survivors had failed to
  apply. `String.replace(string, string)` takes only the first occurrence and
  the doc comment quotes the regex above it, so the mutation edited the comment;
  and a multi-line anchor used `\n` against a CRLF file. **A mutation that fails
  to apply reports a green suite, indistinguishable from a decorative guard.**
  Assert the mutation landed.
- **Known sensitivity cost, measured:** the widened `RECOMMENDATION` also
  matches the *noun* "needs", reclassifying one real fabrication in stored data
  — *"A funding plan has been drafted outlining target capital needs…"*
  (`2026-07-30-redesign-rep1.json`, MediSync, `deviation-deterministic`) — from
  `asserted` to `recommended`. Conservative direction, so the lower bound holds,
  but a detection lost. A clause-initial anchor recovers it and costs two other
  clauses.

## Metric 6 — redundant-need rate, added 2026-08-23

**What it measures.** One binary observation per (call, dimension): does the
generated RNA state as a **need** an artifact class the source document shows the
startup **already has**. Reference-free — a property of the document, so no arm
is scored against its own prompt.

**Why the obvious design was refused.** "Did the RNA name the criterion the
`L+1` rubric defines" is circular: an adjudicator reading the document with the
rubric ladder in view is approximately the `deviation-deterministic` condition,
so its agreement with that arm proves nothing (`lib/hard-absences.js` records
the same reasoning). It would reproduce the vocabulary-reuse metric retired on
2026-07-29.

**The mechanism** — not forked from metric 5; same classifier, opposite input:

| | token list | bin read |
|---|---|---|
| metric 5 | `absentTokens` — what the document never mentions | `asserted` |
| metric 6 | `artifactTokens` (`lib/satisfactions.js`) — what the document evidences | `recommended` |

Same segmentation, same scope-inheritance repair. `CLASSIFIER_SOURCE` is pinned
byte-identical, or metric 5's pooling breaks. Reported alongside the headline:
`mentioned` (upper bound) and `unclassified` — a large `unclassified` means the
classifier cannot read this output and the rate should not be quoted.

**The pilot, reported honestly.** Piloted for free against 96 real observations
on disk (`2026-08-06-supplied-level.json`, `2026-08-09-supplied-level.json`). As
first written it fired 10 times, and a hand-read found essentially all 10 false
positives — the satisfied token was the origin being moved away from
(*"transition from paper prototype"*, *"beyond paper prototypes"*) or the scope a
recommendation ranged over (*"across the target market"*). **The uncorrected
headline would have read baseline 21% vs corpus 0% on `truth` — large,
quotable, wrong, and favouring the corpus specifically.** This is the most useful
thing here to remember before trusting any redundancy number.

**The correction** (`lib/redundancy.js`): an acquisition requirement — the token
must be the direct object of an acquisition verb (`identify, define, establish,
create, develop, build, secure, obtain, acquire, find, determine, conduct`) with
no origin/scope preposition (`from, beyond, past, across, outside, rather than,
versus, for`, anchored against the token) or progression verb (`transition,
move, expand, scale, penetrate, grow, further`, same anchoring) governing it —
plus a broad/narrow token split in `lib/satisfactions.js` mirroring
`hard-absences.js` (`target market` moved to `notArtifacts`; it was scope in
every pilot firing). After both fixes: **0 firings across the same 96
observations.**

**Direction and named uncaught classes.** A **lower bound** — every ambiguity
resolves away from redundancy, matching metric 5's posture. Uncaught:

- **Passive/postposed acquisition** — *"A paper prototype should be created…"*
  goes silent; the gate requires the verb to precede the token.
- **Acquisition verbs outside the frozen list** — `gather`, `collect`, `run`,
  `validate`, `engage`.

A lower bound is quotable *because* its uncaught classes are named.

**The `deflated` condition — positive control.** `inflated` manipulates O/R/I
upward; `deflated` is its mirror, **T/M/A → 1, O/R/I at truth**, as the
within-call control. Forced by the data: both startups sit at `O2 R1 I1` with no
deflation room, while MediSync's `T6 M5 A5` has plenty against a document
evidencing the level-1/2 criteria. Recorded before the run: **if the control
fires on MediSync and not on AgroLink** (`T2 M3 A3`, thinner document), **that is
the expected shape, not a defect.**

**Two pre-registered predictions, verbatim:**

1. **The control fires.** `deflated` redundancy substantially above `truth` on
   every arm. **If this fails the run is void** and reports a detector problem.
2. **The corpus arm scores worse than baseline under `deflated`,** being handed
   level-1/2 criteria as retrieved targets.

Prediction 2 predicts the corpus looks bad, deliberately. Both 2026-08-09
predictions turned out wrong in opposite directions — the reason for
pre-registering rather than reporting whichever direction lands.

**The null-control reading rule.** `sdd-semantic` sends a byte-identical prompt
to `baseline` on the RNA probe. Re-verified for this section: a 2026-08-23
`--dry-run` of the exact command below, diffed section by section, shows the two
arms' RNA blocks identical for both startups (5263 and 5521 characters,
`truth`+`deflated` combined, byte match) — the only difference is the arm-name
header. **Any arm difference smaller than that spread is noise.**

**The methodological sequence:** pilot on historical data → pre-register → run
on **fresh** data. Refining a detector against collected runs is legitimate
pilot work; scoring the *reported* run under a rule chosen after seeing it is
not. `2026-08-06-supplied-level.json` and `2026-08-09-supplied-level.json` were
pilot input and must never become the reported result.

**Limits to quote:** directional (silent on failing to recommend what is
missing); `satisfiedTokens`/`artifactTokens` **authored with no external
source**; **lower bound** with the two classes above named; **n=2**, two
documents, one model, one quota window; **`deflated` is a manipulation
production does not produce** — only the `truth` cells speak to what users
receive.

**Metric 6 cannot pool with any pre-2026-08-23 file, by design.** No file in
`results/` carries a `redundancy|*` fingerprint. `--merge` refuses a
(metric, arm) group unless *every* contributing file agrees on its fingerprint,
and `refusedKeys` means "refused for at least one contributing file" — so
`--merge results/*.json` makes **every** metric-6 row print `refused`, including
the fresh run's own valid data. That is the refusal logic working: read metric 6
from the single `--out` file directly until a second redundancy-fingerprinted
file exists.

**The run command:**

```
node measurement/measure-grounding.js --only-arm=baseline,sdd-semantic,deviation-deterministic --only-probe=rna --level-condition=truth,deflated --reps=1 --out=measurement/results/<date>-rna-redundancy.json
```

**Confirm `--reps=1` at launch by eye, not by counting printed blocks.** The
dry-run printer ignores `--only-probe` (it still prints phantom `LEVELS` blocks)
and does not reflect `--reps`. The correct
derivation is **3 arms × 2 startups × 2 conditions × reps = 12 calls at reps=1.**

### Result, 2026-08-23 — the control did not fire

`results/2026-08-23-rna-redundancy.json`. 12/12 calls, no 429s, no 503s, no
retries. Command exactly as pre-registered.

| arm | condition | redundant | mentioned | unclassified | denied | scoped |
|---|---|---|---|---|---|---|
| `baseline` | truth | 0/6 | 2/6 | 2/6 | 0/6 | 1 |
| `baseline` | deflated | 0/6 | 1/6 | 1/6 | 0/6 | 1 |
| `sdd-semantic` | truth | 0/6 | 2/6 | 2/6 | 0/6 | 0 |
| `sdd-semantic` | deflated | 0/6 | 2/6 | 2/6 | 0/6 | 1 |
| `deviation-deterministic` | truth | 0/6 | 1/6 | 1/6 | 0/6 | 0 |
| `deviation-deterministic` | deflated | 0/6 | 1/6 | 1/6 | 0/6 | 1 |

`redundantRate` is **0 in every one of the six cells**, `truth` and `deflated`
alike. `deniedCount` is 0 everywhere.

⚠️ **The `scoped` column was added 2026-09-04, and it corrects this section.**
This result used to read that no clause ever reached `recommended`, so the run
could not separate "the model never made this error" from "the classifier cannot
read these constructions." **Both claims were wrong.** Re-scoring the stored text
through the same `lib/redundancy.js` reproduces the other four columns exactly
and shows **4 clauses binned `recommended` and downgraded to `scoped` by the
acquisition gate** — all four AgroLink / Technology, all four the *"needs to move
**from paper prototype** to…"* shape, all four correct rejections. The same run's
metric-5 `flaggedClauses` holds 14 `recommended` clauses. So the classifier does
read the model's register and the gate does act on real verdicts; **the ambiguity
resolves in favour of the model never making the error**, and only the
true-positive path is unproven. `scoped` was invisible because
`scoreRedundantNeeds` computes it and nothing aggregates, prints or persists it —
reporting `scopedCount` is a prerequisite of the next run.

**Verdict, in the order it must be read:**

1. **Prediction 1 failed — the `deflated` control did not fire.** It is
   identical to `truth`: 0 on both, all three arms. By the rule written before
   the run, **this voids the run as a model result.**
2. **Prediction 2 is untestable.** Every arm reads 0 under `deflated`; there is
   no arm difference to compare.
3. **The pre-registration's own inference from a failed control was wrong.** The
   README said a failed control "reports a detector problem." Reading the
   generated text shows otherwise: under a supplied level of 1 on T/M/A, every
   arm produced forward-looking recommendations correctly anchored to the source
   document — never a claim that the startup already has what the deflation
   removed:
   - *"Needs to expand paid subscriptions beyond the initial 6 facilities…"* — `sdd-semantic`, MediSync, deflated, Market.
   - *"Needs further market penetration across the remaining target facilities."* — `baseline`, MediSync, deflated, Market.
   - *"Needs: Convert provisional buyer interest into formal agreements…"* — `deviation-deterministic`, AgroLink, deflated, Market.

   **The manipulation failed to induce the target behaviour — the detector had
   nothing to catch.** A different failure from a blind detector; do not conflate
   them.
4. **The honest claim is narrow: "the model did not make this error in these 36
   observations."** Not "the detector works." Not "the model is robust to a
   deflated supplied level." The two uncaught classes remain untested here, and
   n=1 rep, 2 documents, 3 arms, one model.
5. **The void rule itself was the wrong instrument** (2026-09-04). It collapsed
   *can the detector see the behaviour* (code and register, testable at zero
   quota) with *does the condition induce it* (only testable by spending calls),
   so a well-behaved model voided the run. The successor design splits them: a
   blocking zero-quota detector control, then a manipulation check whose failure
   reports a narrow model result rather than voiding anything.
6. **What a future test needs.** Deflation did not make the model contradict its
   own source document — the same shape as the 2026-08-06 finding that a wrong
   supplied level alone produces no fabrication in the baseline arm. Both
   documents label every fact (`Target Market:`, `Revenue:`), so the artifact the
   rubric asks for is signposted and there is nothing to miss; redundancy needs
   the artifact **evidenced but not salient**, which is a document property, not
   a level property. Designed and pre-registered 2026-09-04 as an `unlabelled`
   document variant plus a split control and a stopping rule:
   `docs/superpowers/specs/2026-09-04-metric-6-salience-manipulation-design.md`.
   **Implemented 2026-09-05, unrun** — see the next section.

**Also observed, same run — metric 5, n=1, observation only.** `asserted` is 0/6
on every arm under both conditions. `mentioned` varied on `truth`: baseline 1/6,
`sdd-semantic` 2/6, `deviation-deterministic` 4/6 — consistent in direction with
the corpus arm surfacing absent-artifact vocabulary more often, but not what this
run was built to answer.

### The salience manipulation — implemented 2026-09-05, unrun

Second design, `docs/superpowers/specs/2026-09-04-metric-6-salience-manipulation-design.md`,
amended before implementation. Zero quota spent building it. **No model result
exists yet.**

```
node measurement/measure-grounding.js   --only-arm=baseline,sdd-semantic,deviation-deterministic   --only-probe=rna --level-condition=truth --doc-variant=original,unlabelled   --reps=1 --out=measurement/results/<date>-rna-salience.json
```

3 arms x 2 startups x 2 variants x 1 rep = **12 calls**, one quota day.

**G1, the detector control** (`lib/g1-cases.js`, blocking, zero quota). Every
clause the metric 6 scorer bins `recommended` or `scoped` across the three stored
result files, each paired with a mutant that swaps the progression frame for an
acquisition frame and changes nothing else. All 11, not a subset — choosing cases
after scoring them is how a control gets tuned into passing. Provenance is
machine-checked: each original must be recoverable from the file, arm, startup,
condition, rep and dimension it names, and each mutant must name the same
satisfied token.

**Result: 11/11 pairs score mutant-fires / original-silent**, and both
expected-silent cases (passive/postposed acquisition, out-of-list verb) stay
silent. The detector reads the model's own syntax when that syntax carries a
redundancy.

**Mutation log — 4 mutants against `lib/redundancy.js`, 3 killed:**

| mutant | outcome |
|---|---|
| `develop` removed from `ACQUISITION_VERB` | killed (2 tests) |
| `isAcquisitionRequest` hardwired to `true` | killed (3 tests) |
| `ORIGIN_OR_SCOPE_PREP` veto removed | killed (2 tests) |
| `PROGRESSION_VERB` veto removed | **survived** |

The survivor is a genuine coverage gap, recorded rather than patched: of the 11
originals, 10 are silent for two independent reasons at once (no acquisition verb
precedes the token *and* the origin/scope preposition vetoes), 1 is silent purely
for the first, and only 1 is decided by a veto alone. `PROGRESSION_VERB` is the
sole silencer on **zero** cases, because across 132 historical observations the
model wrote the origin frame with a preposition every time. **G1 establishes
nothing about that regex.**

**Amendment 1 (2026-09-05), before any call.** G1's pass rule dropped its "at
least 2 startups" clause. All 11 harvestable clauses are AgroLink PH: MediSync's
six classified clauses are descriptive (*"user acceptance is demonstrated by
expansion to 6 facilities"*), never the recommendation register. AgroLink's
satisfied artifacts are things the model recommends moving **beyond**;
MediSync's are things it reports as **done**. Declined alternatives, with
reasons, are in the design file — chiefly that G1's cases are the model's own
generated text, so a third document buys nothing until quota is spent generating
for it, and `common.startups` is hashed into every fingerprint key so adding one
refuses all historical pooling.

⚠️ **The bound this buys travels with every G1 claim.** G1 validates the detector
against **AgroLink's register only**. Half the run's observations will come from
MediSync, whose register G1 never tested — and MediSync's descriptive register is
exactly what `unlabelled` aims to move. **G1's blind spot sits where the
manipulation acts.** A `redundant` verdict on a MediSync clause is not covered by
G1 and must be hand-read before it is quoted.

**The `unlabelled` variants** (`lib/doc-variants.js`). Each evidence phrase stays
byte-identical; its field label is removed by relocating the phrase into a
narrative field; nothing else changes. Both blocking checks pass —
`verifySatisfactions` finds every phrase verbatim, and the fact multiset (dates,
numbers, capitalised and all-caps tokens, field labels stripped) is unchanged for
both documents. **No connective words were added**: any prose written into a
variant is authorial influence on the result. The cost is that relocated timeline
sentences read as fragments, a validity cost taken deliberately.

⚠️ **Five of six cells.** AgroLink/Market cannot be manipulated — its evidence
phrase *includes* its own field label (`"Target Market: Rice and vegetable
cooperatives…"`), so "evidence byte-identical" and "label deleted" cannot both
hold. Editing `SATISFACTIONS` was declined: out of scope for this design, and it
is hashed as `satisfactions` material, so changing it would refuse pooling for
exactly the `original` cells the variant fingerprinting exists to protect.
Recorded in `UNMANIPULATED_CELLS`. It is an accidental within-document control
and **must not be read as a manipulated observation**.

⚠️ **One confound, MediSync only.** Its Acceptance evidence shares a sentence with
an Organizational fact (*"team grew to 3 founders"*), and splitting the sentence
would be the reordering the rule forbids, so that fact is unlabelled as a side
effect. Metric 6 scores only T/M/A so it cannot produce a metric 6 observation,
but metric 5 reads O/R/I and its `unlabelled` numbers carry it. `Revenue:` is
left labelled by the rule, which weakens the Acceptance manipulation.

**Reporting and pooling.** `scopedCount` is now reported per (arm, variant,
condition) and the scoped clauses persisted as `scopedClauses` — a gate whose
rejections cannot be counted cannot be audited, which is why the 2026-08-23
finding sat unseen for eleven days. Metrics 5 and 6 carry a `variant` column.
Variant documents are hashed **only** into `assertion-unlabelled*` /
`redundancy-unlabelled*` keys, never into `common`: 30 new keys, and all 45 keys
stored in `2026-08-23-rna-redundancy.json` verified byte-identical, so `original`
cells stay poolable.

**Verified without spending quota.** Re-scoring 2026-08-23 reproduces its six
original rows exactly; its unlabelled rows read `n=0` with a null rate, not 0%.
A typo'd `--doc-variant` and an unknown flag both exit 1 before any network call.
`--dry-run` prints `G1: pass (11 pairs, 2 dimensions, 1 startup). Variant checks:
pass.` and the two RNA prompts differ in **exactly the document lines** — rubric
block, supplied levels and instructions byte-identical. Merging the two
supplied-level files gives a refusal list byte-identical to the pre-change one
for every non-variant key.

**The stopping rule is live.** If G1 passes and `unlabelled` still yields 0 on
every arm, **metric 6 is retired** — no third manipulation is designed. Retiring
on a rule is the honest end, and it is the end metric 3 was given.

**Still true, and unchanged by any of this:** metric 6 has produced no true
positive on any real generated text (96 historical + 36 fresh observations), and
the two named uncaught classes remain untested.

## Reading the output

Trust the **gap and its direction**, not the absolute levels — there is no
expert ground truth here. A negative gap means the model ranked the mid-stage
venture *below* the early-stage one, as `gemini-2.5-flash-lite` did.

Both generation scripts use `temperature: 0` and the verbatim
`AI_GROUNDING_INSTRUCTION`, so the only variable is the model.

## Caveats

**Generation scripts** (`measure-models`, `measure-differentiation`):

- Small N by design (3 repetitions) — free-tier quota is the constraint and 429
  the failure mode. Both stop cleanly on exhaustion and report partial results;
  check `n=` before comparing cells.
- The prompts mirror the production *shape* but are not `createBasePrompt`, so
  RAG context and startup history are absent.
- Thinking-enabled models still vary run to run at `temperature: 0`.

**Retrieval scripts** (`calibrate-similarity`, `measure-retrieval`) — read
before quoting:

- **The documents are written, not sampled.** Nine descriptions composed for
  this test across three clean domains. Real capsule proposals are longer and
  messier, so this separation is an optimistic case.
- **Ground truth is domain membership, not human judgement** — coarse; the right
  answer is sometimes a same-stage startup in another sector. Neither arm sees
  the labels, which is what keeps it honest.
- **N is 9 documents / 36 pairs.** Enough to reject a 0.70 threshold; not enough
  to fine-tune between 0.78 and 0.80.
- Embeddings are deterministic, so a re-run reproduces exactly — which also
  means repetition buys nothing.

If re-running these for the paper: raise `REPS`, record the date and the model
IDs the API actually returned that day, and re-check the model list first —
`gemini-2.5-flash` disappeared between the checklist being written and the
measurement being taken.

**`measure-grounding.js`:**

- **Step A is free of the generation endpoint, not free outright.** It calls
  `embedContent`, which has its own ceiling (`embed_content_free_tier_requests`)
  — hit once here, recovered within a minute. Embeddings are deterministic, so
  12/12 vs 0/12 reproduces exactly; it is not a small-N number needing reps.
- **Step B's ceiling is a hard daily cap, not `DELAY_MS`.**
  `GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20` for
  `gemini-3.6-flash`, confirmed from the 429 body. The window resets at
  **midnight US Pacific = 15:00 Philippine time**, so a PH-morning run draws on
  the *previous* window and may find it spent — that is why the 2026-07-29 run
  got 16 calls, not 18.
- **N binds every Step B conclusion, and the noise floor is measured rather than
  assumed** — ±1.0 gap points between two byte-identical prompts. Accumulate at
  least three reps with `--merge` before treating any metric-3 difference as real.
- **Metric 1 replaced the old rubric-term metric**, which measured whether
  retrieval's exact wording reached the output rather than whether the output was
  correct. An RNA can contain a `keyTerm` while describing the wrong level, or
  omit every `keyTerm` and be an accurate paraphrase.
- **Metrics 1, 2 and 3 exclude dimensions the model dropped.** An omitted
  `dimension` is skipped by `levelPlacement`, and a missing
  `readiness_level_type` by `stageAppropriateness` — not scored as an error — a missing field is a schema
  problem, not a bad placement or an appropriate recommendation. This script does
  not measure schema compliance; watch `n=`.
- **Metric 2 word-boundary matches, case-insensitively, against the RNA text —
  not the rubric.** `isStageInappropriate` flags a dimension only when a marker
  phrase for a level well above the startup's rung appears (`\bphrase\b`, so
  "ipo" doesn't match inside "IPOPHL"). An advanced action phrased outside the
  lexicon goes unflagged — under-counting, not over-counting.
- **The seeded per-dimension levels are real, not approximated** — from
  `seedDemoStartups` (AgroLink T2/M2/A1/O2/R1/I1, MediSync T5/M4/A3/O4/R3/I3).
  The documents are `measure-differentiation.js`'s verbatim early/mid pair.
- **The `semantic` mode's Step B query is startup-invariant.** With every
  dimension missing (the normal case for a fresh startup), `retrieveRubrics`
  queries the same six-word string whatever the startup or level, so both
  startups receive an *identical* rubric set in that arm. Production code's
  property, not a harness artifact, and a second independent reason the
  substitute cannot deliver a level-appropriate rubric.
- **The profile-data query's ground truth is deliberately loose.** "Correct"
  means every returned row's key is among the startup's 12 valid
  `(dimension, current-or-next-level)` pairs across *all six* dimensions — easier
  to satisfy than Step A's per-dimension check, so the 0/2 empty result is not an
  artifact of an unfairly strict bar.
- **N is 2 startups** for the profile-data query — enough to check whether the
  mechanism clears the floor at all, not enough to characterize a partial-hit rate.
