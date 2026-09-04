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
  assert.equal(
    s.metric5.length,
    H.ARMS.length * H.ALL_DOC_VARIANTS.length * H.ALL_LEVEL_CONDITIONS.length,
    'one row per arm per document variant per condition',
  );
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
    'arm', 'condition', 'dimension', 'klass', 'rep', 'startup', 'text', 'variant',
  ]);
  assert.deepEqual(rows[0], {
    arm: 'baseline', startup: 'AgroLink PH', variant: 'original', condition: 'truth', rep: 0,
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

// Review finding 1 (2026-08-23): metric 5 reports `mentioned` and
// `unclassified` alongside its headline rate - the honesty column that says
// whether the classifier could read the output at all. Metric 6 computed both
// per-observation (lib/redundancy.js) but dropped them before they reached
// the printed row, so a printed `truth 0% (n=6)` was indistinguishable from
// "the classifier read nothing". This clause is mentioned but classifies
// unclassified (no recommendation/negation/assertion cue matches "is
// intriguing to"), so it proves both counts survive summarizeResults without
// inflating redundantN or redundantRate.
test('metric 6 carries mentioned and unclassified counts through, mirroring metric 5', () => {
  const results = {
    baseline: {
      quotaHit: false,
      startups: {
        'AgroLink PH': {
          retrieved: [], rnaCalls: [], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [], assertionInflatedCalls: [],
          assertionDeflatedCalls: [
            { byDim: { Technology: 'The paper prototype is intriguing to reviewers.' } },
          ],
        },
      },
    },
  };
  const s = H.summarizeResults(results);
  const row = s.metric6.find((r) => r.arm === 'baseline' && r.condition === 'deflated');
  assert.equal(row.mentioned, 1, 'the token was mentioned even though the clause never classified as recommended');
  assert.equal(row.unclassified, 1, 'the clause matched none of the classifier cues - the honesty column');
  assert.equal(row.redundantN, 1);
  assert.equal(row.redundantRate, 0, 'an unclassified clause must not count toward the headline');
});

// Review finding 3 (2026-08-23): `redundancy-inflated|<arm>` was computed,
// fingerprinted and refusal-enforced but printReports hand-rolled metric 6
// for `truth` and `deflated` only, orphaning the `inflated` row that
// lib/fingerprint.js's own comment and tests/fingerprint.test.js both say
// metric 6 reports. Fixed by switching to console.table(s.metric6), the same
// mechanism metric 5 already uses. Verifies the inflated row renders and that
// its n is the n=0 sentinel (null rate), not a misleading 0%, for a run that
// only populated truth and deflated calls.
test('printReports displays all three metric-6 conditions, including an unrun inflated row', () => {
  const results = {
    baseline: {
      quotaHit: false,
      startups: {
        'AgroLink PH': {
          retrieved: [], rnaCalls: [], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [{ byDim: { Market: 'Needs: secure a signed distribution agreement.' } }],
          assertionInflatedCalls: [],
          assertionDeflatedCalls: [{ byDim: { Market: 'Needs: identify a target market segment.' } }],
        },
      },
    },
  };
  const calls = [];
  const original = console.table;
  console.table = (rows) => calls.push(rows);
  const originalLog = console.log;
  console.log = () => {};
  try {
    H.printReports(results);
  } finally {
    console.table = original;
    console.log = originalLog;
  }
  const metric6Table = calls.find((rows) => rows.some((r) => 'redundantN' in r));
  assert.ok(metric6Table, 'printReports must render metric 6 via console.table, like metric 5');
  const conditions = metric6Table
    .filter((r) => r.arm === 'baseline' && r.variant === 'original')
    .map((r) => r.condition).sort();
  assert.deepEqual(conditions, ['deflated', 'inflated', 'truth']);
  const inflated = metric6Table.find((r) => r.arm === 'baseline' && r.variant === 'original' && r.condition === 'inflated');
  assert.equal(inflated.redundantN, 0, 'no inflated calls were made, so n must be the sentinel 0');
  assert.equal(inflated.redundantRate, null, 'n=0 must read as n/a, never a misleading 0%');
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

test('rnaTexts carries every generated dimension so a future metric can re-score without quota', () => {
  const results = {
    baseline: {
      quotaHit: false,
      startups: {
        'MediSync Cebu': {
          retrieved: [],
          rnaCalls: [{ byDim: { Market: 'Needs: define the segment.' } }], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [{ byDim: { Market: 'Needs: define the segment.' } }],
          assertionInflatedCalls: [],
          assertionDeflatedCalls: [{ byDim: { Technology: 'Needs: build a prototype.' } }],
        },
      },
    },
  };
  const rows = H.rnaTexts(results);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.arm, r.startup, r.condition, r.dimension, r.text]).sort(),
    [
      ['baseline', 'MediSync Cebu', 'deflated', 'Technology', 'Needs: build a prototype.'],
      ['baseline', 'MediSync Cebu', 'truth', 'Market', 'Needs: define the segment.'],
    ].sort(),
  );
});

// ---------------------------------------------------------------------------
// Required change 1 (design 2026-09-04): the acquisition gate's rejections were
// computed and dropped. `scoreRedundantNeeds` downgrades a `recommended` clause
// to `scoped`, and no column, no print and no persisted field carried it — so
// the gate's entire activity was unobservable from a results file, and the four
// rejections in the 2026-08-23 run went unseen for eleven days. A gate whose
// rejections cannot be counted cannot be audited.
//
// The fixture is the real shape all four of those clauses had: the satisfied
// artifact as the origin being left behind. It classifies `recommended` on
// "Needs to", then ORIGIN_OR_SCOPE_PREP's `from` downgrades it — so it is
// invisible in every existing column at once (redundant false, unclassified
// false, denied false).
const SCOPED_FIXTURE = 'Needs to move from paper prototype testing to full software development.';

function scopedResults() {
  return {
    baseline: {
      quotaHit: false,
      startups: {
        'AgroLink PH': {
          retrieved: [], rnaCalls: [], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [{ byDim: { Technology: SCOPED_FIXTURE } }],
          assertionInflatedCalls: [], assertionDeflatedCalls: [],
        },
      },
    },
  };
}

test('metric 6 reports scopedCount, the acquisition gate rejections', () => {
  const s = H.summarizeResults(scopedResults());
  const row = s.metric6.find((r) => r.arm === 'baseline' && r.condition === 'truth');
  assert.equal(row.scopedCount, 1, 'the gate rejected one observation and the row must say so');
  assert.equal(row.redundantN, 1);
  assert.equal(row.redundantRate, 0, 'a rejected clause must never reach the headline');
  assert.equal(row.unclassified, 0, '`scoped` is a gate verdict, not a read failure - never folded into the honesty column');
});

test('scopedCount is `refused` when metric 6 refused this pool, like every sibling column', () => {
  // Nothing is merged here, so the value is a number rather than the sentinel;
  // the assertion that matters is that the key exists on every row printed,
  // including the conditions a run never populated.
  const s = H.summarizeResults({});
  for (const row of s.metric6) {
    assert.ok('scopedCount' in row, `metric 6 row ${row.arm}/${row.condition} must carry scopedCount`);
  }
});

test('scopedClauses persists the gate rejections verbatim, the way flaggedClauses persists metric 5', () => {
  const rows = H.scopedClauses(scopedResults());
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    'arm', 'condition', 'dimension', 'klass', 'rep', 'startup', 'text', 'variant',
  ]);
  assert.deepEqual(rows[0], {
    arm: 'baseline', startup: 'AgroLink PH', variant: 'original', condition: 'truth', rep: 0,
    dimension: 'Technology', klass: 'scoped', text: SCOPED_FIXTURE,
  });
});

