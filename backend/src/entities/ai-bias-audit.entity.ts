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

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();

  @ManyToOne(() => AiGenerationRun, { nullable: true, deleteRule: 'set null' })
  generationRun?: AiGenerationRun;
}
