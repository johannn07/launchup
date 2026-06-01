import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { BaselineService } from './baseline.service';

@Controller('ai/baseline')
export class BaselineController {
  constructor(private readonly baseline: BaselineService) {}

  @Get('normalize')
  async normalize(@Query('score') score?: string) {
    const s = Number(score || '0');
    const res = await this.baseline.normalizeScore(s);
    return res;
  }

  @Post('update')
  async update(@Body() body: { mean: number; std: number }) {
    await this.baseline.updateBaseline(body.mean, body.std);
    return { ok: true };
  }
}
