# RNA Redundancy Probe (Metric 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add metric 6 — the redundant-need rate — plus a `deflated` level condition that acts as its positive control, so RNA generation quality can be measured on the path production actually ships.

**Architecture:** Metric 6 is metric 5's mirror on machinery that already exists. `lib/assertions.js` segments an RNA into clauses and bins each one; `classifyClause(clause, tokens, scope)` is generic over its token list. Metric 5 reads the `asserted` bin against *absent* tokens; metric 6 reads the `recommended` bin against *satisfied* tokens. No fork of the classifier, no change to its cues.

**Tech Stack:** Node CommonJS, `node --test`, no new dependencies. Run tests with `pnpm test:measurement` from `backend/`.

**Spec:** `docs/superpowers/specs/2026-08-23-rna-redundancy-probe-design.md`

## Global Constraints

- **No new dependencies.** The measurement harness is plain Node CommonJS.
- **`lib/assertions.js` cues and `CLASSIFIER_SOURCE` stay byte-identical.** Editing them changes every stored metric-5 fingerprint and stops all historical pooling. Task 8 pins this with a test.
- **Fingerprint changes are additive only.** `JSON.stringify` drops `undefined`, and a new *key* cannot change an existing key's material. Never edit an existing hash's inputs.
- **No Gemini call until Task 8's gate passes.** Free tier is 20 generation calls/day, window resets 15:00 Philippine time.
- **Never run `pnpm build` while `pnpm dev` is watching** — both write `dist/`. `pnpm test` and `pnpm test:measurement` are safe.
- **Every mutation must be asserted to have landed.** A mutation that silently fails to apply reports a green suite indistinguishable from a decorative guard. Assert the anchor matched (`assert s.count(old) == 1`) *and* that behaviour changed.
- Commit after every task. No pushing — this branch stays local.

---

## Two landmines this plan defuses first

Both are in `measure-grounding.js` today and both corrupt data **silently** if `deflated` is added before they are fixed:

1. **`levelsForCondition` (line 170)** is `condition === 'inflated' ? inflatedLevels(...) : startup.levels`. A `deflated` condition falls to the `else` and receives **truth levels** — the run would send unmanipulated prompts while labelling them `deflated`.
2. **`conditionField` (line 175)** and the generation loop's `else` branch (line 1002) both funnel any non-`truth` condition into `assertionInflatedCalls` — **deflated calls would contaminate metric 5's inflated pool**, exactly the double-push hazard the surrounding comment warns about.

Task 1 exists solely to make both exhaustive before anything new is added.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/measurement/lib/satisfactions.js` | **new** — per-(startup, dimension) artifact classes each document evidences, plus a run-time verifier |
| `backend/measurement/lib/redundancy.js` | **new** — scores RNA text for redundant needs and denied satisfactions |
| `backend/measurement/measure-grounding.js` | condition maps, `deflated`, storage, scoring, reporting, `rnaTexts` |
| `backend/measurement/lib/fingerprint.js` | additive `redundancy\|*` keys |
| `backend/measurement/tests/satisfactions.test.js` | **new** — verifier, disjointness |
| `backend/measurement/tests/redundancy.test.js` | **new** — the non-vacuity fixtures |
| `backend/measurement/tests/level-condition.test.js` | extended for `deflated`, `both`, `all`, comma lists |
| `backend/measurement/README.md` | pre-registration, run command |

---

### Task 1: Make the condition maps exhaustive

Nothing new is added here. This task only converts two binary ternaries into total maps that throw on an unknown condition, so Task 2 cannot introduce a silent mislabel.

**Files:**
- Modify: `backend/measurement/measure-grounding.js:169-177` (the two helpers), `:1000-1005` (the push), `:1578` (exports)
- Test: `backend/measurement/tests/level-condition.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `levelsForCondition(startup, condition)` throws on unknown; `conditionField(condition)` throws on unknown. Both exported.

- [ ] **Step 1: Write the failing test**

Append to `backend/measurement/tests/level-condition.test.js`:

```js
const { levelsForCondition, conditionField } = require(path.resolve(__dirname, '../measure-grounding.js'));

test('levelsForCondition rejects an unknown condition instead of silently returning truth', () => {
  const startup = { levels: { Technology: 6, Market: 5, Acceptance: 5, Organizational: 2, Regulatory: 1, Investment: 1 } };
  assert.throws(() => levelsForCondition(startup, 'nonsense'), /unknown condition/i);
});

test('conditionField rejects an unknown condition instead of silently returning the inflated pool', () => {
  assert.throws(() => conditionField('nonsense'), /unknown condition/i);
});

test('the known conditions still map exactly as before', () => {
  const startup = { levels: { Technology: 6, Market: 5, Acceptance: 5, Organizational: 2, Regulatory: 1, Investment: 1 } };
  assert.deepEqual(levelsForCondition(startup, 'truth'), startup.levels);
  assert.equal(levelsForCondition(startup, 'inflated').Organizational, 3);
  assert.equal(levelsForCondition(startup, 'inflated').Technology, 6);
  assert.equal(conditionField('truth'), 'assertionTruthCalls');
  assert.equal(conditionField('inflated'), 'assertionInflatedCalls');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && pnpm test:measurement`
Expected: FAIL — `levelsForCondition is not a function` (the helpers are not exported yet).

- [ ] **Step 3: Implement**

Replace `backend/measurement/measure-grounding.js:169-177`:

