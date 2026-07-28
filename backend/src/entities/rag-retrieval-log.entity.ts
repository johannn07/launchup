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

  /**
   * Per-channel result counts: { rubrics, frameworks, peers }.
   *
   * Nullable because rows written before the corpus existed have no breakdown,
   * and backfilling a guess would be worse than an honest null.
   */
  @Property({ type: 'jsonb', nullable: true })
  channel_counts?: { rubrics: number; frameworks: number; peers: number } | null;

  @Property({ type: 'timestamp' })
  retrieved_at: Date = new Date();
}