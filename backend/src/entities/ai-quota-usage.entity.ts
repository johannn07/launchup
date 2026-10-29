import { DateTimeType, Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

/**
 * Gemini requests sent per model per daily quota window. Gemini reports no
 * remaining count, so this is the app's own tally — calls made outside the app
 * (measurement scripts) are not in it.
 */
@Entity({ tableName: 'ai_quota_usage' })
@Unique({ properties: ['model', 'windowStart'] })
export class AiQuotaUsage {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @Property()
  model!: string;

  /** Midnight US Pacific, when this window's quota opened. */
  @Property({ type: DateTimeType })
  windowStart!: Date;

  @Property()
  calls: number = 0;

  /** Gemini refused for quota in this window, whatever `calls` says. */
  @Property()
  exhausted: boolean = false;
}
