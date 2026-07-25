import {
  DateTimeType,
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Startup } from './startup.entity';
import { AiGenerationRun } from './ai-generation-run.entity';

@Entity({ tableName: 'ai_recommendations' })
export class AiRecommendation {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup, { nullable: true, deleteRule: 'set null' })
  startup?: Startup;

  @Property({ length: 50 })
  dimensionKey!: string;

  @Property({ length: 40 })
  recommendationKind!: string;

  @Property({ type: 'text' })
  content!: string;

  @Property({ length: 40, default: 'validated' })
  validationStatus!: string;

  @Property({ length: 40, default: 'high-confidence' })
  confidenceStatus!: string;

  @Property({ type: 'text', nullable: true })
  notes?: string | null;

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();

  @ManyToOne(() => AiGenerationRun, { nullable: true, deleteRule: 'set null' })
  generationRun?: AiGenerationRun;
}
