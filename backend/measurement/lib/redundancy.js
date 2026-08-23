/**
 * Metric 6 — the redundant-need rate. The mirror of lib/assertions.js'
 * scoreAssertedAbsences, on the same segmentation and the same classifier.
 *
 *   metric 5: absent tokens   x `asserted`    — claims an artifact that isn't there
 *   metric 6: satisfied tokens x `recommended` — asks for one that already is
 *
 * classifyClause is generic over its token list, so nothing here forks it and
 * nothing here touches its cues. Editing those would change CLASSIFIER_SOURCE
 * and orphan every stored metric-5 fingerprint.
 *
 * LOWER BOUND, with a named uncaught class: NEGATION is tested before
 * RECOMMENDATION, so "has not yet secured any paying customer" bins as
 * `negated`, not `recommended`. That is a real and arguably worse failure —
 * falsely denying evidenced fact — so it is counted separately as `denied` and
 * never folded into the headline.
 */

const { splitClauses, classifyClause, CLASSIFIER_SOURCE } = require('./assertions.js');

const CONTINUATION = /^\s*(?:and|or|then)\b/i;

/**
 * One binary observation per (call, dimension): did this dimension's text
 * recommend at least one artifact the document already evidences?
 *
 * Binary rather than a token count, because counting rewards verbosity and the
 * corpus arm writes longer RNAs — the same rule metric 5 uses.
 *
 * A dimension the model omitted is skipped rather than scored clean. Watch n.
 */
function scoreRedundantNeeds(rnaByDim, satisfactions) {
  const observations = [];
  for (const [dimension, spec] of Object.entries(satisfactions ?? {})) {
    const text = rnaByDim?.[dimension];
    if (typeof text !== 'string') continue;

    const clauses = [];
    let scope = '';
    for (const clause of splitClauses(text)) {
      const continuation = CONTINUATION.test(clause);
      const klass = classifyClause(clause, spec.satisfiedTokens, continuation ? scope : '');
      if (!continuation) scope = clause;
      if (klass) clauses.push({ text: clause, klass });
    }

    observations.push({
      dimension,
      mentioned: clauses.length > 0,
      redundant: clauses.some((c) => c.klass === 'recommended'),
      denied: clauses.some((c) => c.klass === 'negated'),
      clauses,
    });
  }
  return { observations };
}

/**
 * What `redundancy|*` hashes. classifyClause's own cue regexes decide
 * `recommended` here exactly as they decide `asserted` for metric 5, so
 * CLASSIFIER_SOURCE is included, not just this module's own additions —
 * editing a cue changes redundancy scoring too, not only assertion scoring.
 */
const REDUNDANCY_SOURCE = [CLASSIFIER_SOURCE, CONTINUATION.source, scoreRedundantNeeds.toString()].join('\n');

module.exports = { scoreRedundantNeeds, REDUNDANCY_SOURCE };
