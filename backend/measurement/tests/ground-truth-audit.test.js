const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const A = require(path.resolve(__dirname, '../audit-ground-truth.js'));

const DIMS = A.DIMENSIONS;

/**
 * The load-bearing check: scored against the seeded reference, the re-scorer
 * must reproduce the figures measure-grounding.js published for the same runs
 * (TODO_CHECKLIST.md, the n=3 table). If it does, the pooling and the scoring
 * agree with the harness, and any difference under a different reference is the
 * reference rather than a bug in this script.
 */
test('reproduces the published n=3 numbers under the seeded reference', () => {
  const scored = A.score(A.loadCalls(), A.reference('seeded'));

  const published = {
    baseline: { mae: 0.78, within1: 30 },
    'sdd-semantic': { mae: 0.42, within1: 34 },
    'deviation-deterministic': { mae: 1.36, within1: 13 },
    'deviation-titles': { mae: 1.69, within1: 15 },
    'deviation-bare': { mae: 1.78, within1: 12 },
  };

  for (const [arm, expected] of Object.entries(published)) {
    assert.ok(scored[arm], `${arm} missing from the pooled runs`);
    assert.strictEqual(scored[arm].n, 36, `${arm} must be balanced at 36 observations`);
    assert.strictEqual(
      Number(scored[arm].mae.toFixed(2)), expected.mae,
      `${arm} MAE diverged from the published figure`,
    );
    assert.strictEqual(scored[arm].within1, expected.within1, `${arm} within1 diverged`);
  }
});

/** Every arm must be scored over the same cells, or MAEs are not comparable. */
test('all five arms are balanced against each other', () => {
  const scored = A.score(A.loadCalls(), A.reference('strict'));
  const counts = new Set(Object.values(scored).map((s) => s.n));
  assert.strictEqual(counts.size, 1, `arms have differing n: ${[...counts]}`);
});

test('both derived references cover every scored cell', () => {
  for (const name of ['strict', 'permissive']) {
    const ref = A.reference(name);
    for (const startup of Object.keys(A.SEEDED)) {
      for (const dim of DIMS) {
        assert.strictEqual(
          typeof ref[startup][dim], 'number',
          `${name} reference is missing ${startup}/${dim}`,
        );
      }
    }
  }
});

/** A derived level outside 1-9 would be scored silently, so guard the range. */
test('derived levels stay on the 1-9 rubric scale and permissive is never lower', () => {
  for (const [startup, dims] of Object.entries(A.DERIVED)) {
    for (const [dim, cell] of Object.entries(dims)) {
      for (const rule of ['strict', 'permissive']) {
        assert.ok(
          Number.isInteger(cell[rule]) && cell[rule] >= 1 && cell[rule] <= 9,
          `${startup}/${dim} ${rule} is off-scale: ${cell[rule]}`,
        );
      }
      assert.ok(
        cell.permissive >= cell.strict,
        `${startup}/${dim}: permissive must not be below strict`,
      );
      assert.ok(cell.quote && cell.why, `${startup}/${dim} is missing its justification`);
    }
  }
});

/**
 * The reference-free check is only sound while its premise holds. If a document
 * is ever edited to mention hiring, counsel or funding, the ceilings stop being
 * ceilings and every rate computed from them is wrong.
 */
test('the artifact classes claimed absent really are absent from both documents', () => {
  assert.strictEqual(A.verifyAbsences(A.loadDocuments()), true);
});

test('verifyAbsences fails when a claimed-absent token is present', () => {
  assert.throws(
    () => A.verifyAbsences({ 'AgroLink PH': 'the team engaged external counsel' }),
    /counsel/,
  );
});

/** Generous ceilings are the point: a close reading must not be load-bearing. */
test('hard-absence ceilings sit above what the documents support', () => {
  for (const [dim, spec] of Object.entries(A.HARD_ABSENCES)) {
    for (const startup of Object.keys(A.DERIVED)) {
      assert.ok(
        spec.ceiling >= A.DERIVED[startup][dim].permissive,
        `${startup}/${dim}: ceiling ${spec.ceiling} is stricter than the permissive reading`,
      );
    }
  }
});

test('unsupported placements are counted over every arm and every hard-absence cell', () => {
  const counts = A.unsupportedPlacements(A.loadCalls());
  assert.strictEqual(Object.keys(counts).length, 5, 'expected all five arms');
  // 3 reps x 2 startups x 3 dimensions.
  for (const [arm, a] of Object.entries(counts)) {
    assert.strictEqual(a.checked, 18, `${arm} checked ${a.checked}, expected 18`);
    assert.ok(a.unsupported <= a.checked);
  }
});

/**
 * Pins the boundary. `ceiling` means "supported up to and including", so a
 * placement AT it must not be counted. Written after a mutation to `>=` passed
 * every other test in this file while silently inflating all five arms' rates.
 */
test('a placement exactly at the ceiling is supported; one rung above is not', () => {
  const at = { Organizational: 2, Regulatory: 2, Investment: 2 };
  const above = { Organizational: 3, Regulatory: 3, Investment: 3 };
  const call = (byDim) => ({ arm: 'x', startup: 'AgroLink PH', byDim });

  assert.strictEqual(A.unsupportedPlacements([call(at)]).x.unsupported, 0);
  assert.strictEqual(A.unsupportedPlacements([call(above)]).x.unsupported, 3);
});

/** The superseded pre-redesign file must stay out, as the fingerprint guard has it. */
test('the pre-redesign results file is excluded from the pool', () => {
  assert.ok(
    !A.RESULT_FILES.includes('2026-07-29-rep1.json'),
    'the 2026-07-29 file predates the probe redesign and must not pool',
  );
});