```js
/** The one place a condition maps to supplied levels — live run and --dry-run.
 *  A total map, not a ternary: an unknown condition used to fall through to
 *  truth levels, which would have sent an unmanipulated prompt under a
 *  manipulated label. */
const CONDITION_LEVELS = {
  truth: (startup) => startup.levels,
  inflated: (startup) => inflatedLevels(startup.levels),
};

function levelsForCondition(startup, condition) {
  const build = CONDITION_LEVELS[condition];
  if (!build) throw new Error(`levelsForCondition: unknown condition "${condition}"`);
  return build(startup);
}

/** The one place a condition maps to its storage field — scoring and audit trail.
 *  Total for the same reason: the old `else` sent every non-truth condition into
 *  the inflated pool, which would have silently mixed two manipulations. */
const CONDITION_FIELD = {
  truth: 'assertionTruthCalls',
  inflated: 'assertionInflatedCalls',
};

function conditionField(condition) {
  const field = CONDITION_FIELD[condition];
  if (!field) throw new Error(`conditionField: unknown condition "${condition}"`);
  return field;
}
```

Replace the push at `backend/measurement/measure-grounding.js:1000-1005`:

```js
              // rnaCalls is the truth-only pool metrics 1-2 read. The
              // per-condition pool is chosen by the total map so a new condition
              // cannot land in another condition's field.
              if (condition === 'truth') cell.rnaCalls.push({ byDim });
              cell[conditionField(condition)].push({ byDim });
```

Add `levelsForCondition,` and `conditionField,` to the export block at `:1578`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS, and the pre-existing count rises by 3.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/measure-grounding.js backend/measurement/tests/level-condition.test.js
git commit -m "refactor: make the condition maps total before adding a third condition"
```

---

### Task 2: Add the `deflated` condition and comma-list parsing

**Files:**
- Modify: `backend/measurement/measure-grounding.js` (overrides, `ALL_LEVEL_CONDITIONS`, `selectLevelConditions`, both cell-init sites at `:970` and `:1430`, exports)
- Test: `backend/measurement/tests/level-condition.test.js`

**Interfaces:**
- Consumes: `levelsForCondition`, `conditionField` from Task 1.
- Produces: `DEFLATED_OVERRIDE`, `deflatedLevels(levels)`, `ALL_LEVEL_CONDITIONS = ['truth','inflated','deflated']`, `selectLevelConditions(filter) -> {conditions, errors}` accepting comma lists plus the `both` and `all` aliases. Storage field `assertionDeflatedCalls`.

- [ ] **Step 1: Write the failing test**

Append to `backend/measurement/tests/level-condition.test.js`:

```js
const { deflatedLevels, DEFLATED_OVERRIDE, selectLevelConditions } =
  require(path.resolve(__dirname, '../measure-grounding.js'));

const LEVELS = { Technology: 6, Market: 5, Acceptance: 5, Organizational: 2, Regulatory: 1, Investment: 1 };

test('deflated pushes T/M/A to 1 and leaves O/R/I at truth as the within-call control', () => {
  const out = deflatedLevels(LEVELS);
  assert.deepEqual(
    { Technology: out.Technology, Market: out.Market, Acceptance: out.Acceptance },
    { Technology: 1, Market: 1, Acceptance: 1 },
  );
  assert.deepEqual(
    { Organizational: out.Organizational, Regulatory: out.Regulatory, Investment: out.Investment },
    { Organizational: 2, Regulatory: 1, Investment: 1 },
  );
});

test('deflatedLevels returns a new object — STARTUPS.levels is hashed into every fingerprint', () => {
  const before = { ...LEVELS };
  deflatedLevels(LEVELS);
  assert.deepEqual(LEVELS, before);
});

test('deflated is disjoint from inflated, so no dimension is manipulated in both', () => {
  const overlap = Object.keys(DEFLATED_OVERRIDE).filter((k) => k in INFLATED_OVERRIDE);
  assert.deepEqual(overlap, []);
});

test('both keeps its pre-2026-08-23 meaning and is NOT widened', () => {
  assert.deepEqual(selectLevelConditions('both').conditions, ['truth', 'inflated']);
});

test('all selects three', () => {
  assert.deepEqual(selectLevelConditions('all').conditions, ['truth', 'inflated', 'deflated']);
});

test('a comma list selects exactly what it names, in canonical order', () => {
  assert.deepEqual(selectLevelConditions('deflated,truth').conditions, ['truth', 'deflated']);
});

test('an unrecognised entry hard-errors rather than being dropped', () => {
  const { conditions, errors } = selectLevelConditions('truth,inflted');
  assert.deepEqual(conditions, []);
  assert.match(errors[0], /"inflted"/);
});

test('no filter still defaults to truth alone', () => {
  assert.deepEqual(selectLevelConditions(null).conditions, ['truth']);
});
```

`INFLATED_OVERRIDE` is already imported in this file; if not, add it to the existing require.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && pnpm test:measurement`
Expected: FAIL — `deflatedLevels is not a function`, and `both` returns three entries once `ALL_LEVEL_CONDITIONS` grows.

- [ ] **Step 3: Implement**

Beside `INFLATED_OVERRIDE` in `backend/measurement/measure-grounding.js`:

```js
/**
 * The mirror of INFLATED_OVERRIDE, and the split is forced by the data rather
 * than chosen. Both startups sit at O2 R1 I1, which has no deflation room;
 * MediSync's T6 M5 A5 has plenty and its document evidences the level-1/2
 * criteria plainly. O/R/I stay at truth so every call carries its own
 * unmanipulated control, exactly as T/M/A do under `inflated`.
 */
const DEFLATED_OVERRIDE = { Technology: 1, Market: 1, Acceptance: 1 };

/** Returns a NEW object, for the reason inflatedLevels does. */
function deflatedLevels(levels) {
  return { ...levels, ...DEFLATED_OVERRIDE };
}
```

