/**
 * Comparability fingerprints for the summary-bias probe, one per (metric, arm).
 *
 * A separate file and a separate KEY SPACE from lib/fingerprint.js on purpose:
 * the metric families do not overlap, so pooling rules for `levels`/`rna`/
 * `fabrication` say nothing about `tone`/`criteria`/`differentiation`. Every
 * material carries `family: 'summary-bias'` and its own `metric`, which makes a
 * value collision with the grounding harness's map structurally impossible
 * rather than merely unlikely.
 *
 * Per (metric, arm), not per metric, for the reason lib/fingerprint.js's header
 * gives: editing the adversarial prompt must not discard the baseline arm's
 * still-valid rows.
 *
 * Dependencies per metric:
 *   tone            -> the arm's prompt(s), the common block, and summary-tone.ts
 *                      (it is the scorer - re-scoring old text with edited cues
 *                      is a different measurement)
 *   criteria        -> the arm's prompt(s) and the common block ONLY. unmet_criteria
 *                      counts come from the model, not from summary-tone.ts, so a
 *                      cue edit must NOT invalidate criteria data.
 *   differentiation -> same as tone; it reads criticalCount and unmet-criteria counts
 *
 * The ADVERSARIAL arm's material includes the LEGACY prompt as well, because the
 * adversarial arm's fallback runs it. Degraded rows are excluded from the means,
 * but the arm's definition still contains that path, and a legacy edit changes
 * what a degradation degrades TO.
 */
const crypto = require('crypto');

const hash = (material) =>
  crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 12);

/**
 * @param {object} spec
 * @param {object} spec.common   { genModel, temperature, grounding, startups } - `grounding`
 *                               is in here because groundPrompt() appends an instruction to
 *                               the prompt, so it changes what was measured; `startups` is
 *                               the two DTOs as sent, since a fixture edit is a new experiment
 * @param {object} spec.sources  { legacyPrompt, adversarialPrompt, tone } - prompt-builder
 *                               `.toString()`s and summary-tone.ts's file text
 * @param {Array}  spec.arms     [{ name, adversarialSummary }]
 */
function summaryFingerprintMap(spec) {
  const { common, sources, arms } = spec;
  const out = {};

  for (const arm of arms) {
    // An arm is defined by every prompt it can reach, not only the one it means
    // to use. See the header.
    const promptSrc = arm.adversarialSummary
      ? { adversarial: sources.adversarialPrompt, legacyFallback: sources.legacyPrompt }
      : { legacy: sources.legacyPrompt };

    const base = { family: 'summary-bias', promptSrc, common };

    out[`tone|${arm.name}`] = hash({ ...base, metric: 'tone', toneSrc: sources.tone });
    // No toneSrc: these are the model's own counts.
    out[`criteria|${arm.name}`] = hash({ ...base, metric: 'criteria' });
    out[`differentiation|${arm.name}`] = hash({
      ...base,
      metric: 'differentiation',
      toneSrc: sources.tone,
    });
  }

  return out;
}

module.exports = { summaryFingerprintMap, hash };
