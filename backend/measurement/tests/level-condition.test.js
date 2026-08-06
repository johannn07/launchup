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
