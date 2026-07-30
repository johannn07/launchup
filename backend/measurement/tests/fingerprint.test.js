const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { fingerprintMap } = require(path.resolve(__dirname, '../lib/fingerprint.js'));

const base = {
  common: { grounding: 'G', dimensions: ['Technology'], startups: { A: { levels: { Technology: 2 } } } },
  markers: [{ phrase: 'ipo', minLevel: 9, dimensions: null }],
  rubrics: [
    { key: 'trl-1', readinessType: 'Technology', level: 1, title: 'TRL 1', content: 'C1', keyTerms: ['a'] },
    { key: 'trl-2', readinessType: 'Technology', level: 2, title: 'TRL 2', content: 'C2', keyTerms: ['b'] },
  ],
  sources: {
    rna: 'function rnaPrompt(){}',
    levels: 'function levelsPrompt(){}',
    fabrication: 'function h(){}',
    readinessLevelBlock: 'function readinessLevelBlock(){}',
    renderRubricBlock: 'function renderRubricBlock(){}',
    fullLadderRubrics: 'function fullLadderRubrics(){}',
  },
  arms: [
    { name: 'baseline', ragCorpus: false, rubricMode: null },
    { name: 'deviation-deterministic', ragCorpus: true, rubricMode: 'deterministic' },
  ],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

test('produces one fingerprint per (metric, arm)', () => {
  const fp = fingerprintMap(base);
  assert.deepEqual(Object.keys(fp).sort(), [
    'fabrication|baseline', 'fabrication|deviation-deterministic',
    'levels|baseline', 'levels|deviation-deterministic',
    'rna|baseline', 'rna|deviation-deterministic',
  ]);
});

test('is stable across identical inputs', () => {
  assert.deepEqual(fingerprintMap(base), fingerprintMap(clone(base)));
});

test('a prompt-source change moves only that metric', () => {
  const changed = clone(base);
  changed.sources.rna = 'function rnaPrompt(){/*v2*/}';
  const a = fingerprintMap(base);
  const b = fingerprintMap(changed);
  assert.notEqual(a['rna|baseline'], b['rna|baseline']);
  assert.equal(a['levels|baseline'], b['levels|baseline'], 'metric 3 data must survive an RNA-prompt change');
});

test('a lexicon change moves the rna metric only', () => {
  const changed = clone(base);
  changed.markers.push({ phrase: 'franchise', minLevel: 8, dimensions: null });
  const a = fingerprintMap(base);
  const b = fingerprintMap(changed);
  assert.notEqual(a['rna|baseline'], b['rna|baseline']);
  assert.equal(a['levels|baseline'], b['levels|baseline']);
});

// This is the case that makes per-ARM granularity necessary: the ladder change
// alters the levels prompt for a corpus arm and leaves baseline untouched.
test('a rubric-scope change moves only the arms it applies to', () => {
  const changed = clone(base);
  changed.levelsRubricScope = 'full-ladder';
  const a = fingerprintMap({ ...base, levelsRubricScope: 'current-and-next' });
  const b = fingerprintMap(changed);
  assert.equal(a['levels|baseline'], b['levels|baseline'], 'baseline gets no rubric either way');
  assert.notEqual(a['levels|deviation-deterministic'], b['levels|deviation-deterministic']);
});

// --------------------------------------------------------------------------
// Finding 1 coverage: helpers called FROM INSIDE a prompt builder are not
// present in that builder's own .toString(), so each must be hashed
// explicitly. These tests mutate exactly one such input at a time and assert
// the fingerprint actually moves - a hash that doesn't change under a real
// change to what it's supposed to cover is a decorative guard, not a real one.
// --------------------------------------------------------------------------

test('a readinessLevelBlock source change moves the rna fingerprint for every arm, not the levels fingerprint', () => {
  // readinessLevelBlock is called from inside rnaPrompt only (every arm gets
  // the levels block per confound 1's fix); levelsPrompt never calls it.
  const changed = clone(base);
  changed.sources.readinessLevelBlock = 'function readinessLevelBlock(){/*confound-1 revert*/}';
  const a = fingerprintMap(base);
  const b = fingerprintMap(changed);
  assert.notEqual(a['rna|baseline'], b['rna|baseline']);
  assert.notEqual(a['rna|deviation-deterministic'], b['rna|deviation-deterministic']);
  assert.equal(a['levels|baseline'], b['levels|baseline'], 'the levels probe never calls readinessLevelBlock');
  assert.equal(a['levels|deviation-deterministic'], b['levels|deviation-deterministic']);
});

test('a renderRubricBlock source change moves both the levels and the rna fingerprint', () => {
  // renderRubricBlock renders both the RNA rubric block and the levels rubric
  // block, so a change to it must invalidate both metrics.
  const changed = clone(base);
  changed.sources.renderRubricBlock = 'function renderRubricBlock(){/*v2*/}';
  const a = fingerprintMap(base);
  const b = fingerprintMap(changed);
  assert.notEqual(a['levels|baseline'], b['levels|baseline']);
  assert.notEqual(a['levels|deviation-deterministic'], b['levels|deviation-deterministic']);
  assert.notEqual(a['rna|baseline'], b['rna|baseline']);
  assert.notEqual(a['rna|deviation-deterministic'], b['rna|deviation-deterministic']);
});

test('a fullLadderRubrics source change moves only the levels fingerprint', () => {
  // fullLadderRubrics only feeds the levels probe's rubric block (confound 2's
  // fix); the RNA probe keeps the (current, current+1) lookup and never calls it.
  const changed = clone(base);
  changed.sources.fullLadderRubrics = 'function fullLadderRubrics(){/*v2*/}';
  const a = fingerprintMap(base);
  const b = fingerprintMap(changed);
  assert.notEqual(a['levels|baseline'], b['levels|baseline']);
  assert.notEqual(a['levels|deviation-deterministic'], b['levels|deviation-deterministic']);
  assert.equal(a['rna|baseline'], b['rna|baseline']);
  assert.equal(a['rna|deviation-deterministic'], b['rna|deviation-deterministic']);
});

test('editing a corpus row\'s content moves levels and rna for a corpus arm, and never touches baseline', () => {
  // The case the finding names directly: editing a RUBRICS row's title/content
  // changes what a corpus arm's prompt says while corpusRows (the row COUNT,
  // checked separately by mergeRuns' envKey) stays identical.
  const changed = clone(base);
  changed.rubrics[0].content = 'C1 edited';
  const a = fingerprintMap(base);
  const b = fingerprintMap(changed);
  assert.equal(a['levels|baseline'], b['levels|baseline'], 'baseline never receives corpus text');
  assert.equal(a['rna|baseline'], b['rna|baseline']);
  assert.notEqual(a['levels|deviation-deterministic'], b['levels|deviation-deterministic']);
  assert.notEqual(a['rna|deviation-deterministic'], b['rna|deviation-deterministic']);
});

test('editing a corpus row\'s keyTerms moves the fingerprint even though the row count is unchanged', () => {
  const changed = clone(base);
  changed.rubrics[0].keyTerms = ['a', 'a whole new term'];
  assert.equal(changed.rubrics.length, base.rubrics.length, 'row count is unchanged - only content differs');
  const a = fingerprintMap(base);
  const b = fingerprintMap(changed);
  assert.notEqual(a['levels|deviation-deterministic'], b['levels|deviation-deterministic']);
  assert.notEqual(a['rna|deviation-deterministic'], b['rna|deviation-deterministic']);
});
