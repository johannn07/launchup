import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiMetricsService } from './ai-metrics.service';
import { AiMetricsController } from './ai-metrics.controller';
import { BaselineService } from './baseline.service';
import { AiConfigService } from './ai-config.service';
import { AiRunService } from './ai-run.service';
import { EmbeddingService } from './embedding.service';

@Module({
  providers: [
    AiService,
    AiMetricsService,
    BaselineService,
    AiConfigService,
    AiRunService,
    EmbeddingService,
  ],
  controllers: [AiMetricsController],
  exports: [
    AiService,
    AiMetricsService,
    BaselineService,
    AiConfigService,
    AiRunService,
    EmbeddingService,
  ],
})
export class AiModule {}
