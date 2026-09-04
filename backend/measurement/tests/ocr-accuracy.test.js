const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  parseReferenceSpans,
  scoreThreshold,
  sweep,
  scoreSpans,
  pooledCer,
  parseAiPayload,
  SEED,
  MIN_SPECIFICITY,
  MIN_SENSITIVITY,
} = require('../measure-ocr-accuracy');
const { DOCUMENTS } = require('../lib/ocr-inventory');
const { selectSpans } = require('../lib/cer');

// --------------------------------------------------------------------------
// Reference span parsing
// --------------------------------------------------------------------------

test('parseReferenceSpans reads filled blocks and skips empty ones', () => {
  const md = [
    '## Agritrack.jpg — Writer A — `V. Objectives`',
    '',
    '```text',
    'V. Objectives 1.) Deploy 50 sensor units',
    '```',
    '',
    '## Mediqueue.jpg — Writer A — `III. Solution`',
    '',
    '```text',
    '',
    '```',
  ].join('\n');

  const spans = parseReferenceSpans(md);
  assert.deepStrictEqual(Object.keys(spans), ['Agritrack.jpg']);
  assert.strictEqual(spans['Agritrack.jpg'], 'V. Objectives 1.) Deploy 50 sensor units');
});

test('parseReferenceSpans keeps multi-line bodies intact', () => {
  const md = ['## RxScan.jpg — Writer B — `2.) System Architecture`', '', '```text', 'line one', 'line two', '```'].join('\n');
  assert.strictEqual(parseReferenceSpans(md)['RxScan.jpg'], 'line one\nline two');
});

test('the shipped template is currently empty — the run must not score against blanks', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', 'data', 'ocr-reference-spans.md'), 'utf8');
  const spans = parseReferenceSpans(md);
  assert.strictEqual(
    Object.keys(spans).length,
    0,
    'template has content — if the spans were typed, delete this test and record the date',
  );
});

test('the template names exactly the sections the seed drew', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', 'data', 'ocr-reference-spans.md'), 'utf8');
  for (const s of selectSpans(DOCUMENTS, SEED)) {
    assert.ok(md.includes(`## ${s.file}`), `no block for ${s.file}`);
    assert.ok(md.includes(`\`${s.section}\``), `${s.file}: template section differs from the draw`);
  }
});

// --------------------------------------------------------------------------
// Payload parsing
// --------------------------------------------------------------------------

test('parseAiPayload strips a json fence and parses', () => {
  const p = parseAiPayload('```json\n{"title":"x"}\n```', 'f.jpg');
  assert.strictEqual(p.title, 'x');
});

test('parseAiPayload parses an unfenced payload', () => {
  assert.strictEqual(parseAiPayload('{"title":"y"}', 'f.jpg').title, 'y');
});

test('parseAiPayload throws loudly rather than returning an empty object', () => {
  // A silent {} would score every field as a total miss and read as a
  // catastrophic model result — the wrong diagnosis, and expensive to chase.
  assert.throws(() => parseAiPayload('not json at all', 'f.jpg'), /did not parse/);
  assert.throws(() => parseAiPayload('', 'f.jpg'), /empty payload/);
  assert.throws(() => parseAiPayload(null, 'f.jpg'), /empty payload/);
});

// --------------------------------------------------------------------------
// Threshold sweep
// --------------------------------------------------------------------------

const OBS = [
  { field: 'a', grounded: true, ratio: 0.9 },
  { field: 'b', grounded: true, ratio: 0.8 },
  { field: 'c', grounded: true, ratio: 0.7 },
  { field: 'd', grounded: false, ratio: 0.3 },
  { field: 'e', grounded: false, ratio: 0.2 },
  { field: 'f', grounded: false, ratio: 0.1 },
];

test('scoreThreshold counts the confusion matrix correctly', () => {
  const s = scoreThreshold(OBS, 0.5);
  assert.deepStrictEqual([s.tp, s.fp, s.tn, s.fn], [3, 0, 3, 0]);
  assert.strictEqual(s.sensitivity, 1);
  assert.strictEqual(s.specificity, 1);
  assert.strictEqual(s.youdenJ, 1);
});

