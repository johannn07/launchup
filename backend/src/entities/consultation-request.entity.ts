import { DateTimeType, Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { Startup } from './startup.entity';
import { User } from './user.entity';

@Entity({ tableName: 'consultation_requests' })
export class ConsultationRequest {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup, { deleteRule: 'cascade' })
  startup!: Startup;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  mentor!: User;

  @Property({ length: 20, default: 'pending' })
  status!: 'pending' | 'accepted' | 'completed';

  @Property({ type: DateTimeType })
  requestedAt: Date = new Date();

  @Property({ type: DateTimeType, nullable: true })
  resolvedAt?: Date;
}