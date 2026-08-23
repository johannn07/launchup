# RNA redundancy probe (metric 6) — design

Status: approved 2026-08-23, unimplemented.
Extends the RNA probe added 2026-08-06. Supersedes nothing.

## Problem

Every grounding figure this project can quote is the **levels probe**, where the
model infers a readiness level. Production does the opposite: mentors set levels
and the RNA path consumes them. The RNA probe exists and already mirrors
production's `(L, L+1)` retrieval, but **no metric scored on its output has ever
separated the arms**:

| metric | scores RNA | status |
|---|---|---|
| 2 — stage-inappropriate recommendations | yes | 0% on every arm since 2026-07-30 |
| 4 — absent-field fabrication | yes | 0/15 on every arm; opt-in, retired as aimed at something the corpus cannot influence |
| 5 — asserts absent evidence | yes | signal **only** under `inflated`; 0/12 on both arms under `truth` |

So the brief is not "build an RNA probe". It is **"two RNA metrics have
saturated at 0%; design a third that can discriminate, and make its null
interpretable"** — because metric 4's 0% turned out to mean the probe was blind,
and nobody can currently tell which kind of 0% metric 2 is.

**On the 12-vs-54 discrepancy recorded in `SESSION_NOTES.md`.** It is not a
defect. `rag-query.service.ts`'s deterministic branch keys on `level` and
`level + 1`, so six dimensions retrieve twelve rows. The levels probe shows all
54 only because the level is the thing being inferred there. Nothing to fix; the
note reads as a bug and is not one.

## What is measured

**Metric 6 — redundant-need rate.** One binary observation per (call,
dimension): does the RNA state as a **need** an artifact class the source
document shows the startup **already has**?

Reference-free. It is a property of the document, so nothing is adjudicated and
no arm is scored against its own prompt.

**Why not score criterion coverage against the rubric.** The obvious design —
"did the RNA name the criterion the `L+1` rubric defines" — is circular.
`lib/hard-absences.js` already records why: an adjudicator reading the document
with the rubric ladder in view *is approximately the `deviation-deterministic`
condition*, so its agreement with that arm proves nothing. Scoring against the
retrieved rubric would reward the corpus arm for echoing its own prompt, which
is how the original metric 1 (vocabulary reuse) died on 2026-07-29.

## Design

### The mirror of metric 5, on the same machinery

`lib/assertions.js` already segments an RNA into clauses and bins each one, and
`classifyClause(clause, tokens, scope)` is generic over its token list.

| | token list | bin read |
|---|---|---|
| metric 5 | `absentTokens` — what the document never mentions | `asserted` |
| metric 6 | `satisfiedTokens` — what the document evidences | `recommended` |

Same segmentation, same scope-inheritance repair from 2026-08-09, opposite list,
opposite bin. **The classifier is not forked and its cues are not touched** —
`CLASSIFIER_SOURCE` stays byte-identical, or every metric-5 file stops pooling.

### `lib/satisfactions.js`

Per startup, a list of artifact classes the document evidences, each carrying the
document phrase it was read from, and **asserted against the document text at run
time** rather than trusted — the pattern `verifyAbsences` already uses.
Authored, with no external source, and tagged as such: the same standard the
corpus rows and `data/stage-markers.json` are held to.

Held **disjoint from every corpus row's `keyTerms`** by a test, exactly as
`stage-markers.test.js` does, so a corpus arm cannot score well on metric 6 by
echoing rubric text.

### The `deflated` condition

`inflated` (2026-08-06) manipulates O/R/I upward and holds T/M/A at truth.
`deflated` is its mirror: **T/M/A → 1, O/R/I left at truth** as the within-call
control.

The split is forced by the data rather than chosen. Both startups sit at
`O2 R1 I1`, which has no deflation room; MediSync's `T6 M5 A5` has plenty, and
its document evidences the level-1/2 criteria plainly — 44 rural health units
identified, six facilities live, paid subscriptions, PHP 5,000 MRR. Deflating
Market to 1 should make the model recommend identifying a target segment to a
startup with paying customers.

