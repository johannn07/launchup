const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const H = require(path.resolve(__dirname, '../measure-grounding.js'));

const LEVELS = { Technology: 2, Market: 2, Acceptance: 1, Organizational: 2, Regulatory: 1, Investment: 1 };

// Confound 1: production's createBasePrompt (ai.service.ts:937-943) emits this
// block for EVERY arm and only the rubric block varies with ragCorpus. The
// harness emitted it for none, so it compared "told its levels" against "not
// told" - a contrast production never presents.
test('readinessLevelBlock uses production abbreviations in production order', () => {
  const block = H.readinessLevelBlock(LEVELS);
  assert.match(block, /Initial Readiness Level:/);
  assert.match(block, /TRL 2/);
  assert.match(block, /MRL 2/);
  assert.match(block, /ARL 1/);
  assert.match(block, /ORL 2/);
  assert.match(block, /RRL 1/);
  assert.match(block, /IRL 1/);
  assert.ok(
    block.indexOf('TRL') < block.indexOf('MRL') &&
    block.indexOf('MRL') < block.indexOf('ARL') &&
    block.indexOf('ARL') < block.indexOf('ORL') &&
    block.indexOf('ORL') < block.indexOf('RRL') &&
    block.indexOf('RRL') < block.indexOf('IRL'),
    'order must match ai.service.ts',
  );
});

test('rnaPrompt includes the levels block even with no rubric (baseline arm)', () => {
  const p = H.rnaPrompt('DOC', '', LEVELS);
  assert.match(p, /Initial Readiness Level:/);
  assert.match(p, /TRL 2/);
});

test('rnaPrompt includes the levels block with a rubric too (corpus arm)', () => {
  const p = H.rnaPrompt('DOC', '\n--- Verified Readiness Rubrics (authoritative) ---\nX\n', LEVELS);
  assert.match(p, /Initial Readiness Level:/);
  assert.match(p, /Verified Readiness Rubrics/);
});

// Confound 2: deterministic retrieval keys on (type, level) using the startup's
// ACTUAL level, so the levels probe was asking that arm to predict what it had
// been handed.
test('levelsPrompt never contains the levels block', () => {
  const p = H.levelsPrompt('DOC', '');
  assert.ok(!/Initial Readiness Level:/.test(p), 'the levels probe must not leak the answer');
});

test('fullLadderRubrics returns every level of every dimension', () => {
  const ladder = H.fullLadderRubrics();
  assert.equal(ladder.length, 54);
  for (const dim of H.DIMENSIONS) {
    const levels = ladder.filter((r) => r.readinessType === dim).map((r) => r.level).sort((a, b) => a - b);
    assert.deepEqual(levels, [1, 2, 3, 4, 5, 6, 7, 8, 9], `${dim} needs all nine rungs`);
  }
});

test('fullLadderRubrics is grouped by dimension and ascending within it', () => {
  const ladder = H.fullLadderRubrics();
  const tech = ladder.filter((r) => r.readinessType === 'Technology');
  const firstIdx = ladder.indexOf(tech[0]);
  assert.deepEqual(
    ladder.slice(firstIdx, firstIdx + 9).map((r) => r.level),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test('the ladder does not single out the startup current level', () => {
  // If it did, the levels probe would be leaking again by another route.
  const ladder = H.fullLadderRubrics();
  const keys = ladder.map((r) => r.key);
  assert.ok(keys.includes('trl-1') && keys.includes('trl-9'),
    'the whole ladder must be present, not a window around the true level');
});
