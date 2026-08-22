const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { normalizeField } = require(path.resolve(__dirname, '../lib/field-overlap.js'));

// The schema declares proposal_field as a bare STRING (ai.service.ts:178), not an
// enum over the DTO's fields, so the same field can arrive in several spellings.
// Without this, `historical_timeline` and `historicalTimeline` count as two
// distinct fields and every overlap number reads low for a formatting reason.
test('normalizeField collapses casing, underscores and spaces to one key', () => {
  const forms = ['historicalTimeline', 'historical_timeline', 'Historical Timeline', 'HISTORICAL-TIMELINE'];
  const keys = new Set(forms.map(normalizeField));
  assert.equal(keys.size, 1, `expected one key, got ${[...keys].join(', ')}`);
  assert.equal(normalizeField('historicalTimeline'), 'historicaltimeline');
});

const { fieldSet } = require(path.resolve(__dirname, '../lib/field-overlap.js'));

// Two criteria can cite one field. The metric asks WHICH fields were reached
// for, so a field named twice is still one field - counting it twice would let
// a verbose call look like broader coverage.
test('fieldSet dedupes repeated citations of the same field', () => {
  const detail = [
    { criterion: 'No revenue', proposalField: 'historicalTimeline' },
    { criterion: 'No transaction', proposalField: 'historical_timeline' },
    { criterion: 'No buyers', proposalField: 'targetMarket' },
  ];
  assert.deepEqual([...fieldSet(detail)].sort(), ['historicaltimeline', 'targetmarket']);
});

// A blank or missing proposal_field is not a field citation. Admitting it as ''
// would make two calls that both failed to name a field look like they agreed
// on one.
test('fieldSet drops entries whose proposalField is unusable', () => {
  const detail = [
    { criterion: 'a', proposalField: '' },
    { criterion: 'b', proposalField: '   ' },
    { criterion: 'c', proposalField: null },
    { criterion: 'd' },
    { criterion: 'e', proposalField: 'objectives' },
  ];
  assert.deepEqual([...fieldSet(detail)], ['objectives']);
});

test('fieldSet of no criteria is an empty set', () => {
  assert.equal(fieldSet([]).size, 0);
  assert.equal(fieldSet(undefined).size, 0);
});

const { jaccard } = require(path.resolve(__dirname, '../lib/field-overlap.js'));
const S = (...xs) => new Set(xs);

test('jaccard of identical sets is 1', () => {
  assert.equal(jaccard(S('a', 'b'), S('b', 'a')), 1);
});

test('jaccard of disjoint sets is 0', () => {
  assert.equal(jaccard(S('a', 'b'), S('c', 'd')), 0);
});

test('jaccard of partially overlapping sets is intersection over union', () => {
  // {a,b,c} n {b,c,d} = {b,c}; union = {a,b,c,d}
  assert.equal(jaccard(S('a', 'b', 'c'), S('b', 'c', 'd')), 0.5);
});

// The load-bearing case. The baseline arm cites no fields at all - it has no
// criteria field in its schema (criteriaTable already guards this as
// `structuralZero`). Scoring 0/0 as 1 would report that arm as perfectly
// uniform: a damning finding manufactured from a missing field rather than
// from anything the model did.
test('jaccard of two empty sets is null, not 1', () => {
  assert.equal(jaccard(S(), S()), null);
});

// Well-defined, unlike the above: the union is non-empty and they share nothing.
test('jaccard of an empty set against a populated one is 0', () => {
  assert.equal(jaccard(S(), S('a')), 0);
});

const { overlapStats } = require(path.resolve(__dirname, '../lib/field-overlap.js'));

// cross = how much the arm says the same things about two DIFFERENT startups.
// within = how much it repeats itself about the SAME startup across reps. That
// second number is the intrinsic noise floor the old guard never had: a gap
// only means something measured against how stable the arm is on one document.
test('an arm that cites different fields per startup separates fully', () => {
  const r = overlapStats([S('a', 'b'), S('a', 'b')], [S('c', 'd'), S('c', 'd')]);
  assert.equal(r.crossOverlap, 0);
  assert.equal(r.withinOverlap, 1);
  assert.equal(r.separation, 1);
});

test('an arm that cites the same fields for both startups separates not at all', () => {
  const r = overlapStats([S('a', 'b'), S('a', 'b')], [S('a', 'b'), S('a', 'b')]);
  assert.equal(r.crossOverlap, 1);
  assert.equal(r.withinOverlap, 1);
  assert.equal(r.separation, 0);
});

test('crossOverlap is the mean over every early-by-mid pair', () => {
  // ({a,b},{a,b}) = 1 ; ({a,c},{a,b}) = |{a}| / |{a,b,c}| = 1/3
  const r = overlapStats([S('a', 'b'), S('a', 'c')], [S('a', 'b')]);
  assert.equal(r.nCrossPairs, 2);
  assert.equal(round(r.crossOverlap), 0.667);
});

