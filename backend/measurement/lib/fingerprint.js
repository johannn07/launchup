/**
 * Comparability fingerprints, one per (metric, arm).
 *
 * Per-metric alone is too coarse: a rubric change can affect a CORPUS arm while
 * leaving baseline and sdd-semantic identical, and a per-metric hash would
 * discard those two arms' still-valid data. Per (metric, arm) keeps exactly
 * what is comparable.
 *
 * Dependencies per metric:
 *   levels      -> levels prompt, renderRubricBlock, fullLadderRubrics, the
 *                  arm's rubric scope, plus a corpus content hash for corpus
 *                  arms — a row count would miss a same-length row edit
 *   rna         -> RNA prompt, readinessLevelBlock (every arm gets it),
 *                  renderRubricBlock, rubric scope, the stage-marker lexicon
 *                  (metric 2 scores with it), and the same corpus hash
 *   fabrication -> hallucination prompt and the field lists
 *
 * The helpers are hashed explicitly because `.toString()` on a builder does not
 * include the body of anything it calls — hashing only rnaPrompt, levelsPrompt
 * and hallucinationPrompt would leave every fingerprint unchanged when
 * readinessLevelBlock, renderRubricBlock or fullLadderRubrics changes.
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
 * @param {object} [spec.absences]       HARD_ABSENCES - the assertion probe's hard-coded absence list
 * @param {object} [spec.inflatedLevels] INFLATED_OVERRIDE - the assertion probe's inflated-condition levels
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
    absences,
    inflatedLevels,
  } = spec;

  // Content hash, not the row count mergeRuns' envKey already checks — editing
  // a row's title, content or keyTerms changes the prompt but not the count.
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
    // A corpus-less arm gets no rubric on either probe, so scope and corpus
    // changes cannot affect it. 'none'/null is what lets its old data keep
    // pooling across both a ladder change and a corpus edit.
    // An arm may override the ladder's rendering scope (see deviation-titles).
    // Arms without an override keep the spec-level default, so their hashes are
    // untouched by the introduction of a new arm.
    const levelsScope = arm.ragCorpus ? (arm.levelsRubricScope ?? levelsRubricScope) : 'none';
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
      // Only hashed for arms that actually use the alternate renderer.
      // JSON.stringify drops undefined keys, so every other arm's material —
      // and therefore its hash — is byte-identical to before this existed.
      titlesRendererSrc:
        levelsScope === 'full-ladder-titles-only' ? sources.renderTitlesOnlyBlock : undefined,
      bareRendererSrc:
        levelsScope === 'full-ladder-bare-titles' ? sources.renderBareTitlesBlock : undefined,
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

    // Additive only. JSON.stringify drops undefined, and a new KEY cannot
    // change an existing one's material — so every hash above is untouched.
    if (sources.assertion) {
      const assertionMaterial = {
        src: sources.rna,
        readinessLevelBlockSrc: sources.readinessLevelBlock,
        renderRubricBlockSrc: sources.renderRubricBlock,
        common,
        scope: rnaScope,
        rubricMode: arm.rubricMode,
        corpusHash: corpusHashForArm,
        // Scoring is part of comparability here: re-scoring old text with an
        // edited classifier or an edited token list is a different measurement.
        classifierSrc: sources.assertion,
        absences,
      };
      out[`assertion|${arm.name}`] = hash(assertionMaterial);
      out[`assertion-inflated|${arm.name}`] = hash({ ...assertionMaterial, inflatedLevels });
    }
  }
  return out;
}

module.exports = { fingerprintMap };
