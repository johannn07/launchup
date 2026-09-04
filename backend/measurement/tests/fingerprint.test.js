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

// Pinned literally. New probes may ADD keys; they may never change an existing
// one. A changed hash here means already-collected runs in measurement/results/
// have been orphaned — which is sometimes correct (the 2026-08-05 level
// correction did it deliberately) but must never happen as a side effect.
test('adding the assertion probe leaves all 15 existing fingerprints byte-identical', () => {
  const fps = require(path.resolve(__dirname, '../measure-grounding.js')).currentFingerprints();
  const EXPECTED = {
    'levels|baseline': 'f37240d520f1',
    'rna|baseline': 'c989157dd47c',
    'fabrication|baseline': '5c3658a9d8a0',
    'levels|sdd-semantic': '685aaca78813',
    'rna|sdd-semantic': 'e493360bc91d',
    'fabrication|sdd-semantic': 'ad0cadacf33b',
    'levels|deviation-deterministic': '068c08908b27',
    'rna|deviation-deterministic': '0496862854ed',
    'fabrication|deviation-deterministic': '2cea25747e77',
    'levels|deviation-titles': '0334a04515c0',
    'rna|deviation-titles': '0496862854ed',
    'fabrication|deviation-titles': '2cea25747e77',
    'levels|deviation-bare': '28a2e7c629fe',
    'rna|deviation-bare': '0496862854ed',
    'fabrication|deviation-bare': '2cea25747e77',
  };
  for (const [key, value] of Object.entries(EXPECTED)) {
    assert.equal(fps[key], value, `${key} changed — collected data would stop pooling`);
  }
});

test('the assertion probe adds two keys per arm', () => {
  const fps = require(path.resolve(__dirname, '../measure-grounding.js')).currentFingerprints();
  assert.ok(fps['assertion|baseline'], 'truth-condition key missing');
  assert.ok(fps['assertion-inflated|baseline'], 'inflated-condition key missing');
  assert.notEqual(
    fps['assertion|baseline'], fps['assertion-inflated|baseline'],
    'the two conditions must never pool with each other',
  );
});

// Pinned literally, same reasoning as the assertion-probe test above: adding
// redundancy keys may only ADD keys, never move an existing one. These are the
// real currentFingerprints() values captured immediately before the redundancy
// probe was wired in, so this is a genuine before/after comparison, not two
// calls with nothing between them.
test('adding redundancy keys leaves every pre-existing hash byte-identical', () => {
  const fps = require(path.resolve(__dirname, '../measure-grounding.js')).currentFingerprints();
  const EXPECTED = {
    'levels|baseline': 'f37240d520f1',
    'rna|baseline': 'c989157dd47c',
    'fabrication|baseline': '5c3658a9d8a0',
    'assertion|baseline': '5bc942c001b2',
    'assertion-inflated|baseline': 'd6da5974ba15',
    'levels|sdd-semantic': '685aaca78813',
    'rna|sdd-semantic': 'e493360bc91d',
    'fabrication|sdd-semantic': 'ad0cadacf33b',
    'assertion|sdd-semantic': '50865a2a2b56',
    'assertion-inflated|sdd-semantic': '54768a48564c',
    'levels|deviation-deterministic': '068c08908b27',
    'rna|deviation-deterministic': '0496862854ed',
    'fabrication|deviation-deterministic': '2cea25747e77',
    'assertion|deviation-deterministic': '6bdfc9e3b6a7',
    'assertion-inflated|deviation-deterministic': '83ba8cf12214',
    'levels|deviation-titles': '0334a04515c0',
    'rna|deviation-titles': '0496862854ed',
    'fabrication|deviation-titles': '2cea25747e77',
    'assertion|deviation-titles': '6bdfc9e3b6a7',
    'assertion-inflated|deviation-titles': '83ba8cf12214',
    'levels|deviation-bare': '28a2e7c629fe',
    'rna|deviation-bare': '0496862854ed',
    'fabrication|deviation-bare': '2cea25747e77',
    'assertion|deviation-bare': '6bdfc9e3b6a7',
    'assertion-inflated|deviation-bare': '83ba8cf12214',
  };
  for (const [key, value] of Object.entries(EXPECTED)) {
    assert.equal(fps[key], value, `${key} moved — historical files stop pooling`);
  }
});

