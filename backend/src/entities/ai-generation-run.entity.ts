import {
  DateTimeType,
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Startup } from './startup.entity';

/**
 * `capsule_extract` covers the whole proposal parse, Gemini Vision included.
 * The vision call and Tesseract fallback are two model calls in one run — which
 * fired shows in the token totals, not the operation.
 *
 * `analysis_summary` is the one-shot summary written on application submit.
 */
export type AiRunOperation =
  | 'rna'
  | 'rna_refine'
  | 'rns'
  | 'rns_refine'
  | 'initiatives'
  | 'initiatives_refine'
  | 'roadblocks'
  | 'roadblocks_refine'
  | 'capsule_extract'
  | 'analysis_summary';
export type AiRunStatus = 'running' | 'completed' | 'failed';

/**
 * One row per AI generation call, recording the pipeline config in effect, so
 * every artifact is attributable to the exact comparison arm that produced it.
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
