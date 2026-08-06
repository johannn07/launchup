const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { splitClauses, classifyClause, scoreAssertedAbsences } =
  require(path.resolve(__dirname, '../lib/assertions.js'));
const { HARD_ABSENCES } = require(path.resolve(__dirname, '../lib/hard-absences.js'));

const INVEST = HARD_ABSENCES.Investment.artifactTokens;
const REGU = HARD_ABSENCES.Regulatory.artifactTokens;
const ORG = HARD_ABSENCES.Organizational.artifactTokens;

// The exact sentence observed on 2026-08-05. This is the defect the probe exists
// to count: the rubric's evidence REQUIREMENT restated as accomplished fact.
test('an asserted absent artifact is classified as asserted', () => {
  assert.equal(
    classifyClause('The venture has drafted a funding plan (IRL 3)', INVEST),
    'asserted',
  );
});

test('recommending the same artifact is not a fabrication', () => {
  assert.equal(
    classifyClause('Should draft a funding plan with a stated target raise', INVEST),
    'recommended',
  );
});

test('a negated absence is correct reporting, not a fabrication', () => {
  assert.equal(classifyClause('Has not engaged external counsel', REGU), 'negated');
});

// Precedence mutant killer. If assertion were tested before negation, the "has"
// in "has not engaged" would classify this as asserted and inflate every arm's
// rate. Verified against the mutant: reorder the checks in classifyClause and
// this test fails while the three above still pass.
test('negation beats assertion when both cues are in one clause', () => {
  assert.equal(
    classifyClause('The venture has no written funding plan', INVEST),
    'negated',
    'assertion-before-negation would score this as a fabrication',
  );
});

test('a clause with no absent token is not classified at all', () => {
  assert.equal(classifyClause('The prototype was tested with three cooperatives', INVEST), null);
});

test('splitClauses separates a negated report from its recommendation', () => {
  const clauses = splitClauses('The venture has no funding plan and should draft one.');
  assert.equal(clauses.length, 2);
  assert.match(clauses[0], /has no funding plan/);
  assert.match(clauses[1], /should draft one/);
});

test('the two-clause case is not flagged as a fabrication', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'The venture has no funding plan and should draft one.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0].asserted, false);
  assert.equal(r.observations[0].mentioned, true);
});

test('scoring is binary per dimension, so verbosity cannot inflate it', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'Angel funding is secured. Investor conversations are underway. The round is closed.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  // Only the first clause asserts under the tightened cue set — "are underway"
  // and "is closed" are bare copulas with no participle, so they land in
  // unclassified. Asserting that too keeps the test honest about what it covers.
  assert.equal(r.observations[0].asserted, true, 'one asserting clause still counts as one observation');
  assert.equal(r.observations[0].unclassified, true, 'the other two clauses match no cue');
});

test('a dimension the model dropped is skipped, not scored as clean', () => {
  // Matches lib/metrics.js: a missing field is a schema problem, and scoring it
  // as "no fabrication" would reward a model that returns less.
  const r = scoreAssertedAbsences({}, { Investment: HARD_ABSENCES.Investment });
  assert.equal(r.observations.length, 0);
});

test('an unrecognised framing is reported as unclassified, not silently clean', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'Funding, per the attached schedule.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations[0].mentioned, true);
  assert.equal(r.observations[0].asserted, false);
  assert.equal(r.observations[0].unclassified, true);
});

// The reason bare copulas were dropped: this names no funding artifact, and
// scoring it as a fabrication would bias the rate upward — the opposite of
// this module's lower-bound guarantee.
test('a bare copula beside a token is unclassified, not asserted', () => {
  assert.equal(classifyClause('Investor interest is growing steadily', INVEST), 'unclassified');
});

test('a copula fabrication is still caught through its participle', () => {
  assert.equal(classifyClause('Angel funding is secured', INVEST), 'asserted');
});

test('an achievement state is asserted', () => {
  assert.equal(classifyClause('A written funding plan is in place', INVEST), 'asserted');
});

