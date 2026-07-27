import { Controller, Get, Query, Post, Body, UseGuards } from '@nestjs/common';
import { AdminGuard, JwtGuard } from 'src/auth/guard';
import { BaselineService } from './baseline.service';

// Admin, not merely authenticated: `update` rewrites the baseline distribution
// that score normalization (Objective 4c) measures against, so an unprivileged
// caller could silently move every normalized score in the study.
@UseGuards(JwtGuard, AdminGuard)
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
