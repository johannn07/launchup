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
 *   levels      -> the levels prompt source, renderRubricBlock's source,
 *                  fullLadderRubrics' source, the rubric scope that arm
 *                  receives, and (for a corpus arm only) a content hash of
 *                  the full RUBRICS corpus - not just its row count, which a
 *                  same-length edit to any row's title/content/keyTerms
 *                  would leave unchanged
 *   rna         -> the RNA prompt source, readinessLevelBlock's source (every
 *                  arm gets this block, not just corpus arms), renderRubricBlock's
 *                  source, that arm's rubric scope, the stage-marker lexicon
 *                  (metric 2 is scored with it), and the same corpus content
 *                  hash for a corpus arm
 *   fabrication -> the hallucination prompt source and the field lists
 *
 * A hash of only the three top-level prompt BUILDERS (rnaPrompt, levelsPrompt,
 * hallucinationPrompt) misses every helper they call internally - their
 * `.toString()` does not include a called function's body. readinessLevelBlock,
 * renderRubricBlock and fullLadderRubrics are exactly that: called from inside
 * the builders, invisible to the builders' own source text, so a change to any
 * of the three (e.g. reverting confound 1's levels-block fix) would leave every
 * fingerprint unchanged. They are hashed explicitly here for that reason.
 */
const crypto = require('crypto');

const hash = (material) =>
  crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 12);

/**
 * @param {object} spec
 * @param {object} spec.common      grounding instruction, dimensions, startups (docs + levels + field lists)
 * @param {Array}  spec.markers     the stage-marker lexicon
 * @param {Array}  [spec.rubrics]   the full RUBRICS corpus - one entry per row, each with at
 *                                  least title/content/keyTerms/key/readinessType/level
 * @param {object} spec.sources     { rna, levels, fabrication, readinessLevelBlock,
 *                                    renderRubricBlock, fullLadderRubrics } - prompt-builder
 *                                  and prompt-helper source text
 * @param {Array}  spec.arms        ARMS
 * @param {string} [spec.levelsRubricScope]  'full-ladder' | 'current-and-next' | 'none'
 * @param {string} [spec.rnaRubricScope]     'current-and-next' | 'none'
 */
function fingerprintMap(spec) {
  const {
    common,
    markers,
    rubrics = [],
    sources,
    arms,
    levelsRubricScope = 'full-ladder',
    rnaRubricScope = 'current-and-next',
  } = spec;

  // A content hash of the corpus itself, not just corpusRows' row count
  // (mergeRuns' envKey already checks that separately). Editing a row's
  // title, content or keyTerms changes what a corpus arm's prompt actually
  // says without changing the row count, so the count alone cannot catch it.
  const corpusHash = hash(
    rubrics.map((r) => ({
      key: r.key,
      readinessType: r.readinessType,
      level: r.level,
      title: r.title,
      content: r.content,
      keyTerms: r.keyTerms,
    })),
  );

  const out = {};
  for (const arm of arms) {
    // An arm with no corpus receives no rubric on either probe, so a change to
    // the rubric SCOPE, or to the corpus content behind it, cannot affect it.
    // Recording 'none'/null is what lets its old data keep pooling across
    // both a ladder change and a corpus edit.
    const levelsScope = arm.ragCorpus ? levelsRubricScope : 'none';
    const rnaScope = arm.ragCorpus ? rnaRubricScope : 'none';
    const corpusHashForArm = arm.ragCorpus ? corpusHash : null;

    out[`levels|${arm.name}`] = hash({
      src: sources.levels,
      renderRubricBlockSrc: sources.renderRubricBlock,
      fullLadderRubricsSrc: sources.fullLadderRubrics,
      common,
      scope: levelsScope,
      rubricMode: arm.rubricMode,
      corpusHash: corpusHashForArm,
    });
    out[`rna|${arm.name}`] = hash({
      src: sources.rna,
      readinessLevelBlockSrc: sources.readinessLevelBlock,
      renderRubricBlockSrc: sources.renderRubricBlock,
      common,
      scope: rnaScope,
      rubricMode: arm.rubricMode,
      markers,
      corpusHash: corpusHashForArm,
    });
    out[`fabrication|${arm.name}`] = hash({ src: sources.fabrication, common, scope: rnaScope, rubricMode: arm.rubricMode });
  }
  return out;
}

module.exports = { fingerprintMap };
