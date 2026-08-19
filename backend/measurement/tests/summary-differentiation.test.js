const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { differentiationTable, MIN_CELL_N, EARLY, MID } =
  require(path.resolve(__dirname, '../measure-summary-bias.js'));

const ARMS = [
  { name: 'baseline', adversarialSummary: false },
  { name: 'adversarial', adversarialSummary: true },
];

const row = (arm, startup, { critical = 1, fields = [] } = {}) => ({
  arm,
  startup,
  status: 'ok',
  adversarialSummary: arm === 'adversarial',
  source: arm === 'adversarial' ? 'schema' : 'legacy',
  tone: { criticalCount: critical, positiveCount: 0, ratio: 1, flagged: false },
  unmetCriteria: fields.length,
  unmetCriteriaDetail: fields.map((f) => ({ criterion: 'c', proposalField: f, whyUnmet: 'w' })),
});

const forArm = (table, name) => table.find((t) => t.arm === name);

// The headline behaviour change. These rows PASS under the old rule
// (criticalGap = 1, so `separates` is true), and the count columns must no
// longer be able to produce a PASS at all - they are diagnosed as unable to
// separate these two startups, so a verdict built on them is a broken
// instrument made stricter rather than a fixed one.
test('count gaps can no longer earn a PASS', () => {
  const rows = [
    row('adversarial', EARLY, { critical: 3, fields: ['a'] }),
    row('adversarial', EARLY, { critical: 3, fields: ['a'] }),
    row('adversarial', MID, { critical: 2, fields: ['a'] }),
    row('adversarial', MID, { critical: 2, fields: ['a'] }),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'adversarial');
  assert.equal(t.criticalGap, 1, 'the count gap is still reported');
  assert.notEqual(t.verdict, 'PASS');
});

// The exact shape that produced the 2026-08-18 validation run's bogus
// adversarial PASS: criticalGap -0.33 off ONE early call against a 3-call mean.
test('a cell below MIN_CELL_N reports underpowered, never a verdict', () => {
  const rows = [
    row('adversarial', EARLY, { critical: 2, fields: ['a'] }),
    row('adversarial', MID, { critical: 2, fields: ['b'] }),
    row('adversarial', MID, { critical: 2, fields: ['b'] }),
    row('adversarial', MID, { critical: 3, fields: ['b'] }),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'adversarial');
  assert.equal(MIN_CELL_N, 2);
  assert.equal(t.nEarly, 1);
  assert.equal(t.underpowered, true);
  assert.equal(t.verdict, 'n/a - underpowered');
});

// Defect 3, the worst of the three: the old rule tested `gap !== 0`, so an arm
// criticising the MID-stage proposal harder than the early-stage one - the
// opposite of the guard's rationale - earned the same PASS as one that got it
// right. The sign must be legible without mental arithmetic.
test('a backwards count gap is labelled as favouring the mid-stage startup', () => {
  const rows = [
    row('adversarial', EARLY, { critical: 2, fields: ['a'] }),
    row('adversarial', EARLY, { critical: 2, fields: ['a'] }),
    row('adversarial', MID, { critical: 3, fields: ['b'] }),
    row('adversarial', MID, { critical: 3, fields: ['b'] }),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'adversarial');
  assert.equal(t.criticalGap, -1);
  assert.equal(t.criticalFavours, 'mid');
});

// The baseline arm has no criteria field in its schema, so it cites no proposal
// fields anywhere. That must read as unmeasurable, not as perfect uniformity.
test('an arm that cites no proposal fields reports no scoreable citations', () => {
  const rows = [
    row('baseline', EARLY),
    row('baseline', EARLY),
    row('baseline', MID),
    row('baseline', MID),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'baseline');
  assert.equal(t.crossOverlap, null);
  assert.equal(t.separation, null);
  assert.equal(t.verdict, 'n/a - no scoreable field citations');
});

// The margin was pre-registered on 2026-08-19, so a verdict is now issued - but
// this grid is 2x2, below the pre-registered n bar of 3 per startup, so the
// comparison is reported and explicitly NOT quotable.
test('a separating arm below the n bar reports PASS but not quotable', () => {
  const rows = [
    row('adversarial', EARLY, { critical: 3, fields: ['a', 'b'] }),
    row('adversarial', EARLY, { critical: 3, fields: ['a', 'b'] }),
    row('adversarial', MID, { critical: 3, fields: ['c', 'd'] }),
    row('adversarial', MID, { critical: 3, fields: ['c', 'd'] }),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'adversarial');
  assert.equal(t.underpowered, false);
  assert.equal(t.crossOverlap, 0);
  assert.equal(t.withinOverlap, 1);
  assert.equal(t.separation, 1);
  assert.equal(t.quotable, false);
  assert.equal(t.verdict, 'PASS - not quotable');
});

const { criteriaDetail } = require(path.resolve(__dirname, '../measure-summary-bias.js'));