Extend the maps and the condition list:

```js
const ALL_LEVEL_CONDITIONS = ['truth', 'inflated', 'deflated'];

// `both` is FROZEN at its pre-2026-08-23 meaning. Widening it would silently
// change what an already-recorded command produces — the --merge failure mode
// in a different costume. `all` is the new name for everything.
const CONDITION_ALIASES = {
  both: ['truth', 'inflated'],
  all: ['truth', 'inflated', 'deflated'],
};
```

Add to `CONDITION_LEVELS`: `deflated: (startup) => deflatedLevels(startup.levels),`
Add to `CONDITION_FIELD`: `deflated: 'assertionDeflatedCalls',`

Replace `selectLevelConditions`:

```js
/**
 * Exact names, comma lists, or an alias. Prefix matching is still refused — it
 * buys nothing over three fixed values and could silently select the wrong one.
 * An unrecognised entry hard-errors before any network call, like selectProbes:
 * silently running fewer conditions than asked for looks identical to a clean run.
 */
function selectLevelConditions(filter) {
  if (filter == null) return { conditions: ['truth'], errors: [] };
  const raw = String(filter).trim().toLowerCase();
  const available = `Available: ${ALL_LEVEL_CONDITIONS.join(', ')}, both, all.`;
  if (CONDITION_ALIASES[raw]) return { conditions: CONDITION_ALIASES[raw].slice(), errors: [] };

  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) {
    return { conditions: [], errors: [`--level-condition=${filter} named no condition. ${available}`] };
  }
  const unknown = entries.filter((e) => !ALL_LEVEL_CONDITIONS.includes(e));
  if (unknown.length) {
    return {
      conditions: [],
      errors: [
        `--level-condition=${filter} is not a condition: ${unknown.map((u) => `"${u}"`).join(', ')}. ${available}`,
      ],
    };
  }
  // Canonical order, not argument order, so two spellings of the same request
  // produce the same run shape.
  return { conditions: ALL_LEVEL_CONDITIONS.filter((c) => entries.includes(c)), errors: [] };
}
```

Add `assertionDeflatedCalls: []` to **both** cell-init sites — `:970` and `:1430` — beside the existing assertion arrays.

Update the usage string at `:222` to `--level-condition=<truth|inflated|deflated|both|all|comma-list>`.

Add `DEFLATED_OVERRIDE,` and `deflatedLevels,` to the export block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/measure-grounding.js backend/measurement/tests/level-condition.test.js
git commit -m "feat: add the deflated level condition and comma-list condition selection"
```

---

### Task 3: `lib/satisfactions.js`

**Files:**
- Create: `backend/measurement/lib/satisfactions.js`
- Test: `backend/measurement/tests/satisfactions.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `SATISFACTIONS` — `{ [startupName]: { [dimension]: { evidence: string, satisfiedTokens: string[] } } }` — and `verifySatisfactions(docs)` which throws unless every `evidence` string appears verbatim in its document.

**The trap this structure exists to avoid.** `HARD_ABSENCES` is keyed by dimension alone because absence generalises across both documents. Satisfaction does **not** — MediSync has revenue and AgroLink's document says `Revenue: None to date.` A verifier that asserted the *token* were present would mark AgroLink's revenue as satisfied on the strength of that very sentence. So the verifier asserts a hand-picked **evidence phrase**, verbatim, and the tokens are only ever matched against *generated* text.

- [ ] **Step 1: Write the failing test**

Create `backend/measurement/tests/satisfactions.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { SATISFACTIONS, verifySatisfactions } = require(path.resolve(__dirname, '../lib/satisfactions.js'));
const { STARTUPS } = require(path.resolve(__dirname, '../measure-grounding.js'));

const DOCS = Object.fromEntries(Object.entries(STARTUPS).map(([name, s]) => [name, s.doc]));

test('every evidence phrase appears verbatim in its own document', () => {
  assert.equal(verifySatisfactions(DOCS), true);
});

test('verifySatisfactions throws when an evidence phrase is not in the document', () => {
  assert.throws(
    () => verifySatisfactions({ ...DOCS, 'AgroLink PH': 'Title: AgroLink PH\nRevenue: None to date.' }),
    /SATISFACTIONS is wrong/,
  );
});

test('it is keyed per startup, because satisfaction does not generalise across documents', () => {
  assert.deepEqual(Object.keys(SATISFACTIONS).sort(), ['AgroLink PH', 'MediSync Cebu']);
});

test('only the deflated dimensions are specified — O/R/I have no deflation room', () => {
  for (const dims of Object.values(SATISFACTIONS)) {
    assert.deepEqual(Object.keys(dims).sort(), ['Acceptance', 'Market', 'Technology']);
  }
});

test('no satisfied token collides with a corpus keyTerm', async () => {
  // Mirrors tests/stage-markers.test.js:17-24. A collision would penalise the
  // corpus arm for echoing its own prompt, confounding pre-registered
  // prediction 2 in the corpus arm's disfavour.
  const { RUBRICS } = require(path.resolve(__dirname, '../measure-grounding.js'));
  const keyTerms = new Set();
  for (const r of RUBRICS) for (const kt of r.keyTerms ?? []) keyTerms.add(String(kt).toLowerCase());

  const clashes = [];
  for (const [startup, dims] of Object.entries(SATISFACTIONS)) {
    for (const [dim, spec] of Object.entries(dims)) {
      for (const t of spec.satisfiedTokens) {
        if (keyTerms.has(t.toLowerCase())) clashes.push(`${startup}/${dim}: "${t}"`);
      }
    }
  }
  assert.deepEqual(clashes, [], `satisfied tokens collide with corpus keyTerms:\n${clashes.join('\n')}`);
});
```

