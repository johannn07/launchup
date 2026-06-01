import {
  Collection,
  DateTimeType,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Startup } from './startup.entity';
import { ReadinessGap } from './readiness-gap.entity';

@Entity({ tableName: 'readiness_evaluations' })
export class ReadinessEvaluation {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup, { deleteRule: 'cascade' })
  startup!: Startup;

  @Property()
  compositeScore!: number;

  @Property()
  tierLabel!: string;

  @Property()
  isProvisional: boolean = false;

  @Property({ type: 'text', nullable: true })
  warning?: string | null;

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();

  @Property({ type: DateTimeType })
  updatedAt: Date = new Date();

  @OneToMany(() => ReadinessGap, (gap) => gap.evaluation)
  gaps = new Collection<ReadinessGap>(this);
}