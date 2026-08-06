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

/**
 * `need(?:s|ed|ing)?` rather than `need\s+to`: the model's modal form for a
 * requirement is a label — "Needs: Advance to ORL 3", "Need: Draft an initial
 * funding hypothesis", "Needs a defined financial model", "certifications
 * needed". Seven of fourteen unclassified clauses on 2026-08-06 were this.
 *
 * Widening here cannot raise the fabrication rate: classifyClause tests
 * recommendation before assertion, so a new match can only move a clause OUT of
 * `asserted`.
 */
const RECOMMENDATION =
  /\b(?:should|must|need(?:s|ed|ing)?|recommend(?:s|ed|ation)?|consider|begin|start|prioriti[sz]e|next\s+step|plan\s+to|aim\s+to|ought\s+to|advis(?:e|ed|able))\b/i;

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
 *
 * `exists` is the one existential added (measured 2026-08-06: "A basic funding
 * plan exists alongside PHP 5,000 MRR"). It is safe because it is a finite verb
 * requiring the artifact as its subject, unlike `existing`, an attributive
 * adjective. `existed` and `existing` were considered and REFUSED: "Existing
 * investor sentiment remains cautious despite early traction" asserts nothing,
 * and neither form has a measured instance. The gate against bare copulas
 * ("investor interest is growing") does not protect against attributive usage,
 * so the ordering argument for negation/recommendation precedence does not apply.
 * `remains` and `includes` were also refused for lack of measured instances.
 */
const ASSERTION =
  /\b(?:has|have|had|maintains?|holds?)\b|\b(?:secured|obtained|engaged|established|drafted|filed|signed|hired|appointed|registered|retained|completed|received|granted|issued)\b|\b(?:exists?)\b|\bin\s+place\b|\bunder\s+contract\b/i;

/**
 * Multiword tokens like "term sheet" and "org chart" must match as phrases.
 *
 * The optional plural is not cosmetic: RRL 4's own text reads "The specific
 * permits, licenses, or certifications required", so the plural is the form the
 * model echoes. Without it "Two permits have been issued" scored null — invisible
 * even to `mentioned`, which the README calls an upper bound.
 */
const tokenRe = (token) =>
  new RegExp(
    `\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?:s|es)?\\b`,
    'i',
  );

/**
 * Accompaniment asserts existence without a verb: "led by 3 founders alongside
 * a first non-founder contributor" holds no possession and no achievement
 * participle, yet claims the contributor exists.
 *
 * `with` is deliberately absent. It is pervasive and un-restrictable —
 * "Currently at ORL 2 with founders committed full-time", "engage a contributor
 * with a formal agreement" — and it costs nothing measured, because the
 * `with` assertions the probe has actually caught were caught by their
 * participle (`engaged`, `drafted`).
 *
 * Global flag is required: assertsByAccompaniment uses matchAll.
 */
const ACCOMPANIMENT =
  /\b(?:alongside|along\s+with|together\s+with|accompanied\s+by|as\s+well\s+as)\b/gi;

/**
 * The noun-phrase window between the preposition and the artifact it governs.
 * Admits "alongside a first non-founder contributor" (32) while refusing a
 * preposition that governs some earlier phrase. A constant, not a literal at the
 * call site, so a recalibration is one edit and shows up in CLASSIFIER_SOURCE.
 */
const ACCOMPANIMENT_WINDOW = 40;

/**
 * True when an artifact token is the object of an accompaniment preposition:
 * within ACCOMPANIMENT_WINDOW characters after it, with no punctuation between
 * that would put them in different phrases.
 */
function assertsByAccompaniment(text, tokens) {
  const preps = [...text.matchAll(ACCOMPANIMENT)].map((m) => m.index + m[0].length);
  if (!preps.length) return false;
  for (const token of tokens) {
    const m = tokenRe(token).exec(text);
    if (!m) continue;
    for (const end of preps) {
      if (m.index <= end) continue;
      const span = text.slice(end, m.index);
      if (span.length <= ACCOMPANIMENT_WINDOW && !/[,;()]/.test(span)) return true;
    }
  }
  return false;
}

/** A coordinated clause that reports an absence: "and no investors...", "and has not...". */
const AND_CLAUSE =
  /\s+and\s+(?=(?:it\s+|they\s+|the\s+\w+\s+)?(?:should|must|need|needs|consider|begin|start|prioriti[sz]e|plan\s+to|aim\s+to|ought)\b|(?:(?:has|have|had|is|are|was|were)\s+)?(?:no|not|never)\b)/i;

/**
 * Sentence break, refusing abbreviation periods.
 *
 * `Dr.` is the measured case: an RNA read "led by 3 founders (Dr. Elena Reyes,
 * ...)" and the split left a fragment starting mid-name, which no cue could
 * classify. The rest are the same class and cost nothing.
 */
const SENTENCE_BREAK =
  /(?<=[.!?])(?<!\b(?:Dr|Mr|Mrs|Ms|Prof|Inc|Corp|Ltd|Co|St|No|vs|approx|Fig)\.)(?<!\b[A-Z]\.)(?<!\be\.g\.)(?<!\bi\.e\.)\s+|;\s*/;

/**
 * Sentence boundaries, semicolons, comma-joined coordination, contrastive
 * conjunctions, and the coordinations that join two independent reports.
 *
 * "Assessment of X, absence of Y" is the modal shape of an RNA, so a balanced
 * sentence must not collapse into one clause: NEGATION has precedence and would
 * mask the assertion half. Splitting every bare "and" is still refused — it
 * would shred noun phrases ("counsel and compliance review") into cue-less
 * fragments — so "and" splits only before a modal or a negation, the two shapes
 * that start a new finite clause.
 */
function splitClauses(text) {
  return String(text)
    .split(SENTENCE_BREAK)
    .flatMap((part) => part.split(/,\s+(?=(?:and|but|while|whereas|although|though)\b)/i))
    // A leading subordinator scopes its negation to its own clause: "While no
    // term sheet exists, the team has secured angel funding" asserts.
    .flatMap((part) => {
      const m = /^((?:while|though|although|whereas)\b[^,]*),\s*(.+)$/i.exec(part.trim());
      return m ? [m[1], m[2]] : [part];
    })
    .flatMap((part) => part.split(/\s+(?:but|though|while)\s+/i))
    .flatMap((part) => part.split(AND_CLAUSE))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A fragment left by a coordination split. Its subject and its modal are in the
 * previous clause: "..., and prepare for its first full-time hire" carries no
 * cue of its own, and "..., and maintain an active log" carried an ASSERTION cue
 * it had no right to.
 */
const CONTINUATION = /^\s*(?:and|or|then)\b/i;

/**
 * Returns null when the clause names no absent artifact at all.
 *
 * Order is load-bearing: negation, then recommendation, then assertion. A clause
 * holding both "has" and "not" is a correct report of an absence, and a clause
 * holding both "has" and "should" is advice. Testing assertion first would score
 * both as fabrications.
 *
 * `scope` is the clause governing a continuation fragment. Only the two gates
 * that resolve AWAY from fabrication see it — the token test and ASSERTION read
 * the fragment alone, so a fragment can never be made `asserted` by its
 * neighbour. Inheriting cues rather than a verdict is deliberate: a head clause
 * frequently holds no artifact token and so classifies as null, leaving a
 * verdict-inheriting design nothing to inherit.
 */
function classifyClause(clause, tokens, scope = '') {
  const text = String(clause);
  if (!tokens.some((t) => tokenRe(t).test(text))) return null;
  const gated = scope ? `${scope} ${text}` : text;
  if (NEGATION.test(gated)) return 'negated';
  if (RECOMMENDATION.test(gated) || IMPERATIVE.test(gated.trim())) return 'recommended';
  if (ASSERTION.test(text) || assertsByAccompaniment(text, tokens)) return 'asserted';
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
    let scope = '';
    for (const clause of splitClauses(text)) {
      const continuation = CONTINUATION.test(clause);
      // artifactTokens, not absentTokens: the broad list is verifyAbsences'
      // absence guarantee and fires on abstract usage here. See lib/hard-absences.js.
      const klass = classifyClause(clause, spec.artifactTokens, continuation ? scope : '');
      if (!continuation) scope = clause;
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

/**
 * What `assertion|*` hashes. `scoreAssertedAbsences.toString()` alone contained
 * none of the cue regexes and neither helper it calls, so editing a cue — the
 * likeliest future edit, and one this branch already made — left the
 * fingerprint unchanged and let re-scored data pool with old data. Exactly the
 * hazard lib/fingerprint.js's header documents for the prompt builders.
 *
 * Add any new regex or helper here at the same time you add it above.
 */
const CLASSIFIER_SOURCE = [
  NEGATION.source,
  RECOMMENDATION.source,
  IMPERATIVE.source,
  ASSERTION.source,
  ACCOMPANIMENT.source,
  String(ACCOMPANIMENT_WINDOW),
  AND_CLAUSE.source,
  SENTENCE_BREAK.source,
  CONTINUATION.source,
  tokenRe.toString(),
  assertsByAccompaniment.toString(),
  splitClauses.toString(),
  classifyClause.toString(),
  scoreAssertedAbsences.toString(),
].join('\n');

module.exports = { splitClauses, classifyClause, scoreAssertedAbsences, CLASSIFIER_SOURCE };
