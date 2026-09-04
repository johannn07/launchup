const test = require('node:test');
const assert = require('node:assert');

const {
  normalize,
  editDistance,
  infixDistance,
  characterErrorRate,
  mulberry32,
  selectSpans,
} = require('../lib/cer');
const { DOCUMENTS, FIELDS } = require('../lib/ocr-inventory');

test('normalize collapses whitespace but keeps case and punctuation', () => {
  assert.strictEqual(normalize('  AgriTrack:\n  a  low-cost\tsystem. '), 'AgriTrack: a low-cost system.');
  assert.strictEqual(normalize('Agritrack'), 'Agritrack', 'case must survive — it is a real error class');
  assert.strictEqual(normalize('a, b.'), 'a, b.', 'punctuation must survive');
});

test('normalize folds typographic variants to ASCII', () => {
  assert.strictEqual(normalize('don’t'), "don't");
  assert.strictEqual(normalize('“quoted”'), '"quoted"');
  assert.strictEqual(normalize('a—b'), 'a-b');
  assert.strictEqual(normalize('PHP 620'), 'PHP 620');
});

test('editDistance matches known values', () => {
  assert.strictEqual(editDistance('kitten', 'sitting'), 3);
  assert.strictEqual(editDistance('', 'abc'), 3);
  assert.strictEqual(editDistance('abc', 'abc'), 0);
});

test('infixDistance charges only the reference span, not the rest of the page', () => {
  const haystack = 'I. General Information. II. Problem: crops fail. III. Solution: sensors.';
  // Exact substring — the surrounding sections must cost nothing.
  assert.strictEqual(infixDistance('II. Problem: crops fail.', haystack), 0);
  // One substitution inside the span.
  assert.strictEqual(infixDistance('II. Problem: crops fai1.', haystack), 1);
});

test('infixDistance returns the full reference length when the span is absent', () => {
  assert.strictEqual(infixDistance('zzzz', 'aaaaaaaa'), 4);
});

test('characterErrorRate is 0 on an exact read and ~1 on a total miss', () => {
  const exact = characterErrorRate('Deploy 50 sensor units', 'noise Deploy 50 sensor units more noise');
  assert.strictEqual(exact.cer, 0);
  assert.strictEqual(exact.refLength, 22);

  const miss = characterErrorRate('Deploy 50 sensor units', 'wholly unrelated content here');
  assert.ok(miss.cer > 0.7, `a total miss should approach 1, got ${miss.cer}`);
});

test('characterErrorRate returns null for an empty reference rather than a perfect score', () => {
  assert.strictEqual(characterErrorRate('', 'anything'), null);
  assert.strictEqual(characterErrorRate('   ', 'anything'), null);
});

test('characterErrorRate counts a real misread at the expected rate', () => {
  // "Handwriten" is what the page says; a model writing "Handwritten" costs 1.
  const r = characterErrorRate('Automated Handwriten Prescription', 'Automated Handwritten Prescription Digitization');
  assert.strictEqual(r.distance, 1);
  assert.strictEqual(r.cer, 1 / 33);
});

test('span selection is reproducible from the seed and re-rolls to something different', () => {
  const a = selectSpans(DOCUMENTS, 20260905);
  const b = selectSpans(DOCUMENTS, 20260905);
  assert.deepStrictEqual(a, b, 'the same seed must give the same draw');

  const other = selectSpans(DOCUMENTS, 1);
  assert.notDeepStrictEqual(a, other, 'a different seed must move the draw');
});

test('every selected span names a section the document actually has', () => {
  for (const span of selectSpans(DOCUMENTS, 20260905)) {
    const doc = DOCUMENTS.find((d) => d.file === span.file);
    assert.ok(doc, `${span.file} not in the corpus`);
    assert.strictEqual(doc.sections[span.sectionIndex], span.section);
  }
});

test('mulberry32 stays inside [0,1)', () => {
  const rand = mulberry32(42);
  for (let i = 0; i < 1000; i += 1) {
    const v = rand();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('the inventory is complete and well-formed', () => {
  assert.strictEqual(DOCUMENTS.length, 10);

  const byWriter = DOCUMENTS.reduce((acc, d) => ({ ...acc, [d.writer]: (acc[d.writer] ?? 0) + 1 }), {});
  assert.deepStrictEqual(byWriter, { A: 5, B: 5 }, 'five pages per writer');

  for (const doc of DOCUMENTS) {
    assert.ok(doc.sections.length > 0, `${doc.file} has no sections`);
    assert.deepStrictEqual(
      Object.keys(doc.fields).sort(),
      [...FIELDS].sort(),
      `${doc.file} must label all eight fields and no others`,
    );
    for (const [field, value] of Object.entries(doc.fields)) {
      assert.strictEqual(typeof value, 'boolean', `${doc.file}.${field} must be a boolean`);
    }
  }
});

test('both label classes are populated enough to fit a threshold', () => {
  let grounded = 0;
  let invented = 0;
  for (const doc of DOCUMENTS) {
    for (const field of FIELDS) {
      if (doc.fields[field]) grounded += 1;
      else invented += 1;
    }
  }
  assert.ok(invented >= 10, `too few negatives to calibrate against: ${invented}`);
  assert.ok(grounded >= 10, `too few positives to calibrate against: ${grounded}`);
});
