/**
 * The `unlabelled` document variants and the two blocking checks the design
 * puts on them (2026-09-04 spec, "The manipulation — `unlabelled` documents").
 *
 * The variant is a SALIENCE manipulation: every evidence phrase stays
 * byte-identical, its field label is removed by moving the phrase into a
 * narrative field, and nothing else changes. The checks exist because authorial
 * care is not evidence — a variant that quietly gained or lost a fact could
 * produce the effect on its own.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const V = require(path.resolve(__dirname, '../lib/doc-variants.js'));
const { SATISFACTIONS, verifySatisfactions } = require(path.resolve(__dirname, '../lib/satisfactions.js'));

const NARRATIVE = ['Description', 'Problem Statement', 'Solution'];

// --- Blocking check 1: the evidence is still there, verbatim ---------------

test('verifySatisfactions passes on the unlabelled variants', () => {
  assert.equal(verifySatisfactions(V.variantDocs('unlabelled')), true);
});

// --- Blocking check 2: fact preservation ----------------------------------
// The guard against authoring the variant into producing the effect. Field
// labels are stripped from both sides before extraction, because deleting a
// label is the manipulation and must not read as a lost fact.

test('every numeral, date and proper noun survives the manipulation', () => {
  for (const [startup, original] of Object.entries(V.ORIGINAL_DOCS)) {
    const variant = V.DOC_VARIANTS[startup].unlabelled;
    assert.deepEqual(
      V.extractFacts(variant), V.extractFacts(original),
      `${startup}: the variant changed the fact multiset. A variant that adds, drops or alters a number fails the run.`,
    );
  }
});

test('fact preservation actually catches a changed number', () => {
  // Without this the check above could be vacuously true.
  const doc = V.ORIGINAL_DOCS['AgroLink PH'];
  const tampered = doc.replace('18 cooperatives', '19 cooperatives');
  assert.notDeepEqual(V.extractFacts(tampered), V.extractFacts(doc));
});

test('fact preservation ignores field labels, which the manipulation removes', () => {
  const labelled = 'Timeline: 2025-06 field interviews with 18 cooperatives.';
  const unlabelled = 'Solution: 2025-06 field interviews with 18 cooperatives.';
  assert.deepEqual(V.extractFacts(labelled), V.extractFacts(unlabelled));
});

// --- The manipulation did what it claims ----------------------------------

test('every manipulated evidence phrase moves from a labelled field to a narrative one', () => {
  for (const cell of V.MANIPULATED_CELLS) {
    const { evidence } = SATISFACTIONS[cell.startup][cell.dimension];
    const before = V.hostFieldOf(V.ORIGINAL_DOCS[cell.startup], evidence);
    const after = V.hostFieldOf(V.DOC_VARIANTS[cell.startup].unlabelled, evidence);
    assert.ok(!NARRATIVE.includes(before), `${cell.startup}/${cell.dimension}: evidence was already narrative in the original`);
    assert.ok(
      NARRATIVE.includes(after),
      `${cell.startup}/${cell.dimension}: evidence still sits under "${after}" — the label was not removed`,
    );
  }
});

test('the five manipulable cells are manipulated and the sixth is recorded, not silently skipped', () => {
  const all = [];
  for (const [startup, dims] of Object.entries(SATISFACTIONS)) for (const d of Object.keys(dims)) all.push(`${startup}/${d}`);
  const done = V.MANIPULATED_CELLS.map((c) => `${c.startup}/${c.dimension}`);
  const skipped = V.UNMANIPULATED_CELLS.map((c) => `${c.startup}/${c.dimension}`);
  assert.deepEqual([...done, ...skipped].sort(), all.sort(), 'every (startup, dimension) cell must be either manipulated or recorded as not');
  assert.deepEqual(skipped, ['AgroLink PH/Market']);
  for (const c of V.UNMANIPULATED_CELLS) assert.ok(c.why && c.why.length > 20, 'a skipped cell must carry its reason');
});

// AgroLink/Market cannot be manipulated: its evidence phrase INCLUDES its own
// field label ("Target Market: Rice and vegetable cooperatives..."), so
// "evidence stays byte-identical" and "the field label is deleted" are mutually
// exclusive for that one cell. Pinned so the conflict cannot be forgotten.
test('the blocked cell is blocked for the reason recorded', () => {
  const { evidence } = SATISFACTIONS['AgroLink PH'].Market;
  assert.match(evidence, /^Target Market: /);
  assert.equal(V.hostFieldOf(V.DOC_VARIANTS['AgroLink PH'].unlabelled, evidence), 'Target Market');
});

// --- Nothing else moved ---------------------------------------------------

test('fields the manipulation does not touch are byte-identical', () => {
  for (const [startup, original] of Object.entries(V.ORIGINAL_DOCS)) {
    const a = V.fields(original);
    const b = V.fields(V.DOC_VARIANTS[startup].unlabelled);
    for (const label of ['Title', 'Problem Statement', 'Revenue', 'IP Status', 'Team']) {
      assert.equal(b[label], a[label], `${startup}: "${label}" changed, and the manipulation has no business touching it`);
    }
  }
});

test('the variants are the original documents, not new ones', () => {
  for (const [startup, original] of Object.entries(V.ORIGINAL_DOCS)) {
    assert.notEqual(V.DOC_VARIANTS[startup].unlabelled, original, `${startup}: the variant is identical to the original`);
  }
  assert.deepEqual(Object.keys(V.DOC_VARIANTS).sort(), Object.keys(SATISFACTIONS).sort());
});

// --- The axis -------------------------------------------------------------

test('variantDocs returns the originals for the `original` variant', () => {
  assert.deepEqual(V.variantDocs('original'), V.ORIGINAL_DOCS);
});

test('an unknown variant name is rejected rather than silently defaulted', () => {
  assert.throws(() => V.variantDocs('unlabelled '), /unknown document variant/i);
  assert.throws(() => V.variantDocs('scrambled'), /unknown document variant/i);
});

// --- One copy, not two ----------------------------------------------------
// The documents are edited by this module to make the variants, so a second
// copy in the harness would drift the way the readiness levels did before
// src/demo-readiness-levels.ts existed.
//
// What these two tests actually catch is DRIFT, not duplication: strings compare
// by value, so a re-inlined identical copy would still pass today and fail the
// day it diverged. That is the failure that matters, and it is the same
// guarantee tests/harness-exports.test.js gives for the levels.

test('the harness reads its documents from ORIGINAL_DOCS rather than its own copy', () => {
  const H = require(path.resolve(__dirname, '../measure-grounding.js'));
  for (const [startup, doc] of Object.entries(V.ORIGINAL_DOCS)) {
    assert.equal(H.STARTUPS[startup].doc, doc);
  }
});

test('the ground-truth audit reads the same documents', () => {
  const A = require(path.resolve(__dirname, '../audit-ground-truth.js'));
  assert.deepEqual(A.loadDocuments(), V.ORIGINAL_DOCS);
});
