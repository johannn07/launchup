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