test('withinOverlap pools same-startup rep pairs from both startups', () => {
  // early pair ({a,b},{a,c}) = 1/3 ; mid pair ({d,e},{d,e}) = 1 ; mean = 2/3
  const r = overlapStats([S('a', 'b'), S('a', 'c')], [S('d', 'e'), S('d', 'e')]);
  assert.equal(r.nWithinPairs, 2);
  assert.equal(round(r.withinOverlap), 0.667);
});

// One rep per startup yields no same-startup pair, so there is no noise floor
// and separation is unreadable. It must say so rather than report a bare gap -
// this is the shape that produced the validation run's bogus adversarial PASS.
test('withinOverlap is null when no startup has two reps', () => {
  const r = overlapStats([S('a')], [S('b')]);
  assert.equal(r.nWithinPairs, 0);
  assert.equal(r.withinOverlap, null);
  assert.equal(r.separation, null);
});

test('separation is null when crossOverlap has no scoreable pair', () => {
  const r = overlapStats([S('a'), S('a')], []);
  assert.equal(r.crossOverlap, null);
  assert.equal(r.separation, null);
});

// The baseline arm. It cites no fields anywhere, so every pair is 0/0. Reporting
// 0 or 1 here would invent a finding out of a missing schema field.
test('an arm citing no fields at all reports null throughout, never 0', () => {
  const r = overlapStats([S(), S(), S()], [S(), S(), S()]);
  assert.equal(r.crossOverlap, null);
  assert.equal(r.withinOverlap, null);
  assert.equal(r.separation, null);
  assert.equal(r.nCrossPairs, 0);
});

test('unscoreable pairs are excluded from the mean rather than counted as 0', () => {
  // pairs: (empty,empty) = null, dropped ; ({a},empty) = 0, kept
  const r = overlapStats([S(), S('a')], [S()]);
  assert.equal(r.nCrossPairs, 1);
  assert.equal(r.crossOverlap, 0);
});

function round(x) {
  return x === null ? null : Math.round(x * 1000) / 1000;
}

// The pre-registered rule (2026-08-19) is defined on min/max of the RAW pair
// values, not the means, so those values have to survive into the results file.
// Persisting only means is the same defect that left both 2026-08-18 runs
// un-rescoreable for overlap.
test('overlapStats exposes the scoreable pair values, not just their means', () => {
  const r = overlapStats([S('a', 'b'), S('a', 'c')], [S('a', 'b')]);
  // cross: ({a,b},{a,b}) = 1 ; ({a,c},{a,b}) = 1/3
  assert.deepEqual(r.crossPairValues.map(round).sort(), [0.333, 1]);
  // within: ({a,b},{a,c}) = 1/3
  assert.deepEqual(r.withinPairValues.map(round), [0.333]);
});

test('unscoreable pairs are absent from the pair values, not present as 0', () => {
  // (empty,empty) = null, dropped ; ({a},empty) = 0, kept
  const r = overlapStats([S(), S('a')], [S()]);
  assert.deepEqual(r.crossPairValues, [0]);
  assert.equal(r.crossPairValues.length, r.nCrossPairs);
});

const { completeSeparation, chanceReference } =
  require(path.resolve(__dirname, '../lib/field-overlap.js'));

// The rule pre-registered 2026-08-19: the two pair distributions must not
// overlap at all. No constant - the same logic that made ratio < 0.75 quotable.
test('complete separation holds when every within pair beats every cross pair', () => {
  assert.equal(completeSeparation([0.1, 0.3], [0.6, 0.8]), true);
});

// Strict >, pinned by the pre-registration: the rule does not resolve ambiguity
// toward PASS, because PASS is the claim being made and should cost something.
// Same call as exactly 0.75 counting as balanced.
test('a tie between the distributions is a FAIL, not a PASS', () => {
  assert.equal(completeSeparation([0.3, 0.5], [0.5, 0.6]), false);
});

test('overlapping distributions do not separate', () => {
  assert.equal(completeSeparation([0.3, 0.7], [0.6, 0.8]), false);
});

test('complete separation is null when either side has no scoreable pair', () => {
  assert.equal(completeSeparation([], [0.5]), null);
  assert.equal(completeSeparation([0.5], []), null);
});

// Probability that all nWithin values land above all nCross values under random
// relabelling: 1 / C(nCross + nWithin, nWithin).
test('chanceReference is 1 over the binomial of the pooled pairs', () => {
  assert.equal(round(chanceReference(9, 6) * 5005), 1); // full 3x3 grid
  assert.equal(round(chanceReference(4, 2) * 15), 1); // 2x2 grid
});

test('chanceReference is null when either side has no pairs', () => {
  assert.equal(chanceReference(0, 6), null);
  assert.equal(chanceReference(9, 0), null);
});
