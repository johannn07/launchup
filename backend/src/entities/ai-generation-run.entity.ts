import {
  DateTimeType,
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Startup } from './startup.entity';

export type AiRunOperation = 'rna' | 'rns' | 'initiatives' | 'roadblocks';
export type AiRunStatus = 'running' | 'completed' | 'failed';

/**
 * One row per AI generation call. Records the pipeline configuration in effect
 * so that every generated artifact can be attributed to the exact arm of the
 * baseline-vs-enhanced comparison that produced it.
 */
@Entity({ tableName: 'ai_generation_runs' })
export class AiGenerationRun {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup, { nullable: true, deleteRule: 'set null' })
  startup?: Startup;

  @Property({ length: 40 })
  operation!: AiRunOperation;

  @Property({ length: 100 })
  model!: string;

  /** Frozen AiPipelineConfig snapshot as resolved for this run. */
  @Property({ type: 'json' })
  config!: Record<string, unknown>;

  @Property({ length: 20 })
  status: AiRunStatus = 'running';

  @Property({ nullable: true })
  latencyMs?: number;

  @Property({ nullable: true })
  promptTokens?: number;

  @Property({ nullable: true })
  completionTokens?: number;

  @Property({ type: 'text', nullable: true })
  error?: string;

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();

  @Property({ type: DateTimeType, nullable: true })
  completedAt?: Date;
}
