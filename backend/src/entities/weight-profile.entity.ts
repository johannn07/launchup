import { Entity, Enum, PrimaryKey, Property } from '@mikro-orm/core';
import { Sector } from './enums/sector.enum';
import { BusinessModel } from './enums/business-model.enum';

@Entity({ tableName: 'weight_profiles' })
export class WeightProfile {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  // Both null on the global default row.
  @Enum({ items: () => Sector, nullable: true })
  sector?: Sector | null;

  @Enum({ items: () => BusinessModel, nullable: true })
  businessModel?: BusinessModel | null;

  @Property({ type: 'json' })
  weights!: Record<string, number>;

  @Property({ nullable: true })
  createdAt: Date = new Date();

  @Property({ nullable: true })
  updatedAt: Date = new Date();
}
