# Supplied-Level Fabrication Probe Implementation Plan

> **Superseded on one value:** `INFLATED_OVERRIDE` is **3**, not the 4 this plan
> specifies throughout. 4 pulls rubric rows 4-5 and so never injects IRL 3, the
> row the observed fabrication came from. See the spec's manipulation section.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure whether a wrong *supplied* readiness level turns retrieved rubric text into asserted evidence on production's RNA path.

**Architecture:** A new `--level-condition` flag on the existing grounding harness runs the RNA probe twice per cell — once at the corrected levels and once with Organizational/Regulatory/Investment inflated to 4. A pure classifier scores each generated RNA for clauses that *assert* an artifact class the source documents never mention, distinguishing that from correctly *recommending* the same artifact. No prompt-builder source changes, so no existing fingerprint moves.

**Tech Stack:** Node.js CommonJS, `node:test` + `node:assert`, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-06-supplied-level-fabrication-probe-design.md`

**Branch:** `measure/supplied-level-fabrication` (already exists, spec committed at `342c53d`).

## Global Constraints

- **Working directory is `backend/`** for every command. Measurement paths are relative to it.
- **Run measurement tests with `pnpm test:measurement`** (`node --test measurement/tests/*.test.js`). Baseline before this work: **117 passing**.
- **Jest baseline is 216 passing / 1 failing.** The one failure is the documented pre-existing `AiService › passes valid task responses through unchanged`. A *second* jest failure is a regression you caused.
- **Never run `pnpm build` while `pnpm dev` is watching** — both write `dist/` and the race breaks the running server.
- **Spend zero generation quota.** No task in this plan calls Gemini. `--dry-run` and `--retrieval-only` are free; a plain run is not.
- **No `Co-Authored-By` trailer** in commit messages (project convention).
- **Do not push.** Standing instruction: local commits only until John says otherwise.
- **Never edit `renderRubricBlock`, `renderTitlesOnlyBlock`, `renderBareTitlesBlock`, `fullLadderRubrics`, `rnaPrompt`, `levelsPrompt`, `hallucinationPrompt`, `readinessLevelBlock`, or `STARTUPS`.** Their source text and content are hashed into the 15 existing comparability fingerprints; changing any of them orphans the collected data in `measurement/results/`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `measurement/lib/hard-absences.js` | **create** | `HARD_ABSENCES` + `verifyAbsences` — single source, was duplicated-in-waiting |
| `measurement/lib/assertions.js` | **create** | Pure classifier: clause splitting, three-way classification, per-dimension scoring |
| `measurement/tests/assertions.test.js` | **create** | Classifier units + the mutant-killing precedence test |
| `measurement/tests/level-condition.test.js` | **create** | CLI validation, call suppression, storage-field wiring |
| `measurement/audit-ground-truth.js` | modify | Import the extracted constants instead of declaring them |
| `measurement/measure-grounding.js` | modify | `--level-condition`, `INFLATED_LEVELS`, shared cell builder, metric 5 |
| `measurement/lib/fingerprint.js` | modify | Two new key families |
| `measurement/tests/fingerprint.test.js` | modify | Pin the 15 existing hashes literally |
| `measurement/README.md` | modify | Document the flag, the metric, and the run command |

---

## Task 1: Extract `HARD_ABSENCES` into a shared module

**Why this is first:** the new scorer and `audit-ground-truth.js` must read one copy. Two copies of a shared constant drifting apart is exactly the bug that produced the result retired on 2026-08-05.

**Files:**
- Create: `measurement/lib/hard-absences.js`
- Modify: `measurement/audit-ground-truth.js` (delete lines declaring `HARD_ABSENCES` ~110-128 and `verifyAbsences` ~152-164; add an import)

**Interfaces:**
- Produces: `HARD_ABSENCES` — `{ [dimension]: { ceiling: number, requires: string, absentTokens: string[] } }` for `Organizational`, `Regulatory`, `Investment`; and `verifyAbsences(docsByName) -> true`, which **throws** if any claimed-absent token actually appears.

- [ ] **Step 1: Read the current declarations**

Run: `sed -n '90,165p' measurement/audit-ground-truth.js`

Copy the `HARD_ABSENCES` object and the `verifyAbsences` function **verbatim**, including every comment. The comments explain why `full-time`, `trademark` and `IPOPHL` are deliberately excluded from the token lists; losing them invites someone to "fix" the lists and silently break the measurement.

- [ ] **Step 2: Create the new module**

Create `measurement/lib/hard-absences.js` with this header, then the two verbatim copies below it:

```js
/**
 * Reference-free absence specification, shared by audit-ground-truth.js (which
 * scores placements) and lib/assertions.js (which scores text).
 *
 * Extracted 2026-08-06 rather than copied. The study's inverted result of
 * 2026-07-30..08-04 came from two copies of the demo readiness levels drifting
 * apart; src/demo-readiness-levels.ts exists to stop that. One copy, imported.
 *
 * `ceiling` is used only by placement scoring. lib/assertions.js scores whether
 * the TEXT asserts an artifact the document never mentions, which is a property
 * of the document and not of any supplied level, so it ignores `ceiling`.
 */
