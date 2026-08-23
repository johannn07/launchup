const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  selectLevelConditions, inflatedLevels, deflatedLevels, INFLATED_OVERRIDE, DEFLATED_OVERRIDE, STARTUPS, validateArgs,
  runGenerationArms, ARMS, buildRnaCell, levelsForCondition, conditionField,
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

// 3, not 4: deterministic retrieval pulls (L, L+1), so 3 injects the rows that
// actually name the artifacts — ORL 3's non-founder contributor, RRL 3's
// preliminary opinion, IRL 3's drafted funding plan. At 4 those rows sit in
// neither condition and the manipulation never presents the observed instance.
test('inflation raises exactly O, R and I to 3', () => {
  const out = inflatedLevels(STARTUPS['MediSync Cebu'].levels);
  assert.equal(out.Organizational, 3);
  assert.equal(out.Regulatory, 3);
  assert.equal(out.Investment, 3);
});

test('the inflated condition retrieves the rubric rows the probe is about', async () => {
  const startup = STARTUPS['AgroLink PH'];
  const built = await buildRnaCell(
    null, ARMS.find((a) => a.name === 'deviation-deterministic'), startup,
    inflatedLevels(startup.levels), null, {},
  );
  assert.match(built.rnaBlock, /funding plan/, 'IRL 3 is the source of the observed fabrication');
  assert.match(built.rnaBlock, /non-founder contributor/);
  assert.match(built.rnaBlock, /preliminary opinion/);
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
  assert.match(r.prompts[1], /IRL 3/);
  assert.match(r.prompts[1], /ORL 3/);
  assert.match(r.prompts[1], /RRL 3/);
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

// Regression for the silently degraded probe: truth-condition retrieval used to
// be collected inside the condition loop, so an inflated-only run left the
// ladder empty and the levels probe ran rubric-less on a corpus arm — under an
// unchanged `levels|*` fingerprint, so the degraded calls would have pooled.
test('an inflated-only run still gives a corpus arm its levels rubric block', async () => {
  const r = recorder();
  await runGenerationArms(null, null, {
    ...OPTS,
    arms: [ARMS.find((a) => a.name === 'deviation-deterministic')],
    probes: ['levels'],
    conditions: ['inflated'],
    callFn: r.callFn,
  });
  assert.equal(r.prompts.length, 1);
  assert.match(r.prompts[0], /Verified Readiness Rubrics \(authoritative\)/);
});

test('the fabrication probe gets the truth rubric block under an inflated-only run', async () => {
  const r = recorder();
  const results = await runGenerationArms(null, null, {
    ...OPTS,
    arms: [ARMS.find((a) => a.name === 'deviation-deterministic')],
    probes: [],
    conditions: ['inflated'],
    withFabrication: true,
    callFn: r.callFn,
  });
  assert.equal(results['deviation-deterministic'].startups['AgroLink PH'].retrieved.length, 12);
  assert.match(r.prompts[0], /Verified Readiness Rubrics \(authoritative\)/);
});

test('levelsForCondition rejects an unknown condition instead of silently returning truth', () => {
  const startup = { levels: { Technology: 6, Market: 5, Acceptance: 5, Organizational: 2, Regulatory: 1, Investment: 1 } };
  assert.throws(() => levelsForCondition(startup, 'nonsense'), /unknown condition/i);
});

test('conditionField rejects an unknown condition instead of silently returning the inflated pool', () => {
  assert.throws(() => conditionField('nonsense'), /unknown condition/i);
});

test('the known conditions still map exactly as before', () => {
  const startup = { levels: { Technology: 6, Market: 5, Acceptance: 5, Organizational: 2, Regulatory: 1, Investment: 1 } };
  assert.deepEqual(levelsForCondition(startup, 'truth'), startup.levels);
  assert.equal(levelsForCondition(startup, 'inflated').Organizational, 3);
  assert.equal(levelsForCondition(startup, 'inflated').Technology, 6);
  assert.equal(conditionField('truth'), 'assertionTruthCalls');
  assert.equal(conditionField('inflated'), 'assertionInflatedCalls');
});

const LEVELS = { Technology: 6, Market: 5, Acceptance: 5, Organizational: 2, Regulatory: 1, Investment: 1 };

test('deflated pushes T/M/A to 1 and leaves O/R/I at truth as the within-call control', () => {
  const out = deflatedLevels(LEVELS);
  assert.deepEqual(
    { Technology: out.Technology, Market: out.Market, Acceptance: out.Acceptance },
    { Technology: 1, Market: 1, Acceptance: 1 },
  );
  assert.deepEqual(
    { Organizational: out.Organizational, Regulatory: out.Regulatory, Investment: out.Investment },
    { Organizational: 2, Regulatory: 1, Investment: 1 },
  );
});

test('deflatedLevels returns a new object — STARTUPS.levels is hashed into every fingerprint', () => {
  const before = { ...LEVELS };
  deflatedLevels(LEVELS);
  assert.deepEqual(LEVELS, before);
});

test('deflated is disjoint from inflated, so no dimension is manipulated in both', () => {
  const overlap = Object.keys(DEFLATED_OVERRIDE).filter((k) => k in INFLATED_OVERRIDE);
  assert.deepEqual(overlap, []);
});

test('both keeps its pre-2026-08-23 meaning and is NOT widened', () => {
  assert.deepEqual(selectLevelConditions('both').conditions, ['truth', 'inflated']);
});

test('all selects three', () => {
  assert.deepEqual(selectLevelConditions('all').conditions, ['truth', 'inflated', 'deflated']);
});

test('a comma list selects exactly what it names, in canonical order', () => {
  assert.deepEqual(selectLevelConditions('deflated,truth').conditions, ['truth', 'deflated']);
});

test('an unrecognised entry hard-errors rather than being dropped', () => {
  const { conditions, errors } = selectLevelConditions('truth,inflted');
  assert.deepEqual(conditions, []);
  assert.match(errors[0], /"inflted"/);
});

test('no filter still defaults to truth alone', () => {
  assert.deepEqual(selectLevelConditions(null).conditions, ['truth']);
});
