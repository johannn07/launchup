/**
 * SO 4.4 — flags readiness summaries that are predominantly positive with
 * insufficient critical observations, so the reviewing Manager knows to look
 * harder before approving a status change.
 *
 * Pure: no I/O, no model call, no Nest container — so measurement/ can import it
 * directly and it tests standalone.
 *
 * SAFETY DIRECTION IS THE OPPOSITE of measurement/lib/assertions.js, and the
 * distinction matters because the two modules look alike. There, a false
 * positive inflates a reported fabrication rate, so ambiguity resolves AWAY from
 * flagging and the rate is a lower bound. Here, a false NEGATIVE lets an
 * inflated summary reach a human decision unflagged, so ambiguity resolves
 * TOWARD flagging and an unflagged summary is the trustworthy signal.
 *
 * KNOWN LIMITATION, recorded deliberately, do not "fix" by adding cue words: a
 * `CRITICAL` cue firing pushes toward NOT flagging, so a false positive in that
 * list is the dangerous error here — the opposite of the usual instinct to widen
 * a word list. "Limited competition", "risk is well managed", "the barrier
 * protects the venture", and "no gap in coverage" all fire `CRITICAL` while
 * describing a favourable position, and the classifier cannot tell a noun used
 * as a genuine critical observation from the same noun governed the other way.
 * This project tried a favourable-usage guard / second cue list for this exact
 * failure shape on a previous branch and cut it: the cases don't separate on
 * word choice, only on grammatical role, which needs a mechanism this module
 * does not have. See the pinned test below before reaching for more cues.
 */

const POSITIVE =
  /\b(?:strong|excellent|promising|compelling|robust|significant|impressive|solid|clear\s+advantage|well[- ]positioned|potential|opportunity|advantage|viable|feasible|scalable|innovative)\b/i;

/**
 * Words naming a gap, an absence, or an unmet requirement. `no`/`not` are
 * absent on purpose: they negate whatever follows, and "not strong" is a hedged
 * positive rather than a critical observation. Admitting them would let a
 * negated positive suppress the flag, which is the one direction this module
 * must not err in.
 *
 * The optional plural on the noun cues (`gap`, `risk`, `weakness`, `concern`,
 * `shortfall`, `barrier`, `constraint`, `dependency`) is not cosmetic: an
 * adversarial arm's summary reads "Principal risks are regulatory", and without
 * it that scored `criticalCount: 0` — the same lesson `tokenRe` in
 * measurement/lib/assertions.js documents. `weakness` takes `es`, not `s`.
 */
const CRITICAL =
  /\b(?:unvalidated|unproven|untested|lacks?|lacking|absent|missing|gap(?:s|es)?|risk(?:s|es)?|weakness(?:s|es)?|concern(?:s|es)?|insufficient|limited|unclear|premature|no\s+revenue|has\s+yet\s+to|fails?\s+to|shortfall(?:s|es)?|barrier(?:s|es)?|constraint(?:s|es)?|dependency(?:s|es)?|vulnerable|overstate[sd]?)\b/i;

export const TONE_CUES = { POSITIVE, CRITICAL };

/** Sentence-ish split. Coarse on purpose — the flag rule is a zero-check, not a ratio threshold. */
const splitSentences = (text: string): string[] =>
  String(text)
    .split(/(?<=[.!?])\s+|;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

export interface ToneResult {
  positiveCount: number;
  criticalCount: number;
  ratio: number;
  flagged: boolean;
  clauses: { text: string; valence: 'positive' | 'critical' | null }[];
}

export function analyzeTone(text: string): ToneResult {
  const clauses = splitSentences(text).map((s) => ({
    text: s,
    // Critical is tested FIRST: a sentence carrying both ("strong team, but no
    // revenue") is a critical observation, and counting it as positive would
    // push toward not flagging.
    valence: CRITICAL.test(s) ? ('critical' as const) : POSITIVE.test(s) ? ('positive' as const) : null,
  }));

  const criticalCount = clauses.filter((c) => c.valence === 'critical').length;
  const positiveCount = clauses.filter((c) => c.valence === 'positive').length;
  const total = criticalCount + positiveCount;

  return {
    positiveCount,
    criticalCount,
    ratio: total === 0 ? 0 : criticalCount / total,
    // Exactly `criticalCount === 0`. No ratio threshold — that needs calibration
    // this study has not done. Task 7 produces the distribution.
    flagged: criticalCount === 0,
    clauses,
  };
}
