# Grounding Probe Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two measurement probes that provably measure the wrong thing, and remove two confounds that invalidate the arm contrast at any sample size, so the grounding harness can actually answer whether the verified RAG corpus helps.

**Architecture:** `measure-grounding.js` grows to 879 lines and has no tests because it is a top-level IIFE with no exports. Guard the IIFE with `require.main === module` and extract the pure scoring logic into three small modules under `measurement/lib/`, each independently testable with Node's built-in test runner. The script keeps orchestration, prompts, reporting and CLI.

**Tech Stack:** Node 22 CommonJS, `node --test` (built in, no new dependency), `@google/genai` (already present).

## Global Constraints

- **Scope is `backend/measurement/` only.** No changes under `backend/src/`. Production behaviour is not modified by this plan.
- **Do not change the `test` script in `backend/package.json`.** `pnpm test` is jest with `rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`, and its documented baseline is **167 passing / 2 failing**. A third failure is a regression. Measurement tests run under a separate `test:measurement` script.
- **The two pre-existing jest failures are expected**: `ReadinessService › returns a weighted score…` and `AiService › passes valid task responses through unchanged`.
- **Spend zero generation quota until Task 8.** Tasks 1-7 are quota-free. `gemini-3.6-flash` free tier is **20 `generateContent` calls/day**, resetting at **midnight US Pacific = 15:00 Philippine time**.
- **Branch:** `measure/grounding-arms`, currently 5 commits ahead of `master`, nothing pushed. **Do not push.** John tests locally before anything reaches `master`.
- **No `Co-Authored-By` trailer** in commit messages (`CLAUDE.md`).
- Spec: `docs/superpowers/specs/2026-07-29-grounding-probes-design.md`.

### Correction to the spec, discovered during planning

The spec states `2026-07-29-rep1.json` "stays mergeable for metric 3" under
per-metric fingerprints. **That holds for only two of the three arms.** Confound
2's fix changes the deterministic arm's levels-probe rubric from `(L, L+1)` to
the full nine-rung ladder, so that arm's old data is genuinely incomparable.
`baseline` and `sdd-semantic` receive an empty rubric block both before and
after, so their old data is comparable.

Fingerprints are therefore **per (metric, arm)**, not per metric. Task 6
implements this. It preserves the valid two-thirds of the existing file instead
of discarding it.

## File Structure

**Create:**

| path | responsibility |
|---|---|
| `backend/measurement/data/stage-markers.json` | the authored stage-marker lexicon (data only) |
| `backend/measurement/lib/stage-markers.js` | load the lexicon; decide whether a text is stage-inappropriate for a (dimension, level) |
| `backend/measurement/lib/metrics.js` | pure scorers: level placement, stage-appropriateness rate, differentiation gap. No I/O, no model calls, no lexicon dependency |
| `backend/measurement/lib/fingerprint.js` | per-(metric, arm) comparability fingerprints |
| `backend/measurement/tests/stage-markers.test.js` | lexicon constraints + matching behaviour |
| `backend/measurement/tests/metrics.test.js` | scorer arithmetic |
| `backend/measurement/tests/fingerprint.test.js` | fingerprint identity/difference rules |
| `backend/measurement/tests/merge.test.js` | per-(metric, arm) merge pooling and refusal |
| `backend/measurement/tests/harness-exports.test.js` | requiring the harness is side-effect free |

**Modify:**

| path | change |
|---|---|
| `backend/measurement/measure-grounding.js` | exports + IIFE guard, prompt fixes, rewiring, `--dry-run`, `--with-fabrication-probe` |
| `backend/measurement/README.md` | document the new metrics, the confounds, the lexicon's authored provenance |
| `backend/package.json` | add `test:measurement` only |

**Note on the test command:** it must be `node --test measurement/tests/*.test.js`,
not the bare directory. Verified on this box (Windows, Node 22.19): passing the
directory fails, because Node resolves a bare path argument as a module rather
than a directory to search. Node expands the glob itself, so this does not
depend on the shell.

---

### Task 1: Make the harness requirable and testable

Nothing in `measure-grounding.js` can be tested today because requiring it runs the whole script. Everything else in this plan depends on fixing that first.

**Files:**
- Modify: `backend/measurement/measure-grounding.js` (the trailing IIFE, currently at the end of the file)
- Modify: `backend/package.json` (scripts block)
- Test: `backend/measurement/tests/harness-exports.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `module.exports` from `measure-grounding.js` exposing `{ DIMENSIONS, STARTUPS, ARMS, RUBRICS, MAX_READINESS_LEVEL, GEN_MODEL, EMBED_MODEL, FLOOR, GROUNDING, TYPE_PREFIX, rubricKey, renderRubricBlock, rnaPrompt, levelsPrompt, hallucinationPrompt, extractJsonPayload, isAbsentAnswer, mean }`.

- [ ] **Step 1: Write the failing test**

Create `backend/measurement/tests/harness-exports.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const HARNESS = path.resolve(__dirname, '../measure-grounding.js');

test('requiring the harness does not execute it', () => {
  // If the IIFE still runs on require, this throws or hangs on a network call.
  const m = require(HARNESS);
  // Assert a real export surface, not merely truthiness: `module.exports` is
  // {} by default, so `assert.ok(m)` would pass on an unmodified file and this
  // test would be vacuous.
  assert.ok(Object.keys(m).length > 0, 'the harness must export its helpers');
});

test('exposes the constants later tasks depend on', () => {
  const m = require(HARNESS);
  assert.deepEqual(m.DIMENSIONS, [
    'Technology', 'Market', 'Acceptance', 'Organizational', 'Regulatory', 'Investment',
  ]);
  assert.equal(m.MAX_READINESS_LEVEL, 9);
  assert.equal(m.GEN_MODEL, 'gemini-3.6-flash');
  assert.equal(m.RUBRICS.length, 54);
  assert.equal(Object.keys(m.STARTUPS).length, 2);
  assert.equal(m.ARMS.length, 3);
});

test('exposes the pure helpers', () => {
  const m = require(HARNESS);
  for (const name of ['rubricKey', 'renderRubricBlock', 'rnaPrompt', 'levelsPrompt',
                      'hallucinationPrompt', 'extractJsonPayload', 'isAbsentAnswer', 'mean']) {
    assert.equal(typeof m[name], 'function', `${name} should be exported`);
  }
  assert.equal(m.rubricKey('Technology', 2), 'trl-2');
});