```

Export both:

```js
module.exports = { HARD_ABSENCES, verifyAbsences };
```

- [ ] **Step 3: Point `audit-ground-truth.js` at the module**

Delete both declarations. Add near the other requires at the top:

```js
const { HARD_ABSENCES, verifyAbsences } = require(path.join(__dirname, 'lib/hard-absences.js'));
```

Leave `audit-ground-truth.js`'s `module.exports` list unchanged — it still re-exports `HARD_ABSENCES` and `verifyAbsences`, so its existing tests keep importing them from where they always did.

- [ ] **Step 4: Run the suite — the existing reproduction test is the guard**

Run: `pnpm test:measurement`
Expected: **117 passing, 0 failing.**

`ground-truth-audit.test.js` reproduces the published figures (0.78 / 0.42 / 1.36 / 1.69 / 1.78 MAE) exactly. If the extraction changed a single token, those numbers move and that test fails. This is a pure refactor: any failure here means you altered content, not location.

- [ ] **Step 5: Commit**

```bash
git add measurement/lib/hard-absences.js measurement/audit-ground-truth.js
git commit -m "refactor(measure): extract HARD_ABSENCES into lib for reuse"
```

---

## Task 2: The assertion classifier

**Files:**
- Create: `measurement/lib/assertions.js`
- Create: `measurement/tests/assertions.test.js`

**Interfaces:**
- Consumes: `HARD_ABSENCES` from Task 1.
- Produces:
  - `splitClauses(text) -> string[]`
  - `classifyClause(clause, tokens) -> 'negated' | 'recommended' | 'asserted' | 'unclassified' | null` (`null` = no absent token in this clause)
  - `scoreAssertedAbsences(rnaByDim, absences) -> { observations: Array<{ dimension, mentioned, asserted, unclassified, clauses: Array<{ text, klass }> }> }`

- [ ] **Step 1: Write the failing tests**

Create `measurement/tests/assertions.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { splitClauses, classifyClause, scoreAssertedAbsences } =
  require(path.resolve(__dirname, '../lib/assertions.js'));
const { HARD_ABSENCES } = require(path.resolve(__dirname, '../lib/hard-absences.js'));

const INVEST = HARD_ABSENCES.Investment.absentTokens;
const REGU = HARD_ABSENCES.Regulatory.absentTokens;

// The exact sentence observed on 2026-08-05. This is the defect the probe exists
// to count: the rubric's evidence REQUIREMENT restated as accomplished fact.
test('an asserted absent artifact is classified as asserted', () => {
  assert.equal(
    classifyClause('The venture has drafted a funding plan (IRL 3)', INVEST),
    'asserted',
  );
});

test('recommending the same artifact is not a fabrication', () => {
  assert.equal(
    classifyClause('Should draft a funding plan with a stated target raise', INVEST),
    'recommended',
  );
});

test('a negated absence is correct reporting, not a fabrication', () => {
  assert.equal(classifyClause('Has not engaged external counsel', REGU), 'negated');
});

// Precedence mutant killer. If assertion were tested before negation, the "has"
// in "has not engaged" would classify this as asserted and inflate every arm's
// rate. Verified against the mutant: reorder the checks in classifyClause and
// this test fails while the three above still pass.
test('negation beats assertion when both cues are in one clause', () => {
  assert.equal(
    classifyClause('The venture has no written funding plan', INVEST),
    'negated',
    'assertion-before-negation would score this as a fabrication',
  );
});

test('a clause with no absent token is not classified at all', () => {
  assert.equal(classifyClause('The prototype was tested with three cooperatives', INVEST), null);
});

test('splitClauses separates a negated report from its recommendation', () => {
  const clauses = splitClauses('The venture has no funding plan and should draft one.');
  assert.equal(clauses.length, 2);
  assert.match(clauses[0], /has no funding plan/);
  assert.match(clauses[1], /should draft one/);
});

test('the two-clause case is not flagged as a fabrication', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'The venture has no funding plan and should draft one.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0].asserted, false);
  assert.equal(r.observations[0].mentioned, true);
});

test('scoring is binary per dimension, so verbosity cannot inflate it', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'Angel funding is secured. Investor conversations are underway. The round is closed.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations[0].asserted, true, 'three fabricating clauses still count as one observation');
});

test('a dimension the model dropped is skipped, not scored as clean', () => {
  // Matches lib/metrics.js: a missing field is a schema problem, and scoring it
  // as "no fabrication" would reward a model that returns less.
  const r = scoreAssertedAbsences({}, { Investment: HARD_ABSENCES.Investment });
  assert.equal(r.observations.length, 0);
});