**Expected iteration, pre-registered so it is not a judgement call made after seeing results:** the collision test may fail, because words like `prototype` and `pilot` are plausibly both the evidence word and the TRL rubric's own vocabulary. **The rule is: a colliding token is dropped, never kept.** If dropping empties a (startup, dimension) cell, that cell is excluded from the headline and the exclusion is recorded in the results file and the README. Do not resolve a collision by editing corpus `keyTerms`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && pnpm test:measurement`
Expected: FAIL — `Cannot find module '../lib/satisfactions.js'`.

- [ ] **Step 3: Implement**

Create `backend/measurement/lib/satisfactions.js`:

```js
/**
 * Reference-free satisfaction specification — the mirror of lib/hard-absences.js.
 *
 * Metric 5 asks whether generated text ASSERTS an artifact the document never
 * mentions. Metric 6 asks whether it RECOMMENDS one the document shows already
 * exists. Same documents, same classifier, opposite direction.
 *
 * Keyed by (startup, dimension), unlike HARD_ABSENCES which is keyed by
 * dimension alone: absence generalises across these two documents, satisfaction
 * does not.
 *
 * `evidence` is asserted VERBATIM against the document at run time. Asserting
 * the TOKEN instead would be wrong in the one direction that matters — the
 * string "Revenue" appears in AgroLink's document inside "Revenue: None to
 * date.", so a token-presence check would certify an absence as satisfied.
 *
 * Only T/M/A are specified. They are the dimensions `deflated` manipulates;
 * O/R/I sit at O2 R1 I1 for both startups and have no deflation room.
 *
 * AUTHORED, with no external source — the same standing as
 * data/stage-markers.json, and it must be said whenever a figure is quoted.
 */
const SPECS = {
  'AgroLink PH': {
    Technology: {
      evidence: '2025-09 paper prototype of the lot-aggregation flow tested with 3 cooperatives.',
      satisfiedTokens: ['paper prototype', 'proof of concept', 'concept formulation', 'initial prototype'],
    },
    Market: {
      evidence: 'Target Market: Rice and vegetable cooperatives in Nueva Ecija and Tarlac (roughly 400 cooperatives).',
      satisfiedTokens: ['target market', 'market segment', 'customer segment', 'target customer'],
    },
    Acceptance: {
      evidence: '2025-06 field interviews with 18 cooperatives.',
      satisfiedTokens: ['user interview', 'customer interview', 'user feedback', 'initial user contact'],
    },
  },
  'MediSync Cebu': {
    Technology: {
      evidence: '2025-02 pilot with 2 rural health units and 1 district hospital.',
      satisfiedTokens: ['paper prototype', 'proof of concept', 'concept formulation', 'initial prototype'],
    },
    Market: {
      evidence: 'The 44 rural health units in Cebu province, 8 district hospitals, and 3 tertiary referral centres.',
      satisfiedTokens: ['target market', 'market segment', 'customer segment', 'target customer'],
    },
    Acceptance: {
      evidence: '2026-02 reached PHP 5,000 monthly recurring revenue',
      satisfiedTokens: ['paying customer', 'paid subscription', 'willingness to pay', 'first customer'],
    },
  },
};

const SATISFACTIONS = SPECS;

/** Fails loudly if an evidence phrase is not in its document — assert, don't trust. */
function verifySatisfactions(docs) {
  const violations = [];
  for (const [startup, dims] of Object.entries(SATISFACTIONS)) {
    const doc = docs[startup];
    if (typeof doc !== 'string') {
      violations.push(`${startup}: no document supplied`);
      continue;
    }
    for (const [dim, spec] of Object.entries(dims)) {
      if (!doc.includes(spec.evidence)) {
        violations.push(`${startup}/${dim}: evidence not found verbatim — "${spec.evidence}"`);
      }
    }
  }
  if (violations.length) throw new Error(`SATISFACTIONS is wrong:\n  ${violations.join('\n  ')}`);
  return true;
}

module.exports = { SATISFACTIONS, verifySatisfactions };
```

If the collision test fails, drop the colliding token and re-run. Record every dropped token in a comment beside its cell.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS. If `STARTUPS` or `RUBRICS` are not exported from `measure-grounding.js`, add them to the export block — they are data, and the harness already exports `rubricKey` and friends.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/lib/satisfactions.js backend/measurement/tests/satisfactions.test.js backend/measurement/measure-grounding.js
git commit -m "feat: add the reference-free satisfaction specification for metric 6"
```

---

### Task 4: `lib/redundancy.js` — the scorer and its non-vacuity fixtures

This is the task the whole plan exists to gate. **No quota is spent until its tests pass.**

**Files:**
- Create: `backend/measurement/lib/redundancy.js`
- Test: `backend/measurement/tests/redundancy.test.js`

**Interfaces:**
- Consumes: `splitClauses`, `classifyClause` from `lib/assertions.js`; `SATISFACTIONS` from `lib/satisfactions.js`.
- Produces: `scoreRedundantNeeds(rnaByDim, satisfactionsForStartup) -> { observations: Array<{ dimension, mentioned, redundant, denied, clauses }> }`. One binary observation per (call, dimension). A dimension the model omitted is **skipped, not scored clean** — the same rule `scoreAssertedAbsences` and `lib/metrics.js` use. Watch n.

- [ ] **Step 1: Write the failing test**

Create `backend/measurement/tests/redundancy.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { scoreRedundantNeeds } = require(path.resolve(__dirname, '../lib/redundancy.js'));
const { SATISFACTIONS } = require(path.resolve(__dirname, '../lib/satisfactions.js'));

