/**
 * Comparability fingerprints, one per (metric, arm).
 *
 * Per-metric alone is not enough. Fixing the levels-probe leak changes the
 * rubric a CORPUS arm sees while leaving baseline and sdd-semantic untouched
 * (both get an empty block before and after), so a per-metric hash would
 * discard two arms' worth of still-valid data along with the one that really
 * did change. Per (metric, arm) keeps exactly what is comparable.
 *
 * What each metric depends on:
 *   levels      -> the levels prompt source, the rubric scope that arm receives
 *   rna         -> the RNA prompt source, that arm's rubric scope, AND the
 *                  stage-marker lexicon, since metric 2 is scored with it
 *   fabrication -> the hallucination prompt source and the field lists
 */
const crypto = require('crypto');

const hash = (material) =>
  crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 12);

/**
 * @param {object} spec
 * @param {object} spec.common      grounding instruction, dimensions, startups (docs + levels + field lists)
 * @param {Array}  spec.markers     the stage-marker lexicon
 * @param {object} spec.sources     { rna, levels, fabrication } - prompt-builder source text
 * @param {Array}  spec.arms        ARMS
 * @param {string} [spec.levelsRubricScope]  'full-ladder' | 'current-and-next' | 'none'
 * @param {string} [spec.rnaRubricScope]     'current-and-next' | 'none'
 */
function fingerprintMap(spec) {
  const {
    common,
    markers,
    sources,
    arms,
    levelsRubricScope = 'full-ladder',
    rnaRubricScope = 'current-and-next',
  } = spec;

  const out = {};
  for (const arm of arms) {
    // An arm with no corpus receives no rubric on either probe, so a change to
    // the rubric SCOPE cannot affect it. Recording 'none' is what lets its old
    // data keep pooling across the ladder change.
    const levelsScope = arm.ragCorpus ? levelsRubricScope : 'none';
    const rnaScope = arm.ragCorpus ? rnaRubricScope : 'none';

    out[`levels|${arm.name}`] = hash({ src: sources.levels, common, scope: levelsScope, rubricMode: arm.rubricMode });
    out[`rna|${arm.name}`] = hash({ src: sources.rna, common, scope: rnaScope, rubricMode: arm.rubricMode, markers });
    out[`fabrication|${arm.name}`] = hash({ src: sources.fabrication, common, scope: rnaScope, rubricMode: arm.rubricMode });
  }
  return out;
}

module.exports = { fingerprintMap };
