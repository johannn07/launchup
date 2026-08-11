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

  // The flag rule is exactly `criticalCount === 0`. A ratio threshold would need
  // calibration this study has not done, and the repo's uncalibrated tier
  // thresholds are the cautionary case.
  it('does not flag on a low ratio alone', () => {
    const r = analyzeTone(
      'Strong team. Excellent traction. Promising market. Compelling advantage. One risk: no revenue.',
    );
    expect(r.ratio).toBeLessThan(0.5);
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
});
