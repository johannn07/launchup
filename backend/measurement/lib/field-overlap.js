/**
 * Metric 3's replacement statistic: do two startups get told the same things?
 *
 * The count columns cannot answer that. `criticalCount` ceilings at 3 in a
 * three-sentence summary, and `unmetCriteria` came back 4,4 / 3,5 / 4 / 4,4,4
 * across both 2026-08-18 runs - coinciding means over values that differ in no
 * consistent direction. Uniform harshness means citing the *same proposal
 * fields* about both startups, which is what SO 4.2 actually claims not to do.
 */

/**
 * proposal_field is a bare STRING in the response schema (ai.service.ts:178),
 * not an enum, so one field arrives in several spellings. Without this every
 * overlap number reads low for a formatting reason.
 */
function normalizeField(value) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The set of distinct proposal fields one call reached for. */
function fieldSet(detail) {
  const out = new Set();
  for (const c of detail ?? []) {
    const key = normalizeField(c?.proposalField);
    // A blank proposal_field is not a citation. Admitting it as '' would make
    // two calls that both failed to name a field look like they agreed on one.
    if (key) out.add(key);
  }
  return out;
}

/**
 * |A n B| / |A u B|, or null when both sets are empty.
 *
 * 0/0 is undefined and MUST NOT be read as 1. The baseline arm cites no fields
 * at all - legacySummaryOnly has no criteria field to fill - so scoring it as
 * perfect agreement would report that arm as maximally uniform on the strength
 * of a missing schema field rather than anything the model did.
 */
function jaccard(a, b) {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return null;
  let shared = 0;
  for (const k of a) if (b.has(k)) shared += 1;
  return shared / union.size;
}

/**
 * The scoreable pairs and their mean. Nulls are dropped, never averaged in as 0
 * and never present as a low value - an unscoreable pair is an absent
 * observation. The values themselves are returned because the pre-registered
 * rule is min/max over them, not a comparison of means.
 */
function scoreablePairs(values) {
  const scoreable = values.filter((v) => v !== null);
  if (!scoreable.length) return { mean: null, n: 0, values: [] };
  return {
    mean: scoreable.reduce((a, b) => a + b, 0) / scoreable.length,
    n: scoreable.length,
    values: scoreable,
  };
}

/** Jaccard for every unordered pair of distinct members of one list. */
function selfPairs(sets) {
  const out = [];
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) out.push(jaccard(sets[i], sets[j]));
  }
  return out;
}

/**
 * Metric 3's statistic. `earlySets`/`midSets` are one fieldSet per successful
 * call of one arm on that startup.
 *
 * `withinOverlap` is the point of the design: how much the arm repeats itself
 * about ONE startup across reps is the noise floor that `crossOverlap` has to
 * be read against. The old guard tested `gap !== 0` with no floor at all, which
 * is how a single call produced a PASS.
 *
 * No verdict is returned. The margin that would turn `separation` into
 * PASS/FAIL is deliberately not set here - it has never been observed, and
 * setting it from the same run it would score is the post-hoc move the
 * fingerprint guard exists to forbid. Part 3 pre-registers it.
 */
function overlapStats(earlySets, midSets) {
  const cross = [];
  for (const e of earlySets) for (const m of midSets) cross.push(jaccard(e, m));
  const within = [...selfPairs(earlySets), ...selfPairs(midSets)];

  const c = scoreablePairs(cross);
  const w = scoreablePairs(within);
  return {
    nEarly: earlySets.length,
    nMid: midSets.length,
    crossOverlap: c.mean,
    nCrossPairs: c.n,
    crossPairValues: c.values,
    withinOverlap: w.mean,
    nWithinPairs: w.n,
    withinPairValues: w.values,
    separation: c.mean === null || w.mean === null ? null : w.mean - c.mean,
  };
}

/**
 * The n bar, pre-registered with the rule. BOTH conditions are required:
 * MIN_QUOTABLE_REPS alone would admit grids whose chance reference is weak, and
 * MAX_CHANCE_REFERENCE alone would admit a lopsided 4x2 grid carrying a single
 * mid-side within-pair. Below the bar a comparison is still reported - it is
 * just not quotable.
 */
const MIN_QUOTABLE_REPS = 3;
const MAX_CHANCE_REFERENCE = 0.001;

/**
 * The decision rule, pre-registered in
 * docs/superpowers/specs/2026-08-19-differentiation-margin-design.md BEFORE any
 * generation it scores. The two pair distributions must not overlap at all.
 *
 * No constant, deliberately. This is the same logic that made `ratio < 0.75`
 * quotable - that threshold was defensible because the arms sat in a gap with no
 * overlap, not because 0.75 was independently justified. Complete separation
 * states the condition instead of encoding it as a number.
 *
 * Strict `>`, so a TIE FAILS. The rule does not resolve ambiguity toward PASS:
 * PASS is the claim being made and should cost something. Same call as exactly
 * 0.75 counting as balanced in summary-tone.ts.
 */
function completeSeparation(crossValues, withinValues) {
  if (!crossValues.length || !withinValues.length) return null;
  return Math.min(...withinValues) > Math.max(...crossValues);
}

/** C(n, k), multiplicatively so the intermediate terms stay small. */
function binomial(n, k) {
  const kk = Math.min(k, n - k);
  let out = 1;
  for (let i = 1; i <= kk; i += 1) out = (out * (n - kk + i)) / i;
  return out;
}

/**
 * Probability that every within pair lands above every cross pair under random
 * relabelling of the pooled pairs: 1 / C(nCross + nWithin, nWithin).
 *
 * OPTIMISTIC, and the pre-registration says so: this assumes the pair values are
 * exchangeable and independent, and they are neither - pairs share reps. It is
 * part of a pre-registered decision rule, NOT a significance test, and must
 * never be reported as a p-value.
 */
function chanceReference(nCross, nWithin) {
  if (!nCross || !nWithin) return null;
  return 1 / binomial(nCross + nWithin, nWithin);
}

module.exports = {
  MIN_QUOTABLE_REPS,
  MAX_CHANCE_REFERENCE,
  normalizeField,
  fieldSet,
  jaccard,
  overlapStats,
  completeSeparation,
  chanceReference,
};