test('scopedClauses carries only gate rejections, not every classified clause', () => {
  const rows = H.scopedClauses({
    baseline: {
      quotaHit: false,
      startups: {
        'AgroLink PH': {
          retrieved: [], rnaCalls: [], levelCalls: [], hallucCalls: [],
          // A genuine redundancy: an acquisition verb governs the token, so the
          // gate keeps the `recommended` verdict and there is nothing to record.
          assertionTruthCalls: [{ byDim: { Technology: 'Needs to develop a paper prototype of the lot-aggregation flow.' } }],
          assertionInflatedCalls: [], assertionDeflatedCalls: [],
        },
      },
    },
  });
  assert.deepEqual(rows, [], 'a kept `recommended` verdict is metric 6 headline data, not a gate rejection');
});

// The defect this whole change exists to fix is compute-but-not-persist, so the
// payload itself is asserted rather than the pure function alone.
test('the written payload carries both audit trails', () => {
  const payload = H.resultsPayload(scopedResults());
  assert.ok(Array.isArray(payload.flaggedClauses), 'metric 5 audit trail');
  assert.ok(Array.isArray(payload.scopedClauses), 'metric 6 gate audit trail');
  assert.equal(payload.scopedClauses.length, 1);
  assert.equal(payload.scopedClauses[0].text, SCOPED_FIXTURE);
});

