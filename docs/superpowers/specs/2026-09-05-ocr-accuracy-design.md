# OCR accuracy — objective 3a's owed numbers

**Pre-registered 2026-09-05, before any Gemini call.** Branch `measure/ocr-accuracy`.

Objective 3a is 🟡 for one reason: the code is done and the *numbers* are owed.
Two of them, and the checklist conflates them.

1. **How accurately does the pipeline read handwriting?** No measurement exists.
2. **`SUPPORT_THRESHOLD = 0.5`** ships in production behaviour and its own
   comment calls it a guess: *"There is no handwriting dataset to calibrate
   against yet... Do not cite it."*

This design settles both against one stored run of 10 calls.

---

## The corpus

10 photographed pages in `Downloads/sample proposals`, **2 writers, 5 each**,
confirmed by John. Writer A used a white spiral notebook and numbered the
proposals; Writer B used a yellow legal pad. Every Writer A page shows
bleed-through from its reverse.

The pages were hand-copied from AI-generated proposals. **That source text is
gone**, which decides the reference question below.

The section schema deliberately varies: six pages use `I.`–`V.` (General
Information / Problem / Solution / Target Market / Objectives), and the other
four each use their own (`A.`–`E.`, a metadata table, `1.`–`5.`, and a header
plus `1.`–`4.`). Recorded in `lib/ocr-inventory.js`.

Two things worth knowing before reading any result:

- `GoldChain.jpg` contains a proposal titled **ColdChain Guard**. The filename
  is wrong, not the transcription.
- The pages carry real-world noise — bleed-through, a stain, curled paper,
  shadow. A poor CER would not be a clean handwriting result.

**n = 2 writers.** Per-writer CER is reportable; "Gemini reads handwriting at
X%" is not.

---

## What is being measured, and by what

One call per image to `getCapsuleProposalInfoFromImage` (`ai/ai.service.ts:822`)
— production code required through ts-node, not reimplemented — storing
`raw_transcription` and all eight fields. **10 calls, once.** Both stages read
the same stored file; neither re-runs the model.

The extraction prompt **orders invention**: *"If not explicitly written,
infer..."*, *"NEVER leave any field as an empty string"*, *"at least 40
characters"*. So a field with no section behind it is not a failure mode — it is
the instructed behaviour, and separating it from a grounded field is precisely
what `SUPPORT_THRESHOLD` is for.

---

## Stage 1 — calibrate `SUPPORT_THRESHOLD`

**Ground truth.** For each of 10 documents × 8 fields, does the page carry a
section supplying that field? Adjudicated by a human, recorded in
`lib/ocr-inventory.js`, **80 labelled observations: 54 grounded, 26 invented.**

**Score.** `supportRatio(field, raw_transcription)` — the *production* function
from `src/ocr/field-confidence.ts`, imported, never reimplemented. Sweep the
threshold across the observed ratios and score each candidate against the labels.

