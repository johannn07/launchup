import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiMetricsService } from './ai-metrics.service';
import { AiMetricsController } from './ai-metrics.controller';
import { BaselineService } from './baseline.service';

@Module({
  providers: [AiService, AiMetricsService, BaselineService],
  controllers: [AiMetricsController],
  exports: [AiService, AiMetricsService, BaselineService],
})
export class AiModule {}