// The harness stored unmetCriteria as `.length` only, so the criterion and
// proposal_field text never reached a results file and neither stored run can
// be re-scored for overlap. `whyUnmet` is kept deliberately: it is the audit
// trail for the hand-check, and hand-checks have caught instrument errors twice
// on this project.
test('criteriaDetail keeps criterion, proposalField and whyUnmet per criterion', () => {
  const analysis = {
    unmetCriteria: [
      { criterion: 'No revenue', proposalField: 'historicalTimeline', whyUnmet: 'no figure given' },
    ],
  };
  assert.deepEqual(criteriaDetail(analysis), [
    { criterion: 'No revenue', proposalField: 'historicalTimeline', whyUnmet: 'no figure given' },
  ]);
});

// The baseline arm and the legacy fallback both return no criteria. An empty
// array serializes and reads as "cited nothing"; undefined would vanish from
// the results file and be indistinguishable from a harness that forgot to look.
test('criteriaDetail is an empty array when the analysis carries no criteria', () => {
  assert.deepEqual(criteriaDetail({ unmetCriteria: [] }), []);
  assert.deepEqual(criteriaDetail({}), []);
});

// The boundary, and the case metric 3 exists to detect: a gap of exactly 0 is
// uniform harshness, not differentiation in the expected direction. Labelling it
// `early` would report that the arm distinguished the two startups when it did
// not distinguish them at all. It is also the modal reading in the real data -
// 7 of the 8 gap readings across both stored runs are 0.
test('a gap of exactly zero favours neither startup', () => {
  const rows = [
    row('adversarial', EARLY, { critical: 2, fields: ['a'] }),
    row('adversarial', EARLY, { critical: 2, fields: ['a'] }),
    row('adversarial', MID, { critical: 2, fields: ['a'] }),
    row('adversarial', MID, { critical: 2, fields: ['a'] }),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'adversarial');
  assert.equal(t.criticalGap, 0);
  assert.equal(t.criticalFavours, 'neither');
  assert.equal(t.unmetGap, 0);
  assert.equal(t.unmetFavours, 'neither');
});

const reps = (arm, startup, sets) => sets.map((f) => row(arm, startup, { critical: 3, fields: f }));

// The pre-registered rule at full strength: 3 reps per startup, complete
// separation, chance reference 1/C(15,6) = 0.0002 which clears the 0.001 bar.
test('a full 3x3 grid with complete separation reports a quotable PASS', () => {
  const rows = [
    ...reps('adversarial', EARLY, [['a', 'b'], ['a', 'b'], ['a', 'b']]),
    ...reps('adversarial', MID, [['c', 'd'], ['c', 'd'], ['c', 'd']]),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'adversarial');
  assert.equal(t.nCrossPairs, 9);
  assert.equal(t.nWithinPairs, 6);
  assert.equal(t.separated, true);
  assert.equal(t.quotable, true);
  assert.equal(t.verdict, 'PASS');
});

test('a full grid whose pair distributions overlap reports FAIL - uniform', () => {
  const rows = [
    ...reps('adversarial', EARLY, [['a', 'b'], ['a', 'c'], ['a', 'd']]),
    ...reps('adversarial', MID, [['a', 'b'], ['a', 'c'], ['a', 'd']]),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'adversarial');
  assert.equal(t.separated, false);
  assert.equal(t.quotable, true);
  assert.equal(t.verdict, 'FAIL - uniform');
});

// The case the pre-registration cites for requiring BOTH conditions. A 4x2 grid
// clears the chance reference (1/C(15,7) = 0.00016) but carries a single
// mid-side within-pair, so the reps condition must still reject it.
test('a lopsided 4x2 grid is not quotable despite clearing the chance bar', () => {
  const rows = [
    ...reps('adversarial', EARLY, [['a', 'b'], ['a', 'b'], ['a', 'b'], ['a', 'b']]),
    ...reps('adversarial', MID, [['c', 'd'], ['c', 'd']]),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'adversarial');
  assert.ok(t.chanceReference < 0.001, `chance reference ${t.chanceReference} should clear the bar`);
  assert.equal(t.nMid, 2);
  assert.equal(t.quotable, false);
  assert.equal(t.verdict, 'PASS - not quotable');
});

// The chance condition looks redundant beside the reps condition - 3 reps each
// side forces at least a 3x3 grid, whose chance reference is 0.0002. It becomes
// binding when calls return NO criteria: `unmet_criteria: []` is a valid schema
// response (required requires the key, not a non-empty array), and empty-vs-empty
// pairs are null, which shrinks the scoreable grid underneath a full rep count.
test('reps alone do not make a grid quotable when null pairs shrink it', () => {
  const rows = [
    ...reps('adversarial', EARLY, [['a', 'b'], [], []]),
    ...reps('adversarial', MID, [['c', 'd'], [], []]),
  ];
  const t = forArm(differentiationTable(rows, ARMS), 'adversarial');
  assert.equal(t.nEarly, 3, 'the reps condition is satisfied');
  assert.equal(t.nMid, 3, 'the reps condition is satisfied');
  assert.equal(t.nCrossPairs, 5, 'four empty-vs-empty cross pairs are unscoreable');
  assert.equal(t.nWithinPairs, 4);
  assert.ok(t.chanceReference > 0.001, `chance ${t.chanceReference} must fail the bar`);
  assert.equal(t.quotable, false);
  assert.equal(t.verdict, 'FAIL - not quotable');
});
