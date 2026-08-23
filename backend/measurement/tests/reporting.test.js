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
  const s = H.summarizeResults(results);
  const truth = s.metric5.find((r) => r.arm === 'baseline' && r.condition === 'truth');
  const inflated = s.metric5.find((r) => r.arm === 'baseline' && r.condition === 'inflated');
  assert.equal(truth.asserted, '0/1');
  assert.equal(inflated.asserted, '1/1');
});

// An arm a 429 never reached must produce a row that says n/a, not one that
// says 0% — an absent row and a zero row mean different things.
test('metric 5 gives every arm a row even with no calls', () => {
  const s = H.summarizeResults({});
  assert.equal(s.metric5.length, H.ARMS.length * 3, 'one row per arm per condition');
  assert.equal(s.metric5[0]['asserted %'], 'n/a');
});

// A bare 0 in the honesty column reads as "the classifier handled everything
// cleanly" for an arm that was never run. Every live --merge printed that.
test('unclassified says n/a at obs=0, not 0', () => {
  const s = H.summarizeResults({});
  assert.equal(s.metric5[0].unclassified, 'n/a');
});

test('unclassified is x/obs once there is data', () => {
  const s = H.summarizeResults({
    baseline: {
      startups: {
        'AgroLink PH': {
          retrieved: [], rnaCalls: [], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [{ byDim: { Investment: 'Funding, per the attached schedule.' } }],
          assertionInflatedCalls: [],
        },
      },
    },
  });
  const truth = s.metric5.find((r) => r.arm === 'baseline' && r.condition === 'truth');
  assert.equal(truth.unclassified, '1/1');
});

// The audit trail is what makes the lower-bound claim checkable rather than
// trusted, so its shape is pinned.
test('flaggedClauses emits one seven-field row per flagged clause', () => {
  const rows = H.flaggedClauses({
    baseline: {
      startups: {
        'AgroLink PH': {
          assertionTruthCalls: [{ byDim: { Investment: 'The venture has drafted a funding plan.' } }],
          assertionInflatedCalls: [],
        },
      },
    },
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    'arm', 'condition', 'dimension', 'klass', 'rep', 'startup', 'text',
  ]);
  assert.deepEqual(rows[0], {
    arm: 'baseline', startup: 'AgroLink PH', condition: 'truth', rep: 0,
    dimension: 'Investment', klass: 'asserted', text: 'The venture has drafted a funding plan.',
  });
});

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
  const s = H.summarizeResults(results);
  const row = s.metric6.find((r) => r.arm === 'baseline' && r.condition === 'deflated');
  assert.equal(row.redundantN, 2, 'both written dimensions are observations');
  assert.equal(row.redundantRate, 0.5, 'one of the two is redundant');
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
  const s = H.summarizeResults(results);
  const row = s.metric6.find((r) => r.arm === 'baseline' && r.condition === 'deflated');
  assert.equal(row.redundantN, 1);
});

test('metric 6 reports null rather than 0 when no dimensions were observed', () => {
  const s = H.summarizeResults({});
  const row = s.metric6.find((r) => r.arm === 'baseline' && r.condition === 'truth');
  assert.equal(row.redundantN, 0);
  assert.equal(row.redundantRate, null);
  assert.equal(row.deniedCount, 0);
});

test('flaggedClauses labels the inflated condition and the rep index', () => {
  const rows = H.flaggedClauses({
    baseline: {
      startups: {
        'AgroLink PH': {
          assertionTruthCalls: [],
          assertionInflatedCalls: [
            { byDim: { Investment: 'No funding plan exists.' } },
            { byDim: { Investment: 'A funding plan is in place.' } },
          ],
        },
      },
    },
  });
  assert.deepEqual(rows.map((r) => [r.condition, r.rep, r.klass]), [
    ['inflated', 0, 'negated'],
    ['inflated', 1, 'asserted'],
  ]);
});
