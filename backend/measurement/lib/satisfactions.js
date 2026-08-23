/**
 * Reference-free satisfaction specification — the mirror of lib/hard-absences.js.
 *
 * Metric 5 asks whether generated text ASSERTS an artifact the document never
 * mentions. Metric 6 asks whether it RECOMMENDS one the document shows already
 * exists. Same documents, same classifier, opposite direction.
 *
 * Keyed by (startup, dimension), unlike HARD_ABSENCES which is keyed by
 * dimension alone: absence generalises across these two documents, satisfaction
 * does not.
 *
 * `evidence` is asserted VERBATIM against the document at run time. Asserting
 * the TOKEN instead would be wrong in the one direction that matters — the
 * string "Revenue" appears in AgroLink's document inside "Revenue: None to
 * date.", so a token-presence check would certify an absence as satisfied.
 *
 * Only T/M/A are specified. They are the dimensions `deflated` manipulates;
 * O/R/I sit at O2 R1 I1 for both startups and have no deflation room.
 *
 * AUTHORED, with no external source — the same standing as
 * data/stage-markers.json, and it must be said whenever a figure is quoted.
 */
const SPECS = {
  'AgroLink PH': {
    Technology: {
      evidence: '2025-09 paper prototype of the lot-aggregation flow tested with 3 cooperatives.',
      satisfiedTokens: ['paper prototype', 'concept formulation', 'initial prototype'], // dropped 'proof of concept' — collides with corpus keyTerm
    },
    Market: {
      evidence: 'Target Market: Rice and vegetable cooperatives in Nueva Ecija and Tarlac (roughly 400 cooperatives).',
      satisfiedTokens: ['target market', 'market segment', 'customer segment', 'target customer'],
    },
    Acceptance: {
      evidence: '2025-06 field interviews with 18 cooperatives.',
      satisfiedTokens: ['user interview', 'customer interview', 'user feedback', 'initial user contact'],
    },
  },
  'MediSync Cebu': {
    Technology: {
      evidence: '2025-02 pilot with 2 rural health units and 1 district hospital.',
      satisfiedTokens: ['paper prototype', 'concept formulation', 'initial prototype'], // dropped 'proof of concept' — collides with corpus keyTerm
    },
    Market: {
      evidence: 'The 44 rural health units in Cebu province, 8 district hospitals, and 3 tertiary referral centres.',
      satisfiedTokens: ['target market', 'market segment', 'customer segment', 'target customer'],
    },
    Acceptance: {
      evidence: '2026-02 reached PHP 5,000 monthly recurring revenue',
      satisfiedTokens: ['paying customer', 'paid subscription', 'first customer'], // dropped 'willingness to pay' — collides with corpus keyTerm
    },
  },
};

const SATISFACTIONS = SPECS;

/** Fails loudly if an evidence phrase is not in its document — assert, don't trust. */
function verifySatisfactions(docs) {
  const violations = [];
  for (const [startup, dims] of Object.entries(SATISFACTIONS)) {
    const doc = docs[startup];
    if (typeof doc !== 'string') {
      violations.push(`${startup}: no document supplied`);
      continue;
    }
    for (const [dim, spec] of Object.entries(dims)) {
      if (!doc.includes(spec.evidence)) {
        violations.push(`${startup}/${dim}: evidence not found verbatim — "${spec.evidence}"`);
      }
    }
  }
  if (violations.length) throw new Error(`SATISFACTIONS is wrong:\n  ${violations.join('\n  ')}`);
  return true;
}

module.exports = { SATISFACTIONS, verifySatisfactions };
