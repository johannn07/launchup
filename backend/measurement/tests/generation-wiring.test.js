const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const HARNESS = path.resolve(__dirname, '../measure-grounding.js');
const { runGenerationArms, ARMS } = require(HARNESS);

// --------------------------------------------------------------------------
// selectCells and withRetry are only worth having if the run loop actually
// uses them. A filter that computes the right subset and then runs all 12
// cells anyway, or a retry helper nothing calls, would leave every test in
// cell-selection.test.js / retry.test.js green while the harness still burns
// a full rep to refill one cell. These tests pin the wiring itself.
//
// No model is needed: deterministic rubric retrieval is an exact key lookup
// (measure-grounding.js retrieveRubricsForArm), so `ai` is never touched on
// this path — and the fake below fails loudly if that ever stops being true.
// --------------------------------------------------------------------------

const DEVIATION = ARMS.filter((a) => a.name === 'deviation-deterministic');

const aiThatMustNotBeUsed = {
  models: {
    embedContent: () => {
      throw new Error('embedContent must not be called on the deterministic path');
    },
  },
};

const okResponse = { ms: 1, text: '[]', total: 0 };

test('a filtered run generates only for the selected cell', async () => {
  const prompts = [];
  const results = await runGenerationArms(aiThatMustNotBeUsed, null, {
    arms: DEVIATION,
    startupNames: ['MediSync Cebu'],
    reps: 1,
    report: false,
    pacingMs: 0,
    callFn: async (_ai, prompt) => {
      prompts.push(prompt);
      return okResponse;
    },
  });

  // 2 calls: the RNA probe and the levels probe. The 2026-08-03 refill needed
  // only the second; --only-probe now makes that reachable (see below).
  assert.equal(prompts.length, 2, `expected 2 calls for one cell, got ${prompts.length}`);
  assert.deepEqual(Object.keys(results['deviation-deterministic'].startups), ['MediSync Cebu']);
});

test('--only-probe suppresses the call, it does not merely filter the report', async () => {
  // The whole point is spending fewer requests against a 20/day cap. A probes
  // option that still issued both calls and dropped one afterwards would leave
  // every reporting test green while buying nothing.
  const prompts = [];
  const results = await runGenerationArms(aiThatMustNotBeUsed, null, {
    arms: DEVIATION,
    startupNames: ['MediSync Cebu'],
    reps: 1,
    report: false,
    pacingMs: 0,
    probes: ['levels'],
    callFn: async (_ai, prompt) => {
      prompts.push(prompt);
      return okResponse;
    },
  });

  assert.equal(prompts.length, 1, `levels-only must cost 1 call, got ${prompts.length}`);
  const cell = results['deviation-deterministic'].startups['MediSync Cebu'];
  assert.equal(cell.rnaCalls.length, 0, 'the RNA probe must not have run');
  assert.equal(cell.levelCalls.length, 1, 'the levels probe must still have run');
});

test('probes defaults to both, so an unfiltered run is unchanged', async () => {
  const prompts = [];
  await runGenerationArms(aiThatMustNotBeUsed, null, {
    arms: DEVIATION,
    startupNames: ['MediSync Cebu'],
    reps: 1,
    report: false,
    pacingMs: 0,
    callFn: async (_ai, prompt) => {
      prompts.push(prompt);
      return okResponse;
    },
  });

  assert.equal(prompts.length, 2, 'omitting probes must not change existing behaviour');
});

test('unselected arms still get a results entry, so reports and merge stay well-formed', () => {
  return runGenerationArms(aiThatMustNotBeUsed, null, {
    arms: DEVIATION,
    startupNames: ['MediSync Cebu'],
    reps: 1,
    report: false,
    pacingMs: 0,
    callFn: async () => okResponse,
  }).then((results) => {
    for (const arm of ARMS) {
      assert.ok(results[arm.name], `${arm.name} must be present even when not selected`);
    }
    // Present but empty - an absent arm and an arm that produced nothing must
    // stay distinguishable downstream.
    assert.deepEqual(Object.keys(results.baseline.startups), []);
    assert.deepEqual(Object.keys(results['sdd-semantic'].startups), []);
  });
});

test('an unfiltered run still covers every arm and startup', async () => {
  let calls = 0;
  const results = await runGenerationArms(aiThatMustNotBeUsed, null, {
    // Only the deterministic arm avoids the embedding path, so restrict arms
    // but leave startups defaulted - that is the part under test here.
    arms: DEVIATION,
    reps: 1,
    report: false,
    pacingMs: 0,
    callFn: async () => {
      calls++;
      return okResponse;
    },
  });
  assert.equal(calls, 4, 'one arm x two startups x two probes');
  assert.deepEqual(Object.keys(results['deviation-deterministic'].startups).sort(), [
    'AgroLink PH',
    'MediSync Cebu',
  ]);
});

test('a 503 during generation is retried instead of losing the cell', async () => {
  let n = 0;
  const results = await runGenerationArms(aiThatMustNotBeUsed, null, {
    arms: DEVIATION,
    startupNames: ['MediSync Cebu'],
    reps: 1,
    report: false,
    pacingMs: 0,
    retry: { attempts: 3, delayMs: 1, sleep: async () => {} },
    callFn: async () => {
      n++;
      if (n === 1) throw new Error('got status: 503 Service Unavailable');
      return okResponse;
    },
  });

  // 1 failed RNA attempt + 1 successful retry + 1 levels call.
  assert.equal(n, 3, `expected the 503 to be retried, got ${n} calls`);
  const cell = results['deviation-deterministic'].startups['MediSync Cebu'];
  assert.equal(cell.rnaCalls.length, 1, 'the retried RNA call must be recorded');
  assert.equal(cell.levelCalls.length, 1, 'and the run must continue to the levels probe');
  assert.equal(results['deviation-deterministic'].quotaHit, false);
});

