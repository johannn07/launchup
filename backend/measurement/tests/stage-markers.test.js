const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { MARKERS, markersFor, offendingMarkers, isStageInappropriate } =
  require(path.resolve(__dirname, '../lib/stage-markers.js'));
const { RUBRICS, STARTUPS, DIMENSIONS } =
  require(path.resolve(__dirname, '../measure-grounding.js'));

// Constraint 1 from the spec. A marker that collides with corpus wording lets
// the corpus arm's own retrieved text be scored against it - contamination
// regardless of which direction it pushes the number.
test('no marker phrase collides with any corpus keyTerm', () => {
  const clashes = [];
  for (const m of MARKERS) {
    for (const r of RUBRICS) {
      for (const kt of r.keyTerms) {
        const a = m.phrase.toLowerCase();
        const b = kt.toLowerCase();
        if (a.includes(b) || b.includes(a)) clashes.push(`${m.phrase} <-> ${kt} (${r.key})`);
      }
    }
  }
  assert.deepEqual(clashes, [], `lexicon collides with corpus keyTerms:\n${clashes.join('\n')}`);
});

// Constraint 2 from the spec. A cell with no applicable marker above its
// threshold scores 0 forever and silently dilutes the rate.
test('a stage-inappropriate recommendation is detectable in all 12 cells', () => {
  const unreachable = [];
  for (const [name, s] of Object.entries(STARTUPS)) {
    for (const dim of DIMENSIONS) {
      const level = s.levels[dim];
      const applicable = markersFor(dim).filter((m) => m.minLevel > level + 2);
      if (applicable.length === 0) unreachable.push(`${name}/${dim} (L=${level})`);
    }
  }
  assert.deepEqual(unreachable, [], `no detectable failure in: ${unreachable.join(', ')}`);
});

test('flags an over-advanced recommendation for an early-stage dimension', () => {
  // AgroLink Technology is level 2, so the horizon is 4. "commercialization"
  // is minLevel 7 - SO 1.3's own example of a hallucination.
  assert.equal(isStageInappropriate('Begin commercialization across Luzon.', 'Technology', 2), true);
});

test('does not flag the same phrase for a mid-stage dimension', () => {
  // MediSync Technology is level 5, horizon 7. minLevel 7 is not > 7.
  assert.equal(isStageInappropriate('Begin commercialization across Luzon.', 'Technology', 5), false);
});

test('flags a higher marker even at mid-stage', () => {
  assert.equal(isStageInappropriate('Plan the IPO.', 'Technology', 5), true);
});

test('matching is case-insensitive', () => {
  assert.equal(isStageInappropriate('Prepare for an IPO next year.', 'Technology', 2), true);
});

test('dimension-scoped markers do not fire on other dimensions', () => {
  const text = 'Obtain certification granted by the agency.';
  assert.equal(isStageInappropriate(text, 'Regulatory', 1), true);
  assert.equal(isStageInappropriate(text, 'Technology', 1), false);
});

test('text with no markers is appropriate', () => {
  assert.equal(
    isStageInappropriate('Interview three more cooperatives to confirm demand.', 'Market', 2),
    false,
  );
});

test('offendingMarkers reports which phrase fired', () => {
  const hits = offendingMarkers('Plan the IPO and franchise nationally.', 'Market', 1);
  assert.deepEqual(hits.map((m) => m.phrase).sort(), ['franchise', 'ipo']);
});

test('non-string input is not scored as a failure', () => {
  assert.equal(isStageInappropriate(undefined, 'Market', 1), false);
});