const MEDI = SATISFACTIONS['MediSync Cebu'];

test('fires: recommending something the document evidences', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'Needs: identify a target market segment before further development.' },
    MEDI,
  );
  const market = observations.find((o) => o.dimension === 'Market');
  assert.equal(market.redundant, true);
});

test('spares: recommending a genuine gap', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'Needs: secure a signed distribution agreement with a tertiary referral centre.' },
    MEDI,
  );
  assert.equal(observations.find((o) => o.dimension === 'Market').redundant, false);
});

test('spares: ASSERTING a satisfied artifact is metric 5 bin, not this one', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'The venture has defined its target market segment.' },
    MEDI,
  );
  const market = observations.find((o) => o.dimension === 'Market');
  assert.equal(market.redundant, false);
});

test('the secondary count catches denying an evidenced fact', () => {
  const { observations } = scoreRedundantNeeds(
    { Acceptance: 'The venture has not yet secured any paying customer.' },
    MEDI,
  );
  const acc = observations.find((o) => o.dimension === 'Acceptance');
  assert.equal(acc.denied, true);
  assert.equal(acc.redundant, false, 'a denial must never inflate the headline');
});

test('a dimension the model omitted is skipped, not scored clean', () => {
  const { observations } = scoreRedundantNeeds({ Market: 'Needs: identify a target market segment.' }, MEDI);
  assert.deepEqual(observations.map((o) => o.dimension), ['Market']);
});

test('binary per dimension — two redundant clauses are still one observation', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'Needs: identify a target market segment. The team should also define its customer segment.' },
    MEDI,
  );
  const market = observations.find((o) => o.dimension === 'Market');
  assert.equal(market.redundant, true);
  assert.equal(market.clauses.filter((c) => c.klass === 'recommended').length, 2);
});

