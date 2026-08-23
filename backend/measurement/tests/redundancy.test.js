const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { scoreRedundantNeeds } = require(path.resolve(__dirname, '../lib/redundancy.js'));
const { SATISFACTIONS } = require(path.resolve(__dirname, '../lib/satisfactions.js'));

const MEDI = SATISFACTIONS['MediSync Cebu'];
const AGRO = SATISFACTIONS['AgroLink PH'];

test('fires: recommending something the document evidences', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'Needs: identify a target market segment before further development.' },
    MEDI,
  );
  const market = observations.find((o) => o.dimension === 'Market');
  assert.equal(market.redundant, true);
});

test('spares: recommending a genuine gap', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'Needs: secure a signed distribution agreement with a tertiary referral centre.' },
    MEDI,
  );
  assert.equal(observations.find((o) => o.dimension === 'Market').redundant, false);
});

test('spares: ASSERTING a satisfied artifact is metric 5 bin, not this one', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'The venture has defined its target market segment.' },
    MEDI,
  );
  const market = observations.find((o) => o.dimension === 'Market');
  assert.equal(market.redundant, false);
});

test('the secondary count catches denying an evidenced fact', () => {
  const { observations } = scoreRedundantNeeds(
    { Acceptance: 'The venture has not yet secured any paying customer.' },
    MEDI,
  );
  const acc = observations.find((o) => o.dimension === 'Acceptance');
  assert.equal(acc.denied, true);
  assert.equal(acc.redundant, false, 'a denial must never inflate the headline');
});

test('a dimension the model omitted is skipped, not scored clean', () => {
  const { observations } = scoreRedundantNeeds({ Market: 'Needs: identify a target market segment.' }, MEDI);
  assert.deepEqual(observations.map((o) => o.dimension), ['Market']);
});

test('binary per dimension — two redundant clauses are still one observation', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'Needs: identify a target market segment. The team should also define its customer segment.' },
    MEDI,
  );
  const market = observations.find((o) => o.dimension === 'Market');
  assert.equal(market.redundant, true);
  assert.equal(market.clauses.filter((c) => c.klass === 'recommended').length, 2);
});

test('scope inheritance survives a coordination split', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'The team should complete its regulatory filing, and identify a target market segment.' },
    MEDI,
  );
  assert.equal(observations.find((o) => o.dimension === 'Market').redundant, true);
});

// --------------------------------------------------------------------------
// Task 7b: the 96-observation pilot against 2026-08-06/08-09 historical
// result files found metric 6 firing on all six of these, and a hand-read
// found every one a false positive — the satisfied token names the origin
// being left behind or the scope a recommendation ranges over, never the
// artifact being asked for. Quoted verbatim from task-7b-brief.md, scored
// against the real SATISFACTIONS entry for the startup/dimension each came
// from. This is fixture 1 in the brief's Tests section.
// --------------------------------------------------------------------------

test('spares: the six observed false-positive clauses', () => {
  const cases = [
    ['AgroLink PH', 'Technology', 'Needs transition from paper prototype to software development', AGRO],
    ['AgroLink PH', 'Technology', 'Move from paper prototypes to building and testing a working digital MVP', AGRO],
    ['AgroLink PH', 'Technology', 'Develop working platform software beyond paper prototypes', AGRO],
    ['MediSync Cebu', 'Market', 'Needs to further penetrate the target market across remaining public health facilities', MEDI],
    ['AgroLink PH', 'Market', 'execute structured customer discovery across the target market of roughly 400 cooperatives', AGRO],
    ['MediSync Cebu', 'Market', 'expand repeat sales beyond initial pilots across its target market of 44 rural health units', MEDI],
  ];
  for (const [startup, dimension, text, spec] of cases) {
    const { observations } = scoreRedundantNeeds({ [dimension]: text }, spec);
    const obs = observations.find((o) => o.dimension === dimension);
    assert.equal(obs.redundant, false, `${startup}/${dimension}: "${text}"`);
  }
});

// Review finding 1 (2026-08-23): the acquisition guard checked only that an
// acquisition verb PRECEDES the token, not that the token is that verb's
// object rather than sitting in a trailing "for the X" prepositional phrase.
// In each of these the acquired artifact is the offerings/roadmap; the
// satisfied token is scope. All three FIRE before the "for" fix below and
// must not after it — this is a lower-bound correctness defect, not a
// sensitivity one.
test('spares: an acquisition verb governing a DIFFERENT object, with the token only in a trailing "for" phrase', () => {
  const cases = [
    ['MediSync Cebu', 'Market', 'Needs: develop offerings for the market segment.', MEDI],
    ['MediSync Cebu', 'Market', 'Needs: develop offerings for the target customer.', MEDI],
    ['AgroLink PH', 'Technology', 'Needs: develop a roadmap for the paper prototype.', AGRO],
  ];
  for (const [startup, dimension, text, spec] of cases) {
    const { observations } = scoreRedundantNeeds({ [dimension]: text }, spec);
    const obs = observations.find((o) => o.dimension === dimension);
    assert.equal(obs.redundant, false, `${startup}/${dimension}: "${text}"`);
  }
});

// Review finding 2 (2026-08-23): PROGRESSION_VERB was unanchored, so a
// progression word anywhere earlier in the clause could veto a token it does
// not actually govern. Both silent before anchoring; both must fire after.
test('fires: a progression verb earlier in the clause that does not govern the token', () => {
  const cases = [
    ['MediSync Cebu', 'Market', 'To grow revenue, the team should first identify a target customer profile.', MEDI],
    ['MediSync Cebu', 'Market', 'Further work is needed to define a clear market segment.', MEDI],
  ];
  for (const [startup, dimension, text, spec] of cases) {
    const { observations } = scoreRedundantNeeds({ [dimension]: text }, spec);
    const obs = observations.find((o) => o.dimension === dimension);
    assert.equal(obs.redundant, true, `${startup}/${dimension}: "${text}"`);
  }
});

// classifyClause returns null the instant no token is present at all —
// that only proves token-absence short-circuiting, never that the bin logic
// (negation/recommendation/assertion/unclassified) actually runs. This
// clause carries a real satisfied token but trips none of the three cues.
// None of the six pilot clauses above needs requirement 2 (the notArtifacts
// narrowing) to be excluded — each is already caught by requirement 1's
// progression-verb or origin/scope-preposition check. This clause is
// constructed to isolate requirement 2's own, independent contribution: an
// acquisition verb ("develop") genuinely precedes "target market" with no
// origin/scope preposition from requirement 1's list intervening — "for" is
// not among them — so requirement 1 alone would call this redundant. Only
// narrowing "target market" out of scoring (requirement 2) spares it.
// Confirmed by mutation: with `scoringTokens` in scoreRedundantNeeds pointed
// back at spec.satisfiedTokens, this test goes red while requirement 1 stays
// untouched — see task-7b-report.md.
test('spares: an acquisition verb governing "target market" as pure scope, with no blocking preposition present', () => {
  const { observations } = scoreRedundantNeeds(
    { Market: 'Needs: develop offerings for the target market.' },
    MEDI,
  );
  assert.equal(observations.find((o) => o.dimension === 'Market').redundant, false);
});

test('a mentioned token that is neither recommendation, negation, nor assertion lands unclassified', () => {
  const { observations } = scoreRedundantNeeds(
    { Technology: 'The paper prototype is intriguing to reviewers.' },
    AGRO,
  );
  const tech = observations.find((o) => o.dimension === 'Technology');
  assert.equal(tech.clauses.some((c) => c.klass === 'unclassified'), true);
  assert.equal(tech.redundant, false);
});
