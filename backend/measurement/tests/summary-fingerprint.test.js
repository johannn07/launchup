const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { summaryFingerprintMap } =
  require(path.resolve(__dirname, '../lib/summary-fingerprint.js'));

const ARMS = [
  { name: 'baseline', adversarialSummary: false },
  { name: 'adversarial', adversarialSummary: true },
];

const spec = (sources) => ({
  common: { genModel: 'gemini-3.6-flash', temperature: 0, grounding: true, startups: {} },
  sources: { legacyPrompt: 'L', adversarialPrompt: 'A', tone: 'T', overlap: 'O', ...sources },
  arms: ARMS,
});

// metric 3 is now scored by lib/field-overlap.js, so that file is one of its
// inputs. Without this, editing the normaliser or the Jaccard rule would leave
// the fingerprint unchanged and old differentiation rows would look poolable
// against numbers produced by a different statistic.
test('editing the overlap scorer invalidates differentiation for every arm', () => {
  const before = summaryFingerprintMap(spec());
  const after = summaryFingerprintMap(spec({ overlap: 'O-edited' }));
  for (const arm of ['baseline', 'adversarial']) {
    assert.notEqual(
      before[`differentiation|${arm}`],
      after[`differentiation|${arm}`],
      `differentiation|${arm} must track the overlap scorer`,
    );
  }
});

// The counterpart constraint, and the load-bearing one: SO 4.2's published
// result (4 unmet criteria, 3.75 critical risks) lives in criteria|*. Rebuilding
// metric 3 must not cost that result its poolability. unmet_criteria counts come
// from the model, not from any scorer of ours.
test('editing the overlap scorer leaves tone and criteria untouched', () => {
  const before = summaryFingerprintMap(spec());
  const after = summaryFingerprintMap(spec({ overlap: 'O-edited' }));
  for (const arm of ['baseline', 'adversarial']) {
    assert.equal(before[`tone|${arm}`], after[`tone|${arm}`], `tone|${arm} must not move`);
    assert.equal(before[`criteria|${arm}`], after[`criteria|${arm}`], `criteria|${arm} must not move`);
  }
});
