import { resolveSummaryVerdict } from './summary-verdict';

const recorded = (status: string, runId?: number) =>
  ({ confidenceStatus: status, generationRun: runId ? { id: runId } : undefined }) as never;

describe('resolveSummaryVerdict', () => {
  it('is undefined when there is no summary to judge', () => {
    expect(resolveSummaryVerdict(undefined, undefined)).toBeUndefined();
    expect(resolveSummaryVerdict('', undefined)).toBeUndefined();
    expect(resolveSummaryVerdict('   ', undefined)).toBeUndefined();
  });

  // A recorded row is the verdict computed at generation time under whatever
  // rule shipped then. It is reported as-is, never recomputed: the row carries
  // provenance (which run produced it) that a fresh reading cannot reconstruct.
  it('reports a recorded row as-is, without recomputing', () => {
    const v = resolveSummaryVerdict('Strong team. Excellent traction.', recorded('balanced', 12));
    expect(v).toMatchObject({ status: 'balanced', source: 'recorded', runId: 12 });
  });

  it('keeps a recorded verdict that disagrees with a fresh reading', () => {
    // This text reads `positive-language-flagged` today. A row saying otherwise
    // was written under the old `criticalCount === 0` rule, and showing the
    // fresh reading instead would silently rewrite history.
    const text = 'Strong team. Excellent traction. Promising market. One risk: no revenue.';
    const v = resolveSummaryVerdict(text, recorded('balanced'));
    expect(v).toMatchObject({ status: 'balanced', source: 'recorded' });
  });

  it('recomputes when no row was ever written, and says so', () => {
    const v = resolveSummaryVerdict(
      'The venture demonstrates strong market viability. The team is impressive. One risk: revenue is unproven.',
      undefined,
    );
    expect(v).toMatchObject({ status: 'positive-language-flagged', source: 'recomputed' });
    expect(v).toMatchObject({ criticalCount: 1, positiveCount: 2 });
    expect(v!.ratio).toBeCloseTo(1 / 3);
  });

  it('recomputes a balanced summary to balanced', () => {
    const v = resolveSummaryVerdict('Buyer demand is unvalidated. Regulatory approval is absent.', undefined);
    expect(v).toMatchObject({ status: 'balanced', source: 'recomputed' });
  });

  // The counts belong to the reading that produced the status. A recorded row
  // stores only a status, so attaching recomputed counts to it would present
  // numbers that may not be what the recorded status was derived from.
  it('omits counts on a recorded verdict rather than inventing them', () => {
    const v = resolveSummaryVerdict('Strong team. One risk: no revenue.', recorded('balanced'));
    expect(v).not.toHaveProperty('ratio');
    expect(v).not.toHaveProperty('criticalCount');
  });

  it('uses the same status strings the persistence path writes', () => {
    // startup.service.ts writes exactly these two, so the frontend has one
    // vocabulary to switch on regardless of which branch produced the verdict.
    const flagged = resolveSummaryVerdict('Strong team. Excellent traction.', undefined);
    const balanced = resolveSummaryVerdict('Demand is unvalidated.', undefined);
    expect([flagged!.status, balanced!.status]).toEqual(['positive-language-flagged', 'balanced']);
  });
});
