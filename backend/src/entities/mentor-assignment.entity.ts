import { DateTimeType, Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { Startup } from './startup.entity';
import { User } from './user.entity';

@Entity({ tableName: 'mentor_assignments' })
export class MentorAssignment {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup, { deleteRule: 'cascade' })
  startup!: Startup;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  mentor!: User;

  @ManyToOne(() => User, { deleteRule: 'set null', nullable: true })
  assignedBy?: User;

  @Property({ type: DateTimeType })
  assignedAt: Date = new Date();

  @Property()
  isActive: boolean = true;
}