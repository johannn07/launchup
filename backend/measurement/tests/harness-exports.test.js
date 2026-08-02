const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const HARNESS = path.resolve(__dirname, '../measure-grounding.js');

test('requiring the harness does not execute it', () => {
  // If the IIFE still runs on require, this throws or hangs on a network call.
  const m = require(HARNESS);
  // Assert a real export surface, not merely truthiness: `module.exports` is
  // {} by default, so `assert.ok(m)` would pass on an unmodified file and this
  // test would be vacuous.
  assert.ok(Object.keys(m).length > 0, 'the harness must export its helpers');
});

test('exposes the constants later tasks depend on', () => {
  const m = require(HARNESS);
  assert.deepEqual(m.DIMENSIONS, [
    'Technology', 'Market', 'Acceptance', 'Organizational', 'Regulatory', 'Investment',
  ]);
  assert.equal(m.MAX_READINESS_LEVEL, 9);
  assert.equal(m.GEN_MODEL, 'gemini-3.6-flash');
  assert.equal(m.RUBRICS.length, 54);
  assert.equal(Object.keys(m.STARTUPS).length, 2);
  assert.equal(m.ARMS.length, 3);
});

test('exposes the pure helpers', () => {
  const m = require(HARNESS);
  for (const name of ['rubricKey', 'renderRubricBlock', 'rnaPrompt', 'levelsPrompt',
                      'hallucinationPrompt', 'extractJsonPayload', 'isAbsentAnswer', 'mean']) {
    assert.equal(typeof m[name], 'function', `${name} should be exported`);
  }
  assert.equal(m.rubricKey('Technology', 2), 'trl-2');
});

test('seeded ground-truth levels match main.ts seedDemoStartups', () => {
  const { STARTUPS } = require(HARNESS);
  assert.deepEqual(STARTUPS['AgroLink PH'].levels,
    { Technology: 2, Market: 2, Acceptance: 1, Organizational: 2, Regulatory: 1, Investment: 1 });
  assert.deepEqual(STARTUPS['MediSync Cebu'].levels,
    { Technology: 5, Market: 4, Acceptance: 3, Organizational: 4, Regulatory: 3, Investment: 3 });
});
