import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
} from '@mikro-orm/core';
import { Startup } from './startup.entity';

@Entity({ tableName: 'rag_retrieval_logs' })
export class RagRetrievalLog {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup)
  startup!: Startup;

  @Property()
  result_count!: number;

  @Property({ length: 50 })
  confidence_level!: string;

  @Property()
  low_confidence_flagged!: boolean;

  @Property({ type: 'jsonb' })
  retrieved_profile_ids!: number[]; // or object, depending on your data

  @Property({ type: 'timestamp' })
  retrieved_at: Date = new Date();
}