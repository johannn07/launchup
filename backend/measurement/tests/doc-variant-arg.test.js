/**
 * `--doc-variant`, the axis for the salience manipulation.
 *
 * `--level-condition` is the wrong flag for this: the manipulation varies the
 * DOCUMENT, not the supplied level. It gets its own, with the hard-fail
 * semantics `--only-probe` and `--level-condition` already have — silently
 * running fewer variants than asked for looks identical to a clean run, and
 * this one costs a quota day to discover.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const H = require(path.resolve(__dirname, '../measure-grounding.js'));

test('the default is `original` — the manipulation is never opt-out', () => {
  assert.deepEqual(H.selectDocVariants(null), { variants: ['original'], errors: [] });
  assert.deepEqual(H.selectDocVariants(undefined), { variants: ['original'], errors: [] });
});

test('exact names and comma lists are accepted', () => {
  assert.deepEqual(H.selectDocVariants('unlabelled').variants, ['unlabelled']);
  assert.deepEqual(H.selectDocVariants('original,unlabelled').variants, ['original', 'unlabelled']);
  assert.deepEqual(H.selectDocVariants(' Unlabelled , original ').variants, ['original', 'unlabelled']);
});

test('the order is canonical, not the order they were typed', () => {
  // Two spellings of the same request must produce the same run shape.
  assert.deepEqual(H.selectDocVariants('unlabelled,original').variants, ['original', 'unlabelled']);
});

test('an unrecognised variant hard-errors and selects nothing', () => {
  const r = H.selectDocVariants('unlabeled'); // one L — a plausible typo
  assert.deepEqual(r.variants, []);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /unlabeled/);
  assert.match(r.errors[0], /original, unlabelled/);
});

test('an empty selection is an error, not an empty run', () => {
  assert.equal(H.selectDocVariants('').variants.length, 0);
  assert.equal(H.selectDocVariants(',,').errors.length, 1);
});

test('--doc-variant is a known flag, so it is not rejected as a typo', () => {
  assert.deepEqual(H.validateArgs(['--doc-variant=unlabelled'], []), []);
  assert.deepEqual(H.validateArgs(['--doc-variant=original,unlabelled'], []), []);
});

// --- Where the calls are stored -------------------------------------------
// `original` must keep the field names every stored run already uses, or the
// historical pools break for a change that alters no original-condition
// behaviour at all.

test('the original variant stores into the existing field names', () => {
  assert.equal(H.docVariantField('original', 'truth'), 'assertionTruthCalls');
  assert.equal(H.docVariantField('original', 'inflated'), 'assertionInflatedCalls');
  assert.equal(H.docVariantField('original', 'deflated'), 'assertionDeflatedCalls');
});

test('a variant stores into its own fields, never an existing one', () => {
  const existing = new Set(['assertionTruthCalls', 'assertionInflatedCalls', 'assertionDeflatedCalls', 'rnaCalls']);
  for (const condition of H.ALL_LEVEL_CONDITIONS) {
    const field = H.docVariantField('unlabelled', condition);
    assert.ok(!existing.has(field), `unlabelled/${condition} would overwrite ${field}`);
  }
});

// The 2026-08-23 review found `levelsForCondition` and `conditionField` were
// both binary ternaries, so a third condition would silently have received the
// wrong data. Same shape, same trap: this must be a total map that throws.
test('an unknown variant or condition throws rather than falling through', () => {
  assert.throws(() => H.docVariantField('scrambled', 'truth'), /unknown document variant/i);
  assert.throws(() => H.docVariantField('unlabelled', 'sideways'), /unknown condition/i);
});

test('every (variant, condition) pair has a distinct field', () => {
  const seen = new Map();
  for (const v of H.ALL_DOC_VARIANTS) {
    for (const c of H.ALL_LEVEL_CONDITIONS) {
      const f = H.docVariantField(v, c);
      assert.ok(!seen.has(f), `${v}/${c} collides with ${seen.get(f)} on field ${f}`);
      seen.set(f, `${v}/${c}`);
    }
  }
  assert.equal(seen.size, H.ALL_DOC_VARIANTS.length * H.ALL_LEVEL_CONDITIONS.length);
});
