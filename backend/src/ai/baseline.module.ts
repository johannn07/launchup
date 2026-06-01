import { Module } from '@nestjs/common';
import { BaselineService } from './baseline.service';
import { BaselineController } from './baseline.controller';

@Module({
  providers: [BaselineService],
  controllers: [BaselineController],
  exports: [BaselineService],
})
export class BaselineModule {}