test('scope inheritance survives a coordination split', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'The team should complete its regulatory filing, and identify a target market segment.' },
    MEDI,
  );
  assert.equal(observations.find((o) => o.dimension === 'Market').redundant, true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && pnpm test:measurement`
Expected: FAIL — `Cannot find module '../lib/redundancy.js'`.

- [ ] **Step 3: Implement**

Create `backend/measurement/lib/redundancy.js`:

```js
/**
 * Metric 6 — the redundant-need rate. The mirror of lib/assertions.js'
 * scoreAssertedAbsences, on the same segmentation and the same classifier.
 *
 *   metric 5: absent tokens   x `asserted`    — claims an artifact that isn't there
 *   metric 6: satisfied tokens x `recommended` — asks for one that already is
 *
 * classifyClause is generic over its token list, so nothing here forks it and
 * nothing here touches its cues. Editing those would change CLASSIFIER_SOURCE
 * and orphan every stored metric-5 fingerprint.
 *
 * LOWER BOUND, with a named uncaught class: NEGATION is tested before
 * RECOMMENDATION, so "has not yet secured any paying customer" bins as
 * `negated`, not `recommended`. That is a real and arguably worse failure —
 * falsely denying evidenced fact — so it is counted separately as `denied` and
 * never folded into the headline.
 */

const { splitClauses, classifyClause } = require('./assertions.js');

const CONTINUATION = /^\s*(?:and|or|then)\b/i;

/**
 * One binary observation per (call, dimension): did this dimension's text
 * recommend at least one artifact the document already evidences?
 *
 * Binary rather than a token count, because counting rewards verbosity and the
 * corpus arm writes longer RNAs — the same rule metric 5 uses.
 *
 * A dimension the model omitted is skipped rather than scored clean. Watch n.
 */
function scoreRedundantNeeds(rnaByDim, satisfactions) {
  const observations = [];
  for (const [dimension, spec] of Object.entries(satisfactions ?? {})) {
    const text = rnaByDim?.[dimension];
    if (typeof text !== 'string') continue;

    const clauses = [];
    let scope = '';
    for (const clause of splitClauses(text)) {
      const continuation = CONTINUATION.test(clause);
      const klass = classifyClause(clause, spec.satisfiedTokens, continuation ? scope : '');
      if (!continuation) scope = clause;
      if (klass) clauses.push({ text: clause, klass });
    }

    observations.push({
      dimension,
      mentioned: clauses.length > 0,
      redundant: clauses.some((c) => c.klass === 'recommended'),
      denied: clauses.some((c) => c.klass === 'negated'),
      clauses,
    });
  }
  return { observations };
}

module.exports = { scoreRedundantNeeds };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS, all seven.

If the "spares: asserting" test fails, the satisfied token is matching under an assertion cue — that is correct classifier behaviour and the fixture is what needs rewording, not the classifier. **Never edit `lib/assertions.js` to make a redundancy test pass.**

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/lib/redundancy.js backend/measurement/tests/redundancy.test.js
git commit -m "feat: score the redundant-need rate against the recommended bin"
```

---

### Task 5: Wire metric 6 into the harness

**Files:**
- Modify: `backend/measurement/measure-grounding.js` — `summarizeResults`, the reporting block, and the run-time verifier call
- Test: `backend/measurement/tests/reporting.test.js`

**Interfaces:**
- Consumes: `scoreRedundantNeeds`, `SATISFACTIONS`, `verifySatisfactions`, `conditionField`.
- Produces: per (arm, condition) `{ redundantRate, redundantN, deniedCount }` on the summary object.

- [ ] **Step 1: Write the failing test**

Append to `backend/measurement/tests/reporting.test.js`:

```js
test('metric 6 is summarised per arm and condition, and n counts dimensions the model wrote', () => {
  const results = {
    baseline: {
      quotaHit: false,
      startups: {
        'MediSync Cebu': {
          retrieved: [],
          rnaCalls: [], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [],
          assertionInflatedCalls: [],
          assertionDeflatedCalls: [
            { byDim: { Market: 'Needs: identify a target market segment.', Technology: 'Needs: secure ISO certification.' } },
          ],
        },
      },
    },
  };
  const summary = summarizeResults(results);
  assert.equal(summary.baseline.redundancy.deflated.redundantN, 2, 'both written dimensions are observations');
  assert.equal(summary.baseline.redundancy.deflated.redundantRate, 0.5, 'one of the two is redundant');
});

test('an omitted dimension is not scored clean', () => {
  const results = {
    baseline: {
      quotaHit: false,
      startups: {
        'MediSync Cebu': {
          retrieved: [],
          rnaCalls: [], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [], assertionInflatedCalls: [],
          assertionDeflatedCalls: [{ byDim: { Market: 'Needs: identify a target market segment.' } }],
        },
      },
    },
  };
  assert.equal(summarizeResults(results).baseline.redundancy.deflated.redundantN, 1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && pnpm test:measurement`
Expected: FAIL — `summary.baseline.redundancy` is `undefined`.

- [ ] **Step 3: Implement**

In `summarizeResults`, after the existing assertion summarisation, add:

```js
    // Metric 6, per condition. Keyed by condition rather than folded together:
    // `truth` is what users receive and `deflated` is the positive control, and
    // averaging the two would report neither.
    const redundancy = {};
    for (const condition of ALL_LEVEL_CONDITIONS) {
      const field = conditionField(condition);
      let n = 0;
      let redundant = 0;
      let denied = 0;
      for (const [startupName, cell] of Object.entries(arm.startups)) {
        const spec = SATISFACTIONS[startupName];
        if (!spec) continue;
        for (const call of cell[field] ?? []) {
          for (const obs of scoreRedundantNeeds(call.byDim, spec).observations) {
            n += 1;
            if (obs.redundant) redundant += 1;
            if (obs.denied) denied += 1;
          }
        }
      }
      redundancy[condition] = {
        redundantN: n,
        redundantRate: n ? redundant / n : null,
        deniedCount: denied,
      };
    }
    out[armName].redundancy = redundancy;
```

`redundantRate` is `null`, never `0`, when `n === 0` — `0/0` is undefined and reading it as a clean score is the mistake `lib/field-overlap.js`'s `jaccard` was written to avoid.

Add the require at the top of `measure-grounding.js`:

```js
const { scoreRedundantNeeds } = require(path.join(__dirname, 'lib/redundancy.js'));
const { SATISFACTIONS, verifySatisfactions } = require(path.join(__dirname, 'lib/satisfactions.js'));
```

Call the verifier at the same place `verifyAbsences` is called, so a wrong evidence phrase stops the run before it spends a call:

```js
verifySatisfactions(Object.fromEntries(Object.entries(STARTUPS).map(([n, s]) => [n, s.doc])));
```

In the console report, print per arm:

```
  metric 6 redundant-need   truth <rate> (n=<n>)   deflated <rate> (n=<n>)
  metric 6 denied (secondary, NOT in the headline)  truth <count>  deflated <count>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/measure-grounding.js backend/measurement/tests/reporting.test.js
git commit -m "feat: summarise the redundant-need rate per arm and condition"
```

---

### Task 6: Persist raw RNA text

**Files:**
- Modify: `backend/measurement/measure-grounding.js:1335-1348` (`writeResults`)
- Test: `backend/measurement/tests/reporting.test.js`

**Interfaces:**
- Produces: `rnaTexts: Array<{arm, startup, condition, rep, dimension, text}>` in the results payload.

Today `rnaCalls` holds generated text in memory and the writer emits only aggregates plus `flaggedClauses`. **Every RNA this project has paid quota for is unrecoverable** — that is why metric 6 needs a fresh run rather than a re-score, and this step is what stops metric 7 paying the same price.

- [ ] **Step 1: Write the failing test**

Append to `backend/measurement/tests/reporting.test.js`:

```js
test('rnaTexts carries every generated dimension so a future metric can re-score without quota', () => {
  const results = {
    baseline: {
      quotaHit: false,
      startups: {
        'MediSync Cebu': {
          retrieved: [],
          rnaCalls: [], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [{ byDim: { Market: 'Needs: define the segment.' } }],
          assertionInflatedCalls: [],
          assertionDeflatedCalls: [{ byDim: { Technology: 'Needs: build a prototype.' } }],
        },
      },
    },
  };
  const rows = rnaTexts(results);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.arm, r.startup, r.condition, r.dimension, r.text]).sort(),
    [
      ['baseline', 'MediSync Cebu', 'deflated', 'Technology', 'Needs: build a prototype.'],
      ['baseline', 'MediSync Cebu', 'truth', 'Market', 'Needs: define the segment.'],
    ].sort(),
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && pnpm test:measurement`
Expected: FAIL — `rnaTexts is not a function`.

- [ ] **Step 3: Implement**

Beside `flaggedClauses` in `measure-grounding.js`:

```js
/**
 * Every generated dimension, flat. The harness used to discard this at write
 * time, which is why no metric added after a run could ever be scored against
 * it — the text was gone and only a re-run could recover it.
 *
 * `rep` is absent from the per-call records, so it is emitted as the call's
 * index within its condition pool. Enough to distinguish reps within one file;
 * not a claim about which day a call came from.
 */
function rnaTexts(results) {
  const rows = [];
  for (const [arm, armData] of Object.entries(results)) {
    for (const [startup, cell] of Object.entries(armData.startups ?? {})) {
      for (const condition of ALL_LEVEL_CONDITIONS) {
        const calls = cell[conditionField(condition)] ?? [];
        calls.forEach((call, rep) => {
          for (const [dimension, text] of Object.entries(call.byDim ?? {})) {
            rows.push({ arm, startup, condition, rep, dimension, text });
          }
        });
      }
    }
  }
  return rows;
}
```

Add `rnaTexts: rnaTexts(results),` to the `writeResults` payload and `rnaTexts,` to the export block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/measure-grounding.js backend/measurement/tests/reporting.test.js
git commit -m "feat: persist raw RNA text so future metrics need no new quota"
```

---

### Task 7: Fingerprints and merge

**Files:**
- Modify: `backend/measurement/lib/fingerprint.js:110-131`, `backend/measurement/measure-grounding.js:1391-1397` (`FIELD`)
- Test: `backend/measurement/tests/fingerprint.test.js`, `backend/measurement/tests/merge.test.js`

**Interfaces:**
- Produces: fingerprint keys `redundancy|<arm>` and `redundancy-deflated|<arm>`; `FIELD` entries `redundancy: 'assertionTruthCalls'` and `'redundancy-deflated': 'assertionDeflatedCalls'`.

- [ ] **Step 1: Write the failing test**

Append to `backend/measurement/tests/fingerprint.test.js`:

```js
test('adding redundancy keys leaves every pre-existing hash byte-identical', () => {
  const before = fingerprintMap(FIXTURE_ARGS);      // reuse this file's existing fixture
  const after = fingerprintMap(FIXTURE_ARGS);
  for (const key of Object.keys(before)) {
    if (key.startsWith('redundancy')) continue;
    assert.equal(after[key], before[key], `${key} moved — historical files stop pooling`);
  }
});

test('the deflated override is part of redundancy-deflated comparability', () => {
  const map = fingerprintMap(FIXTURE_ARGS);
  assert.ok(map['redundancy|baseline']);
  assert.notEqual(map['redundancy-deflated|baseline'], map['redundancy|baseline']);
});
```

Append to `backend/measurement/tests/merge.test.js`:

```js
test('--merge refuses to pool redundancy across a changed satisfaction spec', () => {
  // Mirrors the existing assertion refusal test in this file: two files whose
  // redundancy fingerprints differ must refuse on that key and still pool the
  // untouched metrics.
});
```

Fill that body by copying the existing assertion-refusal test in the same file and substituting the `redundancy` key — the mechanics are identical.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && pnpm test:measurement`
Expected: FAIL — `map['redundancy|baseline']` is `undefined`.

- [ ] **Step 3: Implement**

In `lib/fingerprint.js`, after the existing `if (sources.assertion) { ... }` block and **inside the same arm loop**, add a sibling block. Additive only — a new key cannot change an existing key's material:

```js
    if (sources.redundancy) {
      const redundancyMaterial = {
        src: sources.rna,
        readinessLevelBlockSrc: sources.readinessLevelBlock,
        renderRubricBlockSrc: sources.renderRubricBlock,
        common,
        scope: rnaScope,
        rubricMode: arm.rubricMode,
        corpusHash: corpusHashForArm,
        // Scoring is comparability: re-scoring stored text against an edited
        // token list is a different measurement, not more of the same one.
        redundancySrc: sources.redundancy,
        satisfactions,
      };
      out[`redundancy|${arm.name}`] = hash(redundancyMaterial);
      out[`redundancy-deflated|${arm.name}`] = hash({ ...redundancyMaterial, deflatedLevels });
    }
```

Thread `sources.redundancy` (the source text of `lib/redundancy.js`), `satisfactions` (`SATISFACTIONS`) and `deflatedLevels` (`DEFLATED_OVERRIDE`) through from `currentFingerprints()` in `measure-grounding.js`, the same way `sources.assertion`, `absences` and `inflatedLevels` are already threaded.

Add to `FIELD` in `mergeRuns`:

```js
    redundancy: 'assertionTruthCalls',
    'redundancy-deflated': 'assertionDeflatedCalls',
```

**Watch the 1:1 metric→field invariant.** `assertion` already maps to `assertionTruthCalls`, and `mergeRuns` double-pushes if two metric keys share a field. Check how the existing loop iterates before adding `redundancy` against the same field — if it pushes per metric key rather than per field, deduplicate by field first, and add a test asserting `n` does not double.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pnpm test:measurement`
Expected: PASS, including every pre-existing fingerprint test.

- [ ] **Step 5: Commit**

```bash
git add backend/measurement/lib/fingerprint.js backend/measurement/measure-grounding.js backend/measurement/tests/
git commit -m "feat: fingerprint metric 6 so --merge refuses incomparable pools"
```

---

### Task 8: The non-vacuity gate — mutation testing and dry-run

Nothing after this task spends quota, and nothing before it may.

**Files:**
- Modify: `backend/measurement/tests/redundancy.test.js` (classifier pin)
- No production change expected; mutations are applied and reverted.

- [ ] **Step 1: Pin the classifier**

Append to `backend/measurement/tests/redundancy.test.js`:

```js
test('metric 6 does not disturb CLASSIFIER_SOURCE — every stored metric-5 fingerprint depends on it', () => {
  const { CLASSIFIER_SOURCE } = require(path.resolve(__dirname, '../lib/assertions.js'));
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(JSON.stringify(CLASSIFIER_SOURCE)).digest('hex');
  assert.equal(hash, '<paste the hash printed on first run>');
});
```

Run once, paste the printed hash, commit the pinned value.

- [ ] **Step 2: Run the mutations**

Apply each mutation, assert the anchor matched, run the suite, revert. **A mutation that fails to apply reports a green suite indistinguishable from a decorative guard** — this has bitten twice on this project, so assert the edit landed before trusting the result.

| # | Mutation | Must go red |
|---|---|---|
| 1 | In `lib/redundancy.js`, delete the `classifyClause` token gate (pass `[]` as tokens) | "fires" test |
| 2 | Swap `c.klass === 'recommended'` to `'asserted'` | "fires" and "spares: asserting" |
| 3 | In `lib/satisfactions.js`, make `verifySatisfactions` `return true` unconditionally | "throws when evidence is not in the document" |
| 4 | In `measure-grounding.js`, restore `conditionField`'s old ternary | Task 1's unknown-condition test |
| 5 | Make `redundantRate` return `0` instead of `null` when `n === 0` | add an assertion for this if none goes red |

Use a script that asserts `s.count(old) == 1` before writing, and confirm the suite result *changed* rather than merely being red.

- [ ] **Step 3: Dry-run the real prompts, zero quota**

Run:

```bash
node measurement/measure-grounding.js --only-arm=baseline,sdd-semantic,deviation-deterministic --only-probe=rna --level-condition=truth,deflated --dry-run
```

Confirm by reading the printed prompts:
- the `deflated` prompts supply **Technology 1, Market 1, Acceptance 1** and leave O/R/I at truth;
- the `deviation-deterministic` deflated prompt carries **level-1/2** rubric text, not level-6/7;
- `baseline` and `sdd-semantic` prompts are **byte-identical** (the null control) — diff them rather than eyeballing;
- the call count is **12**.

- [ ] **Step 4: Commit**

```bash
git add backend/measurement/tests/redundancy.test.js
git commit -m "test: pin CLASSIFIER_SOURCE and record the metric 6 mutation results"
```

---

### Task 9: Pre-register in the README, then run

**Files:**
- Modify: `backend/measurement/README.md`

- [ ] **Step 1: Write the pre-registration**

Add a `### Metric 6 — redundant-need rate, added 2026-08-23` section to `backend/measurement/README.md` covering, in this order: what it measures, why the rubric-anchored alternative was refused as circular, the `deflated` control, the two pre-registered predictions **verbatim from the spec**, the null-control reading rule, and the limits block. Note any satisfied token dropped for colliding with a corpus `keyTerm`, and any cell excluded as a result.

Both predictions, restated so they are in the repo before any call:

1. **The control fires.** `deflated` redundancy is substantially above `truth` on every arm. **If this fails the run is void** and reports a detector problem, not a model result.
2. **The corpus arm scores worse than baseline under `deflated`**, because it is handed level-1/2 criteria as retrieved targets.

- [ ] **Step 2: Commit before the first call**

```bash
git add backend/measurement/README.md
git commit -m "docs: pre-register metric 6's predictions before any generation call"
```

- [ ] **Step 3: Run rep 1**

```bash
node measurement/measure-grounding.js --only-arm=baseline,sdd-semantic,deviation-deterministic --only-probe=rna --level-condition=truth,deflated --reps=1 --out=measurement/results/2026-08-24-rna-redundancy.json
```

12 calls. Check the quota window first — it resets 15:00 Philippine time, and a run started before 15:00 draws on the previous window. 429s surface in the backend terminal, not the browser.

- [ ] **Step 4: Run rep 2 the following day and merge**

Same command with a new `--out`, then `--merge` both files. `--merge` must refuse nothing; if it refuses a `redundancy` key, the spec changed between reps and the pool is invalid.

- [ ] **Step 5: Commit the results file and write up**

```bash
git add backend/measurement/results/ backend/measurement/README.md SESSION_NOTES.md TODO_CHECKLIST.md
git commit -m "measure: metric 6 redundant-need rate, n=2"
```

Report prediction 1 and prediction 2 **as they came out**, including if both were wrong. Quote no arm difference smaller than the baseline/`sdd-semantic` spread.

---

## Self-Review

**Spec coverage.** Metric 6 definition → Tasks 3, 4. Reference-free anchoring → Task 3. `deflated` → Task 2. `both` frozen → Task 2. Comma lists → Task 2. `rnaTexts` → Task 6. Headline + secondary denied count → Tasks 4, 5. Eight-item testing gate → Tasks 3, 4, 8. Mutation list → Task 8. Run plan → Task 9. Pre-registration → Task 9. Limits → Task 9. **Gap found and closed:** the spec did not mention the two condition-map landmines, which the plan adds as Task 1 — implementing the spec literally, without them, would have sent unmanipulated prompts labelled `deflated`.

**Placeholders.** One deliberate: Task 7's merge test body says to copy the adjacent assertion-refusal test, because that fixture is long and lives in the file the implementer already has open. Task 8's `CLASSIFIER_SOURCE` hash is filled from the first run, which is the only way to obtain it.

**Type consistency.** `scoreRedundantNeeds(rnaByDim, satisfactionsForStartup)` is called with `SATISFACTIONS[startupName]` in Task 5 and with `SATISFACTIONS['MediSync Cebu']` in Task 4 — same shape. `conditionField` returns the field names used in both cell-init sites and in `rnaTexts`. `redundancy[condition]` keys match `ALL_LEVEL_CONDITIONS` throughout.

**Known risk carried forward.** Task 7's `FIELD` map gives `assertion` and `redundancy` the same field, `assertionTruthCalls`. `mergeRuns` documents a 1:1 metric→field invariant that double-pushes when violated. The task says to check the loop and deduplicate by field, but this is the plan's most likely defect and deserves the reviewer's attention.
