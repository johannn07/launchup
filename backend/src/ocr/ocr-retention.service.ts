import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { OcrDocument } from 'src/entities/ocr-document.entity';
import { resolveRetentionDays, retentionCutoff } from './ocr-retention';

/**
 * Parsing happens before a startup exists, so every OcrDocument starts life
 * unattached and nothing later cleans up the ones that never led to an
 * application. Prune them on boot — there is no scheduler in this app.
 */
@Injectable()
export class OcrRetentionService implements OnModuleInit {
  private readonly logger = new Logger(OcrRetentionService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      const removed = await this.prune(new Date());
      if (removed > 0) {
        this.logger.log(`Pruned ${removed} unattached OCR document(s)`);
      }
    } catch (error) {
      // Never block boot on housekeeping.
      this.logger.warn(
        `OCR retention prune skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async prune(now: Date): Promise<number> {
    const retentionDays = resolveRetentionDays(
      this.config.get<string>('OCR_RETENTION_DAYS'),
    );

    if (retentionDays === 0) {
      return 0;
    }

    return this.em.nativeDelete(OcrDocument, {
      startup: null,
      createdAt: { $lt: retentionCutoff(now, retentionDays) },
    });
  }
}
