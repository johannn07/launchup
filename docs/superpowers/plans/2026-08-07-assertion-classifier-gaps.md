# Assertion Classifier Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the four measured defects in the fabrication classifier, then re-run the supplied-level probe on a fresh quota window.

**Architecture:** All code changes are in one pure module, `backend/measurement/lib/assertions.js` — no I/O, no model calls, no harness dependency. `classifyClause` tests cues in the order negation → recommendation → assertion, and that ordering is the safety property the whole design rests on: widening the first two can only move clauses *out of* `asserted`, so only the accompaniment predicate (Task 5) can raise the measured rate. Editing this module changes the `assertion|*` fingerprint by design, so the re-run is a fresh experiment that must refuse to pool with 2026-08-06.

**Tech Stack:** Node 22, `node:test` + `node:assert` (no Jest here — the measurement suite is separate from `backend`'s Jest suite), CommonJS.

**Spec:** `docs/superpowers/specs/2026-08-07-assertion-classifier-gaps-design.md`

## Global Constraints

- **Tasks 1-7 modify only `backend/measurement/lib/assertions.js` and `backend/measurement/tests/assertions.test.js`.** `lib/hard-absences.js`, `lib/metrics.js`, `lib/fingerprint.js` and `measure-grounding.js` are untouched by every task. Task 8 additionally writes a results JSON and updates `measurement/README.md`, `TODO_CHECKLIST.md` and `SESSION_NOTES.md` — that is documentation, and it is the only task permitted to touch them.
- **Do not re-score `measurement/results/2026-08-06-supplied-level.json`, and do not quote a corrected rate from it.** The audit dump is design input only.
- **Baseline test suite: `pnpm test:measurement` → 178 passing, 0 failing.** Run from `backend/`. It must read 178+N passing / 0 failing at the end of every task. *(Note: `SESSION_NOTES.md` records 117 — that figure predates the 2026-08-06 branch and is corrected in Task 8.)*
- **The test runner needs the glob, not the directory.** `node --test measurement/tests/` fails; use `pnpm test:measurement`, or `node --test measurement/tests/assertions.test.js` for one file.
- All fixture strings are copied **verbatim** from `measurement/results/2026-08-06-supplied-level.json` — real model output. Do not paraphrase or tidy them.
- Every new regex goes in the `CUES` object (Task 6), never as a loose `const`.
- Commit after every task. Do not push. Work on branch `measure/assertion-classifier-gaps` (already created, holds the spec at `c536dd5`).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `backend/measurement/lib/assertions.js` | The whole classifier: cue regexes, clause splitting, per-clause classification, per-dimension scoring, and the fingerprint material | Modified — all six spec sections |
| `backend/measurement/tests/assertions.test.js` | Behaviour of the above, including the mutant-killers that make each cue load-bearing | Modified — new tests appended per task |

No new files. The module is ~155 lines and each spec section touches a different part of it; splitting it would separate cues from the function that applies them.

---

### Task 1: Abbreviation-safe sentence split

**Files:**
- Modify: `backend/measurement/lib/assertions.js:68-82` (`splitClauses`)
- Test: `backend/measurement/tests/assertions.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SENTENCE_BREAK` — a module-level `RegExp` used only inside `splitClauses`. Task 6 moves it into `CUES`.

- [ ] **Step 1: Write the failing test**

Append to `backend/measurement/tests/assertions.test.js`:

```js
// --------------------------------------------------------------------------
// Gap 4a, measured 2026-08-06. `Dr.` inside a founder name was read as a
// sentence end, so the accompaniment clause reached classifyClause as a
// fragment starting mid-name and could never be classified.
// --------------------------------------------------------------------------

test('an abbreviation period is not a sentence end', () => {
  const clauses = splitClauses(
    'Currently at ORL 3, led by 3 founders (Dr. Elena Reyes, Marco Villanueva, Joy Tabotabo) alongside a first non-founder contributor. To achieve ORL 4, the startup must draft formal role definitions.',
  );
  assert.equal(clauses.length, 2, 'split at "Dr." would give 3');
  assert.match(clauses[0], /^Currently at ORL 3/);
  assert.match(clauses[0], /alongside a first non-founder contributor\.$/);
});

test('a real sentence boundary still splits', () => {
  const clauses = splitClauses('The venture has secured angel funding. No term sheet exists.');
  assert.equal(clauses.length, 2);
});

test('a bare initial is not a sentence end', () => {
  const clauses = splitClauses('Founders are E. Reyes and M. Villanueva of the venture.');
  assert.equal(clauses.length, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```bash
node --test measurement/tests/assertions.test.js
```
Expected: FAIL — `an abbreviation period is not a sentence end` reports `3 !== 2`. The other two pass already; that is fine, they are regression guards.

- [ ] **Step 3: Implement**

In `backend/measurement/lib/assertions.js`, add above `splitClauses`:

```js
/**
 * Sentence break, refusing abbreviation periods.
 *
 * `Dr.` is the measured case: an RNA read "led by 3 founders (Dr. Elena Reyes,
 * ...)" and the split left a fragment starting mid-name, which no cue could
 * classify. The rest are the same class and cost nothing.
 */
const SENTENCE_BREAK =
  /(?<=[.!?])(?<!\b(?:Dr|Mr|Mrs|Ms|Prof|Inc|Corp|Ltd|Co|St|No|vs|approx|Fig)\.)(?<!\b[A-Z]\.)(?<!\be\.g\.)(?<!\bi\.e\.)\s+|;\s*/;
```

Then change the first line of `splitClauses`'s chain from:

```js
    .split(/(?<=[.!?])\s+|;\s*/)
```

to:

```js
    .split(SENTENCE_BREAK)
```

Note the `;\s*` alternative moves into `SENTENCE_BREAK` unchanged — do not drop it.

- [ ] **Step 4: Run the full measurement suite**

Run from `backend/`:
```bash
pnpm test:measurement
```
Expected: PASS, 181 tests, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/lib/assertions.js backend/measurement/tests/assertions.test.js
git commit -m "fix(measurement): stop splitting sentences at abbreviation periods

'Dr.' inside a founder name was read as a sentence end, leaving the
accompaniment clause as a mid-name fragment that no cue could classify.
One of the two genuine assertions the 2026-08-06 run missed."
```

---

### Task 2: `RECOMMENDATION` covers the `Needs:` label form

**Files:**
- Modify: `backend/measurement/lib/assertions.js:20-21` (`RECOMMENDATION`)
- Test: `backend/measurement/tests/assertions.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: no new export. `RECOMMENDATION` keeps its name and stays a module-level `RegExp`.

**Why this is safe to widen freely:** `classifyClause` tests recommendation *before* assertion, so every clause this newly matches moves out of `asserted` or `unclassified` and into `recommended`. It cannot raise the fabrication rate.

- [ ] **Step 1: Write the failing tests**

Append to `backend/measurement/tests/assertions.test.js`:

```js
// --------------------------------------------------------------------------
// Gap 1, measured 2026-08-06: seven of the fourteen `unclassified` clauses were
// recommendations wearing a label. RECOMMENDATION required `need\s+to`, so
// "Needs:", "Need:", "Needs a ..." and "needed" all missed. Strings verbatim
// from measurement/results/2026-08-06-supplied-level.json.
// --------------------------------------------------------------------------

const LABEL_FORM = [
  [ORG, 'Needs: Advance to ORL 3 by engaging the first non-founder contributor, such as a contractor, advisor, or part-time hire.'],
  [INVEST, 'Needs: Advance to IRL 2 by forming an informal funding hypothesis regarding future capital needs and potential target raise amounts.'],
  [INVEST, 'Need: Draft an initial funding hypothesis, outline target raise requirements'],
  [INVEST, 'Needs a defined financial model and funding strategy to support technology development and field operations.'],
  [INVEST, 'Needs initial funding or capital investment to transition from prototype to working platform development.'],
  [REGU, 'Needs: Assemble a documented requirements checklist detailing the specific permits, regulatory standards'],
  [INVEST, 'Needs: Complete a pitch deck or one-pager and conduct initial investor conversations, logging meetings held with targeted investors to reach IRL 4.'],
];

for (const [tokens, clause] of LABEL_FORM) {
  test(`a labelled requirement is a recommendation: "${clause.slice(0, 40)}..."`, () => {
    assert.equal(classifyClause(clause, tokens), 'recommended');
  });
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```bash
node --test measurement/tests/assertions.test.js
```
Expected: FAIL on all seven — each reports `'unclassified' !== 'recommended'`.

- [ ] **Step 3: Implement**

In `backend/measurement/lib/assertions.js`, replace `RECOMMENDATION` with:

```js
/**
 * `need(?:s|ed|ing)?` rather than `need\s+to`: the model's modal form for a
 * requirement is a label — "Needs: Advance to ORL 3", "Need: Draft an initial
 * funding hypothesis", "Needs a defined financial model", "certifications
 * needed". Seven of fourteen unclassified clauses on 2026-08-06 were this.
 *
 * Widening here cannot raise the fabrication rate: classifyClause tests
 * recommendation before assertion, so a new match can only move a clause OUT of
 * `asserted`.
 */
const RECOMMENDATION =
  /\b(?:should|must|need(?:s|ed|ing)?|recommend(?:s|ed|ation)?|consider|begin|start|prioriti[sz]e|next\s+step|plan\s+to|aim\s+to|ought\s+to|advis(?:e|ed|able))\b/i;
```

- [ ] **Step 4: Run the full measurement suite**

Run from `backend/`:
```bash
pnpm test:measurement
```
Expected: PASS, 188 tests, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/lib/assertions.js backend/measurement/tests/assertions.test.js
git commit -m "fix(measurement): recognise the Needs:/needed requirement forms

RECOMMENDATION required 'need to', so the model's actual modal form - a
'Needs:' label - fell through to unclassified. Seven of the fourteen
unclassified clauses on 2026-08-06."
```

---

### Task 3: Coordination scope inheritance

**Files:**
- Modify: `backend/measurement/lib/assertions.js` — `classifyClause` (`:92-99`) and `scoreAssertedAbsences` (`:111-132`)
- Test: `backend/measurement/tests/assertions.test.js`

**Interfaces:**
- Consumes: `RECOMMENDATION` as widened in Task 2 — three of the six fixture clauses inherit a `Needs:` head and fail without it.
- Produces:
  - `CONTINUATION` — module-level `RegExp`, `/^\s*(?:and|or|then)\b/i`.
  - `classifyClause(clause, tokens, scope = '')` — third parameter added, defaulting to `''`. All existing two-argument callers and tests are unaffected.

**The design point:** inheritance is scoped to **cues**, not to a verdict. Head clauses often contain no artifact token (`"To achieve ORL 4, the startup must draft formal role definitions…"` has none), so they classify as `null` and there would be no verdict to inherit. Testing the cue regexes against `scope + clause` reconstructs the original sentence scope instead.

- [ ] **Step 1: Write the failing tests**

Append to `backend/measurement/tests/assertions.test.js`:

```js
// --------------------------------------------------------------------------
// Gap 2, measured 2026-08-06. A comma-and split strands a continuation fragment
// from the modal governing it, leaving it cue-less. Five clauses landed in
// `unclassified` this way — and one landed in `asserted`, which is a live
// counterexample to this module's lower-bound guarantee.
// --------------------------------------------------------------------------

// THE FALSE POSITIVE. Source RNA: "To reach IRL 4, the startup must convert its
// funding plan into an investor pitch deck or one-pager, initiate warm-intro
// investor meetings, and maintain an active log of investor pitches conducted."
// The fragment lost its `must`, and ASSERTION's `maintains?` fired.
test('a stranded continuation does not assert off its own verb', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'To reach IRL 4, the startup must convert its funding plan into an investor pitch deck or one-pager, initiate warm-intro investor meetings, and maintain an active log of investor pitches conducted.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations[0].asserted, false, 'the governing "must" makes every fragment advice');
  assert.equal(r.observations[0].unclassified, false);
});

const STRANDED = [
  ['Organizational', ORG, 'To achieve ORL 4, the startup must draft formal role definitions for the core team, create initial operational process artifacts like onboarding checklists or decision logs, and prepare for its first full-time hire beyond the founding team.'],
  ['Organizational', ORG, 'Need: Document role descriptions, establish operational decision processes, and bring on a first non-founder contributor.'],
  ['Investment', INVEST, 'To advance investment readiness, AgroLink PH needs to create a written funding plan specifying target raise amounts and use of funds, prepare a pitch deck, and initiate preliminary investor discussions.'],
  ['Investment', INVEST, 'Needs to build financial models, investor pitch materials, and investment pitch to secure initial funding.'],
  ['Regulatory', REGU, 'Needs: Assemble a documented requirements checklist detailing the specific permits, regulatory standards, and compliance certifications needed for health referral software to reach RRL 4.'],
];

for (const [dim, tokens, sentence] of STRANDED) {
  test(`a continuation fragment inherits its governing modal: ${dim} — "${sentence.slice(0, 40)}..."`, () => {
    const r = scoreAssertedAbsences({ [dim]: sentence }, { [dim]: HARD_ABSENCES[dim] });
    assert.equal(r.observations[0].asserted, false);
    assert.equal(r.observations[0].unclassified, false, 'the fragment should be recommended, not unclassified');
  });
}

// A fragment must never inherit `asserted` — inheritance carries only the two
// gates that resolve AWAY from fabrication. Without that restriction this would
// score asserted off the head clause's participle.
test('a continuation fragment never inherits an assertion', () => {
  assert.equal(
    classifyClause('and a term sheet', INVEST, 'The venture has secured angel funding'),
    'unclassified',
    'inheriting `asserted` would manufacture a fabrication from a neighbour',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```bash
node --test measurement/tests/assertions.test.js
```
Expected: FAIL — `a stranded continuation does not assert off its own verb` reports `true !== false`; the five `STRANDED` cases report `unclassified` is `true`.

- [ ] **Step 3: Implement**

In `backend/measurement/lib/assertions.js`, add above `classifyClause`:

```js
/**
 * A fragment left by a coordination split. Its subject and its modal are in the
 * previous clause: "..., and prepare for its first full-time hire" carries no
 * cue of its own, and "..., and maintain an active log" carried an ASSERTION cue
 * it had no right to.
 */
const CONTINUATION = /^\s*(?:and|or|then)\b/i;
```

Replace `classifyClause` with:

```js
/**
 * Returns null when the clause names no absent artifact at all.
 *
 * Order is load-bearing: negation, then recommendation, then assertion. A clause
 * holding both "has" and "not" is a correct report of an absence, and a clause
 * holding both "has" and "should" is advice. Testing assertion first would score
 * both as fabrications.
 *
 * `scope` is the clause governing a continuation fragment. Only the two gates
 * that resolve AWAY from fabrication see it — the token test and ASSERTION read
 * the fragment alone, so a fragment can never be made `asserted` by its
 * neighbour. Inheriting cues rather than a verdict is deliberate: a head clause
 * frequently holds no artifact token and so classifies as null, leaving a
 * verdict-inheriting design nothing to inherit.
 */
function classifyClause(clause, tokens, scope = '') {
  const text = String(clause);
  if (!tokens.some((t) => tokenRe(t).test(text))) return null;
  const gated = scope ? `${scope} ${text}` : text;
  if (NEGATION.test(gated)) return 'negated';
  if (RECOMMENDATION.test(gated) || IMPERATIVE.test(gated.trim())) return 'recommended';
  if (ASSERTION.test(text)) return 'asserted';
  return 'unclassified';
}
```

In `scoreAssertedAbsences`, replace the inner clause loop:

```js
    const clauses = [];
    let scope = '';
    for (const clause of splitClauses(text)) {
      const continuation = CONTINUATION.test(clause);
      // artifactTokens, not absentTokens: the broad list is verifyAbsences'
      // absence guarantee and fires on abstract usage here. See lib/hard-absences.js.
      const klass = classifyClause(clause, spec.artifactTokens, continuation ? scope : '');
      if (!continuation) scope = clause;
      if (klass) clauses.push({ text: clause, klass });
    }
```

- [ ] **Step 4: Run the full measurement suite**

Run from `backend/`:
```bash
pnpm test:measurement
```
Expected: PASS, 195 tests, 0 failing.

Pay attention to two pre-existing tests that must still pass — they are the reason inheritance is keyed on a leading coordinator rather than on every split:
- `a leading "While" scopes its negation to its own clause` (`:206`)
- `"and has not" starts a new clause; the assertion before it survives` (`:214`)

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/lib/assertions.js backend/measurement/tests/assertions.test.js
git commit -m "fix(measurement): continuation fragments inherit their governing clause

A comma-and split strands a fragment from its modal. Five clauses fell to
unclassified this way, and one - 'and maintain an active log of investor
pitches conducted' - scored asserted off a lost 'must', which is a
counterexample to the module's own lower-bound guarantee.

Only NEGATION/RECOMMENDATION/IMPERATIVE see the governing clause. The
token test and ASSERTION read the fragment alone, so inheritance can only
move a clause out of `asserted`."
```

---

### Task 4: `exists` as an assertion cue

**Files:**
- Modify: `backend/measurement/lib/assertions.js:36-37` (`ASSERTION`)
- Test: `backend/measurement/tests/assertions.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: no new export.

**This is the first change that can raise the measured rate**, so it is scoped to one word family and the rejected candidates get tests of their own.

- [ ] **Step 1: Write the failing tests**

Append to `backend/measurement/tests/assertions.test.js`:

```js
// --------------------------------------------------------------------------
// Gap 3, measured 2026-08-06. Verbatim from the audit dump — MediSync,
// corpus arm, inflated condition, rep 1.
// --------------------------------------------------------------------------

test('an existential predicate on an artifact is an assertion', () => {
  assert.equal(
    classifyClause('A basic funding plan exists alongside PHP 5,000 MRR.', INVEST),
    'asserted',
  );
});

test('a negated existential is still correct reporting', () => {
  assert.equal(classifyClause('No funding plan exists at all', INVEST), 'negated');
});

test('a recommended existential is still advice', () => {
  assert.equal(classifyClause('A written funding plan should exist by Q3', INVEST), 'recommended');
});

// Both were floated in SESSION_NOTES.md as likely additions alongside `exists`.
// Both are refused: neither has a measured instance, and each has a plain
// counterexample that would break the lower-bound guarantee.
test('"remains" is refused — it asserts nothing about existence', () => {
  assert.notEqual(classifyClause('A permit remains outstanding', REGU), 'asserted');
});

test('"includes" is refused — a plan is not an artifact in existence', () => {
  assert.notEqual(classifyClause('The roadmap includes a contractor engagement', ORG), 'asserted');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```bash
node --test measurement/tests/assertions.test.js
```
Expected: FAIL on `an existential predicate on an artifact is an assertion` — reports `'unclassified' !== 'asserted'`. The other four pass already and are guards.

- [ ] **Step 3: Implement**

In `backend/measurement/lib/assertions.js`, extend `ASSERTION`'s participle group with the existential family. The comment above it gains a paragraph:

```js
/**
 * Possession ("has a funding plan") and achievement ("counsel engaged", "is in
 * place") assert that an artifact exists. A bare copula does not: "investor
 * interest is growing" names no artifact, and admitting it would bias the rate
 * upward — the opposite of this module's lower-bound guarantee.
 *
 * Copula fabrications are still caught through their participle: "angel funding
 * is secured" matches `secured`, so no separate "is + X" alternative is needed.
 *
 * `exists` is the one existential added (measured 2026-08-06: "A basic funding
 * plan exists alongside PHP 5,000 MRR"). It is safe only because negation and
 * recommendation are tested first — "no funding plan exists" and "should exist"
 * both exit before this runs. `remains` and `includes` were considered and
 * REFUSED: "a permit remains outstanding" and "the roadmap includes a contractor
 * engagement" assert nothing, and neither has a measured instance.
 */
const ASSERTION =
  /\b(?:has|have|had|maintains?|holds?)\b|\b(?:secured|obtained|engaged|established|drafted|filed|signed|hired|appointed|registered|retained|completed|received|granted|issued)\b|\b(?:exists?|existed|existing)\b|\bin\s+place\b|\bunder\s+contract\b/i;
```

- [ ] **Step 4: Run the full measurement suite**

Run from `backend/`:
```bash
pnpm test:measurement
```
Expected: PASS, 200 tests, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/lib/assertions.js backend/measurement/tests/assertions.test.js
git commit -m "feat(measurement): add exists to the assertion cues

'A basic funding plan exists alongside PHP 5,000 MRR' was one of the two
genuine fabrications sitting in unclassified on 2026-08-06.

remains and includes are refused with tests, not just omitted - both were
floated in the session notes and both have plain counterexamples."
```

---

### Task 5: Accompaniment predicate

**Files:**
- Modify: `backend/measurement/lib/assertions.js` — new `ACCOMPANIMENT`, `ACCOMPANIMENT_WINDOW`, `assertsByAccompaniment`; one line in `classifyClause`
- Test: `backend/measurement/tests/assertions.test.js`

**Interfaces:**
- Consumes: `tokenRe` (existing, `:47`); `SENTENCE_BREAK` from Task 1 — without it the target clause never arrives whole.
- Produces:
  - `ACCOMPANIMENT` — module-level `RegExp`, **global-flagged** (`matchAll` needs it).
  - `ACCOMPANIMENT_WINDOW` — module-level `number`, `40`.
  - `assertsByAccompaniment(text, tokens) -> boolean` — module-private, not exported.

**This is the only change in the plan that can move the measured rate upward.** It carries the heaviest mutant-killer burden in Task 7.

- [ ] **Step 1: Write the failing tests**

Append to `backend/measurement/tests/assertions.test.js`:

```js
// --------------------------------------------------------------------------
// Gap 4b, measured 2026-08-06. Once the `Dr.` split is fixed the clause arrives
// whole — and still has no cue. It asserts by accompaniment: no possession, no
// achievement participle, just the artifact hung off "alongside".
// --------------------------------------------------------------------------

test('an artifact governed by an accompaniment preposition is asserted', () => {
  const r = scoreAssertedAbsences(
    { Organizational: 'Currently at ORL 3, led by 3 founders (Dr. Elena Reyes, Marco Villanueva, Joy Tabotabo) alongside a first non-founder contributor.' },
    { Organizational: HARD_ABSENCES.Organizational },
  );
  assert.equal(r.observations[0].asserted, true);
});

// `with` is deliberately NOT an accompaniment preposition. It is pervasive and
// cannot be restricted usefully, and excluding it costs nothing measured: the
// two already-detected assertions use `with` but are caught by their participle.
test('"with" is not an accompaniment preposition', () => {
  // The clause must CONTAIN an artifact token, or classifyClause returns null
  // and the assertion passes without testing anything. "advisor" is in
  // Organizational's artifactTokens; "founders" and "full-time" are not.
  assert.equal(
    classifyClause('The venture operates with an advisor role planned for Q3', ORG),
    'unclassified',
    'adding `with` to ACCOMPANIMENT would make this assert',
  );
});

test('an accompaniment assertion caught by its participle still works', () => {
  assert.equal(
    classifyClause('Currently at RRL 3, with legal counsel engaged and a trademark application pending with IPOPHL.', REGU),
    'asserted',
    'this one is caught by `engaged`, not by accompaniment',
  );
});

// The window and the punctuation guard are separate restrictions and need
// separate tests: a span long enough to fail the window usually also contains a
// comma, so one fixture would leave whichever guard runs second unkilled.
test('a preposition separated from the token by punctuation does not assert', () => {
  assert.equal(
    classifyClause('Growth continued alongside strong demand, and a term sheet', INVEST),
    'unclassified',
    'the comma puts the preposition and the token in different phrases',
  );
});

test('a preposition beyond the noun-phrase window does not assert', () => {
  // 61 characters between "alongside" and "term sheet", and deliberately no
  // punctuation — this fixture kills a widened ACCOMPANIMENT_WINDOW and nothing else.
  assert.equal(
    classifyClause(
      'The platform grew alongside sustained demand from cooperatives across the province and a term sheet',
      INVEST,
    ),
    'unclassified',
    'the preposition governs "demand", not the distant token',
  );
});

// Negation still wins, which is what protects a real reported absence that
// happens to contain an accompaniment preposition.
test('negation beats accompaniment', () => {
  assert.equal(
    classifyClause('Currently operating solely on founder time and personal resources alongside PHP 5,000 MRR without a funding plan.', INVEST),
    'negated',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```bash
node --test measurement/tests/assertions.test.js
```
Expected: FAIL on `an artifact governed by an accompaniment preposition is asserted` — reports `false !== true`. The other four pass already and are guards.

- [ ] **Step 3: Implement**

In `backend/measurement/lib/assertions.js`, add after `tokenRe`:

```js
/**
 * Accompaniment asserts existence without a verb: "led by 3 founders alongside
 * a first non-founder contributor" holds no possession and no achievement
 * participle, yet claims the contributor exists.
 *
 * `with` is deliberately absent. It is pervasive and un-restrictable —
 * "Currently at ORL 2 with founders committed full-time", "engage a contributor
 * with a formal agreement" — and it costs nothing measured, because the
 * `with` assertions the probe has actually caught were caught by their
 * participle (`engaged`, `drafted`).
 *
 * Global flag is required: assertsByAccompaniment uses matchAll.
 */
const ACCOMPANIMENT =
  /\b(?:alongside|along\s+with|together\s+with|accompanied\s+by|as\s+well\s+as)\b/gi;

/**
 * The noun-phrase window between the preposition and the artifact it governs.
 * Admits "alongside a first non-founder contributor" (32) while refusing a
 * preposition that governs some earlier phrase. A constant, not a literal at the
 * call site, so a recalibration is one edit and shows up in CLASSIFIER_SOURCE.
 */
const ACCOMPANIMENT_WINDOW = 40;

/**
 * True when an artifact token is the object of an accompaniment preposition:
 * within ACCOMPANIMENT_WINDOW characters after it, with no punctuation between
 * that would put them in different phrases.
 */
function assertsByAccompaniment(text, tokens) {
  const preps = [...text.matchAll(ACCOMPANIMENT)].map((m) => m.index + m[0].length);
  if (!preps.length) return false;
  for (const token of tokens) {
    const m = tokenRe(token).exec(text);
    if (!m) continue;
    for (const end of preps) {
      if (m.index <= end) continue;
      const span = text.slice(end, m.index);
      if (span.length <= ACCOMPANIMENT_WINDOW && !/[,;()]/.test(span)) return true;
    }
  }
  return false;
}
```

In `classifyClause`, change the assertion line from:

```js
  if (ASSERTION.test(text)) return 'asserted';
```

to:

```js
  if (ASSERTION.test(text) || assertsByAccompaniment(text, tokens)) return 'asserted';
```

- [ ] **Step 4: Run the full measurement suite**

Run from `backend/`:
```bash
pnpm test:measurement
```
Expected: PASS, 206 tests, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/lib/assertions.js backend/measurement/tests/assertions.test.js
git commit -m "feat(measurement): detect assertion by accompaniment

'led by 3 founders alongside a first non-founder contributor' holds no
possession and no achievement participle, yet claims the contributor
exists. The second of the two genuine fabrications missed on 2026-08-06.

Positional rather than a whole-clause cue: the token must be the object
of the preposition, within a 40-char noun-phrase window with no
punctuation between. 'with' is excluded - pervasive, un-restrictable, and
costs nothing measured."
```

---

### Task 6: `CUES` and the fingerprint guard

**Files:**
- Modify: `backend/measurement/lib/assertions.js:143-155` (`CLASSIFIER_SOURCE`, exports)
- Test: `backend/measurement/tests/assertions.test.js`

**Interfaces:**
- Consumes: every regex from Tasks 1-5 — `SENTENCE_BREAK`, `CONTINUATION`, `ACCOMPANIMENT` — plus the four originals.
- Produces: `CUES` — a new named export, `{ NEGATION, RECOMMENDATION, IMPERATIVE, ASSERTION, ACCOMPANIMENT, AND_CLAUSE, CONTINUATION, SENTENCE_BREAK }`. `CLASSIFIER_SOURCE` keeps its name, type (`string`) and meaning.

**Why:** the module's standing instruction — "add any new regex or helper here at the same time you add it above" — is exactly the kind of comment that gets missed, and the consequence is data scored by two different classifiers pooling silently. Building the hash *from* `CUES` makes the omission impossible; the test catches a regex declared outside `CUES`, which building from `CUES` cannot.

- [ ] **Step 1: Write the failing test**

Append to `backend/measurement/tests/assertions.test.js`. Add `const fs = require('fs');` near the top imports if it is not already there.

```js
// --------------------------------------------------------------------------
// CLASSIFIER_SOURCE is what `assertion|*` hashes. Building it from CUES makes a
// forgotten regex impossible; this test catches the other half — a regex
// declared outside CUES entirely.
// --------------------------------------------------------------------------

test('every module-level constant is either a cue or a named non-cue', () => {
  const { CUES } = require(path.resolve(__dirname, '../lib/assertions.js'));
  const src = fs.readFileSync(path.resolve(__dirname, '../lib/assertions.js'), 'utf8');
  const NON_CUES = ['ACCOMPANIMENT_WINDOW', 'CLASSIFIER_SOURCE', 'CUES'];
  const declared = [...src.matchAll(/^const ([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
  assert.ok(declared.length >= 8, 'the scan found nothing — the regex stopped matching declarations');
  for (const name of declared) {
    assert.ok(
      Object.hasOwn(CUES, name) || NON_CUES.includes(name),
      `${name} is a module constant in neither CUES nor NON_CUES, so it may be missing from CLASSIFIER_SOURCE`,
    );
  }
});

test('CLASSIFIER_SOURCE carries every cue in CUES', () => {
  const { CUES, CLASSIFIER_SOURCE: SRC } = require(path.resolve(__dirname, '../lib/assertions.js'));
  for (const [name, re] of Object.entries(CUES)) {
    assert.ok(SRC.includes(re.source), `CLASSIFIER_SOURCE is missing ${name}`);
  }
});

test('CLASSIFIER_SOURCE carries the accompaniment window and every helper', () => {
  const { CLASSIFIER_SOURCE: SRC } = require(path.resolve(__dirname, '../lib/assertions.js'));
  for (const fragment of ['(?:s|es)?', 'ACCOMPANIMENT_WINDOW', 'matchAll', 'rnaByDim', "'recommended'"]) {
    assert.ok(SRC.includes(fragment), `CLASSIFIER_SOURCE is missing ${fragment}`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```bash
node --test measurement/tests/assertions.test.js
```
Expected: FAIL — all three, because `CUES` is not exported yet (`Cannot read properties of undefined`).

- [ ] **Step 3: Implement**

In `backend/measurement/lib/assertions.js`, replace the `CLASSIFIER_SOURCE` block and the exports:

```js
/**
 * The cue regexes, collected so CLASSIFIER_SOURCE is built FROM them rather than
 * listing them again. The old list was a standing instruction to remember, and
 * the consequence of forgetting was data scored by two different classifiers
 * pooling under one fingerprint. tests/assertions.test.js catches the remaining
 * hole — a regex declared outside this object.
 */
const CUES = {
  NEGATION,
  RECOMMENDATION,
  IMPERATIVE,
  ASSERTION,
  ACCOMPANIMENT,
  AND_CLAUSE,
  CONTINUATION,
  SENTENCE_BREAK,
};

/** What `assertion|*` hashes. Regexes included, not just one function's .toString(). */
const CLASSIFIER_SOURCE = [
  ...Object.values(CUES).map((re) => re.source),
  `ACCOMPANIMENT_WINDOW=${ACCOMPANIMENT_WINDOW}`,
  tokenRe.toString(),
  assertsByAccompaniment.toString(),
  splitClauses.toString(),
  classifyClause.toString(),
  scoreAssertedAbsences.toString(),
].join('\n');

module.exports = { splitClauses, classifyClause, scoreAssertedAbsences, CUES, CLASSIFIER_SOURCE };
```

- [ ] **Step 4: Run the full measurement suite**

Run from `backend/`:
```bash
pnpm test:measurement
```
Expected: PASS, 209 tests, 0 failing.

The pre-existing test `CLASSIFIER_SOURCE carries every cue regex, every helper and the token matcher` (`:234`) must still pass — its distinctive substrings all survive, since no cue lost a branch in this plan.

- [ ] **Step 5: Confirm the fingerprint actually moved**

This is the point of the task. Run from `backend/`:

```bash
node -e "const {CLASSIFIER_SOURCE}=require('./measurement/lib/assertions.js'); const {fingerprintMap}=require('./measurement/lib/fingerprint.js'); const {HARD_ABSENCES}=require('./measurement/lib/hard-absences.js'); console.log(fingerprintMap({common:{},markers:[],rubrics:[],sources:{rna:'r',levels:'l',fabrication:'f',assertion:CLASSIFIER_SOURCE},absences:HARD_ABSENCES,arms:[{name:'baseline',ragCorpus:false,rubricMode:null}]})['assertion|baseline'])"
```

Record the printed hash in the commit message. It must differ from whatever `2026-08-06-supplied-level.json` carries for `assertion|baseline` — read that with:

```bash
node -e "const j=require('./measurement/results/2026-08-06-supplied-level.json'); console.log(JSON.stringify(j.fingerprints||j.meta&&j.meta.fingerprints,null,1))"
```

If they match, stop — something is wrong with how `CLASSIFIER_SOURCE` is assembled, and the re-run would silently pool with data scored by the old classifier.

- [ ] **Step 6: Commit**

```bash
git add backend/measurement/lib/assertions.js backend/measurement/tests/assertions.test.js
git commit -m "refactor(measurement): build CLASSIFIER_SOURCE from a CUES object

The old list was a standing instruction to remember; forgetting it would
let data scored by two different classifiers pool under one fingerprint.
Building the hash from CUES makes that impossible, and a source scan
catches a regex declared outside CUES.

assertion|baseline moves to <hash from step 5>, so the re-run cannot pool
with 2026-08-06. That is the guard working."
```

---

### Task 7: Mutation pass

**Files:**
- No production changes. Temporary edits to `backend/measurement/lib/assertions.js`, each reverted.
- Modify: `backend/measurement/tests/assertions.test.js` only if a mutant survives.

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: nothing. This task's deliverable is the mutation log in the commit message.

**Why this task exists:** mutation testing has caught three decorative guards on this work — `is429` (passed with the guard removed), `placed > ceiling` vs `>=` (passed all nine tests while inflating every arm's rate), and `ipo` matching `IPOPHL`. A cue that no test kills is a cue the fingerprint hashes for nothing.

- [ ] **Step 1: Run each mutant**

For each row: apply the mutation, run `pnpm test:measurement` from `backend/`, record which test fails, then `git checkout backend/measurement/lib/assertions.js`.

| # | Mutation | Must kill |
|---|---|---|
| 1 | Revert `SENTENCE_BREAK` to `/(?<=[.!?])\s+\|;\s*/` | `an abbreviation period is not a sentence end` |
| 2 | Drop `\|need(?:s\|ed\|ing)?` back to `need\s+to\|needs\s+to` in `RECOMMENDATION` | the seven `a labelled requirement is a recommendation` tests |
| 3 | In `classifyClause`, ignore `scope` (`const gated = text;`) | `a stranded continuation does not assert off its own verb` |
| 4 | In `scoreAssertedAbsences`, pass `scope` unconditionally instead of `continuation ? scope : ''` | `a leading "While" scopes its negation to its own clause` (pre-existing, `:206`) |
| 5 | Let `ASSERTION` be tested against `gated` too | `a continuation fragment never inherits an assertion` |
| 6 | Drop `\b(?:exists?\|existed\|existing)\b` from `ASSERTION` | `an existential predicate on an artifact is an assertion` |
| 7 | Remove `\|\| assertsByAccompaniment(text, tokens)` from `classifyClause` | `an artifact governed by an accompaniment preposition is asserted` |
| 8 | Add `\|with` to `ACCOMPANIMENT` | `"with" is not an accompaniment preposition` |
| 9 | Raise `ACCOMPANIMENT_WINDOW` to `400` | `a preposition beyond the noun-phrase window does not assert` |
| 10 | Drop the `!/[,;()]/.test(span)` guard from `assertsByAccompaniment` | `a preposition separated from the token by punctuation does not assert` |
| 11 | Drop `CONTINUATION` from `CUES` | `every module-level constant is either a cue or a named non-cue`. **Not** `CLASSIFIER_SOURCE carries every cue in CUES` — that test iterates `CUES`, so removing an entry makes it pass vacuously. This mutant exists to prove the source scan is the guard that matters. |

**Mutants 9 and 10 have separate fixtures on purpose** — a span long enough to fail the window usually also contains a comma, so a shared fixture would leave whichever guard runs second unkilled.

- [ ] **Step 2: Close any survivor**

If a mutant survives, write the test that kills it, verify it fails against the mutant and passes against the real code, then revert the mutant. Do not weaken a mutation to make it die.

- [ ] **Step 3: Run the full suite one final time**

Run from `backend/`:
```bash
pnpm test:measurement
```
Expected: PASS, 209+ tests, 0 failing. Also confirm `git status` is clean apart from any test file changes — a leftover mutation reaching a commit would be far worse than a surviving mutant.

- [ ] **Step 4: Commit**

```bash
git add backend/measurement/tests/assertions.test.js
git commit -m "test(measurement): mutation pass over the new classifier cues

11 mutants, all killed. Notable: <record any survivor and the test added>.

The accompaniment predicate carries the heaviest burden because it is the
only change that can raise the measured rate."
```

If no test file change was needed, skip the commit and record the mutation log in Task 8's commit instead.

---

### Task 8: Re-run the probe and write up

**Files:**
- Create: `backend/measurement/results/2026-08-07-supplied-level.json` (produced by the run)
- Modify: `backend/measurement/README.md`, `TODO_CHECKLIST.md`, `SESSION_NOTES.md`

**Interfaces:**
- Consumes: the classifier as of Task 7.
- Produces: nothing consumed by later tasks.

**Timing gate: do not start before 15:00 Philippine time on 2026-08-07.** The free tier is 20 generation calls/day and the window resets then; the 2026-08-06 run already drew 16 from the current window. Starting early gets a 429 partway through and leaves an unbalanced pool — the exact failure that biased rep 3 on 2026-08-03.

- [ ] **Step 1: Confirm the window has reset**

```bash
date
```
Expected: on or after 15:00 local. If earlier, stop and wait — there is no way to buy the calls back.

- [ ] **Step 2: Run the probe**

Run from `backend/`:
```bash
node measurement/measure-grounding.js --only-arm=baseline,deviation-deterministic --only-probe=rna --level-condition=both --reps=2 --out=measurement/results/2026-08-07-supplied-level.json
```

2 arms × 2 conditions × 2 startups × 2 reps = 16 calls. 429s appear in the terminal, not as a thrown error — check the run reports 16/16 calls before reading any table.

- [ ] **Step 3: Verify the run refuses to pool with 2026-08-06**

Run from `backend/`:
```bash
node measurement/measure-grounding.js --merge "measurement/results/2026-08-0*-supplied-level.json"
```
Expected: a refusal naming the `assertion|*` and `assertion-inflated|*` fingerprint groups. **A successful merge is a failure of this task** — it would mean the classifier edit did not reach the hash, and the two files were scored by different classifiers.

- [ ] **Step 4: Read `flaggedClauses` by hand**

Do not skip this. On 2026-08-06 the by-hand read is the only reason the two missed fabrications were found at all, and the aggregate tables would have reported 17% as final.

```bash
node -e "const j=require('./measurement/results/2026-08-07-supplied-level.json'); const f=(function find(o){for(const k in o){if(k==='flaggedClauses')return o[k];if(o[k]&&typeof o[k]==='object'){const r=find(o[k]);if(r)return r;}}})(j); const by={}; for(const c of f) by[c.klass]=(by[c.klass]||0)+1; console.log(by); for(const c of f) if(c.klass!=='recommended') console.log(\`[\${c.klass}|\${c.startup.split(' ')[0]}|\${c.condition}|\${c.dimension}] \${c.text}\`)"
```

Any clause in `unclassified` or `asserted` that is misfiled is a finding for the write-up, not something to patch now — patching the classifier against this data is the post-hoc move, and it would orphan the run that just cost a full day's quota.

- [ ] **Step 5: Write up the result**

Update, in this order:

1. **`backend/measurement/README.md`** — a new section for the 2026-08-07 run: the arm × condition table, the by-hand read, and the `unclassified` count against 2026-08-06's 14. If `unclassified` fell as predicted, remove the standing caveat against quoting a rate while that column is large; if it did not, say so and keep the caveat.
2. **`TODO_CHECKLIST.md` §0** — close `🔬 OBJECTIVE · S · Close the two measured classifier gaps, then re-run`. Record the new figure **with the prediction from the spec beside it**: the spec committed in writing, before the run, to the corpus+inflated cell reading higher than 2/12. Present the increase as the lower bound tightening on a repaired instrument, not as a newly discovered defect.
3. **`SESSION_NOTES.md`** — a new dated section. It must record four things that correct earlier entries:
   - the false positive (`"and maintain an active log…"`), which is a counterexample to the module's lower-bound guarantee that sat in the collected data;
   - that 12 of the 14 `unclassified` clauses were mis-binned recommendations, so the recorded "subject-less fragments" diagnosis was one third of the picture;
   - that **AgroLink reps were not added and the rationale for them is withdrawn** — both startups sit at `O2 R1 I1`, so the inflation manipulation is identical on both and "its lower levels" cannot explain AgroLink's zero;
   - that the **measurement suite baseline is 178, not 117** — the 117 figure predates the 2026-08-06 branch.
4. Apply the `CLAUDE.md` **Documentation maintenance** rules: keep the §0 status table in sync, and compress any session now older than the three most recent.

- [ ] **Step 6: Commit**

```bash
git add backend/measurement/results/2026-08-07-supplied-level.json backend/measurement/README.md TODO_CHECKLIST.md SESSION_NOTES.md
git commit -m "measure: re-run the supplied-level probe on the repaired classifier

16/16 calls, n=2. <headline figure> on the corpus+inflated cell against
2/12 on 2026-08-06, and unclassified fell 14 -> <n>.

The increase is the lower bound tightening on a repaired instrument, not
a new defect - predicted in writing in the spec before the run. The
fingerprint guard correctly refuses to pool the two files.

AgroLink reps were not added: both startups sit at O2 R1 I1, so the
inflation manipulation is identical on both and 'its lower levels'
cannot explain AgroLink's zero."
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 abbreviation-safe split | 1 |
| §2 `exists`, with `remains`/`includes` refused | 4 |
| §3 accompaniment, `with` excluded, 40-char window | 5 |
| §4 `RECOMMENDATION` widening (`IMPERATIVE` gains nothing) | 2 |
| §5 coordination scope inheritance | 3 |
| §6 `CUES` + `CLASSIFIER_SOURCE` + source scan | 6 |
| Tests: 17 dump fixtures, `While` guard, refusal guards, `with` guard, 178 regression | 1-6 |
| Mutation pass | 7 |
| Re-run + fingerprint refusal + no AgroLink reps | 8 |
| "Expected consequence stated before the number exists" | 8 step 5 |

No gaps.

**Placeholder scan:** the only unfilled values are runtime outputs — the fingerprint hash in Task 6's commit message, the mutation survivors in Task 7, and the headline figure in Task 8. Each has an explicit step producing it.

**Type consistency:** `classifyClause(clause, tokens, scope = '')` is introduced in Task 3 and used with three arguments in Tasks 3 and 5 only; the default keeps every existing two-argument call site valid. `assertsByAccompaniment(text, tokens) -> boolean` is defined and called in Task 5 alone. `CUES` is defined in Task 6 and consumed only by Task 6's tests and `CLASSIFIER_SOURCE`. `ACCOMPANIMENT` is global-flagged where defined (Task 5) because `matchAll` throws otherwise, and it is never used with `.test()`.

**Ordering note:** Task 5 depends on Task 1 (the clause must arrive whole) and Task 3 depends on Task 2 (three fixtures inherit a `Needs:` head). Tasks must run in order.