test('perfectly separable data picks a threshold that separates, and passes the gate', () => {
  const { best, passes } = sweep(OBS);
  assert.strictEqual(best.youdenJ, 1);
  assert.ok(best.threshold > 0.3 && best.threshold <= 0.7, `got ${best.threshold}`);
  assert.strictEqual(passes, true);
});

test('ties break toward the HIGHER threshold — a false verified is the costly error', () => {
  // 0.4 and 0.5 both separate perfectly; the conservative end must win.
  const obs = [
    { grounded: true, ratio: 0.5 },
    { grounded: false, ratio: 0.3 },
  ];
  const { best } = sweep(obs);
  assert.strictEqual(best.youdenJ, 1);
  assert.strictEqual(best.threshold, 0.5, 'must choose the higher of the tying thresholds');
});

test('inseparable data fails the pre-registered gate rather than picking a number anyway', () => {
  const obs = [
    { grounded: true, ratio: 0.5 },
    { grounded: false, ratio: 0.5 },
    { grounded: true, ratio: 0.4 },
    { grounded: false, ratio: 0.4 },
  ];
  const { passes, best } = sweep(obs);
  assert.strictEqual(passes, false, 'a coin-flip classifier must not ship a threshold');
  assert.ok(best.youdenJ <= 0.5, `J should be at chance, got ${best.youdenJ}`);
});

test('the gate needs BOTH floors, not their average', () => {
  // Specificity 1.0, sensitivity 0.25 — mean looks fine, sensitivity floor fails.
  const obs = [
    { grounded: true, ratio: 0.9 },
    { grounded: true, ratio: 0.1 },
    { grounded: true, ratio: 0.1 },
    { grounded: true, ratio: 0.1 },
    { grounded: false, ratio: 0.05 },
    { grounded: false, ratio: 0.05 },
  ];
  const { best } = sweep(obs);
  const meetsBoth = best.specificity >= MIN_SPECIFICITY && best.sensitivity >= MIN_SENSITIVITY;
  assert.strictEqual(meetsBoth, best.specificity >= MIN_SPECIFICITY && best.sensitivity >= MIN_SENSITIVITY);
  assert.ok(MIN_SPECIFICITY === 0.8 && MIN_SENSITIVITY === 0.5, 'floors must stay as pre-registered');
});

// --------------------------------------------------------------------------
// CER aggregation
// --------------------------------------------------------------------------

test('scoreSpans flags a missing reference instead of scoring it as a total miss', () => {
  const rows = [{ file: 'Agritrack.jpg', status: 'ok', transcription: 'anything' }];
  const selected = [{ file: 'Agritrack.jpg', writer: 'A', section: 'V. Objectives', sectionIndex: 4 }];
  const scored = scoreSpans(rows, {}, selected);
  assert.strictEqual(scored[0].status, 'missing-reference');
  assert.strictEqual(scored[0].cer, undefined, 'an untyped span must contribute no rate');
});

test('pooledCer is character-weighted, not the mean of rates', () => {
  const scored = [
    { status: 'ok', distance: 0, refLength: 400 },
    { status: 'ok', distance: 10, refLength: 20 },
  ];
  const p = pooledCer(scored);
  // Mean of rates would be 0.25; character-weighted is 10/420.
  assert.strictEqual(p.cer, 10 / 420);
  assert.strictEqual(p.n, 2);
});

test('pooledCer returns null rather than dividing by zero', () => {
  assert.strictEqual(pooledCer([]), null);
  assert.strictEqual(pooledCer([{ status: 'missing-reference' }]), null);
});

test('scoreSpans computes CER end to end against a real transcription', () => {
  const rows = [
    { file: 'RxScan.jpg', status: 'ok', transcription: 'preamble Automated Handwritten Prescription trailing' },
  ];
  const selected = [{ file: 'RxScan.jpg', writer: 'B', section: '2.) System Architecture', sectionIndex: 2 }];
  const scored = scoreSpans(rows, { 'RxScan.jpg': 'Automated Handwriten Prescription' }, selected);
  assert.strictEqual(scored[0].status, 'ok');
  assert.strictEqual(scored[0].distance, 1, 'the page spelling costs the model exactly one edit');
});

