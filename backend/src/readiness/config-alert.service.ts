import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { ActivityLog } from 'src/entities/activity-log.entity';

export const CONFIG_ALERT_ACTION = 'Config alert';

/**
 * SRS 2.3: invalid weight or tier configuration alerts a Manager through the
 * Admin dashboard's Recent Activity feed.
 */
@Injectable()
export class ConfigAlertService {
  private readonly logger = new Logger(ConfigAlertService.name);
  // Scoring runs on every readiness view; one row per distinct problem per boot.
  private readonly raised = new Set<string>();

  constructor(private readonly em: EntityManager) {}

  async raise(details: string) {
    this.logger.warn(details);
    if (this.raised.has(details)) return;
    this.raised.add(details);
    try {
      // A fork, so the caller's pending changes are not flushed with the alert.
      await this.em.fork().persistAndFlush(
        this.em.create(ActivityLog, {
          action: CONFIG_ALERT_ACTION,
          details,
          actor: 'system',
          createdAt: new Date(),
        }),
      );
    } catch (err) {
      this.raised.delete(details);
      this.logger.warn(
        `Could not record config alert: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
