import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'tier_configs' })
export class TierConfig {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @Property()
  tierLabel!: string;

  @Property()
  threshold!: number;

  // weights saved as JSON: { team: 0.3, market: 0.25, product: 0.2, traction: 0.15, funding: 0.1 }
  @Property({ type: 'json', nullable: true })
  weights?: Record<string, number> | null;

  @Property({ nullable: true })
  createdAt: Date = new Date();

  @Property({ nullable: true })
  updatedAt: Date = new Date();
}
