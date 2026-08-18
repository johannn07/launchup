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
 * `CRITICAL` cue firing raises the ratio and so pushes toward NOT flagging, so a
 * false positive in that list is the dangerous error here — the opposite of the usual instinct to widen
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

/**
 * Minimum critical share for a summary to pass unflagged. Calibrated, not
 * guessed — the distribution comes from measurement/results/2026-08-18-summary-bias.json
 * (gemini-3.6-flash, temp 0, 10 summaries):
 *
 *   baseline     0.333 0.333 0.333 0.333 0.500 0.500
 *   adversarial  1.000 1.000 1.000 1.000
 *
 * The arms do not overlap, so any threshold in (0.50, 1.00) separates them
 * perfectly; 0.75 is the midpoint, i.e. the value furthest from both observed
 * edges. The comparison is strict (`< 0.75` flags), so exactly 0.75 is
 * BALANCED — see the boundary test in the spec for why that one case does not
 * follow this module's resolve-toward-flagging direction.
 *
 * RE-CALIBRATE if the summary prompt changes. The rule this replaced was
 * `criticalCount === 0`, and it failed precisely because the prompt moved out
 * from under it: the legacy prompt mandates "3. Critical risks and primary
 * recommendations", so every baseline summary carried exactly one risk
 * sentence and the rule fired 0 times in 10 — it could not fire against the
 * prompt it exists to police. A threshold is only as good as the distribution
 * it was set against.
 *
 * Do NOT re-score that results file under this threshold. Editing this file
 * changes the `tone|*` fingerprint (measurement/lib/summary-fingerprint.js
 * hashes this file's text), so those results correctly refuse to pool with any
 * future run. Validating 0.75 needs a fresh run, not a re-read of the old one.
 */
const BALANCED_MIN_RATIO = 0.75;

/** Sentence-ish split. Coarse on purpose — a cue either appears in a sentence or it doesn't. */
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
  // Load-bearing, not reportage — the flag rule reads it. A cue-less summary
  // scores 0 rather than NaN, so it flags, which is the safe direction.
  const ratio = total === 0 ? 0 : criticalCount / total;

  return {
    positiveCount,
    criticalCount,
    ratio,
    // `criticalCount === 0` is not OR'd in because it is subsumed — no critical
    // observation forces ratio 0, which is below any positive threshold. So this
    // rule flags a strict superset of what the old one flagged and can never
    // trade away an existing detection.
    flagged: ratio < BALANCED_MIN_RATIO,
    clauses,
  };
}
