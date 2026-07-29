const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { fingerprintMap } = require(path.resolve(__dirname, '../lib/fingerprint.js'));

const base = {
  common: { grounding: 'G', dimensions: ['Technology'], startups: { A: { levels: { Technology: 2 } } } },
  markers: [{ phrase: 'ipo', minLevel: 9, dimensions: null }],
  sources: { rna: 'function rnaPrompt(){}', levels: 'function levelsPrompt(){}', fabrication: 'function h(){}' },
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
