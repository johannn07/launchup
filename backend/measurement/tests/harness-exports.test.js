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
  assert.equal(m.ARMS.length, 5);
});

test('exposes the pure helpers', () => {
  const m = require(HARNESS);
  for (const name of ['rubricKey', 'renderRubricBlock', 'rnaPrompt', 'levelsPrompt',
                      'hallucinationPrompt', 'extractJsonPayload', 'isAbsentAnswer', 'mean']) {
    assert.equal(typeof m[name], 'function', `${name} should be exported`);
  }
  assert.equal(m.rubricKey('Technology', 2), 'trl-2');
});

/**
 * Reads the app seeder's own source rather than restating its numbers. A third
 * copy of the levels is what let the harness and the app disagree unnoticed;
 * this fails if either side moves without the other.
 */
test('harness ground-truth levels match src/demo-readiness-levels.ts', () => {
  const fs = require('fs');
  const { STARTUPS } = require(HARNESS);
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../src/demo-readiness-levels.ts'), 'utf8',
  );
  const ABBREV = { T: 'Technology', M: 'Market', A: 'Acceptance', O: 'Organizational', R: 'Regulatory', I: 'Investment' };

  for (const name of Object.keys(STARTUPS)) {
    // Terminator is the outer close at two-space indent — a plain `],` stops at
    // the first tuple and yields one level, not six.
    const block = src.match(new RegExp(`'${name}':\\s*\\[([\\s\\S]*?)\\r?\\n  \\],`));
    assert.ok(block, `no levels block for ${name} in demo-readiness-levels.ts`);

    const parsed = {};
    for (const [, abbrev, level] of block[1].matchAll(/ReadinessType\.(\w+),\s*(\d+)/g)) {
      parsed[ABBREV[abbrev]] = Number(level);
    }
    // A regex that silently matched nothing must not pass vacuously.
    assert.equal(Object.keys(parsed).length, 6, `parsed ${Object.keys(parsed).length} levels for ${name}, expected 6`);
    assert.deepEqual(STARTUPS[name].levels, parsed, `${name}: harness disagrees with the app seeder`);
  }
});
