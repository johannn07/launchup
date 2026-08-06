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

const { runGenerationArms, ARMS } = require(path.resolve(__dirname, '../measure-grounding.js'));

const ONE_ARM = [ARMS.find((a) => a.name === 'baseline')];
const RNA_JSON = JSON.stringify([
  { readiness_level_type: 'Investment', rna: 'The venture has drafted a funding plan (IRL 3).' },
]);

function recorder() {
  const prompts = [];
  return {
    prompts,
    callFn: async (_ai, prompt) => {
      prompts.push(prompt);
      return { text: RNA_JSON };
    },
  };
}

const OPTS = {
  arms: ONE_ARM,
  startupNames: ['AgroLink PH'],
  probes: ['rna'],
  reps: 1,
  pacingMs: 0,
  report: false,
  retry: { attempts: 1, delayMs: 0, sleep: async () => {} },
};

// A call filtered after the fact still costs a call against a 20/day cap, so
// the assertion is that the request was never MADE.
test('truth-only suppresses the inflated call rather than discarding it', async () => {
  const r = recorder();
  await runGenerationArms(null, null, { ...OPTS, conditions: ['truth'], callFn: r.callFn });
  assert.equal(r.prompts.length, 1, 'exactly one model call');
  assert.match(r.prompts[0], /IRL 1/, 'the truth condition supplies AgroLink IRL 1');
});

test('both conditions issue exactly one call each, with different supplied levels', async () => {
  const r = recorder();
  await runGenerationArms(null, null, { ...OPTS, conditions: ['truth', 'inflated'], callFn: r.callFn });
  assert.equal(r.prompts.length, 2, 'one call per condition, never two per condition');
  assert.match(r.prompts[0], /IRL 1/);
  assert.match(r.prompts[1], /IRL 4/);
  assert.match(r.prompts[1], /ORL 4/);
  assert.match(r.prompts[1], /RRL 4/);
});

test('the inflated prompt leaves Technology at truth', async () => {
  const r = recorder();
  await runGenerationArms(null, null, { ...OPTS, conditions: ['inflated'], callFn: r.callFn });
  assert.match(r.prompts[0], /TRL 2/, 'AgroLink Technology is 2 and must not move');
});

test('each condition lands in its own storage field', async () => {
  const r = recorder();
  const results = await runGenerationArms(null, null, {
    ...OPTS, conditions: ['truth', 'inflated'], callFn: r.callFn,
  });
  const cell = results.baseline.startups['AgroLink PH'];
  assert.equal(cell.assertionTruthCalls.length, 1);
  assert.equal(cell.assertionInflatedCalls.length, 1);
  assert.equal(cell.rnaCalls.length, 1, 'only the truth condition feeds metrics 1-2');
});

// The levels probe's prompt contains no supplied levels at all, so running it
// once per condition would spend a second call for a byte-identical request.
test('the levels probe runs once regardless of how many conditions are selected', async () => {
  const r = recorder();
  await runGenerationArms(null, null, {
    ...OPTS, probes: ['levels'], conditions: ['truth', 'inflated'], callFn: r.callFn,
  });
  assert.equal(r.prompts.length, 1);
});

// A silently degraded probe that looks like a real arm is the failure mode
// this harness exists to prevent — and it would spend quota to produce it.
test('--with-fabrication-probe rejects an inflated-only condition', () => {
  const errs = validateArgs(['--with-fabrication-probe', '--level-condition=inflated'], []);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /truth condition/i);
});

test('--with-fabrication-probe accepts both conditions', () => {
  assert.deepEqual(validateArgs(['--with-fabrication-probe', '--level-condition=both'], []), []);
});

test('--with-fabrication-probe accepts the default condition', () => {
  assert.deepEqual(validateArgs(['--with-fabrication-probe'], []), []);
});
