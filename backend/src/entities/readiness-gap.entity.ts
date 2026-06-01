import { DateTimeType, Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { ReadinessEvaluation } from './readiness-evaluation.entity';

@Entity({ tableName: 'readiness_gaps' })
export class ReadinessGap {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => ReadinessEvaluation, { deleteRule: 'cascade' })
  evaluation!: ReadinessEvaluation;

  @Property()
  dimensionKey!: string;

  @Property()
  score!: number;

  @Property()
  tierThreshold!: number;

  @Property()
  shortfall!: number;

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();
}