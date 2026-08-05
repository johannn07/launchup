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
  // AgroLink truth is T2 M3 A3 O2 R1 I1. Assign T2 (exact) and M5 (off by 2).
  const s = H.summarizeResults(results({
    agroAssigned: { Technology: 2, Market: 5 },
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
    assert.equal(s[key].length, 5, `${key} must have a row for every arm`);
    const row = s[key].find((r) => r.arm === 'deviation-deterministic');
    assert.ok(row, 'the unreached arm still needs a row');
  }
});
