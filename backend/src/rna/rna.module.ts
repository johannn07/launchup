import { Module } from '@nestjs/common';
import { RnaController } from './rna.controller';
import { RnaService } from './rna.service';
import { AiModule } from 'src/ai/ai.module';
import { RagQueryService } from './rag-query.service';
import { GroundedPromptBuilderService } from './grounded-prompt-builder.service';
import { OutputValidatorService } from './output-validator.service';

@Module({
  imports: [AiModule],
  controllers: [RnaController],
  providers: [
    RnaService,
    RagQueryService,
    GroundedPromptBuilderService,
    OutputValidatorService,
  ],
  exports: [
    RagQueryService,
    GroundedPromptBuilderService,
    OutputValidatorService,
  ],
})
export class RnaModule {}