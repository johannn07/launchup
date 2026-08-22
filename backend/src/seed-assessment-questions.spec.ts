import { seedAssessmentQuestions } from './seed-assessment-questions';
import { UratQuestion } from './entities/urat-question.entity';
import { CalculatorQuestion } from './entities/calculator-question.entity';
import { URAT_QUESTIONS, CALCULATOR_QUESTIONS } from './assessment-questions';

/**
 * The guard is the whole point. Without it a second boot doubles both banks and
 * nothing looks broken until an applicant sees every question twice.
 */
function buildEm(counts: { urat: number; calculator: number }) {
  const created: { entity: unknown; data: Record<string, unknown> }[] = [];

  const em = {
    count: jest.fn(async (entity: unknown) =>
      entity === UratQuestion ? counts.urat : counts.calculator,
    ),
    create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
      created.push({ entity, data });
      return data;
    }),
    persist: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  };

  const of = (entity: unknown) => created.filter((c) => c.entity === entity);
  return { em, created, of };
}

describe('seedAssessmentQuestions', () => {
  it('seeds both banks when the tables are empty', async () => {
    const { em, of } = buildEm({ urat: 0, calculator: 0 });

    const result = await seedAssessmentQuestions(em as any);

    expect(of(UratQuestion)).toHaveLength(18);
    expect(of(CalculatorQuestion)).toHaveLength(35);
    expect(result).toEqual({ urat: 18, calculator: 35 });
  });

  it('inserts nothing when both tables already hold rows', async () => {
    const { em, created } = buildEm({ urat: 18, calculator: 35 });

    const result = await seedAssessmentQuestions(em as any);

    expect(created).toHaveLength(0);
    expect(result).toEqual({ urat: 0, calculator: 0 });
  });

  it('seeds the two banks independently', async () => {
    const { em, of } = buildEm({ urat: 18, calculator: 0 });

    await seedAssessmentQuestions(em as any);

    expect(of(UratQuestion)).toHaveLength(0);
    expect(of(CalculatorQuestion)).toHaveLength(35);
  });

  it('maps a URAT question onto the entity field names', async () => {
    const { em, of } = buildEm({ urat: 0, calculator: 35 });

    await seedAssessmentQuestions(em as any);

    // `category` in the bank, `readinessType` on the entity — a silent rename
    // would persist rows with an undefined dimension and no error.
    expect(of(UratQuestion)[0].data).toEqual({
      question: URAT_QUESTIONS[0].question,
      readinessType: URAT_QUESTIONS[0].category,
    });
  });

  it('carries the score onto each calculator question', async () => {
    const { em, of } = buildEm({ urat: 18, calculator: 0 });

    await seedAssessmentQuestions(em as any);

    expect(of(CalculatorQuestion)[0].data).toEqual({
      question: CALCULATOR_QUESTIONS[0].question,
      score: CALCULATOR_QUESTIONS[0].score,
      category: CALCULATOR_QUESTIONS[0].category,
    });
    expect(of(CalculatorQuestion).every((c) => typeof c.data.score === 'number')).toBe(true);
  });
});
