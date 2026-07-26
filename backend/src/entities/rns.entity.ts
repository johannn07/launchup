import { Entity, Enum, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { Startup } from './startup.entity';
import { User } from './user.entity';
import { RnsStatus } from './enums/rns.enum';
import { ReadinessType } from './enums/readiness-type.enum';
import { ReadinessLevel } from './readiness-level.entity';
import { AiGenerationRun } from './ai-generation-run.entity';

@Entity({ tableName: 'rns' })
export class Rns {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @Property()
  priorityNumber!: number;

  @Property()
  clickedByMentor: boolean = false;

  @Property()
  clickedByStartup: boolean = false;

  @Property({ type: 'text' })
  description!: string;

  @ManyToOne(() => ReadinessLevel)
  targetLevel!: ReadinessLevel;

  @Property()
  isAiGenerated: boolean = false;

  @Enum(() => RnsStatus)
  status: RnsStatus = RnsStatus.New;

  @Enum(() => RnsStatus)
  requestedStatus?: RnsStatus;

  @Property({ default: 'Unchanged' })
  approvalStatus: 'Pending' | 'Approved' | 'Denied' | 'Unchanged';

  @Enum(() => ReadinessType)
  readinessType!: ReadinessType;

  @ManyToOne(() => Startup, { deleteRule: 'cascade' })
  startup!: Startup;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  assignee!: User;

  @ManyToOne(() => AiGenerationRun, { nullable: true, deleteRule: 'set null' })
  generationRun?: AiGenerationRun;

  getTargetLevelScore(): number {
    return this.targetLevel.level;
  }
}
