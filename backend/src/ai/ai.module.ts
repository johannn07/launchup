import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiMetricsService } from './ai-metrics.service';
import { AiMetricsController } from './ai-metrics.controller';
import { BaselineService } from './baseline.service';
import { AiConfigService } from './ai-config.service';
import { AiRunService } from './ai-run.service';
import { EmbeddingService } from './embedding.service';
import { EmbeddingIndexService } from './embedding-index.service';
import { RagCorpusSeederService } from './rag-corpus-seeder.service';

@Module({
  providers: [
    AiService,
    AiMetricsService,
    BaselineService,
    AiConfigService,
    AiRunService,
    EmbeddingService,
    EmbeddingIndexService,
    RagCorpusSeederService,
  ],
  controllers: [AiMetricsController],
  exports: [
    AiService,
    AiMetricsService,
    BaselineService,
    AiConfigService,
    AiRunService,
    EmbeddingService,
    EmbeddingIndexService,
    RagCorpusSeederService,
  ],
})
export class AiModule {}
