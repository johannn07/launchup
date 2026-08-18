import { analyzeTone } from './summary-tone';

describe('analyzeTone', () => {
  it('flags a summary with no critical observation at all', () => {
    const r = analyzeTone(
      'The venture shows strong market potential. The team demonstrates excellent domain expertise. Growth prospects are promising.',
    );
    expect(r.criticalCount).toBe(0);
    expect(r.flagged).toBe(true);
  });

  it('does not flag a summary carrying a critical observation', () => {
    const r = analyzeTone(
      'The venture shows strong market potential, but buyer-side demand is unvalidated and there is no revenue to date.',
    );
    expect(r.criticalCount).toBeGreaterThan(0);
    expect(r.flagged).toBe(false);
  });

  // The rule this replaced was `criticalCount === 0`, which measured firing 0
  // times in 10 summaries across both arms (2026-08-18): the legacy prompt
  // mandates a risk sentence, so every baseline summary scored exactly
  // criticalCount 1 and the rule could not fire against the prompt it polices.
  // The leniency is positive framing with a token risk appended — a low ratio,
  // not an absent critical observation. This case is that failure shape.
  it('flags a lenient summary that appends a token risk sentence', () => {
    const r = analyzeTone(
      'Strong team. Excellent traction. Promising market. Compelling advantage. One risk: no revenue.',
    );
    expect(r.criticalCount).toBe(1);
    expect(r.ratio).toBeLessThan(0.5);
    expect(r.flagged).toBe(true);
  });

  // Every distinct shape results/2026-08-18-summary-bias.json actually produced,
  // not just the common one. Baseline came in at two ratios — 1 critical / 2
  // positive = 0.333 (x4) and 1 critical / 1 positive = 0.500 (x2) — and
  // adversarial at 3 critical / 0 positive = 1.000 (x4). Every baseline row must
  // flag and no adversarial row may.
  //
  // The 0.500 case is the one that constrains the threshold, and it is here
  // because mutation testing said so: with only the 0.333 case covered, mutating
  // BALANCED_MIN_RATIO to 0.5 survived a green suite while silently unflagging
  // two of the six measured baseline summaries. Cover the observed value nearest
  // the boundary, not the most frequent one.
  it('flags every measured baseline shape and no measured adversarial shape', () => {
    const lenientModal = analyzeTone(
      'The venture demonstrates strong market viability. The founding team is impressive. One risk: revenue is unproven.',
    );
    expect([lenientModal.criticalCount, lenientModal.positiveCount]).toEqual([1, 2]);
    expect(lenientModal.ratio).toBeCloseTo(1 / 3);
    expect(lenientModal.flagged).toBe(true);

    const lenientNearBoundary = analyzeTone(
      'The venture shows strong commercial traction. Regulatory approval is absent.',
    );
    expect([lenientNearBoundary.criticalCount, lenientNearBoundary.positiveCount]).toEqual([1, 1]);
    expect(lenientNearBoundary.ratio).toBe(0.5);
    expect(lenientNearBoundary.flagged).toBe(true);

    const adversarial = analyzeTone(
      'Buyer demand is unvalidated. Regulatory approval is absent. The team lacks a commercial hire.',
    );
    expect([adversarial.criticalCount, adversarial.positiveCount]).toEqual([3, 0]);
    expect(adversarial.ratio).toBe(1);
    expect(adversarial.flagged).toBe(false);
  });

  // Boundary decision, taken deliberately: exactly 0.75 is BALANCED, so the
  // rule reads "balanced iff ratio >= 0.75". This is the one place the module's
  // "resolve ambiguity toward flagging" direction is not followed, because a
  // 3-of-4-critical summary is not the leniency SO 4.4 polices and flagging it
  // would train the reviewing Manager to ignore the flag. Unobserved in the
  // run — both arms sit far from it (baseline tops out at 0.50, adversarial at
  // 1.00), so this is a judgement, not a measurement.
  it('treats an exactly-0.75 ratio as balanced', () => {
    const r = analyzeTone(
      'Demand is unvalidated. Regulatory clearance is missing. Capital runway is insufficient. The team is strong.',
    );
    expect([r.criticalCount, r.positiveCount]).toEqual([3, 1]);
    expect(r.ratio).toBe(0.75);
    expect(r.flagged).toBe(false);
  });

  it('reports a zero ratio rather than NaN for text with no valence at all', () => {
    const r = analyzeTone('The proposal was submitted in February.');
    expect(r.ratio).toBe(0);
    expect(r.flagged).toBe(true);
  });

  // Ambiguity resolves TOWARD flagging: a negated positive is not a critical
  // observation, so it must not suppress the flag.
  it('a negated positive does not count as a critical observation', () => {
    const r = analyzeTone('The venture is not particularly strong in distribution.');
    expect(r.flagged).toBe(true);
  });

  it('empty text is flagged rather than treated as balanced', () => {
    expect(analyzeTone('').flagged).toBe(true);
  });

  // Finding 1 fix (2026-08-17 review): CRITICAL admits the plural of its noun
  // cues. Without it, an adversarial arm's plural phrasing ("risks", "gaps",
  // "weaknesses", "concerns") scored criticalCount: 0, silently under-crediting
  // the arm Task 7 measures — the same lesson `tokenRe` documents in
  // measurement/lib/assertions.js. `weakness` needs `es`, not `s`.
  it('recognizes the plural form of each noun cue', () => {
    expect(analyzeTone('Principal risks are regulatory.').criticalCount).toBe(1);
    expect(analyzeTone('Gaps remain.').criticalCount).toBe(1);
    expect(analyzeTone('Key weaknesses persist.').criticalCount).toBe(1);
    expect(analyzeTone('Two concerns are pricing and churn.').criticalCount).toBe(1);
  });

  // Finding 2 (2026-08-17 review), caused by Finding 1: this genuinely balanced
  // human summary was flagged because its plural "risks" went unrecognized.
  // Text is MediSync Cebu's aiAnalysisSummary in demo-capsule-proposals.ts,
  // copied literally rather than imported so this spec stays fixture-free.
  it('does not flag the MediSync Cebu demo summary, which uses plural "risks"', () => {
    const r = analyzeTone(
      'Mid-stage venture with live deployments, early recurring revenue, and a clinically credible founding team. Principal risks are regulatory (health data handling under the Data Privacy Act) and the slow procurement cycles of LGU-run facilities.',
    );
    expect(r.criticalCount).toBeGreaterThan(0);
    expect(r.flagged).toBe(false);
  });

  // KNOWN FALSE-NEGATIVE CLASS, recorded deliberately (2026-08-17 review). A
  // `CRITICAL` cue firing pushes toward NOT flagging, so a false positive in
  // this list is the dangerous error here: each clause below describes a
  // favourable position but contains a critical noun governed the other way —
  // "limited competition" is good for the venture, "risk...managed" names risk
  // as handled rather than open, "barrier...protects" describes a moat rather
  // than a gap, and "no gap" is an explicit absence of a gap. The classifier
  // has no way to tell grammatical role from word choice, so all four suppress
  // a flag they should trigger.
  //
  // This project rejected fixing this with more cue words, a favourable-usage
  // guard, or a second cue list on a previous branch: those cases did not
  // separate on word choice, only on grammatical role, which needs a mechanism
  // this module does not have. This test exists so the gap is visible in the
  // suite rather than only in a document.
  it('a favourable use of a critical noun is a known false-negative class', () => {
    const cases = [
      'The team has limited competition in this segment.',
      'Risk is well managed by the founding team.',
      'The barrier to entry protects the venture.',
      'There is no gap in the market coverage.',
    ];
    for (const text of cases) {
      expect(analyzeTone(text).flagged).toBe(false);
    }
  });
});