test('a 429 during generation still stops the run without retrying', async () => {
  let n = 0;
  const results = await runGenerationArms(aiThatMustNotBeUsed, null, {
    arms: DEVIATION,
    startupNames: ['MediSync Cebu'],
    reps: 1,
    report: false,
    pacingMs: 0,
    retry: { attempts: 3, delayMs: 1, sleep: async () => {} },
    callFn: async () => {
      n++;
      throw new Error('got status: 429 Too Many Requests');
    },
  });

  assert.equal(n, 1, 'a quota error must cost exactly one call, not three');
  assert.equal(results['deviation-deterministic'].quotaHit, true);
});

// --------------------------------------------------------------------------
// The --doc-variant axis. A flag that selected variants and then generated from
// the original document would leave every test in doc-variant-arg.test.js green
// while the run measured nothing — and it would cost a quota day to find out.
// These pin that the variant reaches the prompt, lands in its own pool, and
// stays out of the pools metrics 1-2 read.
// --------------------------------------------------------------------------

const V = require(path.resolve(__dirname, '../lib/doc-variants.js'));

const rnaOnly = {
  arms: DEVIATION,
  startupNames: ['MediSync Cebu'],
  reps: 1,
  report: false,
  pacingMs: 0,
  probes: ['rna'],
};

test('the default run is original-only and populates no variant pool', async () => {
  const prompts = [];
  const results = await runGenerationArms(aiThatMustNotBeUsed, null, {
    ...rnaOnly,
    callFn: async (_ai, prompt) => { prompts.push(prompt); return okResponse; },
  });
  assert.equal(prompts.length, 1, 'one call: one arm, one startup, one rep, truth, original');
  assert.ok(prompts[0].includes(V.ORIGINAL_DOCS['MediSync Cebu']), 'the original document must reach the prompt');
  const cell = results['deviation-deterministic'].startups['MediSync Cebu'];
  assert.deepEqual(cell.unlabelledTruthCalls, [], 'no variant was requested, so no variant pool may fill');
});

test('an unlabelled run sends the unlabelled document, not the original', async () => {
  const prompts = [];
  await runGenerationArms(aiThatMustNotBeUsed, null, {
    ...rnaOnly,
    docVariants: ['unlabelled'],
    callFn: async (_ai, prompt) => { prompts.push(prompt); return okResponse; },
  });
  assert.equal(prompts.length, 1);
  assert.ok(
    prompts[0].includes(V.DOC_VARIANTS['MediSync Cebu'].unlabelled),
    'the unlabelled variant must reach the prompt verbatim',
  );
  assert.ok(
    !prompts[0].includes('Target Market: The 44 rural health units'),
    'the deleted field label must not survive into the prompt',
  );
  assert.ok(
    prompts[0].includes('The 44 rural health units in Cebu province'),
    'the evidence phrase itself must survive — this is a salience manipulation, not a deletion',
  );
});

test('both variants run as separate calls and land in separate pools', async () => {
  const prompts = [];
  const results = await runGenerationArms(aiThatMustNotBeUsed, null, {
    ...rnaOnly,
    docVariants: ['original', 'unlabelled'],
    callFn: async (_ai, prompt) => {
      prompts.push(prompt);
      return { ...okResponse, text: JSON.stringify([{ readiness_level_type: 'Technology', rna: 'x' }]) };
    },
  });
  assert.equal(prompts.length, 2, 'one call per variant — the axis multiplies the call count');
  const cell = results['deviation-deterministic'].startups['MediSync Cebu'];
  assert.equal(cell.assertionTruthCalls.length, 1, 'original goes to the existing pool');
  assert.equal(cell.unlabelledTruthCalls.length, 1, 'unlabelled goes to its own');
});

// Metrics 1-2 score level placement and stage-appropriateness against the
// document-derived reference, which is derived from the ORIGINAL document. A
// manipulated call reaching rnaCalls would silently corrupt both.
test('rnaCalls, which metrics 1-2 read, receives only the original variant', async () => {
  const results = await runGenerationArms(aiThatMustNotBeUsed, null, {
    ...rnaOnly,
    docVariants: ['original', 'unlabelled'],
    callFn: async () => ({ ...okResponse, text: JSON.stringify([{ readiness_level_type: 'Technology', rna: 'x' }]) }),
  });
  const cell = results['deviation-deterministic'].startups['MediSync Cebu'];
  assert.equal(cell.rnaCalls.length, 1, 'exactly one of the two calls may reach the metric 1-2 pool');
});

test('the levels probe always reads the original document', async () => {
  const prompts = [];
  await runGenerationArms(aiThatMustNotBeUsed, null, {
    arms: DEVIATION,
    startupNames: ['MediSync Cebu'],
    reps: 1,
    report: false,
    pacingMs: 0,
    probes: ['levels'],
    docVariants: ['unlabelled'],
    callFn: async (_ai, prompt) => { prompts.push(prompt); return okResponse; },
  });
  assert.equal(prompts.length, 1, 'the axis must not multiply the levels probe');
  assert.ok(
    prompts[0].includes(V.ORIGINAL_DOCS['MediSync Cebu']),
    'metric 1 scores against a reference derived from the original document, so the levels probe must read it',
  );
});
