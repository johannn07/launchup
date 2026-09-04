/**
 * G1 — the detector control (design 2026-09-04, "G1 — the detector control,
 * built from the model's own sentences").
 *
 * Zero quota, blocking, and it runs before any call is made. It answers one
 * question and only one: does the detector fire on the MODEL'S OWN syntax when
 * that syntax carries a redundancy? The 2026-08-23 fixtures were hand-written,
 * so passing them proved nothing about the register the model actually writes
 * in — which is precisely the ambiguity that voided that run.
 *
 * G1 is a BOUND, not a proof. Mutants are built from clauses the detector
 * already reaches, so constructions it never reaches cannot appear among them.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const G = require(path.resolve(__dirname, '../lib/g1-cases.js'));

// --- The cases are real, not invented -------------------------------------
// The whole value of G1 over the 2026-08-23 fixtures is that every original is
// a sentence the model actually produced. That claim is machine-checked here
// rather than trusted: each case names a file, arm, startup, condition, rep and
// dimension, and the original must be recoverable from exactly those
// coordinates.

test('every G1 original is recoverable verbatim from its recorded provenance', () => {
  const found = G.harvestSourceClauses();
  const key = (c) => [c.file, c.arm, c.startup, c.condition, c.rep, c.dimension, c.text].join('|');
  const pool = new Set(found.map(key));
  for (const c of G.G1_CASES) {
    assert.ok(
      pool.has(key({ ...c, text: c.original })),
      `case ${c.id}: no clause at ${c.file}/${c.arm}/${c.startup}/${c.condition}/rep${c.rep}/${c.dimension} matches its recorded original`,
    );
  }
});

test('the harvest takes only clauses the detector already reaches', () => {
  for (const c of G.harvestSourceClauses()) {
    assert.ok(
      c.klass === 'recommended' || c.klass === 'scoped',
      `harvest admitted a ${c.klass} clause; G1 mutants may only be built from clauses classifyClause already reads`,
    );
  }
});

// --- The mutation changes the frame and nothing else -----------------------

test('every mutant keeps the same satisfied token as its original — no token substitution', () => {
  for (const c of G.G1_CASES) {
    const inOriginal = G.satisfiedTokensIn(c.startup, c.dimension, c.original);
    const inMutant = G.satisfiedTokensIn(c.startup, c.dimension, c.mutant);
    assert.ok(inOriginal.length > 0, `case ${c.id}: the original names no satisfied token`);
    assert.deepEqual(
      inMutant, inOriginal,
      `case ${c.id}: the mutation introduced or dropped an artifact. It may only replace the progression frame with an acquisition frame.`,
    );
  }
});

// --- The paired property, which is what G1 exists to establish -------------

test('every pair scores mutant-fires and original-silent', () => {
  const failures = [];
  for (const c of G.G1_CASES) {
    const mutant = G.scoreClause(c.startup, c.dimension, c.mutant);
    const original = G.scoreClause(c.startup, c.dimension, c.original);
    if (!mutant.redundant) failures.push(`case ${c.id}: mutant did not fire (klass ${mutant.klass})`);
    // Both firing is a false positive, not a passing mutant — the pair says
    // nothing about the detector if the frame swap changed no verdict.
    if (original.redundant) failures.push(`case ${c.id}: original fired (klass ${original.klass}) — false positive, not a pass`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

// --- The uncaught classes, asserted rather than fixed ----------------------
// The standing record that metric 6 is a lower bound. A change that makes
// either of these fire must move them deliberately, not by accident.

test('the named uncaught classes stay silent', () => {
  for (const c of G.G1_EXPECTED_SILENT) {
    const scored = G.scoreClause(c.startup, c.dimension, c.text);
    assert.equal(
      scored.redundant, false,
      `"${c.why}" fired. If this is a deliberate widening, move the case; if not, the lower-bound claim just changed silently.`,
    );
  }
});

test('both uncaught classes named in the design are covered', () => {
  assert.deepEqual(
    G.G1_EXPECTED_SILENT.map((c) => c.why).sort(),
    ['acquisition verb outside the frozen list', 'passive or postposed acquisition'],
  );
});

// --- The verdict ----------------------------------------------------------

test('evaluateG1 reports the paired property as met', () => {
  const v = G.evaluateG1();
  assert.deepEqual(v.pairFailures, [], 'no pair may fail');
  assert.equal(v.pairs, 11);
});

// The pass rule as amended 2026-09-05: at least 8 paired cases, at least 2
// dimensions, every pair mutant-fires / original-silent. The original rule also
// required 2 startups; that clause was struck by Amendment 1 in the design file,
// before any call was spent, because it is unsatisfiable from the source the
// design names — see there for what was declined and why.
test('G1 passes the amended coverage rule', () => {
  const v = G.evaluateG1();
  assert.equal(v.pairs >= 8, true, 'at least 8 paired cases');
  assert.equal(v.dimensions.length >= 2, true, 'at least 2 dimensions');
  assert.deepEqual(v.unmet, []);
  assert.equal(v.pass, true);
});

// The bound the amendment buys, pinned so it cannot quietly stop being true.
// G1 validates the detector against AgroLink's register only. Half the run's
// observations come from MediSync, whose descriptive register G1 never tested —
// and that register is exactly what `unlabelled` is aimed at moving. A
// `redundant` verdict on a MediSync clause is therefore not covered by G1 and
// must be hand-read before it is quoted.
//
// If the pool ever gains a second startup this fails, which is the point: the
// bound would no longer be the right thing to say.
test('the amended rule leaves a recorded bound — every G1 case is AgroLink', () => {
  assert.deepEqual(G.evaluateG1().startups, ['AgroLink PH']);
  assert.equal(G.G1_RULE.minStartups, undefined, 'the struck clause must not survive in the code');
});
