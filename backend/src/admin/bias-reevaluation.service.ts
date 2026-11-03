import { EntityManager } from '@mikro-orm/core';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AiService } from 'src/ai/ai.service';
import { AiRunService } from 'src/ai/ai-run.service';
import { biasStatusOf } from 'src/ai/bias-status';
import { ActivityLog } from 'src/entities/activity-log.entity';
import { AiBiasAudit } from 'src/entities/ai-bias-audit.entity';

/**
 * SRS 2.1: a Manager may request a re-evaluation of an audited score. The
 * result is a new audit row, so the original stays as the record of what ran.
 */
@Injectable()
export class BiasReevaluationService {
  constructor(
    private readonly em: EntityManager,
    private readonly ai: AiService,
    private readonly runs: AiRunService,
  ) {}

  async reevaluate(id: number, requestedBy: string) {
    const original = await this.em.findOne(
      AiBiasAudit,
      { id },
      { populate: ['startup'] },
    );
    if (!original) throw new NotFoundException(`Audit with ID ${id} not found`);

    // Audits before 2026-11-03 did not store what the review saw.
    const storedContext = original.reviewContext?.trim();
    const context =
      storedContext ||
      [
        `Startup: ${original.startup?.name ?? 'unknown'}`,
        `Dimension: ${original.dimensionKey}`,
      ].join('\n');
    // Roadblock risk runs 1-5; readiness target levels run 1-9.
    const maxScore = original.dimensionKey === 'roadblock' ? 5 : 9;

    const audit = await this.runs.track(
      original.startup?.id ?? null,
      'bias_reevaluation',
      undefined,
      true,
      async (ctx) => {
        const review = await this.ai.reviewBiasScore(ctx, {
          dimensionKey: original.dimensionKey,
          rawScore: original.rawScore,
          maxScore,
          context,
        });
        const note = storedContext
          ? ''
          : ' The original context was not stored, so this review saw only the startup and dimension.';
        return this.ai.recordBiasAudit({
          startupId: original.startup?.id,
          dimensionKey: original.dimensionKey,
          rawScore: original.rawScore,
          correctedScore: review.correctedScore,
          deviation: Math.abs(review.correctedScore - original.rawScore),
          threshold: original.threshold,
          biasFlagged: review.biasFlagged,
          biasStatus: biasStatusOf(review),
          justification: review.justification + note,
          reviewContext: context,
          reevaluationOf: original.id,
          generationRun: ctx.run,
        });
      },
    );

    await this.em.persistAndFlush(
      this.em.create(ActivityLog, {
        action: 'Admin',
        details: `Re-evaluated bias audit ${id} as audit ${audit.id}`,
        actor: requestedBy,
        createdAt: new Date(),
      }),
    );
    // The admin page prepends this row and reads startup.name.
    return this.em.findOneOrFail(
      AiBiasAudit,
      { id: audit.id },
      { populate: ['startup'] },
    );
  }
}