**Selection rule, fixed now.** Maximise Youden's J (`sensitivity + specificity −
1`). Ties break **toward the higher threshold**, because the errors are not
symmetric: a false `verified` renders a green badge on invented content and
tells a Manager to trust it, while a false `low` only withholds a claim.

**Stopping rule, fixed now.** The fitted point must reach **specificity ≥ 0.80
and sensitivity ≥ 0.50**. If no threshold does, **no new number ships** — the
finding is that word-overlap against the transcription does not separate
grounded from invented content, and `SUPPORT_THRESHOLD` stays a declared guess.
A negative here is a real result and must not be rescued by relaxing the bar
after seeing the sweep.

### The confound, and the check that addresses it

The label is nearly determined by *which field it is*: `title`,
`problem_statement`, `target_market`, `solution_description` and `objectives`
are grounded on all 10 pages, `startup_description` invented on all 10. A
classifier could look strong by keying on field-specific text properties —
length, vocabulary, register — rather than on grounding.

`supportRatio` never sees the field name, so it cannot do this directly. But the
two classes still differ systematically by field, so the pooled number is
partly a between-field comparison.

**Pre-registered secondary analysis:** restrict to `scope` and `methodology`,
the only fields whose label varies while the field is held constant — **20
observations, 4 grounded / 16 invented**. This is the confound-free read. It is
underpowered and will be reported as such, but if the pooled result is strong
and this one is at chance, **the pooled result is the artifact** and the report
must say so.

**Limitation to record with the number.** Section-presence is a coarse label: a
field can have a section on the page and still contain invented content within
it. This calibrates against fabrication-from-nothing, not partial invention.

---

## Stage 2 — CER on sampled spans

**Why the reference is typed from the photos.** CER measures the model against
*the page*. The AI source text would have been the wrong reference even had it
survived — the writers introduced their own errors (`RxScan` says "Handwriten"
in its own title), and charging a correct read as an error inflates CER for a
reason unrelated to the model. The source is gone regardless.

**Why not a model-produced reference.** Claude can read these images, and a
transcription Claude produces would be scored against a model of the same class
— errors correlate, and CER comes out flatteringly low for no good reason. Ruled
out.

**Sampling.** One section per document, drawn uniformly by a seeded PRNG
(`mulberry32`, **seed 20260905**) over that document's own sections. 10 spans,
5 per writer. Metadata blocks are **eligible**: they hold the funding figures
and dates downstream extraction depends on, digits are the hardest characters on
these pages, and excluding them would flatter the number.

The draw, fixed and reproducible from the seed:

| Writer | Document | Section |
|---|---|---|
| A | Agritrack.jpg | V. Objectives |
| A | Mediqueue.jpg | III. Solution |
| A | Sakayscan.jpg | I. General Information |
| A | BalikBasura.jpg | III. Solution |
| A | EskwelaKo.jpg | II. Problem |
| B | Anilink.jpg | IV. Target Market |
| B | AquaSense.jpg | C. Technical Proposal |
| B | BarangayPass.jpg | Expected Outcomes |
| B | GoldChain.jpg | 3. Proposed Solution |
| B | RxScan.jpg | 2.) System Architecture |

**Blinding.** The spans are typed from the photographs **before** any model
output is shown. The run may execute first, but no transcription is displayed
until the references are recorded.

**Normalisation, fixed now.** NFC; typographic quotes/dashes folded to ASCII;
all whitespace runs collapsed to one space; trimmed. **Case and punctuation are
kept** — both are real transcription errors, and the writers' own inconsistent
capitalisation is on the page, so charging it is correct. Whitespace is
collapsed because the reference is a flat typed span while the model returns
re-flowed prose; line breaks would otherwise dominate the distance without
saying anything about character recognition.

**Alignment.** Free-start/free-end edit distance (`infixDistance`) between the
reference and the best-matching substring of `raw_transcription`, so the page's
other sections are not charged as deletions. A span the model omits entirely
still scores distance ≈ its own length, i.e. CER ≈ 1 — the correct answer for a
total miss.

**CER = distance / reference length**, not clamped: an insertion-heavy read can
exceed 1, and capping it would misreport it.

**Reporting.** Per-span CER, then per-writer, then pooled — in that order, so
one catastrophic miss is visible rather than averaged away.

---

## Pre-registered predictions

Recorded so the analysis cannot be written to fit whatever comes back.

1. **Pooled CER below 0.15.** The hands are neat and Gemini vision is strong.
2. **Writer A's CER exceeds Writer B's** — cramped hand, heavy bleed-through.
3. **The fitted threshold lands above 0.5**, i.e. the shipped value is too
   permissive. The prompt tells the model to build invented fields *from visible
   detail*, so invented text should reuse page vocabulary and score higher than
   0.5 by construction.

Prediction 3 is the one that matters and the one I am least sure of.

---

## Gates — all zero-quota, all before the run

- `--dry-run` prints the full plan and makes **zero** network calls.
- Span selection reproducible from the seed; a different seed moves the draw.
- Every selected span names a section its document actually has.
- Inventory well-formed: 10 documents, 5 per writer, all eight fields labelled
  boolean on every document, no extra keys.
- CER primitives verified against known values, including an exact read (0), a
  total miss (≈1), an absent reference (null, never 0), and a one-character
  misread at the exact expected rate.
- `supportRatio` is imported from production, and a test asserts the harness
  does not define its own.

## What this cannot claim

- Nothing about **sketch/canvas recognition** (3b). Different objective, still
  absent.
- Nothing about **SUS** — 3c's other half needs the user study.
- Nothing generalisable across handwriting: **n = 2 writers, 1 model, 1 quota
  window, 10 pages, one page each.**
- Stage 1's labels are section-presence, not content-level grounding.
