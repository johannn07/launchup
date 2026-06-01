import { Controller, Get, Query } from '@nestjs/common';
import { OcrService } from './ocr.service';

@Controller('ocr')
export class OcrController {
  constructor(private readonly ocr: OcrService) {}

  // Quick test endpoint: /ocr/parse?file=relative/path/to/file
  @Get('parse')
  async parse(@Query('file') file?: string) {
    if (!file) return { text: '', note: 'no file provided' };
    const result = await this.ocr.parseImageFile(file);
    return result;
  }
}
