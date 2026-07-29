const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const H = require(path.resolve(__dirname, '../measure-grounding.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-test-'));

function writeRun(name, { levelsFp, rnaFp, agroLevels }) {
  const file = path.join(TMP, name);
  fs.writeFileSync(file, JSON.stringify({
    generatedAt: '2026-07-29T00:00:00Z',
    genModel: 'gemini-3.6-flash',
    embedModel: 'gemini-embedding-2',
    corpusRows: 54,
    floor: 0.78,
    fingerprints: {
      'levels|baseline': levelsFp,
      'rna|baseline': rnaFp,
    },
    results: {
      baseline: {
        quotaHit: false,
        startups: {
          'AgroLink PH': { retrieved: [], rnaCalls: [], levelCalls: [{ byDim: agroLevels }], hallucCalls: [] },
        },
      },
      'sdd-semantic': { quotaHit: false, startups: {} },
      'deviation-deterministic': { quotaHit: false, startups: {} },
    },
  }, null, 2));
  return file;
}

test('pools a metric whose fingerprint matches', () => {
  const a = writeRun('a.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 2 } });
  const b = writeRun('b.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 4 } });
  const { merged } = H.mergeRuns([a, b], H.ARMS);
  assert.equal(merged.baseline.startups['AgroLink PH'].levelCalls.length, 2);
});

test('refuses one metric while pooling another', () => {
  // The exact case Task 4 creates: the RNA prompt changed, the levels prompt
  // did not, so metric 3 data must survive.
  const a = writeRun('c.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 2 } });
  const b = writeRun('d.json', { levelsFp: 'L1', rnaFp: 'R2', agroLevels: { Technology: 4 } });
  const { merged, refusals } = H.mergeRuns([a, b], H.ARMS);
  assert.equal(merged.baseline.startups['AgroLink PH'].levelCalls.length, 2, 'levels must pool');
  assert.ok(refusals.some((r) => r.startsWith('rna|baseline')), `expected an rna refusal, got ${JSON.stringify(refusals)}`);
});

test('throws when the model differs', () => {
  const a = writeRun('e.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 2 } });
  const bad = path.join(TMP, 'f.json');
  const data = JSON.parse(fs.readFileSync(a, 'utf8'));
  data.genModel = 'gemini-2.5-flash-lite';
  fs.writeFileSync(bad, JSON.stringify(data));
  assert.throws(() => H.mergeRuns([a, bad], H.ARMS), /not comparable/i);
});

test('a file with no fingerprints pools with nothing new', () => {
  const a = writeRun('g.json', { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 2 } });
  const legacy = path.join(TMP, 'h.json');
  const data = JSON.parse(fs.readFileSync(a, 'utf8'));
  delete data.fingerprints;
  fs.writeFileSync(legacy, JSON.stringify(data));
  const { refusals } = H.mergeRuns([a, legacy], H.ARMS);
  assert.ok(refusals.length > 0, 'a pre-fingerprint file must not silently pool');
});

test('two pre-fingerprint files do not pool with each other either', () => {
  // Both sides undefined makes `mine !== ref` false, so without the explicit
  // undefined checks these pool silently. The one real legacy file predates
  // both confound fixes, so its numbers came from a different experiment and
  // must never be summed with anything - including another legacy file.
  const legacy = (name) => {
    const f = path.join(TMP, name);
    const src = writeRun(`src-${name}`, { levelsFp: 'L1', rnaFp: 'R1', agroLevels: { Technology: 2 } });
    const d = JSON.parse(fs.readFileSync(src, 'utf8'));
    delete d.fingerprints;
    fs.writeFileSync(f, JSON.stringify(d));
    return f;
  };
  const a = legacy('legacy-a.json');
  const b = legacy('legacy-b.json');
  const { merged, refusals } = H.mergeRuns([a, b], H.ARMS);
  assert.ok(
    refusals.some((r) => r.startsWith('levels|baseline')),
    `expected a levels refusal, got ${JSON.stringify(refusals)}`,
  );
  assert.equal(
    (merged.baseline.startups['AgroLink PH'] || { levelCalls: [] }).levelCalls.length,
    0,
    'legacy data must not pool, not even with other legacy data',
  );
});
