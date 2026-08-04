import { Module } from '@nestjs/common';
import { RoadblockService } from './roadblock.service';
import { RoadblockController } from './roadblock.controller';
import { AiModule } from 'src/ai/ai.module';
import { RnaModule } from 'src/rna/rna.module';
@Module({
  imports: [AiModule, RnaModule],
  providers: [RoadblockService],
  controllers: [RoadblockController],
})
export class RoadblockModule {}
