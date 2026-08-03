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
  // only the second, but one cell is the smallest unit the loop runs.
  assert.equal(prompts.length, 2, `expected 2 calls for one cell, got ${prompts.length}`);
  assert.deepEqual(Object.keys(results['deviation-deterministic'].startups), ['MediSync Cebu']);
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
