import {
  Entity,
  PrimaryKey,
  Property,
  Index,
} from '@mikro-orm/core';
import { VectorType } from '../common/types/vector-type';

@Entity({ tableName: 'vector_embeddings' })
export class VectorEmbedding {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @Property({ length: 255 })
  @Index()
  source_type!: string;

  @Property({ length: 255 })
  @Index()
  source_id!: string;

  @Property({ type: VectorType })
  embedding!: number[];

  @Property({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Property({ type: 'timestamp' })
  created_at: Date = new Date();
}