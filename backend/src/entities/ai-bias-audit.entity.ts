import {
  DateTimeType,
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Startup } from './startup.entity';
import { AiGenerationRun } from './ai-generation-run.entity';

@Entity({ tableName: 'ai_bias_audits' })
export class AiBiasAudit {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup, { nullable: true, deleteRule: 'set null' })
  startup?: Startup;

  @Property({ length: 50 })
  dimensionKey!: string;

  @Property()
  rawScore!: number;

  @Property()
  correctedScore!: number;

  @Property()
  deviation!: number;

  @Property()
  threshold!: number;

  @Property()
  biasFlagged: boolean = false;

  @Property({ length: 40, default: 'normalized' })
  biasStatus!: string;

  @Property({ type: 'text', nullable: true })
  justification?: string | null;

  /** The Manager's reason for overriding; `justification` keeps the reviewer's own. */
  @Property({ type: 'text', nullable: true })
  overrideJustification?: string | null;

  /** What the review saw, so a Manager can request a re-evaluation (SRS 2.1). */
  @Property({ type: 'text', nullable: true })
  reviewContext?: string | null;

  /** The audit this row re-evaluates. */
  // Typed explicitly: `number | null` reflects as Object, which became varchar.
  @Property({ type: 'integer', nullable: true })
  reevaluationOf?: number | null;

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();

  @ManyToOne(() => AiGenerationRun, { nullable: true, deleteRule: 'set null' })
  generationRun?: AiGenerationRun;
}
