const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { SATISFACTIONS, verifySatisfactions } = require(path.resolve(__dirname, '../lib/satisfactions.js'));
const { STARTUPS } = require(path.resolve(__dirname, '../measure-grounding.js'));

const DOCS = Object.fromEntries(Object.entries(STARTUPS).map(([name, s]) => [name, s.doc]));

test('every evidence phrase appears verbatim in its own document', () => {
  assert.equal(verifySatisfactions(DOCS), true);
});

test('verifySatisfactions throws when an evidence phrase is not in the document', () => {
  assert.throws(
    () => verifySatisfactions({ ...DOCS, 'AgroLink PH': 'Title: AgroLink PH\nRevenue: None to date.' }),
    /SATISFACTIONS is wrong/,
  );
});

test('it is keyed per startup, because satisfaction does not generalise across documents', () => {
  assert.deepEqual(Object.keys(SATISFACTIONS).sort(), ['AgroLink PH', 'MediSync Cebu']);
});

test('only the deflated dimensions are specified — O/R/I have no deflation room', () => {
  for (const dims of Object.values(SATISFACTIONS)) {
    assert.deepEqual(Object.keys(dims).sort(), ['Acceptance', 'Market', 'Technology']);
  }
});

// Mirrors assertions.test.js:155-177 for HARD_ABSENCES — same broad/narrow
// device, same two failure modes to guard: a narrow token from nowhere, and a
// notArtifacts entry that silently removes nothing.
test('the narrow artifactTokens list is a subset of satisfiedTokens, plus multiword refinements', () => {
  for (const [startup, dims] of Object.entries(SATISFACTIONS)) {
    for (const [dim, spec] of Object.entries(dims)) {
      for (const t of spec.artifactTokens) {
        const derived = spec.satisfiedTokens.includes(t) || (spec.artifactExtras || []).includes(t);
        assert.ok(derived, `${startup}/${dim}: "${t}" is in neither satisfiedTokens nor artifactExtras`);
      }
    }
  }
});

test('every notArtifacts entry matches something in its own satisfiedTokens', () => {
  for (const [startup, dims] of Object.entries(SATISFACTIONS)) {
    for (const [dim, spec] of Object.entries(dims)) {
      for (const t of spec.notArtifacts || []) {
        assert.ok(
          spec.satisfiedTokens.includes(t),
          `${startup}/${dim}: notArtifacts entry "${t}" matches nothing in satisfiedTokens — typo or wrong case silently no-ops`,
        );
      }
    }
  }
});

test('"target market" is narrowed out of Market\'s artifactTokens for both startups', () => {
  for (const startup of ['AgroLink PH', 'MediSync Cebu']) {
    const market = SATISFACTIONS[startup].Market;
    assert.ok(market.satisfiedTokens.includes('target market'), `${startup}: broad list lost "target market"`);
    assert.ok(!market.artifactTokens.includes('target market'), `${startup}: narrow list still has "target market"`);
  }
});

test('no satisfied token collides with a corpus keyTerm', async () => {
  // Mirrors tests/stage-markers.test.js:17-24. A collision would penalise the
  // corpus arm for echoing its own prompt, confounding pre-registered
  // prediction 2 in the corpus arm's disfavour.
  const { RUBRICS } = require(path.resolve(__dirname, '../measure-grounding.js'));
  const keyTerms = new Set();
  for (const r of RUBRICS) for (const kt of r.keyTerms ?? []) keyTerms.add(String(kt).toLowerCase());

  const clashes = [];
  for (const [startup, dims] of Object.entries(SATISFACTIONS)) {
    for (const [dim, spec] of Object.entries(dims)) {
      for (const t of spec.satisfiedTokens) {
        if (keyTerms.has(t.toLowerCase())) clashes.push(`${startup}/${dim}: "${t}"`);
      }
    }
  }
  assert.deepEqual(clashes, [], `satisfied tokens collide with corpus keyTerms:\n${clashes.join('\n')}`);
});
