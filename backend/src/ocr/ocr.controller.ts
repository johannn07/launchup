import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { OcrService } from './ocr.service';

// `parse` reads a caller-supplied server-side path and returns its text, with
// no confinement to an upload directory. The guard narrows who can do that to
// authenticated users; it does not make the endpoint safe. It is described in
// its own comment as a "quick test endpoint" and should probably be deleted.
@UseGuards(JwtGuard)
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
