const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { splitClauses, classifyClause, scoreAssertedAbsences, CUES, CLASSIFIER_SOURCE } =
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
    // All five are rejected at the token-narrowing gate itself (classifyClause
    // returns null before any cue runs), which is the mechanism this test is
    // meant to pin — verified with node before tightening from notEqual.
    assert.equal(classifyClause(sentence, tokens), null);
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

// The subset test above only checks direction (narrow ⊆ broad ∪ extras), which
// passes even if a notArtifacts entry matches nothing — a typo or wrong case
// silently drops zero tokens, leaving a topic word in artifactTokens with no
// error. This checks the subtraction actually removed something.
test('every notArtifacts entry matches something in its dimension\'s absentTokens', () => {
  for (const [dim, spec] of Object.entries(HARD_ABSENCES)) {
    for (const t of spec.notArtifacts || []) {
      assert.ok(
        spec.absentTokens.includes(t),
        `${dim}: notArtifacts entry "${t}" matches nothing in absentTokens — typo or wrong case silently no-ops`,
      );
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

// --------------------------------------------------------------------------
// CLASSIFIER_SOURCE is what `assertion|*` hashes. Building it from CUES makes a
// forgotten regex impossible; these tests catch the other half — a regex
// declared outside CUES entirely — and confirm every helper still lands in the
// hash.
//
// This supersedes the old hand-maintained `distinctive`-substring test that
// used to live here. That test's own name went false in Task 3: CONTINUATION
// was added to the module but never added to the `distinctive` map, so a test
// named "every cue regex" silently covered six of seven. A second hand-curated
// list is the exact standing-instruction failure mode this task exists to
// remove, so it is deleted rather than patched — the CUES-derived test below
// cannot go stale the same way, because it walks CUES itself instead of a
// second copy of the cue names.
// --------------------------------------------------------------------------

test('every module-level constant is either a cue or a named non-cue', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../lib/assertions.js'), 'utf8');
  const NON_CUES = ['CLASSIFIER_SOURCE', 'CUES'];
  const declared = [...src.matchAll(/^const ([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
  assert.ok(declared.length >= 8, 'the scan found nothing — the regex stopped matching declarations');
  for (const name of declared) {
    assert.ok(
      Object.hasOwn(CUES, name) || NON_CUES.includes(name),
      `${name} is a module constant in neither CUES nor NON_CUES, so it may be missing from CLASSIFIER_SOURCE`,
    );
  }
});

test('CLASSIFIER_SOURCE carries every cue in CUES', () => {
  for (const [name, re] of Object.entries(CUES)) {
    assert.ok(CLASSIFIER_SOURCE.includes(re.source), `CLASSIFIER_SOURCE is missing ${name}`);
  }
});

test('CLASSIFIER_SOURCE carries every helper, not just the cue regexes', () => {
  // One distinctive substring per helper: tokenRe, splitClauses, classifyClause,
  // scoreAssertedAbsences — the four .toString() entries alongside the cues.
  for (const fragment of ['(?:s|es)?', 'whereas', "'recommended'", 'rnaByDim']) {
    assert.ok(CLASSIFIER_SOURCE.includes(fragment), `CLASSIFIER_SOURCE is missing ${fragment}`);
  }
});

test('a classifier edit moves the assertion fingerprint', () => {
  const { fingerprintMap } = require(path.resolve(__dirname, '../lib/fingerprint.js'));
  const spec = {
    common: {}, markers: [], rubrics: [],
    sources: { rna: 'r', levels: 'l', fabrication: 'f', assertion: CLASSIFIER_SOURCE },
    arms: [{ name: 'baseline', ragCorpus: false, rubricMode: null }],
  };
  const edited = { ...spec, sources: { ...spec.sources, assertion: `${CLASSIFIER_SOURCE}|edited` } };
  assert.notEqual(fingerprintMap(spec)['assertion|baseline'], fingerprintMap(edited)['assertion|baseline']);
});

// --------------------------------------------------------------------------
// Gap 4a, measured 2026-08-06. `Dr.` inside a founder name was read as a
// sentence end, so the accompaniment clause reached classifyClause as a
// fragment starting mid-name and could never be classified.
// --------------------------------------------------------------------------

test('an abbreviation period is not a sentence end', () => {
  const clauses = splitClauses(
    'Currently at ORL 3, led by 3 founders (Dr. Elena Reyes, Marco Villanueva, Joy Tabotabo) alongside a first non-founder contributor. To achieve ORL 4, the startup must draft formal role definitions.',
  );
  assert.equal(clauses.length, 2, 'split at "Dr." would give 3');
  assert.match(clauses[0], /^Currently at ORL 3/);
  assert.match(clauses[0], /alongside a first non-founder contributor\.$/);
});

test('a real sentence boundary still splits', () => {
  const clauses = splitClauses('The venture has secured angel funding. No term sheet exists.');
  assert.equal(clauses.length, 2);
});

test('a bare initial is not a sentence end', () => {
  const clauses = splitClauses('Founders are E. Reyes and M. Villanueva of the venture.');
  assert.equal(clauses.length, 1);
});

// --------------------------------------------------------------------------
// Gap 1, measured 2026-08-06: seven of the fourteen `unclassified` clauses were
// recommendations wearing a label. RECOMMENDATION required `need\s+to`, so
// "Needs:", "Need:", "Needs a ..." and "needed" all missed. Strings verbatim
// from measurement/results/2026-08-06-supplied-level.json.
// --------------------------------------------------------------------------

const LABEL_FORM = [
  [ORG, 'Needs: Advance to ORL 3 by engaging the first non-founder contributor, such as a contractor, advisor, or part-time hire.'],
  [INVEST, 'Needs: Advance to IRL 2 by forming an informal funding hypothesis regarding future capital needs and potential target raise amounts.'],
  [INVEST, 'Need: Draft an initial funding hypothesis, outline target raise requirements'],
  [INVEST, 'Needs a defined financial model and funding strategy to support technology development and field operations.'],
  [INVEST, 'Needs initial funding or capital investment to transition from prototype to working platform development.'],
  [REGU, 'Needs: Assemble a documented requirements checklist detailing the specific permits, regulatory standards'],
  [INVEST, 'Needs: Complete a pitch deck or one-pager and conduct initial investor conversations, logging meetings held with targeted investors to reach IRL 4.'],
];

for (const [tokens, clause] of LABEL_FORM) {
  test(`a labelled requirement is a recommendation: "${clause.slice(0, 40)}..."`, () => {
    assert.equal(classifyClause(clause, tokens), 'recommended');
  });
}

// --------------------------------------------------------------------------
// Gap 2, measured 2026-08-06. A comma-and split strands a continuation fragment
// from the modal governing it, leaving it cue-less. Five clauses landed in
// `unclassified` this way — and one landed in `asserted`, which is a live
// counterexample to this module's lower-bound guarantee.
// --------------------------------------------------------------------------

// THE FALSE POSITIVE. Source RNA: "To reach IRL 4, the startup must convert its
// funding plan into an investor pitch deck or one-pager, initiate warm-intro
// investor meetings, and maintain an active log of investor pitches conducted."
// The fragment lost its `must`, and ASSERTION's `maintains?` fired.
test('a stranded continuation does not assert off its own verb', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'To reach IRL 4, the startup must convert its funding plan into an investor pitch deck or one-pager, initiate warm-intro investor meetings, and maintain an active log of investor pitches conducted.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations[0].asserted, false, 'the governing "must" makes every fragment advice');
  assert.equal(r.observations[0].unclassified, false);
});

const STRANDED = [
  ['Organizational', ORG, 'To achieve ORL 4, the startup must draft formal role definitions for the core team, create initial operational process artifacts like onboarding checklists or decision logs, and prepare for its first full-time hire beyond the founding team.'],
  ['Organizational', ORG, 'Need: Document role descriptions, establish operational decision processes, and bring on a first non-founder contributor.'],
  ['Investment', INVEST, 'To advance investment readiness, AgroLink PH needs to create a written funding plan specifying target raise amounts and use of funds, prepare a pitch deck, and initiate preliminary investor discussions.'],
  ['Investment', INVEST, 'Needs: Formulate a clear financial model, commercial pricing strategy, and investment pitch to secure initial funding.'],
  ['Regulatory', REGU, 'Needs: Assemble a documented requirements checklist detailing the specific permits, regulatory standards, and compliance certifications needed for health referral software to reach RRL 4.'],
];

for (const [dim, tokens, sentence] of STRANDED) {
  test(`a continuation fragment inherits its governing modal: ${dim} — "${sentence.slice(0, 40)}..."`, () => {
    const r = scoreAssertedAbsences({ [dim]: sentence }, { [dim]: HARD_ABSENCES[dim] });
    assert.equal(r.observations[0].asserted, false);
    assert.equal(r.observations[0].unclassified, false, 'the fragment should be recommended, not unclassified');
  });
}

// A fragment must never inherit `asserted` — inheritance carries only the two
// gates that resolve AWAY from fabrication. Without that restriction this would
// score asserted off the head clause's participle.
test('a continuation fragment never inherits an assertion', () => {
  assert.equal(
    classifyClause('and a term sheet', INVEST, 'The venture has secured angel funding'),
    'unclassified',
    'inheriting `asserted` would manufacture a fabrication from a neighbour',
  );
});

// --------------------------------------------------------------------------
// Gap 3, measured 2026-08-06. Verbatim from the audit dump — MediSync,
// corpus arm, inflated condition, rep 1.
// --------------------------------------------------------------------------

// KNOWN UNCAUGHT CLASS, recorded deliberately. This is a real fabrication — a
// funding plan the source document never mentions, reported as present — and
// the classifier does not catch it. `exists` was tried as a cue for exactly
// this clause (measured 2026-08-06) and then cut (measured 2026-08-09): the
// same cue also fires on "Investor interest exists but remains informal at
// this stage," where `funding`/`investor` is attributive, not the thing being
// said to exist. No syntactic restriction separates the two, so the cue was
// refused and this clause reverted to a documented gap instead.
test('an existential predicate on an artifact is a known uncaught class', () => {
  const r = scoreAssertedAbsences(
    { Investment: 'A basic funding plan exists alongside PHP 5,000 MRR.' },
    { Investment: HARD_ABSENCES.Investment },
  );
  assert.equal(r.observations[0].asserted, false, 'the cue that would catch this also fires on "Investor interest exists"');
  assert.equal(r.observations[0].mentioned, true, 'the artifact is still detected as mentioned');
});

test('a negated existential is still correct reporting', () => {
  assert.equal(classifyClause('No funding plan exists at all', INVEST), 'negated');
});

test('a recommended existential is still advice', () => {
  assert.equal(classifyClause('A written funding plan should exist by Q3', INVEST), 'recommended');
});

// Both were floated in SESSION_NOTES.md as likely additions alongside `exists`.
// Both are refused: neither has a measured instance, and each has a plain
// counterexample that would break the lower-bound guarantee.
test('"remains" is refused — it asserts nothing about existence', () => {
  assert.notEqual(classifyClause('A permit remains outstanding', REGU), 'asserted');
});

test('"includes" is refused — a plan is not an artifact in existence', () => {
  assert.notEqual(classifyClause('The roadmap includes a contractor engagement', ORG), 'asserted');
});

// Constructed guard: the reason `exists` was cut. `investor` is attributive
// here, not the head of the subject NP — the same shape as "A basic funding
// plan exists", which IS a fabrication. Nothing in the syntax distinguishes
// them, so the cue cannot be trusted for either.
test('"exists" is refused — an attributive subject asserts no artifact', () => {
  assert.notEqual(
    classifyClause('Investor interest exists but remains informal at this stage.', INVEST),
    'asserted',
  );
});

// Constructed guard for `existed`, the one refused cue with no test before this.
test('"existed" is refused — no measured instance and the same attributive hole as `exists`', () => {
  assert.notEqual(
    classifyClause('A significant funding gap existed between revenue and cost.', INVEST),
    'asserted',
  );
});

// Constructed guard, not a dump fixture. `existing` is an attributive
// adjective: it modifies a topic word rather than predicating existence of an
// artifact, so it asserts nothing. This is the same failure the bare-copula
// exclusion above exists to prevent.
test('"existing" is refused — an attributive adjective asserts no artifact', () => {
  assert.notEqual(
    classifyClause('Existing investor sentiment remains cautious despite early traction.', INVEST),
    'asserted',
  );
});

// KNOWN UNCAUGHT CLASS, recorded deliberately. This clause does assert a
// non-founder contributor, and the classifier does not catch it: there is no
// possession, no achievement participle, and no negation or recommendation —
// the artifact hangs off "alongside" alone.
//
// A predicate for this was built and cut (spec section 3): it had no way to
// require the token be the HEAD of the governed phrase, so 14 of 14 constructed
// realistic clauses scored as fabrications. Missing a real assertion keeps the
// reported rate a lower bound; inventing one does not. This test exists so the
// gap is visible in the suite rather than only in a document.
test('accompaniment-only assertion is a known uncaught class', () => {
  const r = scoreAssertedAbsences(
    { Organizational: 'Currently at ORL 3, led by 3 founders (Dr. Elena Reyes, Marco Villanueva, Joy Tabotabo) alongside a first non-founder contributor.' },
    { Organizational: HARD_ABSENCES.Organizational },
  );
  assert.equal(r.observations[0].asserted, false, 'if this ever passes, the predicate came back — read spec section 3 first');
  assert.equal(r.observations[0].mentioned, true, 'the artifact is still detected as mentioned');
});

test('an accompaniment assertion caught by its participle still works', () => {
  assert.equal(
    classifyClause('Currently at RRL 3, with legal counsel engaged and a trademark application pending with IPOPHL.', REGU),
    'asserted',
    'this one is caught by `engaged`, not by accompaniment',
  );
});
