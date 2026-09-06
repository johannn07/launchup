import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { OcrRetentionService } from './ocr-retention.service';

@Module({
  controllers: [OcrController],
  providers: [OcrService, OcrRetentionService],
  exports: [OcrService],
})
export class OcrModule {}