// Review finding 1: metric 5 and metric 6 both report all three
// ALL_LEVEL_CONDITIONS rows, so both need a key per condition or a condition's
// row can print over a pool nothing ever fingerprinted (assertion-deflated and
// redundancy-inflated were the two missing before this).
test('the full (metric, condition) grid exists per arm and every condition is distinct', () => {
  const fps = require(path.resolve(__dirname, '../measure-grounding.js')).currentFingerprints();
  const keys = [
    'assertion|baseline', 'assertion-inflated|baseline', 'assertion-deflated|baseline',
    'redundancy|baseline', 'redundancy-inflated|baseline', 'redundancy-deflated|baseline',
  ];
  for (const key of keys) assert.ok(fps[key], `${key} missing`);
  assert.equal(new Set(keys.map((k) => fps[k])).size, keys.length, 'two conditions collided onto the same hash');
});

test('the deflated override is part of redundancy-deflated comparability', () => {
  const fps = require(path.resolve(__dirname, '../measure-grounding.js')).currentFingerprints();
  assert.ok(fps['redundancy|baseline']);
  assert.notEqual(fps['redundancy-deflated|baseline'], fps['redundancy|baseline']);
});

// ---------------------------------------------------------------------------
// Required change 3 (design 2026-09-04): the `unlabelled` documents must be
// hashed ONLY into variant-condition keys.
//
// `common.startups` carries the document text, and `common` is material for
// every key. Folding a variant document into that shared map would move every
// hash in the file and refuse to pool with every historical run — over a
// document those runs never saw. The original cells must stay poolable with
// 2026-08-23; only the unlabelled cells are new.
// ---------------------------------------------------------------------------

const withProbes = {
  ...base,
  sources: { ...base.sources, assertion: 'CLASSIFIER', redundancy: 'REDUNDANCY' },
  absences: { Investment: {} },
  satisfactions: { A: { Technology: {} } },
  inflatedLevels: { A: {} },
  deflatedLevels: { A: {} },
};

const withVariants = {
  ...withProbes,
  docVariants: { unlabelled: { A: 'the unlabelled document text' } },
};

test('adding document variants leaves every pre-existing hash byte-identical', () => {
  const before = fingerprintMap(withProbes);
  const after = fingerprintMap(withVariants);
  for (const [key, value] of Object.entries(before)) {
    assert.equal(after[key], value, `${key} moved — historical files would stop pooling`);
  }
});

test('each variant gets its own key per arm and condition', () => {
  const fp = fingerprintMap(withVariants);
  const added = Object.keys(fp).filter((k) => !(k in fingerprintMap(withProbes))).sort();
  assert.deepEqual(added, [
    'assertion-unlabelled-deflated|baseline', 'assertion-unlabelled-deflated|deviation-deterministic',
    'assertion-unlabelled-inflated|baseline', 'assertion-unlabelled-inflated|deviation-deterministic',
    'assertion-unlabelled|baseline', 'assertion-unlabelled|deviation-deterministic',
    'redundancy-unlabelled-deflated|baseline', 'redundancy-unlabelled-deflated|deviation-deterministic',
    'redundancy-unlabelled-inflated|baseline', 'redundancy-unlabelled-inflated|deviation-deterministic',
    'redundancy-unlabelled|baseline', 'redundancy-unlabelled|deviation-deterministic',
  ]);
});

test('editing a variant document moves only that variant\'s keys', () => {
  const changed = clone(withVariants);
  changed.docVariants.unlabelled.A = 'a different unlabelled document';
  const before = fingerprintMap(withVariants);
  const after = fingerprintMap(changed);
  for (const key of Object.keys(before)) {
    if (key.includes('-unlabelled')) {
      assert.notEqual(after[key], before[key], `${key} must move when its document changes`);
    } else {
      assert.equal(after[key], before[key], `${key} must not move — it does not use the variant document`);
    }
  }
});

test('the variant keys do not collide with each other', () => {
  const fp = fingerprintMap(withVariants);
  const keys = Object.keys(fp).filter((k) => k.includes('unlabelled'));
  assert.equal(new Set(keys.map((k) => fp[k])).size, keys.length, 'two variant conditions collided onto the same hash');
});

test('a variant key differs from its own original counterpart', () => {
  const fp = fingerprintMap(withVariants);
  // Existence first: notEqual against undefined would pass on a key that was
  // never emitted, which is exactly the bug this test is meant to catch.
  for (const k of ['redundancy|baseline', 'redundancy-unlabelled|baseline',
    'assertion-deflated|baseline', 'assertion-unlabelled-deflated|baseline']) {
    assert.match(fp[k] ?? '', /^[0-9a-f]{12}$/, `${k} was not emitted`);
  }
  // Same arm, same condition, same everything except the document.
  assert.notEqual(fp['redundancy|baseline'], fp['redundancy-unlabelled|baseline']);
  assert.notEqual(fp['assertion-deflated|baseline'], fp['assertion-unlabelled-deflated|baseline']);
});
