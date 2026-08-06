/**
 * Scores generated RNA text for artifact classes the source documents never
 * mention, asserted as accomplished fact.
 *
 * Pure — no I/O, no model calls, no dependency on the harness — so it tests
 * standalone, like lib/metrics.js.
 *
 * The distinction this module exists for: at IRL 1, "draft a funding plan" is
 * the RNA doing its job and "the venture has drafted a funding plan" is a
 * fabrication. Both contain the same absent token, so token presence alone
 * cannot separate them.
 *
 * Every ambiguity resolves AWAY from fabrication, so the reported rate is a
 * lower bound — the same direction HARD_ABSENCES' generous ceilings already err.
 */

const NEGATION =
  /\b(?:no|not|never|none|lacks?|lacking|without|absent)\b|n['’]t\b|\b(?:absence|lack)\s+of\b|\b(?:yet|has\s+yet|have\s+yet)\s+to\b/i;

const RECOMMENDATION =
  /\b(?:should|must|need\s+to|needs\s+to|recommend(?:s|ed|ation)?|consider|begin|start|prioriti[sz]e|next\s+step|plan\s+to|aim\s+to|ought\s+to|advis(?:e|ed|able))\b/i;

/** Clause-initial bare imperative: "Engage counsel", "Draft a funding plan". */
const IMPERATIVE =
  /^(?:draft|engage|secure|hire|formali[sz]e|document|develop|establish|prepare|obtain|create|build|conduct|appoint|register)\b/i;

/**
 * Possession ("has a funding plan") and achievement ("counsel engaged", "is in
 * place") assert that an artifact exists. A bare copula does not: "investor
 * interest is growing" names no artifact, and admitting it would bias the rate
 * upward — the opposite of this module's lower-bound guarantee.
 *
 * Copula fabrications are still caught through their participle: "angel funding
 * is secured" matches `secured`, so no separate "is + X" alternative is needed.
 */
const ASSERTION =
  /\b(?:has|have|had|maintains?|holds?)\b|\b(?:secured|obtained|engaged|established|drafted|filed|signed|hired|appointed|registered|retained|completed|received|granted|issued)\b|\bin\s+place\b|\bunder\s+contract\b/i;

/** Multiword tokens like "term sheet" and "org chart" must match as phrases. */
const tokenRe = (token) =>
  new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i');

/**
 * Sentence boundaries, semicolons, and comma-joined coordination — plus the one
 * bare-conjunction case that matters: a negated report joined directly to its
 * recommendation ("has no funding plan and should draft one"). Splitting every
 * bare "and" would shred noun phrases ("counsel and compliance review") into
 * cue-less fragments and inflate the unclassified column for nothing.
 */
function splitClauses(text) {
  return String(text)
    .split(/(?<=[.!?])\s+|;\s*|,\s+(?=(?:and|but|while|whereas|although|though)\b)/i)
    .flatMap((part) =>
      part.split(
        /\s+(?:and|but)\s+(?=(?:it\s+|they\s+|the\s+\w+\s+)?(?:should|must|need|needs|consider|begin|start|prioriti[sz]e|plan\s+to|aim\s+to|ought)\b)/i,
      ),
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns null when the clause names no absent artifact at all.
 *
 * Order is load-bearing: negation, then recommendation, then assertion. A clause
 * holding both "has" and "not" is a correct report of an absence, and a clause
 * holding both "has" and "should" is advice. Testing assertion first would score
 * both as fabrications.
 */
function classifyClause(clause, tokens) {
  const text = String(clause);
  if (!tokens.some((t) => tokenRe(t).test(text))) return null;
  if (NEGATION.test(text)) return 'negated';
  if (RECOMMENDATION.test(text) || IMPERATIVE.test(text.trim())) return 'recommended';
  if (ASSERTION.test(text)) return 'asserted';
  return 'unclassified';
}

/**
 * One binary observation per (call, dimension): did this dimension's text assert
 * at least one absent artifact as present?
 *
 * Binary rather than a token count, because counting rewards verbosity and the
 * corpus arm writes longer RNAs.
 *
 * A dimension the model omitted is skipped rather than scored clean — same rule
 * as lib/metrics.js. Watch n.
 */
function scoreAssertedAbsences(rnaByDim, absences) {
  const observations = [];
  for (const [dimension, spec] of Object.entries(absences)) {
    const text = rnaByDim[dimension];
    if (typeof text !== 'string') continue;
    const clauses = [];
    for (const clause of splitClauses(text)) {
      const klass = classifyClause(clause, spec.absentTokens);
      if (klass) clauses.push({ text: clause, klass });
    }
    observations.push({
      dimension,
      mentioned: clauses.length > 0,
      asserted: clauses.some((c) => c.klass === 'asserted'),
      unclassified: clauses.some((c) => c.klass === 'unclassified'),
      clauses,
    });
  }
  return { observations };
}

module.exports = { splitClauses, classifyClause, scoreAssertedAbsences };