test('an unrecognised framing is reported as unclassified, not silently clean', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'Funding, per the attached schedule.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations[0].mentioned, true);
  assert.equal(r.observations[0].asserted, false);
  assert.equal(r.observations[0].unclassified, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:measurement`
Expected: FAIL — `Cannot find module '../lib/assertions.js'`.

- [ ] **Step 3: Implement the classifier**

Create `measurement/lib/assertions.js`:

```js
/**
 * Scores generated RNA text for artifact classes the source documents never
 * mention, asserted as accomplished fact.
 *
 * Pure — no I/O, no model calls, no dependency on the harness — so it tests
 * standalone, like lib/metrics.js.
 *
 * The distinction this module exists for: at IRL 1, "draft a funding plan" is
 * the RNA doing its job and "the venture has drafted a funding plan" is a
 * fabrication. Both contain the same absent token, so token presence alone
 * cannot separate them.
 *
 * Every ambiguity resolves AWAY from fabrication, so the reported rate is a
 * lower bound — the same direction HARD_ABSENCES' generous ceilings already err.
 */

const NEGATION =
  /\b(?:no|not|never|none|lacks?|lacking|without|absent)\b|n['’]t\b|\b(?:absence|lack)\s+of\b|\b(?:yet|has\s+yet|have\s+yet)\s+to\b/i;

const RECOMMENDATION =
  /\b(?:should|must|need\s+to|needs\s+to|recommend(?:s|ed|ation)?|consider|begin|start|prioriti[sz]e|next\s+step|plan\s+to|aim\s+to|ought\s+to|advis(?:e|ed|able))\b/i;

/** Clause-initial bare imperative: "Engage counsel", "Draft a funding plan". */
const IMPERATIVE =
  /^(?:draft|engage|secure|hire|formali[sz]e|document|develop|establish|prepare|obtain|create|build|conduct|appoint|register)\b/i;

const ASSERTION =
  /\b(?:has|have|had|is|are|was|were|secured|obtained|engaged|established|maintains?|holds?|already|currently|in\s+place)\b/i;

/** Multiword tokens like "term sheet" and "org chart" must match as phrases. */
const tokenRe = (token) =>
  new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i');

/**
 * Sentence boundaries, semicolons, and comma-joined coordination — plus the one
 * bare-conjunction case that matters: a negated report joined directly to its
 * recommendation ("has no funding plan and should draft one"). Splitting every
 * bare "and" would shred noun phrases ("counsel and compliance review") into
 * cue-less fragments and inflate the unclassified column for nothing.
 */
function splitClauses(text) {
  return String(text)
    .split(/(?<=[.!?])\s+|;\s*|,\s+(?=(?:and|but|while|whereas|although|though)\b)/i)
    .flatMap((part) =>
      part.split(
        /\s+(?:and|but)\s+(?=(?:it\s+|they\s+|the\s+\w+\s+)?(?:should|must|need|needs|consider|begin|start|prioriti[sz]e|plan\s+to|aim\s+to|ought)\b)/i,
      ),
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns null when the clause names no absent artifact at all.
 *
 * Order is load-bearing: negation, then recommendation, then assertion. A clause
 * holding both "has" and "not" is a correct report of an absence, and a clause
 * holding both "has" and "should" is advice. Testing assertion first would score
 * both as fabrications.
 */
function classifyClause(clause, tokens) {
  const text = String(clause);
  if (!tokens.some((t) => tokenRe(t).test(text))) return null;
  if (NEGATION.test(text)) return 'negated';
  if (RECOMMENDATION.test(text) || IMPERATIVE.test(text.trim())) return 'recommended';
  if (ASSERTION.test(text)) return 'asserted';
  return 'unclassified';
}

/**
 * One binary observation per (call, dimension): did this dimension's text assert
 * at least one absent artifact as present?
 *
 * Binary rather than a token count, because counting rewards verbosity and the
 * corpus arm writes longer RNAs.
 *
 * A dimension the model omitted is skipped rather than scored clean — same rule
 * as lib/metrics.js. Watch n.
 */
function scoreAssertedAbsences(rnaByDim, absences) {
  const observations = [];
  for (const [dimension, spec] of Object.entries(absences)) {
    const text = rnaByDim[dimension];
    if (typeof text !== 'string') continue;
    const clauses = [];
    for (const clause of splitClauses(text)) {
      const klass = classifyClause(clause, spec.absentTokens);
      if (klass) clauses.push({ text: clause, klass });
    }
    observations.push({
      dimension,
      mentioned: clauses.length > 0,
      asserted: clauses.some((c) => c.klass === 'asserted'),
      unclassified: clauses.some((c) => c.klass === 'unclassified'),
      clauses,
    });
  }
  return { observations };
}

module.exports = { splitClauses, classifyClause, scoreAssertedAbsences };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:measurement`
Expected: **127 passing** (117 + 10 new), 0 failing.

- [ ] **Step 5: Confirm the mutant-killing test actually kills the mutant**

This is not optional and not a formality. On 2026-08-05 a `>` → `>=` mutation passed all nine tests of the function it broke while inflating every arm's rate.

In `classifyClause`, temporarily move the `ASSERTION` check above the `NEGATION` check. Run `pnpm test:measurement`.

Expected: **`negation beats assertion when both cues are in one clause` FAILS.** If it passes, the test is worthless — fix the test before restoring the order.

Restore the original order and re-run. Expected: 127 passing.

- [ ] **Step 6: Commit**

```bash
git add measurement/lib/assertions.js measurement/tests/assertions.test.js
git commit -m "feat(measure): classify asserted vs recommended absent artifacts"
```

---

## Task 3: The `--level-condition` flag and the inflation override

**Files:**
- Modify: `measurement/measure-grounding.js` (flag constants ~line 107, `ALL_PROBES` block ~line 112, `validateArgs` ~line 154)
- Create: `measurement/tests/level-condition.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `ALL_LEVEL_CONDITIONS = ['truth', 'inflated']`
  - `INFLATED_OVERRIDE = { Organizational: 4, Regulatory: 4, Investment: 4 }`
  - `inflatedLevels(levels) -> object` — a **new** object, never a mutation
  - `selectLevelConditions(filter) -> { conditions: string[], errors: string[] }`
  - Both exported from `measure-grounding.js`.

- [ ] **Step 1: Write the failing tests**

Create `measurement/tests/level-condition.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  selectLevelConditions, inflatedLevels, INFLATED_OVERRIDE, STARTUPS, validateArgs,
} = require(path.resolve(__dirname, '../measure-grounding.js'));

test('no filter runs the truth condition only, preserving current behaviour', () => {
  assert.deepEqual(selectLevelConditions(null).conditions, ['truth']);
});

test('both runs the pair in a fixed order', () => {
  assert.deepEqual(selectLevelConditions('both').conditions, ['truth', 'inflated']);
});

test('a single condition can be selected', () => {
  assert.deepEqual(selectLevelConditions('inflated').conditions, ['inflated']);
});

// Silently running fewer conditions than asked for looks identical to a quota
// hit in the output — the same reason selectProbes hard-errors.
test('an unknown condition errors rather than defaulting', () => {
  const r = selectLevelConditions('inflatd');
  assert.deepEqual(r.conditions, []);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /inflatd/);
});

test('inflation raises exactly O, R and I to 4', () => {
  const out = inflatedLevels(STARTUPS['MediSync Cebu'].levels);
  assert.equal(out.Organizational, 4);
  assert.equal(out.Regulatory, 4);
  assert.equal(out.Investment, 4);
});

test('inflation leaves Technology, Market and Acceptance at truth', () => {
  const truth = STARTUPS['MediSync Cebu'].levels;
  const out = inflatedLevels(truth);
  assert.equal(out.Technology, truth.Technology);
  assert.equal(out.Market, truth.Market);
  assert.equal(out.Acceptance, truth.Acceptance);
});

// STARTUPS.levels is inside `common`, which every fingerprint hashes. A mutating
// implementation would change all 15 existing hashes the moment this runs and
// orphan every collected result file.
test('inflation never mutates STARTUPS', () => {
  const before = { ...STARTUPS['AgroLink PH'].levels };
  inflatedLevels(STARTUPS['AgroLink PH'].levels);
  assert.deepEqual(STARTUPS['AgroLink PH'].levels, before);
});

test('--level-condition is an accepted flag', () => {
  assert.deepEqual(validateArgs(['--level-condition=both'], []), []);
});

test('a misspelled flag is still rejected', () => {
  const errs = validateArgs(['--level-conditions=both'], []);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /Unrecognized flag/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:measurement`
Expected: FAIL — `selectLevelConditions is not a function`.

- [ ] **Step 3: Implement the flag**

In `measure-grounding.js`, add `'--level-condition='` to `KNOWN_VALUE_FLAG_PREFIXES` (~line 110):

```js
const KNOWN_VALUE_FLAG_PREFIXES = ['--out=', '--reps=', '--only-arm=', '--only-startup=', '--only-probe=', '--level-condition='];
```

Add `--level-condition=<truth|inflated|both>` to the `Unrecognized flag` message inside `validateArgs` (~line 169) so the error text stays complete.

Immediately after the `selectProbes` function, add:

```js
const ALL_LEVEL_CONDITIONS = ['truth', 'inflated'];

/**
 * Organizational, Regulatory and Investment are the three dimensions with
 * verified hard absences, and both startups sit at O2 R1 I1 — so one override
 * covers both and the manipulated cells pool.
 *
 * 4 is +2/+3/+3 from truth: enough to pull the ORL/RRL/IRL 4-5 rubric rows
 * (the ones demanding a non-founder hire, engaged counsel, and a written
 * funding plan), and still plausible as a real mentor's mis-set level. T/M/A
 * stay at truth so every call carries its own unmanipulated control.
 */
const INFLATED_OVERRIDE = { Organizational: 4, Regulatory: 4, Investment: 4 };

/** Returns a NEW object. STARTUPS.levels is inside `common` and is hashed into
 *  all 15 fingerprints — mutating it would orphan every collected result file. */
function inflatedLevels(levels) {
  return { ...levels, ...INFLATED_OVERRIDE };
}

/**
 * Exact names only, like selectProbes: two fixed values, so a prefix match buys
 * nothing and could silently select the wrong one. Defaults to `truth`, which
 * reproduces the harness's behaviour before this flag existed.
 */
function selectLevelConditions(filter) {
  if (filter == null) return { conditions: ['truth'], errors: [] };
  const raw = String(filter).trim().toLowerCase();
  if (raw === 'both') return { conditions: ALL_LEVEL_CONDITIONS.slice(), errors: [] };
  if (ALL_LEVEL_CONDITIONS.includes(raw)) return { conditions: [raw], errors: [] };
  return {
    conditions: [],
    errors: [
      `--level-condition=${filter} is not a condition. Available: ${ALL_LEVEL_CONDITIONS.join(', ')}, both.`,
    ],
  };
}
```

Add `ALL_LEVEL_CONDITIONS`, `INFLATED_OVERRIDE`, `inflatedLevels`, `selectLevelConditions` to `module.exports`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:measurement`
Expected: **136 passing** (127 + 9 new), 0 failing.

- [ ] **Step 5: Commit**

```bash
git add measurement/measure-grounding.js measurement/tests/level-condition.test.js
git commit -m "feat(measure): add --level-condition and the O/R/I inflation override"
```

---

## Task 4: Run the RNA probe per condition

**Files:**
- Modify: `measurement/measure-grounding.js` — `retrieveRubricsForArm` (~line 714), `runGenerationArms` (~lines 822-1003), the `--dry-run` block (~line 1335), the CLI wiring (~line 1352)
- Modify: `measurement/tests/level-condition.test.js` (append)

**Interfaces:**
- Consumes: `inflatedLevels`, `selectLevelConditions` from Task 3.
- Produces:
  - `buildRnaCell(ai, arm, startup, levels, corpusVecs, state) -> Promise<{ retrieved, rnaBlock }>`
  - `runGenerationArms` accepts `conditions` in its options object, defaulting to `['truth']`.
  - Results cells gain `assertionTruthCalls` and `assertionInflatedCalls`, both arrays of `{ byDim }`.

- [ ] **Step 1: Write the failing tests**

Append to `measurement/tests/level-condition.test.js`:

```js
const { runGenerationArms, ARMS } = require(path.resolve(__dirname, '../measure-grounding.js'));

const ONE_ARM = [ARMS.find((a) => a.name === 'baseline')];
const RNA_JSON = JSON.stringify([
  { readiness_level_type: 'Investment', rna: 'The venture has drafted a funding plan (IRL 3).' },
]);

function recorder() {
  const prompts = [];
  return {
    prompts,
    callFn: async (_ai, prompt) => {
      prompts.push(prompt);
      return { text: RNA_JSON };
    },
  };
}

const OPTS = {
  arms: ONE_ARM,
  startupNames: ['AgroLink PH'],
  probes: ['rna'],
  reps: 1,
  pacingMs: 0,
  report: false,
  retry: { attempts: 1, delayMs: 0, sleep: async () => {} },
};

// A call filtered after the fact still costs a call against a 20/day cap, so
// the assertion is that the request was never MADE.
test('truth-only suppresses the inflated call rather than discarding it', async () => {
  const r = recorder();
  await runGenerationArms(null, null, { ...OPTS, conditions: ['truth'], callFn: r.callFn });
  assert.equal(r.prompts.length, 1, 'exactly one model call');
  assert.match(r.prompts[0], /IRL 1/, 'the truth condition supplies AgroLink IRL 1');
});

test('both conditions issue exactly one call each, with different supplied levels', async () => {
  const r = recorder();
  await runGenerationArms(null, null, { ...OPTS, conditions: ['truth', 'inflated'], callFn: r.callFn });
  assert.equal(r.prompts.length, 2, 'one call per condition, never two per condition');
  assert.match(r.prompts[0], /IRL 1/);
  assert.match(r.prompts[1], /IRL 4/);
  assert.match(r.prompts[1], /ORL 4/);
  assert.match(r.prompts[1], /RRL 4/);
});

test('the inflated prompt leaves Technology at truth', async () => {
  const r = recorder();
  await runGenerationArms(null, null, { ...OPTS, conditions: ['inflated'], callFn: r.callFn });
  assert.match(r.prompts[0], /TRL 2/, 'AgroLink Technology is 2 and must not move');
});

test('each condition lands in its own storage field', async () => {
  const r = recorder();
  const results = await runGenerationArms(null, null, {
    ...OPTS, conditions: ['truth', 'inflated'], callFn: r.callFn,
  });
  const cell = results.baseline.startups['AgroLink PH'];
  assert.equal(cell.assertionTruthCalls.length, 1);
  assert.equal(cell.assertionInflatedCalls.length, 1);
  assert.equal(cell.rnaCalls.length, 1, 'only the truth condition feeds metrics 1-2');
});

// The levels probe's prompt contains no supplied levels at all, so running it
// once per condition would spend a second call for a byte-identical request.
test('the levels probe runs once regardless of how many conditions are selected', async () => {
  const r = recorder();
  await runGenerationArms(null, null, {
    ...OPTS, probes: ['levels'], conditions: ['truth', 'inflated'], callFn: r.callFn,
  });
  assert.equal(r.prompts.length, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:measurement`
Expected: FAIL — the inflated call is never made, so `prompts.length` is 1 where 2 is expected.

- [ ] **Step 3: Let retrieval take an explicit level map**

In `retrieveRubricsForArm`, add a trailing parameter and use it. This function is **not** hashed into any fingerprint, so editing it is safe.

```js
async function retrieveRubricsForArm(ai, arm, startup, corpusVecs, state, levels = startup.levels) {
```

Inside the `deterministic` branch, replace `const level = startup.levels[dim];` with:

```js
      const level = levels[dim];
```

This is the mechanism under test: supplying IRL 4 is what pulls the IRL 4/5 rows containing *"a written funding plan with a stated target raise"*. The wrong level and the dangerous text arrive together, exactly as a mentor's mis-set level does in production.

- [ ] **Step 4: Extract the shared cell builder**

Add immediately after `retrieveRubricsForArm`:

```js
/**
 * The one place an RNA cell's retrieval and rubric block are built.
 *
 * --dry-run and the live run built these independently before, and that is
 * precisely how the harness once shipped a --dry-run printing a prompt the run
 * would not send — defeating the only quota-free way to check a prompt.
 */
async function buildRnaCell(ai, arm, startup, levels, corpusVecs, state) {
  const retrieved = await retrieveRubricsForArm(ai, arm, startup, corpusVecs, state, levels);
  return { retrieved, rnaBlock: renderRubricBlock(retrieved) };
}
```

- [ ] **Step 5: Wire conditions into `runGenerationArms`**

Add `conditions = ['truth']` to the options destructuring alongside `probes`.

Update the per-cell budget line so the console estimate stays honest:

```js
    const callsPerCell = (withFabrication ? 1 : 0) + (probes.includes('levels') ? 1 : 0) + (probes.includes('rna') ? conditions.length : 0);
```

Replace the pre-loop body inside `for (const [startupName, startup] of selectedStartups)` (currently lines ~877-885). The existing local is named **`embedState`**, not `state`, and `retrieveRubricsForArm`'s result is currently held in a `retrieved` const that the levels ladder also reads — so build the conditions first and keep the truth-condition rows for both the ladder and the cell:

```js
      let truthRetrieved = [];
      for (const condition of conditions) {
        const levels = condition === 'inflated' ? inflatedLevels(startup.levels) : startup.levels;
        const built = await buildRnaCell(ai, arm, startup, levels, corpusVecs, embedState);
        rnaBlocks.set(`${arm.name}|${startupName}|${condition}`, { block: built.rnaBlock, levels });
        if (condition === 'truth') truthRetrieved = built.retrieved;
      }
      // The levels probe is unaffected by the manipulation — its prompt carries
      // no supplied levels at all — so its ladder keys off the truth retrieval.
      // When only `inflated` is selected, truthRetrieved stays [] and the ladder
      // is empty, which is correct: that run is not measuring the levels probe.
      const ladder = arm.ragCorpus && truthRetrieved.length ? fullLadderRubrics() : [];
      levelBlocks.set(`${arm.name}|${startupName}`, renderLevelsBlockFor(arm, ladder));
      results[arm.name].startups[startupName] = {
        retrieved: truthRetrieved,
        rnaCalls: [], levelCalls: [], hallucCalls: [],
        assertionTruthCalls: [], assertionInflatedCalls: [],
      };
```

`results[...].retrieved` stays the **truth**-condition rows: `mergeRuns` copies that field and every historical file carries the same shape.

Inside the rep loop, replace the single RNA block with a loop over conditions. Everything else — the 429 `break repLoop`, the non-429 `console.error`, the `pacingMs` sleep — is unchanged and must stay:

```js
        // --- RNA generation (metrics 1-2 on truth; metric 5 on both) ---
        if (probes.includes('rna')) for (const condition of conditions) {
          const entry = rnaBlocks.get(`${arm.name}|${startupName}|${condition}`);
          try {
            const out = await attempt(callFn, ai, rnaPrompt(startup.doc, entry.block, entry.levels), retry, `${arm.name} / ${startupName} / rep ${rep} / rna(${condition})`);
            const payload = extractJsonPayload(out.text);
            const parsed = payload ? JSON.parse(payload) : null;
            if (Array.isArray(parsed)) {
              const byDim = {};
              for (const x of parsed) {
                if (typeof x.rna === 'string' && typeof x.readiness_level_type === 'string') {
                  byDim[x.readiness_level_type] = x.rna;
                }
              }
              // One call, two records: metrics 1-2 read rnaCalls, metric 5 reads
              // its own per-condition field. Separate fields keep mergeRuns'
              // 1:1 metric->field invariant, which double-pushes if two metric
              // keys share a field and silently doubles n.
              if (condition === 'truth') {
                cell.rnaCalls.push({ byDim });
                cell.assertionTruthCalls.push({ byDim });
              } else {
                cell.assertionInflatedCalls.push({ byDim });
              }
            }
          } catch (e) {
            if (is429(e)) {
              console.log(`  [quota hit: ${arm.name} / ${startupName} / rep ${rep} / rna(${condition})]`);
              quotaHit = true;
              results[arm.name].quotaHit = true;
              break repLoop;
            } else {
              console.error(`  [error: ${arm.name} / ${startupName} / rep ${rep} / rna(${condition})]`, e.message);
            }
          }
          if (pacingMs) await sleep(pacingMs);
        }
```

The levels and hallucination blocks stay exactly where they are, outside the condition loop.

- [ ] **Step 6: Wire the CLI and `--dry-run`**

At the CLI, resolve the flag and merge its errors with the existing selection errors so a bad value exits 1 before any call:

```js
    const conditionSelection = selectLevelConditions(flagValue('level-condition'));
```

In the `--dry-run` block, replace the inline retrieval/render with the shared helper, printing one RNA prompt per condition:

```js
          for (const condition of conditionSelection.conditions) {
            const levels = condition === 'inflated' ? inflatedLevels(startup.levels) : startup.levels;
            const built = await buildRnaCell(ai, arm, startup, levels, corpusVecs, embedState);
            console.log(`\n----- RNA PROMPT (${condition}) -----\n${rnaPrompt(startup.doc, built.rnaBlock, levels)}`);
          }
```

Pass the conditions into the live run:

```js
    const results = await runGenerationArms(ai, corpusVecs, {
      arms: selection.arms,
      startupNames: selection.startups,
      probes: probeSelection.probes,
      conditions: conditionSelection.conditions,
    });
```

Export `buildRnaCell`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test:measurement`
Expected: **141 passing** (136 + 5 new), 0 failing. Existing `generation-wiring.test.js` tests must still pass — they call `runGenerationArms` without `conditions`, which defaults to `['truth']`.

- [ ] **Step 8: Commit**

```bash
git add measurement/measure-grounding.js measurement/tests/level-condition.test.js
git commit -m "feat(measure): run the RNA probe once per level condition"
```

---

## Task 5: Fingerprints and merge

**Files:**
- Modify: `measurement/lib/fingerprint.js`
- Modify: `measurement/measure-grounding.js` — `currentFingerprints` (~line 1136), `mergeRuns`'s `FIELD` map (~line 1221) and its `dst` initialiser (~line 1251)
- Modify: `measurement/tests/fingerprint.test.js`

**Interfaces:**
- Consumes: `scoreAssertedAbsences` source text (Task 2), `INFLATED_OVERRIDE` (Task 3), the storage fields (Task 4).
- Produces: fingerprint keys `assertion|<arm>` and `assertion-inflated|<arm>`.

- [ ] **Step 1: Write the failing test that pins the existing hashes**

First capture the current values — they are the ground truth for "unchanged":

Run: `node -e "const m=require('./measurement/measure-grounding.js');console.log(JSON.stringify(m.currentFingerprints(),null,2))"`

Copy the 15 printed values into a new test in `measurement/tests/fingerprint.test.js`. Paste the **actual** output; the hashes below are placeholders you must replace:

```js
// Pinned literally. New probes may ADD keys; they may never change an existing
// one. A changed hash here means already-collected runs in measurement/results/
// have been orphaned — which is sometimes correct (the 2026-08-05 level
// correction did it deliberately) but must never happen as a side effect.
test('adding the assertion probe leaves all 15 existing fingerprints byte-identical', () => {
  const fps = require(path.resolve(__dirname, '../measure-grounding.js')).currentFingerprints();
  const EXPECTED = {
    'levels|baseline': 'PASTE_ACTUAL',
    // ... all 15 ...
  };
  for (const [key, value] of Object.entries(EXPECTED)) {
    assert.equal(fps[key], value, `${key} changed — collected data would stop pooling`);
  }
});

test('the assertion probe adds two keys per arm', () => {
  const fps = require(path.resolve(__dirname, '../measure-grounding.js')).currentFingerprints();
  assert.ok(fps['assertion|baseline'], 'truth-condition key missing');
  assert.ok(fps['assertion-inflated|baseline'], 'inflated-condition key missing');
  assert.notEqual(
    fps['assertion|baseline'], fps['assertion-inflated|baseline'],
    'the two conditions must never pool with each other',
  );
});
```

- [ ] **Step 2: Run to verify the second test fails and the first passes**

Run: `pnpm test:measurement`
Expected: the 15-hash test **PASSES** (nothing has changed yet) and the two-keys test **FAILS** on `truth-condition key missing`.

If the 15-hash test fails at this point, a previous task changed hashed material. Stop and find it before continuing.

- [ ] **Step 3: Add the key families**

In `lib/fingerprint.js`, extend the JSDoc `@param` list with `spec.absences` and `spec.inflatedLevels`, destructure `absences` and `inflatedLevels` alongside `rubrics`, and add inside the arm loop after the `fabrication` line:

```js
    // Additive only. JSON.stringify drops undefined, and a new KEY cannot
    // change an existing one's material — so every hash above is untouched.
    if (sources.assertion) {
      const assertionMaterial = {
        src: sources.rna,
        readinessLevelBlockSrc: sources.readinessLevelBlock,
        renderRubricBlockSrc: sources.renderRubricBlock,
        common,
        scope: rnaScope,
        rubricMode: arm.rubricMode,
        corpusHash: corpusHashForArm,
        // Scoring is part of comparability here: re-scoring old text with an
        // edited classifier or an edited token list is a different measurement.
        classifierSrc: sources.assertion,
        absences,
      };
      out[`assertion|${arm.name}`] = hash(assertionMaterial);
      out[`assertion-inflated|${arm.name}`] = hash({ ...assertionMaterial, inflatedLevels });
    }
```

- [ ] **Step 4: Supply the new material from `currentFingerprints`**

Add the require near the other lib requires in `measure-grounding.js`:

```js
const { scoreAssertedAbsences } = require(path.join(__dirname, 'lib/assertions.js'));
const { HARD_ABSENCES } = require(path.join(__dirname, 'lib/hard-absences.js'));
```

In `currentFingerprints`, add to `sources`:

```js
      assertion: scoreAssertedAbsences.toString(),
```

and add two top-level spec keys:

```js
    absences: HARD_ABSENCES,
    inflatedLevels: INFLATED_OVERRIDE,
```

- [ ] **Step 5: Teach `mergeRuns` the new fields**

Extend the `FIELD` map:

```js
  const FIELD = {
    levels: 'levelCalls',
    rna: 'rnaCalls',
    fabrication: 'hallucCalls',
    assertion: 'assertionTruthCalls',
    'assertion-inflated': 'assertionInflatedCalls',
  };
```

Add both arrays to the `dst` initialiser so a merged cell has the same shape as a live one:

```js
              rnaCalls: [], levelCalls: [], hallucCalls: [],
              assertionTruthCalls: [], assertionInflatedCalls: [],
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test:measurement`
Expected: **143 passing**, 0 failing. If a pre-existing test asserts an exact fingerprint *key set*, update that expectation to include the new keys — but **never** change an expected hash value.

- [ ] **Step 7: Verify merge tolerates the historical files**

Run: `node measurement/measure-grounding.js --merge measurement/results/*.json`

Expected: it completes without throwing. Historical files carry no `assertion*` keys, so `mineundefined` triggers a refusal line per file per new key. That is correct — a file with no fingerprint for a key must never pool — and it is noise, not an error. Confirm the pre-existing `levels|*` and `rna|*` pooling behaviour is unchanged from before this task.

- [ ] **Step 8: Commit**

```bash
git add measurement/lib/fingerprint.js measurement/measure-grounding.js measurement/tests/fingerprint.test.js
git commit -m "feat(measure): fingerprint the assertion probe's two conditions"
```

---

## Task 6: Metric 5 reporting and documentation

**Files:**
- Modify: `measurement/measure-grounding.js` — `summarizeResults` (~line 1011), `printReports` (~line 1098)
- Modify: `measurement/README.md`
- Modify: `measurement/tests/reporting.test.js`

**Interfaces:**
- Consumes: `scoreAssertedAbsences` (Task 2), the storage fields (Task 4).
- Produces: `summarizeResults(results).metric5` — one row per (arm, condition).

- [ ] **Step 1: Write the failing test**

Append to `measurement/tests/reporting.test.js`:

```js
test('metric 5 reports asserted, mentioned and unclassified per condition', () => {
  const results = {
    baseline: {
      startups: {
        'AgroLink PH': {
          retrieved: [], rnaCalls: [], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [{ byDim: { Investment: 'No funding plan exists yet.' } }],
          assertionInflatedCalls: [{ byDim: { Investment: 'The venture has drafted a funding plan.' } }],
        },
      },
    },
  };
  const s = summarizeResults(results);
  const truth = s.metric5.find((r) => r.arm === 'baseline' && r.condition === 'truth');
  const inflated = s.metric5.find((r) => r.arm === 'baseline' && r.condition === 'inflated');
  assert.equal(truth.asserted, '0/1');
  assert.equal(inflated.asserted, '1/1');
});

// An arm a 429 never reached must produce a row that says n/a, not one that
// says 0% — an absent row and a zero row mean different things.
test('metric 5 gives every arm a row even with no calls', () => {
  const s = summarizeResults({});
  assert.equal(s.metric5.length, ARMS.length * 2, 'one row per arm per condition');
  assert.equal(s.metric5[0]['asserted %'], 'n/a');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:measurement`
Expected: FAIL — `Cannot read properties of undefined (reading 'find')`, because `metric5` does not exist.

- [ ] **Step 3: Implement the metric**

In `summarizeResults`, declare `const metric5 = [];` beside the others, add this inside the `for (const arm of ARMS)` loop after metric 4, and return `metric5` in the object:

```js
    // --- Metric 5: supplied-level fabrication (asserted absent evidence) ---
    //
    // Reference-free: HARD_ABSENCES names artifact classes neither document
    // mentions, asserted at run time by verifyAbsences rather than trusted. One
    // binary observation per (call, dimension) — counting tokens would reward
    // verbosity, and the corpus arm writes longer RNAs.
    for (const condition of ALL_LEVEL_CONDITIONS) {
      const field = condition === 'truth' ? 'assertionTruthCalls' : 'assertionInflatedCalls';
      let asserted = 0, mentioned = 0, unclassified = 0, obs = 0;
      for (const [, cell] of Object.entries(armResult.startups)) {
        for (const c of cell[field] || []) {
          for (const o of scoreAssertedAbsences(c.byDim, HARD_ABSENCES).observations) {
            obs++;
            if (o.asserted) asserted++;
            if (o.mentioned) mentioned++;
            if (o.unclassified) unclassified++;
          }
        }
      }
      metric5.push({
        arm: arm.name,
        condition,
        asserted: `${asserted}/${obs}`,
        'asserted %': obs ? `${((asserted / obs) * 100).toFixed(0)}%` : 'n/a',
        mentioned: `${mentioned}/${obs}`,
        unclassified,
      });
    }
```

In `printReports`, add after the metric 3 table:

```js
  console.log('\n--- Metric 5: supplied-level fabrication (asserted absent evidence) ---');
  console.log('(share of dimensions whose RNA asserts an artifact class neither document mentions;');
  console.log(' `asserted` is a lower bound and `mentioned` an upper one. A large `unclassified`');
  console.log(' means the classifier cannot read this output and the rate should not be quoted.)\n');
  console.table(s.metric5);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test:measurement`
Expected: **145 passing**, 0 failing.

- [ ] **Step 5: Dump the flagged clauses into the results file**

In `writeResults`, add the audit trail beside `results` so the classifier is checkable after the fact rather than trusted:

```js
    flaggedClauses: (() => {
      const out = [];
      for (const [armName, armResult] of Object.entries(results)) {
        for (const [startupName, cell] of Object.entries(armResult.startups || {})) {
          for (const condition of ALL_LEVEL_CONDITIONS) {
            const field = condition === 'truth' ? 'assertionTruthCalls' : 'assertionInflatedCalls';
            (cell[field] || []).forEach((c, rep) => {
              for (const o of scoreAssertedAbsences(c.byDim, HARD_ABSENCES).observations) {
                for (const cl of o.clauses) {
                  out.push({ arm: armName, startup: startupName, condition, rep, dimension: o.dimension, klass: cl.klass, text: cl.text });
                }
              }
            });
          }
        }
      }
      return out;
    })(),
```

- [ ] **Step 6: Document it**

In `measurement/README.md` add a `--level-condition` entry to the flag list and a metric 5 section stating, in the README's existing plain style:

- What it measures: whether a wrong *supplied* level turns rubric text into asserted evidence, on production's RNA path.
- Why it needs a manipulation: the 2026-08-05 level correction removed the trigger without touching the vulnerability, so an observational run measures 0 and proves nothing.
- The exact run command from the spec, **including `--only-arm`** — without it the run is 40 calls against a 20-call cap.
- The limitation verbatim from the spec: token-based detection misses paraphrase, so `asserted` is a floor, not a census, and the probe **cannot prove the absence of fabrication**.
- The pre-registered interpretation table from the spec.

- [ ] **Step 7: Run the full verification**

```bash
pnpm test:measurement
pnpm test
pnpm build
```

Expected: measurement **145 passing**; jest **216 passing / 1 failing** (the documented pre-existing `AiService` case only); build clean.

- [ ] **Step 8: Commit**

```bash
git add measurement/measure-grounding.js measurement/tests/reporting.test.js measurement/README.md
git commit -m "feat(measure): report metric 5 and dump every flagged clause"
```

---

## Task 7: Quota-free pre-flight

**No code changes.** This task exists because the experiment can be void in a way no unit test detects, and finding that out costs a full day's quota.

**Files:** none modified. Record the findings in the task report.

- [ ] **Step 1: Confirm the inflated condition changes what is retrieved**

Run: `node measurement/measure-grounding.js --only-arm=deviation-deterministic --only-startup=MediSync --level-condition=both --dry-run`

Read the two printed RNA prompts and confirm:

1. The **truth** prompt contains `IRL 1` and its rubric section contains the IRL 1 and IRL 2 rows.
2. The **inflated** prompt contains `IRL 4`, `ORL 4`, `RRL 4`, and its rubric section contains the IRL 4/5, ORL 4/5, RRL 4/5 rows — including the text about a written funding plan, engaged counsel, and a first non-founder hire.
3. Both prompts contain `TRL 6` — Technology must not have moved.

**If the retrieved rows are identical between conditions, stop.** The manipulation is not reaching retrieval, the experiment would measure nothing, and no number of reps fixes it.

- [ ] **Step 2: Confirm the baseline arm is unaffected by the corpus**

Run: `node measurement/measure-grounding.js --only-arm=baseline --only-startup=MediSync --level-condition=both --dry-run`

Expected: neither prompt contains a `--- Verified Readiness Rubrics (authoritative) ---` section, and they differ **only** in the `Initial Readiness Level` block. That difference is the whole baseline contrast: a bare wrong number with no rubric text attached.

- [ ] **Step 3: Confirm no quota was spent**

Both commands must end with `--dry-run: no generation quota spent.`

- [ ] **Step 4: Sanity-check the classifier against a real prompt's vocabulary**

Run: `node -e "const {classifyClause}=require('./measurement/lib/assertions.js');const {HARD_ABSENCES}=require('./measurement/lib/hard-absences.js');for(const s of ['The venture has drafted a funding plan (IRL 3)','Engage external counsel to obtain a preliminary opinion','No investor conversations have taken place','A first non-founder contributor is now under contract'])console.log(JSON.stringify(s),'->',classifyClause(s,HARD_ABSENCES.Investment.absentTokens)||classifyClause(s,HARD_ABSENCES.Regulatory.absentTokens)||classifyClause(s,HARD_ABSENCES.Organizational.absentTokens));"`

Expected: `asserted`, `recommended`, `negated`, `asserted`.

- [ ] **Step 5: Report and stop**

Write the findings into the task report and **stop before the live run.** The live run spends 16 of the day's 20 calls and needs John's go-ahead plus a window that opens at ~15:00 Philippine time. A run started before then draws on the previous window, which was spent 18/20 on 2026-08-05.

The command, for when it is authorised:

```bash
node measurement/measure-grounding.js --only-arm=baseline,deviation-deterministic --only-probe=rna --level-condition=both --reps=2 --out=measurement/results/2026-08-06-supplied-level.json
```

---

## Self-Review

**Spec coverage:** every spec section maps to a task — shared constants → 1; scorer, pipeline, reported numbers → 2; manipulation and flag → 3; run shape and retrieval mechanism → 4; fingerprints, storage fields, historical files → 5; interpretation table and limitation → 6 (README); pre-flight and run plan → 7. The spec's "out of scope" items (`OutputValidatorService`, Objective 4b, more levels reps) have no task, correctly.

**Placeholders:** one deliberate `PASTE_ACTUAL` in Task 5 Step 1, which Step 1 itself generates via the `node -e` command — the values cannot be known before the code is read, and pinning invented hashes would be worse than pinning none.

**Type consistency:** `scoreAssertedAbsences(rnaByDim, absences)` is called with `(c.byDim, HARD_ABSENCES)` in Tasks 5 and 6 and with `(rnaByDim, { Investment: ... })` in Task 2's tests — both are `{ [dimension]: { absentTokens } }`, consistent. `assertionTruthCalls` / `assertionInflatedCalls` are spelled identically in Tasks 4, 5 and 6. `INFLATED_OVERRIDE` (the constant) and `inflatedLevels` (the function) are used per their Task 3 definitions throughout.
