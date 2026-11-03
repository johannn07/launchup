import {
  DateTimeType,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Startup } from './startup.entity';

export type AiJobOperation = 'rna' | 'rns' | 'initiatives' | 'roadblocks';
export type AiJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * A generation request Gemini refused, kept for a later retry (SRS 2.2).
 * `payload` is the original request body, replayed as-is.
 */
@Entity({ tableName: 'ai_generation_jobs' })
@Index({ properties: ['status', 'nextAttemptAt'] })
export class AiGenerationJob {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @Property({ length: 40 })
  operation!: AiJobOperation;

  @ManyToOne(() => Startup, { nullable: true, deleteRule: 'cascade' })
  startup?: Startup | null;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Property({ nullable: true })
  requestedById?: number | null;

  @Property({ nullable: true })
  requestedByEmail?: string | null;

  @Property({ length: 20 })
  status: AiJobStatus = 'queued';

  @Property()
  attempts: number = 0;

  @Property({ type: DateTimeType })
  nextAttemptAt!: Date;

  @Property({ type: 'text', nullable: true })
  lastError?: string | null;

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();

  @Property({ type: DateTimeType, nullable: true })
  completedAt?: Date | null;
}
