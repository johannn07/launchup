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
