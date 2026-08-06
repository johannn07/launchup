/**
 * Reference-free absence specification, shared by audit-ground-truth.js (which
 * scores placements) and lib/assertions.js (which scores text).
 *
 * Extracted 2026-08-06 rather than copied. The study's inverted result of
 * 2026-07-30..08-04 came from two copies of the demo readiness levels drifting
 * apart; src/demo-readiness-levels.ts exists to stop that. One copy, imported.
 *
 * `ceiling` is used only by placement scoring. lib/assertions.js scores whether
 * the TEXT asserts an artifact the document never mentions, which is a property
 * of the document and not of any supplied level, so it ignores `ceiling`.
 */

/**
 * Reference-free check, and the only part of this file that can support a claim
 * about which arm is better.
 *
 * Every reference here — seeded, derived, or hand-adjudicated — is contestable,
 * and a model-set one is worse than contestable: an adjudicator reading the
 * document with the full rubric ladder in front of it is approximately the
 * deviation-deterministic condition, so its agreement with that arm proves
 * nothing. This check needs no reference. Some rungs require an artifact class
 * the document never mentions at all, so any placement at or above them asserts
 * evidence that does not exist, whatever the true level is.
 *
 * `ceiling` is deliberately generous — one rung above what the document
 * supports — so the finding does not depend on a close reading. `absentTokens`
 * is asserted against the document at run time, not trusted.
 *
 * Directional on purpose: it catches over-placement into absent evidence and is
 * silent on under-placement.
 */
const HARD_ABSENCES = {
  Organizational: {
    ceiling: 2,
    requires: 'ORL 3+ requires a non-founder contributor under contract; ORL 4+ adds written role definitions and a first full-time hire beyond the founders.',
    // "full-time" is excluded: AgroLink uses it of its founders, not of a hire.
    // "contributor" added: ORL 3's own rubric text says "non-founder contributor",
    // so a fabrication is more likely to use that word than "contractor".
    absentTokens: ['employee', 'hire', 'hired', 'staff', 'contractor', 'contributor', 'advisor', 'consultant', 'org chart', 'board'],
  },
  Regulatory: {
    ceiling: 2,
    requires: 'RRL 3+ requires external counsel engaged and a preliminary opinion received.',
    // "trademark"/"IPOPHL" are present in both documents but are IP, not product regulation.
    // "opinion" added: RRL 3's own rubric text says "a preliminary opinion received".
    absentTokens: ['counsel', 'lawyer', 'legal', 'regulator', 'regulatory', 'compliance', 'license', 'licence', 'permit', 'certification', 'accredit', 'opinion'],
  },
  Investment: {
    ceiling: 2,
    requires: 'IRL 3+ requires a written funding plan with a stated target raise and use of funds.',
    absentTokens: ['funding', 'investor', 'invest', 'raise', 'round', 'seed', 'grant', 'angel', 'term sheet', 'SAFE', 'capital', 'valuation', 'burn', 'runway'],
  },
};

/** Fails loudly if a token claimed absent actually appears — assert, don't trust. */
function verifyAbsences(docs) {
  const violations = [];
  for (const [dim, spec] of Object.entries(HARD_ABSENCES)) {
    for (const [startup, doc] of Object.entries(docs)) {
      const text = doc.toLowerCase();
      for (const token of spec.absentTokens) {
        if (text.includes(token.toLowerCase())) violations.push(`${startup}/${dim}: "${token}" is present`);
      }
    }
  }
  if (violations.length) throw new Error(`HARD_ABSENCES is wrong:\n  ${violations.join('\n  ')}`);
  return true;
}

module.exports = { HARD_ABSENCES, verifyAbsences };
