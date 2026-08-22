const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { selectArms, ARMS, validateArgs } =
  require(path.resolve(__dirname, '../measure-summary-bias.js'));

const names = (r) => r.arms.map((a) => a.name);

test('no filter selects every arm', () => {
  const r = selectArms(null, ARMS);
  assert.deepEqual(names(r), ['baseline', 'adversarial']);
  assert.deepEqual(r.errors, []);
});

// The reason this flag exists: metric 3 is scoreable on the adversarial arm
// only, so a full run spends 6 baseline calls that cannot contribute to it.
test('an exact name selects only that arm', () => {
  const r = selectArms('adversarial', ARMS);
  assert.deepEqual(names(r), ['adversarial']);
  assert.deepEqual(r.errors, []);
});

test('a prefix selects the arm it matches', () => {
  assert.deepEqual(names(selectArms('adv', ARMS)), ['adversarial']);
});

test('comma-separated names select several arms', () => {
  assert.deepEqual(names(selectArms('adversarial,baseline', ARMS)), ['baseline', 'adversarial']);
});

// Silently running the full set defeats the flag in the expensive direction -
// the point is to spend 6 calls instead of 12 against a 20/day cap.
test('a name matching nothing is an error, never a silent drop', () => {
  const r = selectArms('adverserial', ARMS);
  assert.equal(r.arms.length, 0);
  assert.match(r.errors[0], /matched no arm/);
  assert.match(r.errors[0], /adverserial/);
});

// Over-selection costs as much as under-selection, so a prefix reaching two
// arms is refused rather than guessed at.
test('an ambiguous prefix is refused rather than expanded', () => {
  const arms = [
    { name: 'adversarial', adversarialSummary: true },
    { name: 'adversarial-strict', adversarialSummary: true },
  ];
  const r = selectArms('advers', arms);
  assert.equal(r.arms.length, 0);
  assert.match(r.errors[0], /ambiguous/i);
});

// An exact name must stay selectable even when it prefixes another arm's name.
test('an exact name wins over a longer arm it prefixes', () => {
  const arms = [
    { name: 'adversarial', adversarialSummary: true },
    { name: 'adversarial-strict', adversarialSummary: true },
  ];
  assert.deepEqual(names(selectArms('adversarial', arms)), ['adversarial']);
});

test('validateArgs accepts --only-arm', () => {
  assert.deepEqual(validateArgs(['--only-arm=adversarial']), []);
});
