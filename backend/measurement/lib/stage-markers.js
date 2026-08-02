/**
 * Metric 2's scoring engine: does a generated RNA recommend actions that belong
 * to a readiness level well above where the startup actually sits?
 *
 * This is SO 1.3's own example of a hallucination - "recommending
 * commercialization steps to a TRL 2 startup" - made mechanical. It replaces
 * the absent-field probe, which was both saturated (0/15 invented across every
 * arm) and aimed at something the corpus cannot influence: the corpus holds
 * readiness rubrics, not burn rates or investor names.
 *
 * The lexicon is AUTHORED, with no external source, and is held disjoint from
 * the corpus's own keyTerms - enforced by a test, not a convention. See
 * tests/stage-markers.test.js.
 */
const path = require('path');

const { markers: MARKERS } = require(path.join(__dirname, '../data/stage-markers.json'));

/**
 * An RNA is a *recommended next action*, so the appropriate horizon is the
 * current rung plus roughly two. Recommending beyond that is the failure mode.
 * Overshoot only: undershoot is not a described failure mode, and scoring it
 * here would blur this metric against Objective 4's leniency concern.
 */
const HORIZON = 2;

/** Markers that apply to a dimension. `dimensions: null` means all of them. */
function markersFor(dimension) {
  return MARKERS.filter((m) => m.dimensions === null || m.dimensions.includes(dimension));
}

/** Which markers in `text` are above the horizon for this (dimension, level). */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordBoundary = (phrase) => new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i');

function offendingMarkers(text, dimension, level) {
  if (typeof text !== 'string') return [];
  // Use word-boundary matching instead of substring matching. A bare `includes`
  // test matches "ipo" inside "IPOPHL" (Philippine Intellectual Property Office)
  // in seeded documents, falsely flagging perfectly stage-appropriate trademark
  // registration advice as a level-9 hallucination. Word boundaries prevent that
  // false positive while still catching the intended cases. Trade-off: no inflected
  // forms ("franchise" won't match "franchisee"), which is acceptable — under-count
  // is safer than fabricating a failure.
  return markersFor(dimension)
    .filter((m) => m.minLevel > level + HORIZON)
    .filter((m) => wordBoundary(m.phrase).test(text));
}

function isStageInappropriate(text, dimension, level) {
  return offendingMarkers(text, dimension, level).length > 0;
}

module.exports = { MARKERS, HORIZON, markersFor, offendingMarkers, isStageInappropriate };