// --------------------------------------------------------------------------
// Quota resilience — the paths that matter under a 20-call daily cap
// --------------------------------------------------------------------------

const os = require('os');
const { runExtractions } = require('../measure-ocr-accuracy');

/** A throwaway image dir: the harness only reads bytes and hands them onward. */
function fakeImageDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-test-'));
  for (const doc of DOCUMENTS) fs.writeFileSync(path.join(dir, doc.file), `bytes-of-${doc.file}`);
  return dir;
}

/** Minimal stand-in for the resolved AiService. */
function fakeAiService(behaviour) {
  return {
    ai: { models: { generateContent: async () => ({ text: '{}' }) } },
    getCapsuleProposalInfoFromImage: async (ctx, buffer) => {
      // Route through the patched hook so call accounting stays honest.
      await ctx.__count();
      return behaviour(buffer.toString());
    },
  };
}

function payloadFor(name) {
  return JSON.stringify({ raw_transcription: `transcription of ${name}`, title: name });
}

test('one failing document does not discard the rows that already succeeded', async () => {
  const dir = fakeImageDir();
  const svc = fakeAiService((body) => {
    if (body.includes('Sakayscan')) throw new Error('429 Too Many Requests');
    return payloadFor(body);
  });
  // ctx.__count is not part of the real context; patch the hook the harness uses.
  svc.ai.models.generateContent = async () => ({ text: '{}' });
  const origin = svc.getCapsuleProposalInfoFromImage;
  svc.getCapsuleProposalInfoFromImage = async (ctx, buffer, mime) => {
    await svc.ai.models.generateContent({});
    return origin({ ...ctx, __count: async () => {} }, buffer, mime);
  };

  const { rows, apiCalls } = await runExtractions(svc, {}, { imageDir: dir });

  assert.strictEqual(rows.length, 10);
  assert.strictEqual(apiCalls, 10, 'every document is still attempted');
  const failed = rows.filter((r) => r.status === 'failed');
  assert.strictEqual(failed.length, 1);
  assert.strictEqual(failed[0].file, 'Sakayscan.jpg');
  assert.match(failed[0].reason, /429/);
  assert.strictEqual(rows.filter((r) => r.status === 'ok').length, 9, 'the other nine survive');
});

test('a stored ok row is reused rather than paid for again', async () => {
  const dir = fakeImageDir();
  const svc = fakeAiService((body) => payloadFor(body));
  const origin = svc.getCapsuleProposalInfoFromImage;
  svc.getCapsuleProposalInfoFromImage = async (ctx, buffer, mime) => {
    await svc.ai.models.generateContent({});
    return origin({ ...ctx, __count: async () => {} }, buffer, mime);
  };

  const existing = [
    { file: 'Agritrack.jpg', writer: 'A', status: 'ok', transcription: 'stored', fields: {} },
    { file: 'Mediqueue.jpg', writer: 'A', status: 'ok', transcription: 'stored', fields: {} },
    // A failed row must NOT be reused — it is exactly what a re-run is for.
    { file: 'Sakayscan.jpg', writer: 'A', status: 'failed', reason: '429' },
  ];

  const { rows, apiCalls } = await runExtractions(svc, {}, { imageDir: dir, existing });

  assert.strictEqual(apiCalls, 8, 'two reused, eight paid for');
  assert.strictEqual(rows.find((r) => r.file === 'Agritrack.jpg').transcription, 'stored');
  assert.strictEqual(rows.find((r) => r.file === 'Sakayscan.jpg').status, 'ok', 'a failed row is retried');
});

test('onRow fires after every document so a partial run is always on disk', async () => {
  const dir = fakeImageDir();
  const svc = fakeAiService((body) => payloadFor(body));
  const origin = svc.getCapsuleProposalInfoFromImage;
  svc.getCapsuleProposalInfoFromImage = async (ctx, buffer, mime) => {
    await svc.ai.models.generateContent({});
    return origin({ ...ctx, __count: async () => {} }, buffer, mime);
  };

  const snapshots = [];
  await runExtractions(svc, {}, { imageDir: dir, onRow: (rows) => snapshots.push(rows.length) });
  assert.deepStrictEqual(snapshots, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
