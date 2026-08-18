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

/** Mean of the scoreable pairs. Nulls are dropped, never averaged in as 0. */
function meanScoreable(values) {
  const scoreable = values.filter((v) => v !== null);
  if (!scoreable.length) return { mean: null, n: 0 };
  return { mean: scoreable.reduce((a, b) => a + b, 0) / scoreable.length, n: scoreable.length };
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

  const c = meanScoreable(cross);
  const w = meanScoreable(within);
  return {
    nEarly: earlySets.length,
    nMid: midSets.length,
    crossOverlap: c.mean,
    nCrossPairs: c.n,
    withinOverlap: w.mean,
    nWithinPairs: w.n,
    separation: c.mean === null || w.mean === null ? null : w.mean - c.mean,
  };
}

module.exports = { normalizeField, fieldSet, jaccard, overlapStats };
