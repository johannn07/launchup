import { DateTimeType, Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { Startup } from './startup.entity';

@Entity({ tableName: 'rag_contexts' })
export class RagContext {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup, { nullable: true, deleteRule: 'set null' })
  startup?: Startup;

  @Property({ length: 100 })
  sourceType!: string;

  @Property({ length: 255 })
  title!: string;

  @Property({ type: 'text' })
  content!: string;

  @Property({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @Property({ type: 'float', nullable: true })
  confidence?: number;

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();
}