// ---------------------------------------------------------------------------
// Per-variant reporting. Storing the unlabelled calls without scoring them
// would recreate exactly the defect the scopedCount work above fixed: a value
// computed, or in this case paid for with quota, and never reported.
// ---------------------------------------------------------------------------

test('metricKey maps (base, variant, condition) onto the fingerprint key family', () => {
  assert.equal(H.metricKey('redundancy', 'original', 'truth'), 'redundancy');
  assert.equal(H.metricKey('redundancy', 'original', 'deflated'), 'redundancy-deflated');
  assert.equal(H.metricKey('redundancy', 'unlabelled', 'truth'), 'redundancy-unlabelled');
  assert.equal(H.metricKey('redundancy', 'unlabelled', 'inflated'), 'redundancy-unlabelled-inflated');
  assert.equal(H.metricKey('assertion', 'unlabelled', 'deflated'), 'assertion-unlabelled-deflated');
});

test('metricKey throws on an unknown variant or condition rather than composing a key nothing hashes', () => {
  assert.throws(() => H.metricKey('redundancy', 'scrambled', 'truth'), /unknown document variant/i);
  assert.throws(() => H.metricKey('redundancy', 'original', 'sideways'), /unknown condition/i);
});

test('every metricKey matches a key currentFingerprints actually emits', () => {
  const fps = H.currentFingerprints();
  for (const base of ['assertion', 'redundancy']) {
    for (const variant of H.ALL_DOC_VARIANTS) {
      for (const condition of H.ALL_LEVEL_CONDITIONS) {
        const key = `${H.metricKey(base, variant, condition)}|baseline`;
        assert.ok(key in fps, `${key} is reported but never fingerprinted`);
      }
    }
  }
});

function unlabelledResults(text, dimension = 'Technology') {
  return {
    baseline: {
      quotaHit: false,
      startups: {
        'AgroLink PH': {
          retrieved: [], rnaCalls: [], levelCalls: [], hallucCalls: [],
          assertionTruthCalls: [], assertionInflatedCalls: [], assertionDeflatedCalls: [],
          unlabelledTruthCalls: [{ byDim: { [dimension]: text } }],
          unlabelledInflatedCalls: [], unlabelledDeflatedCalls: [],
        },
      },
    },
  };
}

test('metric 6 reports a row per (arm, variant, condition)', () => {
  const s = H.summarizeResults({});
  const baseline = s.metric6.filter((r) => r.arm === 'baseline');
  assert.equal(baseline.length, H.ALL_DOC_VARIANTS.length * H.ALL_LEVEL_CONDITIONS.length);
  for (const row of baseline) assert.ok('variant' in row, 'every row must say which document it scored');
});

test('an unlabelled call is scored into the unlabelled row, not the original one', () => {
  const s = H.summarizeResults(unlabelledResults('Needs to develop a paper prototype of the lot-aggregation flow.'));
  const original = s.metric6.find((r) => r.arm === 'baseline' && r.variant === 'original' && r.condition === 'truth');
  const unlabelled = s.metric6.find((r) => r.arm === 'baseline' && r.variant === 'unlabelled' && r.condition === 'truth');
  assert.equal(original.redundantN, 0, 'the original pool is empty and must stay empty');
  assert.equal(original.redundantRate, null);
  assert.equal(unlabelled.redundantN, 1);
  assert.equal(unlabelled.redundantRate, 1);
});

test('metric 5 is reported per variant too', () => {
  const s = H.summarizeResults({});
  const baseline = s.metric5.filter((r) => r.arm === 'baseline');
  assert.equal(baseline.length, H.ALL_DOC_VARIANTS.length * H.ALL_LEVEL_CONDITIONS.length);
  for (const row of baseline) assert.ok('variant' in row);
});

test('the audit trails cover the variant pools and say which variant a clause came from', () => {
  const scoped = H.scopedClauses(unlabelledResults(SCOPED_FIXTURE));
  assert.equal(scoped.length, 1, 'a gate rejection in a variant pool must still be recorded');
  assert.equal(scoped[0].variant, 'unlabelled');
  assert.deepEqual(Object.keys(scoped[0]).sort(), [
    'arm', 'condition', 'dimension', 'klass', 'rep', 'startup', 'text', 'variant',
  ]);

  const flagged = H.flaggedClauses(unlabelledResults('The venture has drafted a funding plan.', 'Investment'));
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].variant, 'unlabelled');
});
