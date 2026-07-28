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

test('a marker does not match inside a longer word', () => {
  // "ipo" is a substring of "IPOPHL" (Philippine Intellectual Property Office).
  // Both seeded startups mention IPOPHL. Recommending trademark registration
  // is perfectly stage-appropriate for level-1 Regulatory, not a hallucination.
  const agrolink = '...the "AgroLink PH" wordmark has not been registered with IPOPHL.';
  const medisync = 'Trademark application filed with IPOPHL, pending.';
  assert.equal(isStageInappropriate(agrolink, 'Regulatory', 1), false);
  assert.equal(isStageInappropriate(medisync, 'Regulatory', 1), false);
});

test('the same marker still fires as a whole word', () => {
  // "ipo" fires as a whole word even with IPOPHL present.
  assert.equal(isStageInappropriate('Prepare for an IPO next year.', 'Technology', 2), true);
});

test('no marker matches a seeded document only as a sub-word', () => {
  // Guard: Seeded docs should not trigger any markers when using whole-word
  // matching. If a marker appears as a bare substring in a seeded doc,
  // confirm that whole-word matching correctly rejects it (e.g., "ipo" inside
  // "IPOPHL"). This verifies the fix prevents false positives.
  const docs = {
    'AgroLink PH': `Title: AgroLink PH: Cooperative Market Access Platform
Description: Connects smallholder farmer cooperatives in Central Luzon directly to institutional buyers.
Problem Statement: Smallholder farmers sell through a chain of traders and capture only a fraction of the final market price.
Target Market: Rice and vegetable cooperatives in Nueva Ecija and Tarlac (roughly 400 cooperatives).
Solution: A mobile-first platform where cooperative officers register expected harvest volumes and buyers post standing demand. Includes SMS fallback.
Timeline: 2025-06 field interviews with 18 cooperatives. 2025-09 paper prototype of the lot-aggregation flow tested with 3 cooperatives. 2026-01 two founders committed full-time; provisional agreement with one buyer.
Revenue: None to date.
IP Status: No patents filed. The "AgroLink PH" wordmark has not been registered with IPOPHL.
Team: Rafael Domingo (6 years agricultural extension officer), Ana Beltran (4 years backend engineer).`,
    'MediSync Cebu': `Title: MediSync Cebu: Referral Coordination for Provincial Clinics
Description: Links rural health units across Cebu province with district and tertiary hospitals, replacing a paper-and-phone referral process.
Problem Statement: Referrals move by handwritten form and phone call; clinical history is frequently lost in transit.
Target Market: The 44 rural health units in Cebu province, 8 district hospitals, and 3 tertiary referral centres.
Solution: A web-based form (with SMS and paper-form fallback) captures referring provider, patient condition (by ICD code), and urgency.
Timeline: 2025-02 three pilot clinics actively use the system. 2025-05 feasibility study across all rural health units. Awaiting approval from provincial health office.
Revenue: None to date.
IP Status: No patents. Trademark application filed with IPOPHL, pending.
Team: Dr. Marian Santos (8 years public health), Giancarlo Rossi (3 years fullstack engineer).`
  };

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBoundary = (phrase) => new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i');

  const falsePositives = [];
  for (const [name, text] of Object.entries(docs)) {
    for (const m of MARKERS) {
      const wholeMatch = wordBoundary(m.phrase).test(text);
      if (wholeMatch) {
        falsePositives.push(`${m.phrase} in ${name}`);
      }
    }
  }

  assert.deepEqual(falsePositives, [], `markers incorrectly matched in seeded docs: ${falsePositives.join(', ')}`);
});
