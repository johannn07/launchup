import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Enum,
} from '@mikro-orm/core';
import { Startup } from './startup.entity';

export enum RecommendationStatus {
  PENDING = 'PENDING',
  APPLIED = 'APPLIED',
  DISMISSED = 'DISMISSED',
}

@Entity({ tableName: 'recommendations' })
export class Recommendation {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup)
  startup!: Startup;

  @Property({ length: 255 })
  dimension!: string;

  @Property({ length: 100 })
  type!: string;

  @Property({ type: 'text' })
  text!: string;

  @Enum(() => RecommendationStatus)
  status!: RecommendationStatus;

  @Property({ type: 'text', nullable: true })
  inconsistency_reason?: string;

  @Property({ type: 'text', nullable: true })
  mentor_decision?: string;

  @Property({ type: 'timestamp' })
  created_at: Date = new Date();
}