AgroLink (`T2 M3 A3`) deflates only one or two rungs against a thinner document,
so it is the weaker control cell. Recorded before the run: **if the control fires
on MediSync and not on AgroLink, that is the expected shape, not a defect.**

### `--level-condition` gains comma lists, and `both` keeps its meaning

`selectLevelConditions` today accepts **one exact name or `both`** — it has no
comma-list parsing, so `--level-condition=truth,deflated` currently errors. This
run needs exactly that pair, so the flag gains comma lists.

That is consistent rather than novel: `--only-arm` and `--only-probe` both take
comma lists already, and the "exact names only" comment on
`selectLevelConditions` argues against **prefix** matching, not against commas.
An unrecognised entry must still hard-error before any network call, the way
`selectProbes` does — silently running fewer conditions than asked for looks
identical to a clean run.

`both` is **not** widened. It currently means `truth,inflated`, and redefining it
would silently change what an already-recorded command produces — the `--merge`
failure mode in a different costume. So:

- `both` → `truth,inflated`, unchanged, pinned by a test.
- `all` → all three.
- `truth,deflated` and any other comma list → exactly what it names.

`deflated` enters the probe-design fingerprint, so `--merge` refuses to pool
across it.

### Raw RNA text is persisted

**Corrected 2026-08-23 — the claim below was false.** `writeResults`
(`measure-grounding.js:1503-1517`) embeds the whole `results` accumulator
verbatim, and every cell in it (`rnaCalls`, `assertionTruthCalls`,
`assertionDeflatedCalls`, …) already carries the raw `byDim` text. Verified
directly against `results/2026-08-09-supplied-level.json`:
`results.baseline.startups['AgroLink PH'].rnaCalls[0].byDim.Technology` holds
the full generated RNA sentence, not an aggregate. Nothing has ever been
unrecoverable — the historical text is precisely what made the free pilot in
`task-7b-report.md` possible: 96 real observations, scored at zero quota,
against exactly this stored text. The `rnaTexts` accessor below is a flat
convenience view over data that was already there, not a new persistence
mechanism.

~~The results file gains `rnaTexts`: `{arm, startup, condition, rep, dimension,
text}`. Today `rnaCalls` holds generated text in memory and the writer emits only
aggregates plus classifier-flagged clauses, so every RNA this project has paid
quota for is unrecoverable. That is why this design needs a new run rather than
a re-score, and persisting the text is what stops the next metric paying the same
price.~~

## Reported numbers

**Headline — redundant-need rate**, per (arm, condition): binary observations
where at least one `recommended` clause contains a satisfied token, over
dimensions the model actually wrote. Binary rather than a token count, because
counting rewards verbosity and the corpus arm writes longer RNAs — the same rule
metric 5 uses.

**Secondary — denied-satisfaction count.** `NEGATION` is tested before
`RECOMMENDATION`, so *"has not yet secured paying customers"* about MediSync bins
as `negated` and the headline misses it. That is a real and arguably worse
failure — falsely denying evidenced fact — and it is free to count, since the
clause is already classified. Reported separately, never folded into the
headline.

**Metric 6 is therefore an explicit lower bound**, with `negated` as a named
uncaught class. Same standing as metric 5's hand count, and naming the uncaught
class is what makes a lower bound quotable at all.

## Testing — the gate before any quota is spent

Nothing runs until the detector is proven to fire *and* proven to discriminate:

1. Fixture RNA recommending something MediSync's document evidences → **flags**.
2. Fixture RNA naming a genuine gap → does **not** flag.
3. Fixture RNA that *asserts* rather than recommends → does **not** flag; that is
   metric 5's bin.
4. Fixture RNA that *denies* an evidenced fact → lands in the secondary count,
   not the headline.
