import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'tier_configs' })
export class TierConfig {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @Property()
  tierLabel!: string;

  @Property()
  threshold!: number;

  @Property({ nullable: true })
  createdAt: Date = new Date();

  @Property({ nullable: true })
  updatedAt: Date = new Date();
}
