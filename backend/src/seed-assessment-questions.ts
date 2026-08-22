import { EntityManager } from '@mikro-orm/core';
import { UratQuestion } from './entities/urat-question.entity';
import { CalculatorQuestion } from './entities/calculator-question.entity';
import { URAT_QUESTIONS, CALCULATOR_QUESTIONS } from './assessment-questions';

/**
 * Fills the URAT and calculator question banks on boot when they are empty.
 *
 * They were empty on every database created after the 2026-07-26 wipe: the only
 * code that wrote them lived in AppService, reachable solely through three
 * controller endpoints that were all commented out. Both endpoints still
 * answered 200 with `[]`, so the URAT and calculator steps rendered blank with
 * nothing logged and nothing to catch.
 *
 * Guarded on emptiness rather than reconciling row by row: these questions are
 * content someone may legitimately edit, and clobbering a deliberate edit is
 * worse than leaving a half-deleted table alone. The trade-off is that this
 * will not repair a partial deletion.
 *
 * Returns what it inserted so the caller can log it — a seeder that silently
 * does nothing is how this went unnoticed in the first place.
 */
export async function seedAssessmentQuestions(
  em: EntityManager,
): Promise<{ urat: number; calculator: number }> {
  let urat = 0;
  let calculator = 0;

  if ((await em.count(UratQuestion)) === 0) {
    for (const q of URAT_QUESTIONS) {
      em.persist(
        em.create(UratQuestion, {
          question: q.question,
          readinessType: q.category,
        }),
      );
    }
    urat = URAT_QUESTIONS.length;
  }

  if ((await em.count(CalculatorQuestion)) === 0) {
    for (const q of CALCULATOR_QUESTIONS) {
      em.persist(
        em.create(CalculatorQuestion, {
          question: q.question,
          score: q.score,
          category: q.category,
        }),
      );
    }
    calculator = CALCULATOR_QUESTIONS.length;
  }

  await em.flush();
  return { urat, calculator };
}