test('seeded ground-truth levels match main.ts seedDemoStartups', () => {
  const { STARTUPS } = require(HARNESS);
  assert.deepEqual(STARTUPS['AgroLink PH'].levels,
    { Technology: 2, Market: 2, Acceptance: 1, Organizational: 2, Regulatory: 1, Investment: 1 });
  assert.deepEqual(STARTUPS['MediSync Cebu'].levels,
    { Technology: 5, Market: 4, Acceptance: 3, Organizational: 4, Regulatory: 3, Investment: 3 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test measurement/tests/harness-exports.test.js`

Expected: FAIL. The harness has no `module.exports`, so `m.DIMENSIONS` is `undefined`. It may also attempt a network call on require.

- [ ] **Step 3: Guard the IIFE and add exports**

In `backend/measurement/measure-grounding.js`, find the trailing block that currently begins `(async () => {` and ends with `})().catch((e) => {`. Wrap it and append exports:

```js
/**
 * Guarded so the module can be required by tests without executing anything.
 * Every scorer and prompt builder below is a pure function; the tests exercise
 * them directly rather than through a model call, which is what keeps the whole
 * suite free of the 20/day generation budget.
 */
if (require.main === module) {
  (async () => {
    if (process.argv.includes('--fingerprint')) {
      console.log(probeFingerprint());
      return;
    }

    if (MERGE_FILES.length) {
      runMerge(MERGE_FILES);
      return;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const { corpusVecs } = await runRetrievalOnly(ai);

    if (RETRIEVAL_ONLY) {
      console.log('\n--retrieval-only: stopping before generation arms.');
      return;
    }

    const results = await runGenerationArms(ai, corpusVecs);
    if (OUT_FILE) writeResults(OUT_FILE, results);
  })().catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  });
}

module.exports = {
  DIMENSIONS,
  STARTUPS,
  ARMS,
  RUBRICS,
  MAX_READINESS_LEVEL,
  GEN_MODEL,
  EMBED_MODEL,
  FLOOR,
  GROUNDING,
  TYPE_PREFIX,
  rubricKey,
  renderRubricBlock,
  rnaPrompt,
  levelsPrompt,
  hallucinationPrompt,
  extractJsonPayload,
  isAbsentAnswer,
  mean,
};
```

- [ ] **Step 4: Add the measurement test script**

In `backend/package.json`, add one entry to `scripts`. **Leave `"test"` exactly as it is** — it is jest over `src/**/*.spec.ts` and its 167/2 baseline is a documented invariant.

```json
"test:measurement": "node --test measurement/tests/*.test.js"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS, 4 tests.

- [ ] **Step 6: Confirm the CLI still works and jest is untouched**

Run: `cd backend && node measurement/measure-grounding.js --fingerprint`
Expected: a 12-character hex string, exit 0.

Run: `cd backend && node measurement/measure-grounding.js --merge measurement/results/2026-07-29-rep1.json`
Expected: the three metric tables print, exit 0. **No generation quota is spent** — merge reads files only.

Run: `cd backend && pnpm test`
Expected: 167 passing / 2 failing, unchanged.

- [ ] **Step 7: Commit**

```bash
git add backend/measurement/measure-grounding.js backend/measurement/tests/harness-exports.test.js backend/package.json
git commit -m "test(measurement): make the grounding harness requirable

The harness was a top-level IIFE with no exports, so nothing in it could
be tested without executing the whole script and spending quota. Guard
the IIFE with require.main === module and export the pure helpers.

Adds test:measurement (node --test, built into Node 22, no new
dependency). The test script is untouched - jest still runs src/**/*.spec.ts
and its 167/2 baseline is unaffected."
```

---

### Task 2: Stage-marker lexicon

Metric 2's scoring engine. The two constraints below are the whole reason this is a separate reviewable task — a lexicon that overlaps the corpus would let a corpus arm score well by echoing text it was handed.

**Files:**
- Create: `backend/measurement/data/stage-markers.json`
- Create: `backend/measurement/lib/stage-markers.js`
- Test: `backend/measurement/tests/stage-markers.test.js`

**Interfaces:**
- Consumes: `RUBRICS`, `STARTUPS`, `DIMENSIONS` from `measure-grounding.js` (Task 1).
- Produces: `lib/stage-markers.js` exporting `MARKERS` (array), `HORIZON` (number, 2), `markersFor(dimension) -> marker[]`, `offendingMarkers(text, dimension, level) -> marker[]`, `isStageInappropriate(text, dimension, level) -> boolean`.
  A marker is `{ phrase: string, minLevel: number, dimensions: string[]|null }`.

- [ ] **Step 1: Write the failing test**

Create `backend/measurement/tests/stage-markers.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { MARKERS, markersFor, offendingMarkers, isStageInappropriate } =
  require(path.resolve(__dirname, '../lib/stage-markers.js'));
const { RUBRICS, STARTUPS, DIMENSIONS } =
  require(path.resolve(__dirname, '../measure-grounding.js'));

// Constraint 1 from the spec. A marker that collides with corpus wording lets
// the corpus arm's own retrieved text be scored against it - contamination
// regardless of which direction it pushes the number.
test('no marker phrase collides with any corpus keyTerm', () => {
  const clashes = [];
  for (const m of MARKERS) {
    for (const r of RUBRICS) {
      for (const kt of r.keyTerms) {
        const a = m.phrase.toLowerCase();
        const b = kt.toLowerCase();
        if (a.includes(b) || b.includes(a)) clashes.push(`${m.phrase} <-> ${kt} (${r.key})`);
      }
    }
  }
  assert.deepEqual(clashes, [], `lexicon collides with corpus keyTerms:\n${clashes.join('\n')}`);
});

// Constraint 2 from the spec. A cell with no applicable marker above its
// threshold scores 0 forever and silently dilutes the rate.
test('a stage-inappropriate recommendation is detectable in all 12 cells', () => {
  const unreachable = [];
  for (const [name, s] of Object.entries(STARTUPS)) {
    for (const dim of DIMENSIONS) {
      const level = s.levels[dim];
      const applicable = markersFor(dim).filter((m) => m.minLevel > level + 2);
      if (applicable.length === 0) unreachable.push(`${name}/${dim} (L=${level})`);
    }
  }
  assert.deepEqual(unreachable, [], `no detectable failure in: ${unreachable.join(', ')}`);
});

test('flags an over-advanced recommendation for an early-stage dimension', () => {
  // AgroLink Technology is level 2, so the horizon is 4. "commercialization"
  // is minLevel 7 - SO 1.3's own example of a hallucination.
  assert.equal(isStageInappropriate('Begin commercialization across Luzon.', 'Technology', 2), true);
});

test('does not flag the same phrase for a mid-stage dimension', () => {
  // MediSync Technology is level 5, horizon 7. minLevel 7 is not > 7.
  assert.equal(isStageInappropriate('Begin commercialization across Luzon.', 'Technology', 5), false);
});

test('flags a higher marker even at mid-stage', () => {
  assert.equal(isStageInappropriate('Plan the IPO.', 'Technology', 5), true);
});

test('matching is case-insensitive', () => {
  assert.equal(isStageInappropriate('Prepare for an IPO next year.', 'Technology', 2), true);
});

test('dimension-scoped markers do not fire on other dimensions', () => {
  const text = 'Obtain certification granted by the agency.';
  assert.equal(isStageInappropriate(text, 'Regulatory', 1), true);
  assert.equal(isStageInappropriate(text, 'Technology', 1), false);
});

test('text with no markers is appropriate', () => {
  assert.equal(
    isStageInappropriate('Interview three more cooperatives to confirm demand.', 'Market', 2),
    false,
  );
});

test('offendingMarkers reports which phrase fired', () => {
  const hits = offendingMarkers('Plan the IPO and franchise nationally.', 'Market', 1);
  assert.deepEqual(hits.map((m) => m.phrase).sort(), ['franchise', 'ipo']);
});

test('non-string input is not scored as a failure', () => {
  assert.equal(isStageInappropriate(undefined, 'Market', 1), false);
});

// Regression: "ipo" is a substring of "IPOPHL" (the Philippine Intellectual
// Property Office), which appears verbatim in BOTH seeded startup documents.
// Under bare-substring matching, an RNA recommending a trademark filing - a
// stage-appropriate action at RRL 1 - tripped the minLevel 9 marker and scored
// as the most severe stage-inappropriate recommendation possible.
test('a marker does not match inside a longer word', () => {
  assert.equal(
    isStageInappropriate('Register the wordmark with IPOPHL.', 'Regulatory', 1),
    false,
    'IPOPHL must not trip the ipo marker',
  );
  assert.equal(
    isStageInappropriate('Trademark application filed with IPOPHL, pending.', 'Regulatory', 1),
    false,
  );
});

test('the same marker still fires as a whole word', () => {
  assert.equal(isStageInappropriate('Prepare for an IPO next year.', 'Regulatory', 1), true);
});

// Generalises the regression above: no marker may fire on a seeded document by
// matching inside a longer word. A whole-word match on a document is fine -
// MediSync genuinely has "recurring revenue" - so this asserts the sub-word
// case specifically, by comparing bare-substring hits against whole-word hits.
test('no marker matches a seeded document only as a sub-word', () => {
  const { STARTUPS } = require(path.resolve(__dirname, '../measure-grounding.js'));
  const subWordOnly = [];
  for (const [name, s] of Object.entries(STARTUPS)) {
    for (const m of MARKERS) {
      const bareHit = s.doc.toLowerCase().includes(m.phrase.toLowerCase());
      const wholeWordHit = new RegExp(`\\b${m.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s.doc);
      if (bareHit && !wholeWordHit) subWordOnly.push(`${name}: "${m.phrase}"`);
    }
  }
  assert.deepEqual(subWordOnly, [], `markers matching inside a longer word: ${subWordOnly.join(', ')}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test measurement/tests/stage-markers.test.js`
Expected: FAIL with `Cannot find module '../lib/stage-markers.js'`.

- [ ] **Step 3: Create the lexicon data file**

Create `backend/measurement/data/stage-markers.json`. Every phrase below is validated against both constraints (verified 2026-07-29).

```json
{
  "provenance": "authored",
  "note": "No external source. Authored for measure-grounding.js metric 2. Held deliberately disjoint from data/rag-corpus/readiness-rubrics.json keyTerms so a corpus arm cannot score well by echoing retrieved text. See docs/superpowers/specs/2026-07-29-grounding-probes-design.md.",
  "rejected": [
    "mass production - collides with keyTerm 'production' (trl-9)",
    "term sheet - collides with keyTerm 'term sheet negotiation' (irl-7)",
    "pilot deployment - verbatim keyTerm (trl-6)",
    "regulatory submission - verbatim keyTerm (rrl-5)"
  ],
  "markers": [
    { "phrase": "ipo", "minLevel": 9, "dimensions": null },
    { "phrase": "volume manufacturing", "minLevel": 8, "dimensions": null },
    { "phrase": "international expansion", "minLevel": 8, "dimensions": null },
    { "phrase": "franchise", "minLevel": 8, "dimensions": null },
    { "phrase": "series a", "minLevel": 7, "dimensions": null },
    { "phrase": "commercialization", "minLevel": 7, "dimensions": null },
    { "phrase": "national rollout", "minLevel": 7, "dimensions": null },
    { "phrase": "scale nationally", "minLevel": 7, "dimensions": null },
    { "phrase": "full market launch", "minLevel": 7, "dimensions": null },
    { "phrase": "clinical validation", "minLevel": 6, "dimensions": ["Technology", "Regulatory"] },
    { "phrase": "certification granted", "minLevel": 6, "dimensions": ["Regulatory"] },
    { "phrase": "recurring revenue", "minLevel": 5, "dimensions": ["Market", "Investment"] },
    { "phrase": "paying customers", "minLevel": 5, "dimensions": ["Market", "Acceptance"] },
    { "phrase": "lead investor secured", "minLevel": 5, "dimensions": ["Investment"] },
    { "phrase": "deploy to live users", "minLevel": 4, "dimensions": null },
    { "phrase": "filed for approval", "minLevel": 4, "dimensions": ["Regulatory"] }
  ]
}
```

- [ ] **Step 4: Create the lexicon module**

Create `backend/measurement/lib/stage-markers.js`:

```js
/**
 * Metric 2's scoring engine: does a generated RNA recommend actions that belong
 * to a readiness level well above where the startup actually sits?
 *
 * This is SO 1.3's own example of a hallucination - "recommending
 * commercialization steps to a TRL 2 startup" - made mechanical. It replaces
 * the absent-field probe, which was both saturated (0/15 invented across every
 * arm) and aimed at something the corpus cannot influence: the corpus holds
 * readiness rubrics, not burn rates or investor names.
 *
 * The lexicon is AUTHORED, with no external source, and is held disjoint from
 * the corpus's own keyTerms - enforced by a test, not a convention. See
 * tests/stage-markers.test.js.
 */
const path = require('path');

const { markers: MARKERS } = require(path.join(__dirname, '../data/stage-markers.json'));

/**
 * An RNA is a *recommended next action*, so the appropriate horizon is the
 * current rung plus roughly two. Recommending beyond that is the failure mode.
 * Overshoot only: undershoot is not a described failure mode, and scoring it
 * here would blur this metric against Objective 4's leniency concern.
 */
const HORIZON = 2;

/** Markers that apply to a dimension. `dimensions: null` means all of them. */
function markersFor(dimension) {
  return MARKERS.filter((m) => m.dimensions === null || m.dimensions.includes(dimension));
}

/**
 * Matching is whole-word, case-insensitive - NOT bare substring.
 *
 * Bare `includes` is what the first draft used, and it is wrong on this
 * corpus: "ipo" is a substring of "IPOPHL", the Philippine Intellectual
 * Property Office, which appears verbatim in BOTH seeded startup documents
 * ("...has not been registered with IPOPHL", "Trademark application filed with
 * IPOPHL, pending"). An RNA recommending a trademark filing - entirely
 * stage-appropriate at RRL 1 - would have tripped the minLevel 9 marker and
 * been scored as the most severe stage-inappropriate recommendation there is.
 *
 * The cost is recall on inflected forms: "franchise" no longer matches
 * "franchisee". That is the safer direction for this metric, and the same
 * direction the README already accepts for its other exact-match measures -
 * under-counting a failure is better than inventing one.
 */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordBoundary = (phrase) => new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i');

/** Which markers in `text` are above the horizon for this (dimension, level). */
function offendingMarkers(text, dimension, level) {
  if (typeof text !== 'string') return [];
  return markersFor(dimension)
    .filter((m) => m.minLevel > level + HORIZON)
    .filter((m) => wordBoundary(m.phrase).test(text));
}

function isStageInappropriate(text, dimension, level) {
  return offendingMarkers(text, dimension, level).length > 0;
}

module.exports = { MARKERS, HORIZON, markersFor, offendingMarkers, isStageInappropriate };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS, 14 tests (4 from Task 1 + 10 here).

- [ ] **Step 6: Commit**

```bash
git add backend/measurement/data/stage-markers.json backend/measurement/lib/stage-markers.js backend/measurement/tests/stage-markers.test.js
git commit -m "feat(measurement): add the stage-marker lexicon for metric 2

Metric 2 becomes the stage-inappropriate recommendation rate - SO 1.3's
own example of a hallucination, 'recommending commercialization steps to
a TRL 2 startup' - replacing an absent-field probe that was saturated at
0/15 and aimed at something the corpus cannot influence anyway.

Two constraints are enforced by test rather than convention: zero
collisions with any of the 54 rubric rows' keyTerms (otherwise a corpus
arm scores well by echoing text it was handed), and a detectable failure
in all 12 (startup, dimension) cells. Four candidate markers were
rejected by the first check and are recorded in the data file so nobody
reintroduces them; two of them were verbatim corpus keyTerms.

The lexicon is authored with no external source, same provenance
standard applied to the corpus itself."
```

---

### Task 3: Pure metric scorers

**Files:**
- Create: `backend/measurement/lib/metrics.js`
- Test: `backend/measurement/tests/metrics.test.js`

**Interfaces:**
- Consumes: nothing (deliberately — this module takes the inappropriateness predicate as an argument so it can be tested without the lexicon).
- Produces: `lib/metrics.js` exporting:
  - `levelPlacement(assignedByDim, truthByDim, dimensions) -> { n, mae, exact, within1 }`
  - `stageAppropriateness(rnaByDim, truthByDim, dimensions, isInappropriate) -> { flagged, checked, rate }`
  - `differentiationGap(earlyLevels, midLevels) -> { earlyMean, midMean, gap, earlyN, midN }` where the two arguments are flat arrays of numbers.

- [ ] **Step 1: Write the failing test**

Create `backend/measurement/tests/metrics.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { levelPlacement, stageAppropriateness, differentiationGap } =
  require(path.resolve(__dirname, '../lib/metrics.js'));

const DIMS = ['Technology', 'Market', 'Acceptance'];

test('levelPlacement computes MAE, exact and within-1 counts', () => {
  const truth =    { Technology: 2, Market: 4, Acceptance: 3 };
  const assigned = { Technology: 2, Market: 5, Acceptance: 7 };
  // errors: 0, 1, 4 -> mae 5/3
  const r = levelPlacement(assigned, truth, DIMS);
  assert.equal(r.n, 3);
  assert.equal(r.exact, 1);
  assert.equal(r.within1, 2);
  assert.ok(Math.abs(r.mae - 5 / 3) < 1e-9);
});

// Without Math.abs, an under-estimate and an over-estimate cancel and the
// model scores a perfect 0. Verified by mutation: with Math.abs removed, every
// other test in this file still passes, because none of them has a negative
// delta. This one is the whole reason metric 1 can be trusted.
test('levelPlacement uses absolute error, so errors do not cancel', () => {
  const truth =    { Technology: 5, Market: 2, Acceptance: 3 };
  const assigned = { Technology: 3, Market: 4, Acceptance: 3 };
  // signed:   -2, +2, 0 -> mean 0      (wrong, looks perfect)
  // absolute:  2,  2, 0 -> mean 4/3    (right)
  const r = levelPlacement(assigned, truth, DIMS);
  assert.equal(r.n, 3);
  assert.ok(Math.abs(r.mae - 4 / 3) < 1e-9, `mae should be 4/3, got ${r.mae}`);
  assert.equal(r.exact, 1);
  assert.equal(r.within1, 1, 'a signed -2 would slip under <= 1 and inflate this');
});

test('levelPlacement skips a dimension the model dropped', () => {
  // A missing field is a schema-compliance problem, not evidence the model
  // misplaced the level - so it lowers n rather than scoring as a large error.
  const r = levelPlacement({ Technology: 2 }, { Technology: 2, Market: 4, Acceptance: 3 }, DIMS);
  assert.equal(r.n, 1);
  assert.equal(r.mae, 0);
});

test('levelPlacement reports NaN mae when nothing was scoreable', () => {
  const r = levelPlacement({}, { Technology: 2 }, DIMS);
  assert.equal(r.n, 0);
  assert.ok(Number.isNaN(r.mae));
});

test('levelPlacement ignores non-numeric assignments', () => {
  const r = levelPlacement({ Technology: 'two' }, { Technology: 2 }, ['Technology']);
  assert.equal(r.n, 0);
});

test('stageAppropriateness counts flagged over checked', () => {
  const rna = { Technology: 'bad', Market: 'good', Acceptance: 'bad' };
  const truth = { Technology: 2, Market: 2, Acceptance: 1 };
  const isInappropriate = (text) => text === 'bad';
  const r = stageAppropriateness(rna, truth, DIMS, isInappropriate);
  assert.equal(r.checked, 3);
  assert.equal(r.flagged, 2);
  assert.ok(Math.abs(r.rate - 2 / 3) < 1e-9);
});

test('stageAppropriateness does not count a dimension the model dropped', () => {
  const r = stageAppropriateness({ Technology: 'bad' }, { Technology: 2 }, DIMS, () => true);
  assert.equal(r.checked, 1);
  assert.equal(r.flagged, 1);
});

test('stageAppropriateness passes dimension and level to the predicate', () => {
  const seen = [];
  stageAppropriateness(
    { Technology: 'x' },
    { Technology: 5 },
    ['Technology'],
    (text, dim, level) => { seen.push([text, dim, level]); return false; },
  );
  assert.deepEqual(seen, [['x', 'Technology', 5]]);
});

test('differentiationGap subtracts early mean from mid mean', () => {
  const r = differentiationGap([2, 2, 1], [5, 4, 3]);
  assert.equal(r.earlyN, 3);
  assert.equal(r.midN, 3);
  assert.ok(Math.abs(r.earlyMean - 5 / 3) < 1e-9);
  assert.equal(r.midMean, 4);
  assert.ok(Math.abs(r.gap - (4 - 5 / 3)) < 1e-9);
});

test('differentiationGap reports NaN when an arm produced nothing', () => {
  const r = differentiationGap([2, 2], []);
  assert.equal(r.midN, 0);
  assert.ok(Number.isNaN(r.gap));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test measurement/tests/metrics.test.js`
Expected: FAIL with `Cannot find module '../lib/metrics.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/measurement/lib/metrics.js`:

```js
/**
 * Pure scorers for the grounding harness. No I/O, no model calls, and no
 * dependency on the stage-marker lexicon - stageAppropriateness takes the
 * predicate as an argument so this module can be tested on its own.
 *
 * Every function skips a dimension the model omitted rather than scoring it as
 * a failure. A missing field is a schema-compliance problem, not evidence the
 * model ignored its grounding; conflating the two would let a model that
 * returns less look better. Watch the reported n for a low denominator.
 */

/**
 * Metric 1: how close did the model put the startup to where it actually sits?
 *
 * Ground truth is the seeded per-dimension StartupReadinessLevel, which is
 * independent of anything in the prompt - unlike "did the output resemble the
 * retrieved rubric", which structurally favours whichever arm was shown that
 * rubric and so measures parroting rather than grounding.
 */
function levelPlacement(assignedByDim, truthByDim, dimensions) {
  const errors = [];
  for (const dim of dimensions) {
    const assigned = assignedByDim[dim];
    const truth = truthByDim[dim];
    if (typeof assigned !== 'number' || typeof truth !== 'number') continue;
    errors.push(Math.abs(assigned - truth));
  }
  return {
    n: errors.length,
    mae: errors.length ? errors.reduce((s, e) => s + e, 0) / errors.length : NaN,
    exact: errors.filter((e) => e === 0).length,
    within1: errors.filter((e) => e <= 1).length,
  };
}

/**
 * Metric 2: how often did the RNA recommend an action from well above the
 * startup's actual rung? `isInappropriate(text, dimension, level)` is injected.
 */
function stageAppropriateness(rnaByDim, truthByDim, dimensions, isInappropriate) {
  let flagged = 0;
  let checked = 0;
  for (const dim of dimensions) {
    const text = rnaByDim[dim];
    if (typeof text !== 'string') continue;
    checked++;
    if (isInappropriate(text, dim, truthByDim[dim])) flagged++;
  }
  return { flagged, checked, rate: checked ? flagged / checked : NaN };
}

/** Metric 3: mid-stage mean minus early-stage mean, over flat level arrays. */
function differentiationGap(earlyLevels, midLevels) {
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const earlyMean = mean(earlyLevels);
  const midMean = mean(midLevels);
  return {
    earlyMean,
    midMean,
    earlyN: earlyLevels.length,
    midN: midLevels.length,
    gap: midMean - earlyMean,
  };
}

module.exports = { levelPlacement, stageAppropriateness, differentiationGap };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS, 23 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/lib/metrics.js backend/measurement/tests/metrics.test.js
git commit -m "feat(measurement): add pure scorers for the three metrics

Metric 1 becomes level-placement accuracy against the seeded ground
truth, replacing exact-substring keyTerm matching. The old metric scored
1/12 while the generated text was substantively on target - it measured
vocabulary reuse, and the RNA prompt's demand for document-specific
detail structurally conflicts with echoing abstract rubric phrasing.

Embedding-similarity-to-the-retrieved-rubric was considered and rejected
for metric 1: any 'did the output resemble the rubric it was given'
measure favours the arm that was given it, so it cannot separate
grounding from parroting.

All three scorers skip a dimension the model dropped rather than scoring
it as failure - a missing field is a schema problem, and counting it
would reward a model that returns less."
```

---

### Task 4: Fix both confounds in the prompts

The load-bearing task. Without this the arm contrast is invalid at any N.

**Files:**
- Modify: `backend/measurement/measure-grounding.js` — `rnaPrompt`, `levelsPrompt`, `retrieveRubricsForArm`, and the call sites in `runGenerationArms`
- Test: `backend/measurement/tests/prompts.test.js` (create)

**Interfaces:**
- Consumes: `DIMENSIONS`, `STARTUPS`, `RUBRICS`, `renderRubricBlock` (Task 1 exports).
- Produces: `readinessLevelBlock(levels) -> string`; `fullLadderRubrics() -> rubricRow[]` (all 54, sorted by dimension then level); `rnaPrompt(doc, rubricBlock, levels) -> string` (**signature changed — third parameter added**); `levelsPrompt(doc, rubricBlock) -> string` (signature unchanged). All added to `module.exports`.

- [ ] **Step 1: Write the failing test**

Create `backend/measurement/tests/prompts.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const H = require(path.resolve(__dirname, '../measure-grounding.js'));

const LEVELS = { Technology: 2, Market: 2, Acceptance: 1, Organizational: 2, Regulatory: 1, Investment: 1 };

// Confound 1: production's createBasePrompt (ai.service.ts:937-943) emits this
// block for EVERY arm and only the rubric block varies with ragCorpus. The
// harness emitted it for none, so it compared "told its levels" against "not
// told" - a contrast production never presents.
test('readinessLevelBlock uses production abbreviations in production order', () => {
  const block = H.readinessLevelBlock(LEVELS);
  assert.match(block, /Initial Readiness Level:/);
  assert.match(block, /TRL 2/);
  assert.match(block, /MRL 2/);
  assert.match(block, /ARL 1/);
  assert.match(block, /ORL 2/);
  assert.match(block, /RRL 1/);
  assert.match(block, /IRL 1/);
  assert.ok(
    block.indexOf('TRL') < block.indexOf('MRL') &&
    block.indexOf('MRL') < block.indexOf('ARL') &&
    block.indexOf('ARL') < block.indexOf('ORL') &&
    block.indexOf('ORL') < block.indexOf('RRL') &&
    block.indexOf('RRL') < block.indexOf('IRL'),
    'order must match ai.service.ts',
  );
});

test('rnaPrompt includes the levels block even with no rubric (baseline arm)', () => {
  const p = H.rnaPrompt('DOC', '', LEVELS);
  assert.match(p, /Initial Readiness Level:/);
  assert.match(p, /TRL 2/);
});

test('rnaPrompt includes the levels block with a rubric too (corpus arm)', () => {
  const p = H.rnaPrompt('DOC', '\n--- Verified Readiness Rubrics (authoritative) ---\nX\n', LEVELS);
  assert.match(p, /Initial Readiness Level:/);
  assert.match(p, /Verified Readiness Rubrics/);
});

// Confound 2: deterministic retrieval keys on (type, level) using the startup's
// ACTUAL level, so the levels probe was asking that arm to predict what it had
// been handed.
test('levelsPrompt never contains the levels block', () => {
  const p = H.levelsPrompt('DOC', '');
  assert.ok(!/Initial Readiness Level:/.test(p), 'the levels probe must not leak the answer');
});

test('fullLadderRubrics returns every level of every dimension', () => {
  const ladder = H.fullLadderRubrics();
  assert.equal(ladder.length, 54);
  for (const dim of H.DIMENSIONS) {
    const levels = ladder.filter((r) => r.readinessType === dim).map((r) => r.level).sort((a, b) => a - b);
    assert.deepEqual(levels, [1, 2, 3, 4, 5, 6, 7, 8, 9], `${dim} needs all nine rungs`);
  }
});

test('fullLadderRubrics is grouped by dimension and ascending within it', () => {
  const ladder = H.fullLadderRubrics();
  const tech = ladder.filter((r) => r.readinessType === 'Technology');
  const firstIdx = ladder.indexOf(tech[0]);
  assert.deepEqual(
    ladder.slice(firstIdx, firstIdx + 9).map((r) => r.level),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test('the ladder does not single out the startup current level', () => {
  // If it did, the levels probe would be leaking again by another route.
  const ladder = H.fullLadderRubrics();
  const keys = ladder.map((r) => r.key);
  assert.ok(keys.includes('trl-1') && keys.includes('trl-9'),
    'the whole ladder must be present, not a window around the true level');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test measurement/tests/prompts.test.js`
Expected: FAIL — `H.readinessLevelBlock is not a function`.

- [ ] **Step 3: Add the two new builders**

In `backend/measurement/measure-grounding.js`, immediately above the existing `function rnaPrompt(`:

```js
/**
 * Verbatim in shape from ai.service.ts:937-943. Production emits this for EVERY
 * arm - only rubricBlock varies with ragCorpus - so omitting it here made the
 * harness measure "told its levels" against "not told its levels", which is a
 * contrast production never presents and not a retrieval effect.
 *
 * The abbreviation order is production's and must not be re-sorted: a reviewer
 * comparing the two prompts should see the same block.
 */
function readinessLevelBlock(levels) {
  return `
Initial Readiness Level:
TRL ${levels.Technology}
MRL ${levels.Market}
ARL ${levels.Acceptance}
ORL ${levels.Organizational}
RRL ${levels.Regulatory}
IRL ${levels.Investment}`;
}

/**
 * The nine-rung ladder for every dimension, for the LEVELS probe only.
 *
 * Deterministic retrieval keys on (readinessType, level) using the startup's
 * actual level. Handing that to a probe that asks the model to assess the level
 * shows it the answer, so any differentiation advantage for that arm is leakage
 * rather than grounding - and no number of reps fixes it.
 *
 * The RNA probe deliberately keeps the (L, L+1) lookup, because that is what
 * production ships. These are different instruments and the asymmetry is
 * intentional: do not "tidy" them into agreement.
 */
function fullLadderRubrics() {
  return RUBRICS.slice().sort(
    (a, b) => a.readinessType.localeCompare(b.readinessType) || a.level - b.level,
  );
}
```

- [ ] **Step 4: Change `rnaPrompt` to take and emit the levels**

Replace the existing `function rnaPrompt(doc, rubricBlock) {` body with:

```js
function rnaPrompt(doc, rubricBlock, levels) {
  return `${doc}${rubricBlock}${readinessLevelBlock(levels)}
--- Task ---
Generate a Readiness and Needs Assessment (RNA) for these readiness types: ${DIMENSIONS.join(', ')}.
Respond ONLY with a JSON array: [{"readiness_level_type": (string), "rna": (string, max 500 characters)}]
- readiness_level_type must be exactly one of: ${DIMENSIONS.join(', ')}
- Be specific and grounded strictly in the provided data.

Grounding instruction: ${GROUNDING}`;
}
```

`levelsPrompt` and `hallucinationPrompt` are **unchanged**.

- [ ] **Step 5: Export the new builders**

In the `module.exports` block added in Task 1, add `readinessLevelBlock,` and `fullLadderRubrics,`.

- [ ] **Step 6: Route the ladder into the levels probe**

In `runGenerationArms`, the pre-loop block currently builds one `rubricBlocks` map. Replace that block with two maps — the RNA probe keeps the production `(L, L+1)` retrieval; the levels probe gets the ladder:

```js
  // Two rubric blocks per (arm, startup), not one. The RNA probe mirrors
  // production's (L, L+1) lookup; the levels probe gets the full ladder so it
  // is not handed the quantity it is being asked to predict. See
  // fullLadderRubrics for why the asymmetry is deliberate.
  const rnaBlocks = new Map();    // `${arm}|${startup}` -> block for the RNA probe
  const levelBlocks = new Map();  // `${arm}|${startup}` -> block for the levels probe
  for (const arm of ARMS) {
    for (const [startupName, startup] of Object.entries(STARTUPS)) {
      const retrieved = await retrieveRubricsForArm(ai, arm, startup, corpusVecs, embedState);
      rnaBlocks.set(`${arm.name}|${startupName}`, renderRubricBlock(retrieved));
      // Only a corpus arm gets a rubric at all. `semantic` retrieves nothing
      // against this corpus (Step A: 0/12), which is what makes it a
      // null-condition replicate of baseline - preserved deliberately as a
      // noise control, not a third condition.
      const ladder = arm.ragCorpus && retrieved.length ? fullLadderRubrics() : [];
      levelBlocks.set(`${arm.name}|${startupName}`, renderRubricBlock(ladder));
      results[arm.name].startups[startupName] = { retrieved, rnaCalls: [], levelCalls: [], hallucCalls: [] };
    }
  }
```

Then inside the loop, replace the single lookup

```js
        const rubricBlock = rubricBlocks.get(`${arm.name}|${startupName}`);
```

with

```js
        const rnaBlock = rnaBlocks.get(`${arm.name}|${startupName}`);
        const levelBlock = levelBlocks.get(`${arm.name}|${startupName}`);
```

and update the three call sites in that loop body:
- RNA: `call(ai, rnaPrompt(startup.doc, rnaBlock, startup.levels))`
- levels: `call(ai, levelsPrompt(startup.doc, levelBlock))`
- hallucination: `call(ai, hallucinationPrompt(startup.doc, rnaBlock, startup.present, startup.absent))`

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS, 30 tests.

- [ ] **Step 8: Commit**

```bash
git add backend/measurement/measure-grounding.js backend/measurement/tests/prompts.test.js
git commit -m "fix(measurement): remove both confounds from the arm contrast

Confound 1: ai.service.ts:937-943 emits the startup's levels for every
arm and only the rubric block varies with ragCorpus. The harness emitted
them for no arm, so it was measuring 'told its levels' against 'not
told' - not a retrieval effect, and a contrast production never presents.
rnaPrompt now takes the levels and emits production's block for all arms.

Confound 2: deterministic retrieval keys on (readinessType, level) using
the startup's actual level, so the levels probe was asking that arm to
predict what it had been handed. The levels probe now receives the full
nine-rung ladder for every dimension; the model gets the rubric
vocabulary without being told which rung applies. The RNA probe keeps
the (L, L+1) lookup because that is what production ships - the
asymmetry is deliberate and commented as such.

Neither was fixable by running more reps."
```

---

### Task 5: Rewire the metrics and demote the fabrication probe

**Files:**
- Modify: `backend/measurement/measure-grounding.js` — `runGenerationArms` loop, `reportMetric1`, `reportMetric2`, `reportMetric3`, add `reportMetric4`, add the `--with-fabrication-probe` flag
- Test: `backend/measurement/tests/reporting.test.js` (create)

**Interfaces:**
- Consumes: `levelPlacement`, `stageAppropriateness`, `differentiationGap` (Task 3); `isStageInappropriate` (Task 2).
- Produces: `summarizeResults(results) -> { metric1: row[], metric2: row[], metric3: row[], metric4: row[] }`, a pure function over the results object, added to `module.exports`. The `report*` functions become thin printers over it.

- [ ] **Step 1: Write the failing test**

Create `backend/measurement/tests/reporting.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const H = require(path.resolve(__dirname, '../measure-grounding.js'));

/** Minimal results object shaped exactly as runGenerationArms builds it. */
function results({ agroAssigned, mediAssigned, agroRna }) {
  const mk = (levelCalls, rnaCalls) => ({ retrieved: [], rnaCalls, levelCalls, hallucCalls: [] });
  return {
    baseline: {
      quotaHit: false,
      startups: {
        'AgroLink PH': mk([{ byDim: agroAssigned }], [{ byDim: agroRna }]),
        'MediSync Cebu': mk([{ byDim: mediAssigned }], []),
      },
    },
    'sdd-semantic': { quotaHit: false, startups: {} },
    'deviation-deterministic': { quotaHit: false, startups: {} },
  };
}

test('metric 1 scores level placement against the seeded ground truth', () => {
  // AgroLink truth is T2 M2 A1 O2 R1 I1. Assign T2 (exact) and M4 (off by 2).
  const s = H.summarizeResults(results({
    agroAssigned: { Technology: 2, Market: 4 },
    mediAssigned: {},
    agroRna: {},
  }));
  const row = s.metric1.find((r) => r.arm === 'baseline');
  assert.equal(row.n, 2);
  assert.equal(row.exact, 1);
  assert.ok(Math.abs(Number(row.mae) - 1) < 1e-9, `mae should be 1, got ${row.mae}`);
});

test('metric 2 flags a stage-inappropriate RNA using the real lexicon', () => {
  const s = H.summarizeResults(results({
    agroAssigned: {},
    mediAssigned: {},
    // AgroLink Technology is level 2, horizon 4; "commercialization" is 7.
    agroRna: { Technology: 'Move to commercialization now.', Market: 'Interview more co-ops.' },
  }));
  const row = s.metric2.find((r) => r.arm === 'baseline');
  assert.equal(row.checked, 2);
  assert.equal(row.flagged, 1);
});

test('metric 3 still reports the early-vs-mid gap', () => {
  const s = H.summarizeResults(results({
    agroAssigned: { Technology: 2, Market: 2 },
    mediAssigned: { Technology: 5, Market: 5 },
    agroRna: {},
  }));
  const row = s.metric3.find((r) => r.arm === 'baseline');
  assert.equal(Number(row.GAP), 3);
});

test('an arm that never ran reports n=0 rather than undefined', () => {
  const s = H.summarizeResults(results({ agroAssigned: {}, mediAssigned: {}, agroRna: {} }));
  for (const key of ['metric1', 'metric2', 'metric3']) {
    assert.equal(s[key].length, 3, `${key} must have a row for every arm`);
    const row = s[key].find((r) => r.arm === 'deviation-deterministic');
    assert.ok(row, 'the unreached arm still needs a row');
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test measurement/tests/reporting.test.js`
Expected: FAIL — `H.summarizeResults is not a function`.

- [ ] **Step 3: Add the summarizer**

At the top of `measure-grounding.js`, near the other requires (after the `RUBRICS` require):

```js
const { levelPlacement, stageAppropriateness, differentiationGap } = require(
  path.join(__dirname, 'lib/metrics.js'),
);
const { isStageInappropriate } = require(path.join(__dirname, 'lib/stage-markers.js'));
```

Then replace the three `reportMetricN` functions with one pure summarizer plus thin printers:

```js
/**
 * Pure over the results object so it can be tested without a model call, and
 * so --merge and a live run share exactly one scoring path. Every arm always
 * gets a row, including one a 429 stopped us from reaching - an absent row and
 * a zero row mean different things and the tables must not conflate them.
 */
function summarizeResults(results) {
  const metric1 = [];
  const metric2 = [];
  const metric3 = [];
  const metric4 = [];

  for (const arm of ARMS) {
    const armResult = results[arm.name] || { startups: {} };

    // --- Metric 1: level-placement accuracy vs seeded ground truth ---
    let n = 0, exact = 0, within1 = 0, errSum = 0;
    for (const [startupName, cell] of Object.entries(armResult.startups)) {
      const truth = STARTUPS[startupName].levels;
      for (const lc of cell.levelCalls) {
        const p = levelPlacement(lc.byDim, truth, DIMENSIONS);
        if (!p.n) continue;
        n += p.n;
        exact += p.exact;
        within1 += p.within1;
        errSum += p.mae * p.n;
      }
    }
    metric1.push({
      arm: arm.name,
      n,
      mae: n ? (errSum / n).toFixed(2) : 'n/a',
      exact,
      within1,
      'exact %': n ? `${((exact / n) * 100).toFixed(0)}%` : 'n/a',
    });

    // --- Metric 2: stage-inappropriate recommendation rate ---
    let flagged = 0, checked = 0;
    for (const [startupName, cell] of Object.entries(armResult.startups)) {
      const truth = STARTUPS[startupName].levels;
      for (const rc of cell.rnaCalls) {
        const s = stageAppropriateness(rc.byDim, truth, DIMENSIONS, isStageInappropriate);
        flagged += s.flagged;
        checked += s.checked;
      }
    }
    metric2.push({
      arm: arm.name,
      flagged,
      checked,
      rate: checked ? `${((flagged / checked) * 100).toFixed(0)}%` : 'n/a',
    });

    // --- Metric 3: differentiation gap ---
    const agro = armResult.startups['AgroLink PH'];
    const medi = armResult.startups['MediSync Cebu'];
    const g = differentiationGap(
      agro ? agro.levelCalls.flatMap((c) => Object.values(c.byDim)) : [],
      medi ? medi.levelCalls.flatMap((c) => Object.values(c.byDim)) : [],
    );
    metric3.push({
      arm: arm.name,
      'AgroLink mean': Number.isNaN(g.earlyMean) ? 'n/a' : g.earlyMean.toFixed(2),
      'AgroLink n': g.earlyN,
      'MediSync mean': Number.isNaN(g.midMean) ? 'n/a' : g.midMean.toFixed(2),
      'MediSync n': g.midN,
      GAP: Number.isNaN(g.gap) ? 'n/a' : g.gap.toFixed(2),
    });

    // --- Metric 4: absent-field probe (only when --with-fabrication-probe) ---
    let invented = 0, absentChecked = 0, presentCorrect = 0, presentChecked = 0, reps = 0;
    for (const [, cell] of Object.entries(armResult.startups)) {
      for (const h of cell.hallucCalls) {
        invented += h.inventedAbsent;
        absentChecked += h.absentChecked;
        presentCorrect += h.presentCorrect;
        presentChecked += h.presentChecked;
        reps++;
      }
    }
    metric4.push({
      arm: arm.name,
      invented: `${invented}/${absentChecked}`,
      'invented rate': absentChecked ? `${((invented / absentChecked) * 100).toFixed(0)}%` : 'n/a',
      'present recalled': `${presentCorrect}/${presentChecked}`,
      'n reps': reps,
    });
  }

  return { metric1, metric2, metric3, metric4 };
}

function printReports(results) {
  const s = summarizeResults(results);

  console.log('\n--- Metric 1: level-placement accuracy (vs seeded ground truth) ---');
  console.log('(mean absolute error between the assigned level and the startup\'s actual level; lower is better)\n');
  console.table(s.metric1);

  console.log('\n--- Metric 2: stage-inappropriate recommendation rate ---');
  console.log('(share of generated RNAs recommending actions from more than two rungs above the startup\'s level - SO 1.3\'s example; lower is better)\n');
  console.table(s.metric2);

  console.log('\n--- Metric 3: differentiation gap (early vs mid) ---');
  console.log('Baseline to hold or beat: +2.28 on gemini-3.6-flash (measure-differentiation.js, 2026-07-27)');
  console.log('Measured noise floor: +/-1.0 gap points between byte-identical prompts (2026-07-29)\n');
  console.table(s.metric3);

  if (WITH_FABRICATION) {
    console.log('\n--- Metric 4: absent-field probe (regression check) ---');
    console.log('(saturated at 0/15 on 2026-07-29 across every arm; kept as evidence for SRS 2.2, not as a discriminator)\n');
    console.table(s.metric4);
  }
}
```

Replace the three `reportMetricN(results);` calls at the end of `runGenerationArms` with a single `printReports(results);`, and do the same in `runMerge`.

- [ ] **Step 4: Add the flag and skip the fabrication call by default**

Near the other flags at the top of the file:

```js
/**
 * The absent-field probe is saturated - 0/15 invented on every arm, 2026-07-29,
 * reproducing the 2026-07-27 model comparison's 0/9 on two different models.
 * groundPrompt() already handles it completely, so it discriminates nothing.
 *
 * It is kept rather than deleted because 0/15 with 15/15 recalled is a PASSING
 * result against SRS 2.2's "return null for unverifiable fields" criterion, and
 * that evidence is worth having. Running it once per series is enough. Skipping
 * it by default takes a rep from 18 calls to 12, against a 20/day cap.
 */
const WITH_FABRICATION = process.argv.includes('--with-fabrication-probe');
```

In `runGenerationArms`, wrap the entire third `try { ... } catch { ... }` block (the hallucination probe) and its trailing `await sleep(DELAY_MS);` in:

```js
        if (WITH_FABRICATION) {
          // ... existing hallucination try/catch and sleep, unchanged ...
        }
```

Update the calls-per-rep banner at the top of `runGenerationArms`:

```js
  const callsPerCell = WITH_FABRICATION ? 3 : 2;
  const perRep = ARMS.length * Object.keys(STARTUPS).length * callsPerCell;
  console.log(
    `reps=${REPS}, ${perRep} calls per rep (${REPS * perRep} total) ` +
      `against a 20/day free-tier cap on ${GEN_MODEL}` +
      (WITH_FABRICATION ? ' [+ fabrication probe]' : '') + '\n',
  );
```

- [ ] **Step 5: Export the summarizer**

Add `summarizeResults,` to `module.exports`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS, 34 tests.

- [ ] **Step 7: Verify the old results file still summarizes**

Run: `cd backend && node measurement/measure-grounding.js --merge measurement/results/2026-07-29-rep1.json`

Expected: exit 0, four tables print. Metric 1 and metric 2 will show values computed by the **new** scorers over the **old** data — which is exactly why Task 6 must fingerprint them apart. Note the numbers but do not record them anywhere as a result.

- [ ] **Step 8: Commit**

```bash
git add backend/measurement/measure-grounding.js backend/measurement/tests/reporting.test.js
git commit -m "feat(measurement): rewire the metrics and demote the fabrication probe

summarizeResults is pure over the results object, so a live run and
--merge share one scoring path and the tables are testable without a
model call. Every arm always gets a row - an absent row and a zero row
mean different things.

The absent-field probe moves behind --with-fabrication-probe. It is
saturated (0/15 on every arm, reproducing 0/9 on two models in the
2026-07-27 comparison) so it discriminates nothing, but 0/15 with 15/15
recalled is a passing SRS 2.2 result worth keeping as evidence. Skipping
it by default takes a rep from 18 calls to 12 against a 20/day cap."
```

---

### Task 6: Per-(metric, arm) fingerprints and merge

**Files:**
- Create: `backend/measurement/lib/fingerprint.js`
- Modify: `backend/measurement/measure-grounding.js` — replace `probeFingerprint`, `writeResults`, `runMerge`, and the `--fingerprint` CLI branch
- Test: `backend/measurement/tests/fingerprint.test.js`, `backend/measurement/tests/merge.test.js`

**Interfaces:**
- Consumes: `ARMS`, `DIMENSIONS`, `STARTUPS`, `GROUNDING`, `rnaPrompt`, `levelsPrompt`, `hallucinationPrompt`, `MARKERS`.
- Produces: `lib/fingerprint.js` exporting `fingerprintMap(spec) -> { [`${metric}|${arm}`]: string }` where `metric` is one of `levels`, `rna`, `fabrication`; and `mergeRuns(files, arms) -> { merged, contributions, refusals }` in `measure-grounding.js`. `mergeRuns` **throws** `Error` with a readable message instead of calling `process.exit`, so it is testable; the CLI catches and exits 1.

- [ ] **Step 1: Write the failing test**

Create `backend/measurement/tests/fingerprint.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { fingerprintMap } = require(path.resolve(__dirname, '../lib/fingerprint.js'));

const base = {
  common: { grounding: 'G', dimensions: ['Technology'], startups: { A: { levels: { Technology: 2 } } } },
  markers: [{ phrase: 'ipo', minLevel: 9, dimensions: null }],
  sources: { rna: 'function rnaPrompt(){}', levels: 'function levelsPrompt(){}', fabrication: 'function h(){}' },
  arms: [
    { name: 'baseline', ragCorpus: false, rubricMode: null },
    { name: 'deviation-deterministic', ragCorpus: true, rubricMode: 'deterministic' },
  ],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

test('produces one fingerprint per (metric, arm)', () => {
  const fp = fingerprintMap(base);
  assert.deepEqual(Object.keys(fp).sort(), [
    'fabrication|baseline', 'fabrication|deviation-deterministic',
    'levels|baseline', 'levels|deviation-deterministic',
    'rna|baseline', 'rna|deviation-deterministic',
  ]);
});

test('is stable across identical inputs', () => {
  assert.deepEqual(fingerprintMap(base), fingerprintMap(clone(base)));
});

test('a prompt-source change moves only that metric', () => {
  const changed = clone(base);
  changed.sources.rna = 'function rnaPrompt(){/*v2*/}';
  const a = fingerprintMap(base);
  const b = fingerprintMap(changed);
  assert.notEqual(a['rna|baseline'], b['rna|baseline']);
  assert.equal(a['levels|baseline'], b['levels|baseline'], 'metric 3 data must survive an RNA-prompt change');
});

test('a lexicon change moves the rna metric only', () => {
  const changed = clone(base);
  changed.markers.push({ phrase: 'franchise', minLevel: 8, dimensions: null });
  const a = fingerprintMap(base);
  const b = fingerprintMap(changed);
  assert.notEqual(a['rna|baseline'], b['rna|baseline']);
  assert.equal(a['levels|baseline'], b['levels|baseline']);
});

// This is the case that makes per-ARM granularity necessary: the ladder change
// alters the levels prompt for a corpus arm and leaves baseline untouched.
test('a rubric-scope change moves only the arms it applies to', () => {
  const changed = clone(base);
  changed.levelsRubricScope = 'full-ladder';
  const a = fingerprintMap({ ...base, levelsRubricScope: 'current-and-next' });
  const b = fingerprintMap(changed);
  assert.equal(a['levels|baseline'], b['levels|baseline'], 'baseline gets no rubric either way');
  assert.notEqual(a['levels|deviation-deterministic'], b['levels|deviation-deterministic']);
});
```

Create `backend/measurement/tests/merge.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const H = require(path.resolve(__dirname, '../measure-grounding.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-test-'));

function writeRun(name, { levelsFp, rnaFp, agroLevels }) {
  const file = path.join(TMP, name);
  fs.writeFileSync(file, JSON.stringify({
    generatedAt: '2026-07-29T00:00:00Z',
    genModel: 'gemini-3.6-flash',
    embedModel: 'gemini-embedding-2',
    corpusRows: 54,
    floor: 0.78,
    fingerprints: {
      'levels|baseline': levelsFp,
      'rna|baseline': rnaFp,
    },
    results: {
      baseline: {
        quotaHit: false,
        startups: {
          'AgroLink PH': { retrieved: [], rnaCalls: [], levelCalls: [{ byDim: agroLevels }], hallucCalls: [] },
        },
      },
      'sdd-semantic': { quotaHit: false, startups: {} },
      'deviation-deterministic': { quotaHit: false, startups: {} },
    },
  }, null, 2));
  return file;
}

test('pools a metric whose fingerprint matches', () => {
  const a = writeRun('a.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 2 } });
  const b = writeRun('b.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 4 } });
  const { merged } = H.mergeRuns([a, b], H.ARMS);
  assert.equal(merged.baseline.startups['AgroLink PH'].levelCalls.length, 2);
});

test('refuses one metric while pooling another', () => {
  // The exact case Task 4 creates: the RNA prompt changed, the levels prompt
  // did not, so metric 3 data must survive.
  const a = writeRun('c.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 2 } });
  const b = writeRun('d.json', { levelsFp: 'L1', rnaFp: 'R2', agroLevels: { Technology: 4 } });
  const { merged, refusals } = H.mergeRuns([a, b], H.ARMS);
  assert.equal(merged.baseline.startups['AgroLink PH'].levelCalls.length, 2, 'levels must pool');
  assert.ok(refusals.some((r) => r.startsWith('rna|baseline')), `expected an rna refusal, got ${JSON.stringify(refusals)}`);
});

test('throws when the model differs', () => {
  const a = writeRun('e.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 2 } });
  const bad = path.join(TMP, 'f.json');
  const data = JSON.parse(fs.readFileSync(a, 'utf8'));
  data.genModel = 'gemini-2.5-flash-lite';
  fs.writeFileSync(bad, JSON.stringify(data));
  assert.throws(() => H.mergeRuns([a, bad], H.ARMS), /not comparable/i);
});

test('a file with no fingerprints pools with nothing new', () => {
  const a = writeRun('g.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 2 } });
  const legacy = path.join(TMP, 'h.json');
  const data = JSON.parse(fs.readFileSync(a, 'utf8'));
  delete data.fingerprints;
  fs.writeFileSync(legacy, JSON.stringify(data));
  const { refusals } = H.mergeRuns([a, legacy], H.ARMS);
  assert.ok(refusals.length > 0, 'a pre-fingerprint file must not silently pool');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && node --test measurement/tests/fingerprint.test.js measurement/tests/merge.test.js`
Expected: FAIL — `Cannot find module '../lib/fingerprint.js'` and `H.mergeRuns is not a function`.

- [ ] **Step 3: Write the fingerprint module**

Create `backend/measurement/lib/fingerprint.js`:

```js
/**
 * Comparability fingerprints, one per (metric, arm).
 *
 * Per-metric alone is not enough. Fixing the levels-probe leak changes the
 * rubric a CORPUS arm sees while leaving baseline and sdd-semantic untouched
 * (both get an empty block before and after), so a per-metric hash would
 * discard two arms' worth of still-valid data along with the one that really
 * did change. Per (metric, arm) keeps exactly what is comparable.
 *
 * What each metric depends on:
 *   levels      -> the levels prompt source, the rubric scope that arm receives
 *   rna         -> the RNA prompt source, that arm's rubric scope, AND the
 *                  stage-marker lexicon, since metric 2 is scored with it
 *   fabrication -> the hallucination prompt source and the field lists
 */
const crypto = require('crypto');

const hash = (material) =>
  crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 12);

/**
 * @param {object} spec
 * @param {object} spec.common      grounding instruction, dimensions, startups (docs + levels + field lists)
 * @param {Array}  spec.markers     the stage-marker lexicon
 * @param {object} spec.sources     { rna, levels, fabrication } - prompt-builder source text
 * @param {Array}  spec.arms        ARMS
 * @param {string} [spec.levelsRubricScope]  'full-ladder' | 'current-and-next' | 'none'
 * @param {string} [spec.rnaRubricScope]     'current-and-next' | 'none'
 */
function fingerprintMap(spec) {
  const {
    common,
    markers,
    sources,
    arms,
    levelsRubricScope = 'full-ladder',
    rnaRubricScope = 'current-and-next',
  } = spec;

  const out = {};
  for (const arm of arms) {
    // An arm with no corpus receives no rubric on either probe, so a change to
    // the rubric SCOPE cannot affect it. Recording 'none' is what lets its old
    // data keep pooling across the ladder change.
    const levelsScope = arm.ragCorpus ? levelsRubricScope : 'none';
    const rnaScope = arm.ragCorpus ? rnaRubricScope : 'none';

    out[`levels|${arm.name}`] = hash({ src: sources.levels, common, scope: levelsScope, rubricMode: arm.rubricMode });
    out[`rna|${arm.name}`] = hash({ src: sources.rna, common, scope: rnaScope, rubricMode: arm.rubricMode, markers });
    out[`fabrication|${arm.name}`] = hash({ src: sources.fabrication, common, scope: rnaScope, rubricMode: arm.rubricMode });
  }
  return out;
}

module.exports = { fingerprintMap };
```

- [ ] **Step 4: Wire it into the harness**

In `measure-grounding.js`, delete the existing `probeFingerprint()` function and replace it with:

```js
const { fingerprintMap } = require(path.join(__dirname, 'lib/fingerprint.js'));
const { MARKERS } = require(path.join(__dirname, 'lib/stage-markers.js'));

function currentFingerprints() {
  return fingerprintMap({
    common: {
      grounding: GROUNDING,
      dimensions: DIMENSIONS,
      startups: Object.fromEntries(
        Object.entries(STARTUPS).map(([k, v]) => [k, { doc: v.doc, levels: v.levels, present: v.present, absent: v.absent }]),
      ),
    },
    markers: MARKERS,
    sources: {
      rna: rnaPrompt.toString(),
      levels: levelsPrompt.toString(),
      fabrication: hallucinationPrompt.toString(),
    },
    arms: ARMS,
    levelsRubricScope: 'full-ladder',
    rnaRubricScope: 'current-and-next',
  });
}
```

Change `writeResults` to emit `fingerprints: currentFingerprints()` in place of `probeFingerprint: probeFingerprint()`, and drop the `reps` field's role as a comparability signal (keep it as metadata).

Replace `runMerge` with a testable `mergeRuns` plus a thin CLI wrapper:

```js
/**
 * Pools per (metric, arm). Throws rather than exiting so it is testable; the
 * CLI wrapper below catches and exits 1.
 */
function mergeRuns(files, arms) {
  const days = files.map((f) => ({ file: f, data: JSON.parse(fs.readFileSync(f, 'utf8')) }));

  const envKey = (d) => `${d.data.genModel}|${d.data.embedModel}|${d.data.corpusRows}|${d.data.floor}`;
  const distinctEnv = [...new Set(days.map(envKey))];
  if (distinctEnv.length > 1) {
    throw new Error(
      'Refusing to merge: these runs are not comparable.\n' +
        '(genModel|embedModel|corpusRows|floor)\n' +
        days.map((d) => `  ${d.file}: ${envKey(d)}`).join('\n'),
    );
  }

  // The first file establishes the reference fingerprint for each (metric, arm).
  const reference = days[0].data.fingerprints || {};
  const merged = {};
  for (const arm of arms) merged[arm.name] = { startups: {}, quotaHit: false };

  const contributions = {};
  const refusals = [];
  const FIELD = { levels: 'levelCalls', rna: 'rnaCalls', fabrication: 'hallucCalls' };

  for (const { file, data } of days) {
    for (const arm of arms) {
      const src = data.results[arm.name];
      if (!src) continue;
      merged[arm.name].quotaHit = merged[arm.name].quotaHit || src.quotaHit;

      for (const [metric, field] of Object.entries(FIELD)) {
        const key = `${metric}|${arm.name}`;
        const mine = (data.fingerprints || {})[key];
        const ref = reference[key];
        // undefined on either side is a pre-fingerprint file: never pool it
        // with anything, in either direction.
        if (mine === undefined || ref === undefined || mine !== ref) {
          if (Object.values(src.startups).some((c) => c[field] && c[field].length)) {
            refusals.push(`${key} (${path.basename(file)}: ${mine ?? 'pre-fingerprint'} vs ${ref ?? 'pre-fingerprint'})`);
          }
          continue;
        }

        for (const [startupName, cell] of Object.entries(src.startups)) {
          const dst =
            merged[arm.name].startups[startupName] ||
            (merged[arm.name].startups[startupName] = {
              retrieved: cell.retrieved,
              rnaCalls: [],
              levelCalls: [],
              hallucCalls: [],
            });
          dst[field].push(...cell[field]);
        }
        contributions[key] = (contributions[key] || []).concat(path.basename(file));
      }
    }
  }

  return { merged, contributions, refusals };
}

function runMergeCli(files) {
  const { merged, contributions, refusals } = mergeRuns(files, ARMS);
  console.log(`=== Merged ${files.length} run(s), pooled per (metric, arm) ===`);
  console.table(
    Object.entries(contributions).map(([k, v]) => ({ 'metric|arm': k, files: v.join(', ') })),
  );
  if (refusals.length) {
    console.log('\nNot pooled (fingerprint mismatch - different probe design):');
    for (const r of refusals) console.log(`  ${r}`);
  }
  printReports(merged);
}
```

In the CLI branch, replace `runMerge(MERGE_FILES);` with:

```js
      try {
        runMergeCli(MERGE_FILES);
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      return;
```

And replace the `--fingerprint` branch body with `console.log(JSON.stringify(currentFingerprints(), null, 2));`.

- [ ] **Step 5: Export the new functions**

Add `mergeRuns,` and `currentFingerprints,` to `module.exports`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS, 43 tests.

- [ ] **Step 7: Confirm the old file is refused, not silently pooled**

Run: `cd backend && node measurement/measure-grounding.js --merge measurement/results/2026-07-29-rep1.json`

Expected: exit 0. The file carries the **old single** `probeFingerprint`, not the new `fingerprints` map, so every metric is listed under "Not pooled". This is correct: the run predates both confound fixes, and its numbers were produced by a different experiment.

- [ ] **Step 8: Commit**

```bash
git add backend/measurement/lib/fingerprint.js backend/measurement/measure-grounding.js backend/measurement/tests/fingerprint.test.js backend/measurement/tests/merge.test.js
git commit -m "feat(measurement): fingerprint per (metric, arm), not per metric

The spec called for per-metric fingerprints so the 2026-07-29 file would
stay mergeable for metric 3. Planning found that holds for only two of
three arms: the ladder fix changes the levels prompt for a corpus arm
and leaves baseline and sdd-semantic untouched, since both get an empty
rubric block before and after. Per-metric alone would have discarded two
arms' still-valid data along with the one that really changed.

Fingerprints are therefore keyed (metric, arm), and an arm with no
corpus records scope 'none' - which is what lets its data keep pooling
across a rubric-scope change that cannot affect it.

mergeRuns throws instead of calling process.exit so it is testable, and
pools each (metric, arm) independently, reporting which files
contributed and which were refused."
```

---

### Task 7: `--dry-run`, documentation, and full quota-free verification

**Files:**
- Modify: `backend/measurement/measure-grounding.js` — add `--dry-run`
- Modify: `backend/measurement/README.md`
- Test: manual, all quota-free

- [ ] **Step 1: Add `--dry-run`**

Near the other flags:

```js
/**
 * Assembles and prints every arm's prompts without calling the model. The one
 * thing unit tests cannot check is whether the assembled prompt LOOKS right -
 * and this harness has now twice measured a property of the prompt rather than
 * of the model. Same philosophy as inspect-prompt.js: stop before sendToGemini.
 */
const DRY_RUN = process.argv.includes('--dry-run');
```

In the CLI block, after `runRetrievalOnly` and the `RETRIEVAL_ONLY` early return:

```js
    if (DRY_RUN) {
      const embedState = {};
      for (const arm of ARMS) {
        for (const [startupName, startup] of Object.entries(STARTUPS)) {
          const retrieved = await retrieveRubricsForArm(ai, arm, startup, corpusVecs, embedState);
          const rnaBlock = renderRubricBlock(retrieved);
          const ladder = arm.ragCorpus && retrieved.length ? fullLadderRubrics() : [];
          const levelBlock = renderRubricBlock(ladder);
          console.log(`\n${'='.repeat(78)}\n${arm.name} / ${startupName}\n${'='.repeat(78)}`);
          console.log(`retrieved for RNA probe: ${retrieved.length} rows; levels probe: ${ladder.length} rows`);
          console.log(`\n----- RNA PROMPT -----\n${rnaPrompt(startup.doc, rnaBlock, startup.levels)}`);
          console.log(`\n----- LEVELS PROMPT -----\n${levelsPrompt(startup.doc, levelBlock)}`);
        }
      }
      console.log('\n--dry-run: no generation quota spent.');
      return;
    }
```

- [ ] **Step 2: Run the dry run and check both confound fixes by eye**

Use the session scratchpad, not `/tmp` — this environment reserves
`C:\TEMP\claude\...\scratchpad` for temporary files. Set `DRY=<scratchpad>/dry.txt`.

Run: `cd backend && node measurement/measure-grounding.js --dry-run > "$DRY" 2>&1; grep -c "Initial Readiness Level:" "$DRY"`

Expected: **6** — one per (arm, startup) RNA prompt, and none in any levels prompt.

Run: `cd backend && awk '/----- LEVELS PROMPT -----/,/^={70,}/' "$DRY" | grep -c "Initial Readiness Level:"`
Expected: **0**. The levels probe must never leak the answer.

Run: `cd backend && grep -A2 "retrieved for RNA probe" "$DRY"`
Expected: `deviation-deterministic` shows `12 rows` for the RNA probe and `54 rows` for the levels probe; `baseline` and `sdd-semantic` show `0` and `0`.

- [ ] **Step 3: Update the README**

In `backend/measurement/README.md`, replace the `measure-grounding.js` Step B section with the new metric definitions. It must state, at minimum:

- Metric 1 is level-placement accuracy (MAE vs seeded ground truth); the old rubric-term metric scored 1/12 because it measured vocabulary reuse.
- Metric 2 is the stage-inappropriate recommendation rate, SO 1.3's own example; the lexicon lives in `data/stage-markers.json`, is **authored with no external source**, and is held disjoint from corpus `keyTerms` by test.
- Metric 3 is unchanged in definition but was previously leaked to the deterministic arm.
- Metric 4 is the old absent-field probe behind `--with-fabrication-probe`, retained as SRS §2.2 evidence, saturated.
- Both confounds, in one paragraph each.
- A rep is now 12 calls (18 with the fabrication probe).
- `--dry-run` and `pnpm test:measurement` exist and are quota-free.
- The 2026-07-29 result is **superseded**: it was produced under both confounds and its metric 1 and 2 definitions no longer exist. Keep the file and the noise-floor finding (±1.0 between byte-identical prompts) — that finding is about the model and survives the redesign.

- [ ] **Step 4: Full quota-free verification**

```bash
cd backend
pnpm test:measurement                      # expect all green
pnpm test                                  # expect 167 passing / 2 failing, unchanged
node measurement/measure-grounding.js --fingerprint    # expect a JSON map of 18 entries
node measurement/measure-grounding.js --dry-run | tail -1   # expect the no-quota notice
node --check measurement/measure-grounding.js
```

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/measure-grounding.js backend/measurement/README.md
git commit -m "feat(measurement): add --dry-run and document the redesign

--dry-run assembles and prints every arm's prompts without calling the
model. Unit tests cannot tell whether an assembled prompt looks right,
and this harness has now twice measured a property of the prompt rather
than of the model - so an eyeball path that costs no quota is worth
having standing rather than improvised.

README records both confounds, the four metrics, the lexicon's authored
provenance, and that the 2026-07-29 numbers are superseded. The noise
floor from that run (+/-1.0 gap points between byte-identical prompts)
survives the redesign - it is a fact about the model, not the probes."
```

---

### Task 8: One real rep

**The only task that spends quota.** Do not start it before **15:00 Philippine time**, and prefer the first calls of a fresh window.

**Files:**
- Create: `backend/measurement/results/<YYYY-MM-DD>-redesign-rep1.json`
- Modify: `backend/measurement/README.md`, `TODO_CHECKLIST.md`, `SESSION_NOTES.md`

- [ ] **Step 1: Confirm the window is fresh**

Run: `date` — confirm it is at or after 15:00 PH, or that no generation calls have been made since the last 15:00 PH boundary.

- [ ] **Step 2: Dry-run once more against the live corpus**

Run: `cd backend && node measurement/measure-grounding.js --dry-run | head -60`
Expected: prompts assemble, no errors. Costs embedding quota only.

- [ ] **Step 3: Run one rep**

```bash
cd backend
node measurement/measure-grounding.js --reps=1 --out=measurement/results/$(date +%Y-%m-%d)-redesign-rep1.json
```

Expected: 12 calls, all four arms' cells populated, `n=1` per cell, 8 calls of headroom against the cap.

- [ ] **Step 4: Record the result honestly**

Write the four tables into `measurement/README.md` and `SESSION_NOTES.md`. **Required caveats, all of which are already established:**

- n=1, against a measured noise floor of ±1.0 differentiation-gap points. **No between-arm difference in metric 3 is interpretable at this N.**
- `sdd-semantic` is a null-condition replicate of `baseline`, not a third condition.
- If metric 2 reads 0% on every arm, it has saturated the way the absent-field probe did — report it as the finding it is (the levels block, not the corpus, is doing the grounding work) and note the `baseline-no-levels` fourth arm the spec holds in reserve. **Do not** conclude the corpus is ineffective.
- All metrics are mechanical proxies; SO 1.5 names mentor expert ratings as the ground truth.

- [ ] **Step 5: Update the checklist**

In `TODO_CHECKLIST.md` §0, update the grounding-measurement item: the probes are redesigned, both confounds are fixed, and the remaining work is reps (one per day) rather than code.

- [ ] **Step 6: Commit**

```bash
git add backend/measurement/results backend/measurement/README.md TODO_CHECKLIST.md SESSION_NOTES.md
git commit -m "measure(grounding): first rep under the redesigned probes

<fill in the four tables and what they do and do not show>"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: metric 1 → Tasks 3, 5; metric 2 → Tasks 2, 3, 5; metric 3 → Tasks 4, 5; metric 4 demotion → Task 5; confound 1 → Task 4; confound 2 → Task 4; per-metric fingerprints → Task 6 (**with the documented correction to per-(metric, arm)**); `--dry-run` → Task 7; verification items 1-5 → Tasks 2, 3, 6, 7; verification item 6 → Task 8; the saturation contingency → Task 8 Step 4. The `baseline-no-levels` fourth arm is deliberately **not** implemented, per the spec's "deferred until the saturation is observed".

**Placeholders.** One intentional: Task 8 Step 6's commit body cannot be written before the numbers exist. Every other step carries its actual content.

**Type consistency.** `rnaPrompt` gains a third parameter in Task 4 and every call site is updated in the same task (Tasks 5, 7 and the fingerprint source in Task 6 all use the new signature). `levelsPrompt` and `hallucinationPrompt` keep their signatures. `isStageInappropriate(text, dimension, level)` is defined in Task 2 and consumed with that exact argument order in Tasks 3 and 5. `mergeRuns(files, arms)` is defined in Task 6 and called with `H.ARMS` in its own tests. The results-object shape (`{ retrieved, rnaCalls, levelCalls, hallucCalls }`) is identical in Tasks 4, 5, 6 and both test files.
