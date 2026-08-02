/**
 * Metric 2's scoring engine: does a generated RNA recommend actions belonging
 * to a readiness level well above where the startup sits?
 *
 * SO 1.3's own hallucination example — "recommending commercialization steps to
 * a TRL 2 startup" — made mechanical. Replaces the absent-field probe, which
 * was saturated (0/15 invented across every arm) and aimed at something the
 * corpus cannot influence: it holds rubrics, not burn rates or investor names.
 *
 * The lexicon is AUTHORED with no external source, and held disjoint from the
 * corpus keyTerms by a test rather than convention.
 */
const path = require('path');

const { markers: MARKERS } = require(path.join(__dirname, '../data/stage-markers.json'));

/**
 * An RNA is a *next action*, so the horizon is the current rung plus about two.
 * Overshoot only — undershoot is not a described failure mode, and scoring it
 * would blur this metric against Objective 4's leniency concern.
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
  // Word boundaries, not `includes`: a bare substring test matches "ipo" inside
  // "IPOPHL" (Philippine IP Office) in seeded documents, flagging routine
  // trademark advice as a level-9 hallucination. Costs inflected forms
  // ("franchise" won't match "franchisee") — under-counting beats fabricating.
  return markersFor(dimension)
    .filter((m) => m.minLevel > level + HORIZON)
    .filter((m) => wordBoundary(m.phrase).test(text));
}

function isStageInappropriate(text, dimension, level) {
  return offendingMarkers(text, dimension, level).length > 0;
}

module.exports = { MARKERS, HORIZON, markersFor, offendingMarkers, isStageInappropriate };