5. `satisfiedTokens` disjoint from every corpus `keyTerms`.
6. Every `satisfiedToken` asserted present in its document at run time.
7. `CLASSIFIER_SOURCE` unchanged — pinned, so metric-5 pooling survives.
8. `both` still means `truth,inflated`; `all` means three; `truth,deflated`
   selects exactly that pair; an unrecognised entry hard-errors **before** any
   network call.

**Mutation, each asserted to have landed and to have changed behaviour:** delete
the satisfied-token gate; swap the bin read from `recommended` to `asserted`;
drop the run-time document assertion. A mutation that fails to apply reports a
green suite indistinguishable from a decorative guard — assert the anchor
matched.

## Run plan

`--only-arm` is mandatory here — the default `ARMS` list is five arms, which
would cost 20 calls per rep and consume a whole day on arms this probe has no
question for.

```
node measurement/measure-grounding.js \
  --only-arm=baseline,sdd-semantic,deviation-deterministic \
  --only-probe=rna --level-condition=truth,deflated --reps=1 \
  --out=measurement/results/<date>-rna-redundancy.json
```

3 arms × 2 startups × 2 conditions = **12 calls per rep**, one rep per day
against the 20/day cap, window resetting 15:00 Philippine time. n=2 over two
days, accumulated with `--merge`.

Verify the shape with `--dry-run` (no model call) before spending the first
call, and confirm the printed `deflated` prompts actually carry level-1/2 rubric
text.

`sdd-semantic` is in for one reason: on the RNA probe, semantic rubric retrieval
returns zero rows, so it sends a prompt **byte-identical to baseline**. It is an
accidental null control measuring pure sampling spread at temperature 0. That
control is why the 2026-08-05 levels result is quotable and why metric 3 is not.

## Interpretation, pre-registered

Recorded before the first call, and both predictions are falsifiable:

1. **The control fires.** `deflated` redundancy is substantially above `truth` on
   every arm. **If this fails the run is void** and reports a detector problem,
   not a model result. This is the check metric 4 never had.
2. **The corpus arm scores worse than baseline under `deflated`.** It is handed
   level-1/2 criteria as retrieved targets, so it should recommend
   already-satisfied things *more* often than an arm that never sees them.

Prediction 2 predicts the corpus looks bad, deliberately. Both pre-registered
predictions on 2026-08-09 were wrong in opposite directions, which is the only
reason that run's result carries weight.

**Reading the null control:** any arm difference smaller than the
baseline/`sdd-semantic` spread is noise and must not be quoted as an effect.

## Limits that travel with every figure

- **Directional.** Catches recommending what exists; silent on failing to
  recommend what is missing. It cannot reward a good RNA, only penalise a
  redundant one.
- `satisfiedTokens` are **authored with no external source**, provenance-tagged.
- **Lower bound**, with `negated` as the named uncaught class.
- n=2, two documents, one model (`gemini-3.6-flash`), one quota window.
- **`deflated` is a manipulation production does not produce.** Mentors do not
  systematically under-set levels, so a `deflated` result is a statement about a
  vulnerability, not about shipped RNA quality. Only the `truth` cells speak to
  what users receive.

## Out of scope

- Scoring coverage in the positive direction — needs an adjudicated reference,
  explicitly declined during design.
- Any change to `lib/assertions.js` cues or `CLASSIFIER_SOURCE`.
- ~~Re-scoring historical files. The text no longer exists.~~ **Corrected
  2026-08-23: false — see "Raw RNA text is persisted" above.** The text does
  exist, and re-scoring it is exactly how the metric 6 detector was piloted
  and fixed before any quota was spent. Out of scope here for a narrower
  reason: a historical re-score can pilot a detector but can never be *the*
  reported result once the detector was built by reading it (see
  `task-7b-report.md`, "Methodological sequence").
- The RNS path. Same retrieval, different prompt, different consumer.