test('a bare imperative is a recommendation even with no modal', () => {
  assert.equal(classifyClause('Draft a funding plan', INVEST), 'recommended');
});

// ORL 3's own rubric text is "a non-founder contributor under contract", so a
// fabrication is likelier to use that word than "contractor". Missing it made
// Organizational read 0 for the wrong reason — and 0 is the corpus-is-safe
// conclusion, so the gap biased toward exonerating the thing under test.
test('a non-founder contributor claim is detected', () => {
  assert.equal(classifyClause('A first non-founder contributor is now under contract', ORG), 'asserted');
});

test('a granted permit is an achievement, not unclassified', () => {
  assert.equal(classifyClause('The operating permit was granted last quarter', REGU), 'asserted');
});

test('a received opinion is an achievement', () => {
  assert.equal(classifyClause('A preliminary opinion was received', REGU), 'asserted');
});

// --------------------------------------------------------------------------
// The narrow artifact list. The broad `absentTokens` is verifyAbsences' absence
// guarantee over the documents; reused as an artifact detector over generated
// text it fires on abstract usage, and every such hit scored `asserted` — which
// is the opposite direction from the lower bound the probe claims.
// --------------------------------------------------------------------------

const ABSTRACT_USAGE = [
  ['Regulatory', REGU, 'The venture has compliance obligations under DOH rules'],
  ['Regulatory', REGU, 'The venture has significant regulatory exposure'],
  ['Investment', INVEST, 'The team has limited runway'],
  ['Investment', INVEST, 'The venture has a high burn relative to revenue'],
  ['Organizational', ORG, 'The founders have a board-level discipline'],
];

for (const [dim, tokens, sentence] of ABSTRACT_USAGE) {
  test(`abstract usage asserts no artifact: ${dim} — "${sentence}"`, () => {
    assert.notEqual(classifyClause(sentence, tokens), 'asserted');
  });
}

test('the narrow list is a subset of the broad one, plus multiword refinements', () => {
  for (const [dim, spec] of Object.entries(HARD_ABSENCES)) {
    for (const t of spec.artifactTokens) {
      const derived = spec.absentTokens.includes(t) || (spec.artifactExtras || []).includes(t);
      assert.ok(derived, `${dim}: "${t}" is in neither absentTokens nor artifactExtras`);
    }
  }
});

// --------------------------------------------------------------------------
// Under-count channel (a): singular-only matching. RRL 4's own text reads "The
// specific permits, licenses, or certifications required" — the plural is the
// form the model echoes, and it used to be invisible even to `mentioned`.
// --------------------------------------------------------------------------

test('a plural artifact noun is matched', () => {
  assert.equal(classifyClause('The venture has engaged three investors', INVEST), 'asserted');
});

test('a plural under contract is matched', () => {
  assert.equal(classifyClause('Two contractors are under contract', ORG), 'asserted');
});

test('plural permits are matched', () => {
  assert.equal(classifyClause('Two permits have been issued', REGU), 'asserted');
});

// --------------------------------------------------------------------------
// Under-count channel (b): "assessment of X, absence of Y" is the modal shape of
// an RNA. Collapsed into one clause, NEGATION's precedence masks the assertion.
// --------------------------------------------------------------------------

test('a bare "but" separates an assertion from its balancing absence', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'The venture has drafted a funding plan but no investors have been approached.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations[0].asserted, true);
});

test('a leading "While" scopes its negation to its own clause', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'While no term sheet exists, the team has secured angel funding of PHP 2M.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations[0].asserted, true);
});

test('"and has not" starts a new clause; the assertion before it survives', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'The venture has secured seed capital and has not yet defined use of funds.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations[0].asserted, true);
});

// The reason bare "and" is still not split: a coordinated noun phrase would
// become two cue-less fragments and inflate the unclassified column for nothing.
test('a coordinated noun phrase is not split', () => {
  assert.deepEqual(splitClauses('Engage counsel and compliance review'), ['Engage counsel and compliance review']);
});
