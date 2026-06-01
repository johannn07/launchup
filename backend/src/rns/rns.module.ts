import { Module } from '@nestjs/common';
import { RnsController } from './rns.controller';
import { RnsService } from './rns.service';
import { AiModule } from 'src/ai/ai.module';
import { RnaModule} from 'src/rna/rna.module';

@Module({
  imports: [AiModule, RnaModule],
  controllers: [RnsController],
  providers: [RnsService],
})
export class RnsModule {}
