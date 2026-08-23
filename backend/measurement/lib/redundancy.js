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
 *
 * SECOND uncaught class, added task 7b (2026-08-23): classifyClause's
 * `recommended` bin does not distinguish "get this thing" from "move on FROM
 * / BEYOND / ACROSS this thing" — a satisfied token can sit inside a clause
 * that names it as the origin being left behind or the scope a recommendation
 * ranges over, never as what's being asked for. A 96-observation pilot against
 * two historical result files found this firing on ten real clauses and NONE
 * of them a genuine redundancy — see task-7b-brief.md. `isAcquisitionRequest`
 * below is a second, independent gate on top of classifyClause's `recommended`
 * verdict: it only lets a clause count when an acquisition verb governs the
 * token AND no origin/scope marker intervenes. Every ambiguity resolves AWAY
 * from redundant, the same direction lib/assertions.js already errs.
 */

const { splitClauses, classifyClause, CLASSIFIER_SOURCE } = require('./assertions.js');

const CONTINUATION = /^\s*(?:and|or|then)\b/i;

/**
 * Verbs in the sense of first OBTAINING the artifact. Deliberately a fixed
 * list, not "any recommendation cue" — classifyClause's RECOMMENDATION cue
 * already includes bare modals like "should"/"needs to", which say nothing
 * about whether the token is being acquired or merely mentioned in passing.
 * Extend only with a recorded reason (task-7b-brief.md, required change 1).
 */
const ACQUISITION_VERB =
  /\b(?:identif(?:y|ies|ied|ying)|defin(?:e|es|ed|ing)|establish(?:es|ed|ing)?|creat(?:e|es|ed|ing)|develop(?:s|ed|ing)?|build(?:s|ing)?|built|secur(?:e|es|ed|ing)|obtain(?:s|ed|ing)?|acquir(?:e|es|ed|ing)|finds?|found|finding|determin(?:e|es|ed|ing)|conduct(?:s|ed|ing)?)\b/i;

/**
 * A satisfied token immediately governed by one of these is naming the origin
 * being moved away from, or the scope a recommendation ranges over — not
 * something being acquired. "from paper prototype", "beyond paper
 * prototypes", "across the target market", "rather than the incumbent
 * approach". Checked only in the text strictly BEFORE the token match.
 */
const ORIGIN_OR_SCOPE_PREP =
  /\b(?:from|beyond|past|across|outside|rather\s+than|versus|vs\.?)\s+(?:the|a|an|its|their|our|this|that)?\s*$/i;

/**
 * A governing verb naming movement or expansion rather than first
 * acquisition. "Needs to further penetrate the target market", "expand
 * repeat sales beyond initial pilots across its target market" — the RNA is
 * asking the startup to go further along an axis it is already on, not to
 * newly obtain the token. Deliberately checked only in the text BEFORE the
 * token match: "identify a target market segment before further
 * development" must not be excluded by a "further" that governs a different,
 * later noun phrase entirely (fixture: the pre-existing "fires" test).
 */
const PROGRESSION_VERB =
  /\b(?:transition(?:s|ed|ing)?|mov(?:e|es|ed|ing)|expand(?:s|ed|ing)?|scal(?:e|es|ed|ing)|penetrat(?:e|es|ed|ing)|grow(?:s|ing)?|grew|grown|further)\b/i;

/** Same construction as lib/assertions.js' tokenRe, kept local: that file is
 *  off limits and does not export it, but the matching behaviour it wants —
 *  multiword phrase, word-boundaried, optional plural — is not classifier
 *  logic and does not need to be shared to be correct. */
const tokenPattern = (token) =>
  new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?:s|es)?\\b`, 'gi');

/**
 * True only when some occurrence of some token in `tokens` is the direct
 * object of an acquisition verb in this clause, with no origin/scope marker
 * or progression verb governing it first. Where both readings are available
 * for a given occurrence, that occurrence is skipped — but a clause with two
 * mentions of the same token, one governed and one not, still counts on the
 * governed one.
 */
function isAcquisitionRequest(clause, tokens) {
  for (const token of tokens) {
    const re = tokenPattern(token);
    let m;
    while ((m = re.exec(clause))) {
      const before = clause.slice(0, m.index);
      if (!PROGRESSION_VERB.test(before) && !ORIGIN_OR_SCOPE_PREP.test(before) && ACQUISITION_VERB.test(before)) {
        return true;
      }
    }
  }
  return false;
}

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
      // artifactTokens, not satisfiedTokens: the broad list is
      // verifySatisfactions' document guarantee and fires on scope usage
      // here. See lib/satisfactions.js. Both the classifier and the
      // acquisition gate below read the same list — a token narrowed out of
      // scoring must not still be reachable through the gate's own lookup.
      const scoringTokens = spec.artifactTokens;
      let klass = classifyClause(clause, scoringTokens, continuation ? scope : '');
      if (!continuation) scope = clause;
      // Second gate, independent of classifyClause: `recommended` alone does
      // not tell "get this" from "move on from/beyond/across this". Only an
      // acquisition-governed occurrence keeps the verdict.
      if (klass === 'recommended' && !isAcquisitionRequest(clause, scoringTokens)) klass = 'scoped';
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
 *
 * A satisfied-token edit (SATISFACTIONS) is NOT covered here — that's a data
 * change, not a code change, and is hashed separately as fingerprint.js's
 * `satisfactions` material. This constant is code only.
 *
 * String(CONTINUATION), not .source: .source drops the `i` flag, and losing it
 * would change classifyClause's actual scoping behaviour while leaving this
 * hash unmoved — a fingerprint that looks present but stops detecting the
 * change it exists to catch. CLASSIFIER_SOURCE has the same latent issue in
 * assertions.js (its CUES use `.source` too) but that file is frozen
 * byte-identical for this task, so it is noted here rather than fixed there.
 */
const REDUNDANCY_SOURCE = [
  CLASSIFIER_SOURCE,
  String(CONTINUATION),
  ACQUISITION_VERB.source,
  ORIGIN_OR_SCOPE_PREP.source,
  PROGRESSION_VERB.source,
  tokenPattern.toString(),
  isAcquisitionRequest.toString(),
  scoreRedundantNeeds.toString(),
].join('\n');

module.exports = { scoreRedundantNeeds, REDUNDANCY_SOURCE };
