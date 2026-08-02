/**
 * Pure scorers for the grounding harness. No I/O, no model calls, and no
 * dependency on the stage-marker lexicon - stageAppropriateness takes the
 * predicate as an argument so this module can be tested on its own.
 *
 * Every function skips a dimension the model omitted rather than scoring it as
 * a failure. A missing field is a schema-compliance problem, not evidence the
 * model ignored its grounding; conflating the two would let a model that
 * returns less look better. Watch the reported n for a low denominator.
 */

/**
 * Metric 1: how close did the model put the startup to where it actually sits?
 *
 * Ground truth is the seeded per-dimension StartupReadinessLevel, which is
 * independent of anything in the prompt - unlike "did the output resemble the
 * retrieved rubric", which structurally favours whichever arm was shown that
 * rubric and so measures parroting rather than grounding.
 */
function levelPlacement(assignedByDim, truthByDim, dimensions) {
  const errors = [];
  for (const dim of dimensions) {
    const assigned = assignedByDim[dim];
    const truth = truthByDim[dim];
    if (typeof assigned !== 'number' || typeof truth !== 'number') continue;
    errors.push(Math.abs(assigned - truth));
  }
  return {
    n: errors.length,
    mae: errors.length ? errors.reduce((s, e) => s + e, 0) / errors.length : NaN,
    exact: errors.filter((e) => e === 0).length,
    within1: errors.filter((e) => e <= 1).length,
  };
}

/**
 * Metric 2: how often did the RNA recommend an action from well above the
 * startup's actual rung? `isInappropriate(text, dimension, level)` is injected.
 */
function stageAppropriateness(rnaByDim, truthByDim, dimensions, isInappropriate) {
  let flagged = 0;
  let checked = 0;
  for (const dim of dimensions) {
    const text = rnaByDim[dim];
    if (typeof text !== 'string') continue;
    checked++;
    if (isInappropriate(text, dim, truthByDim[dim])) flagged++;
  }
  return { flagged, checked, rate: checked ? flagged / checked : NaN };
}

/** Metric 3: mid-stage mean minus early-stage mean, over flat level arrays. */
function differentiationGap(earlyLevels, midLevels) {
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const earlyMean = mean(earlyLevels);
  const midMean = mean(midLevels);
  return {
    earlyMean,
    midMean,
    earlyN: earlyLevels.length,
    midN: midLevels.length,
    gap: midMean - earlyMean,
  };
}

module.exports = { levelPlacement, stageAppropriateness, differentiationGap };
