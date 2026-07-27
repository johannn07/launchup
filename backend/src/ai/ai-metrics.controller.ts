import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard, JwtGuard } from 'src/auth/guard';
import { AiMetricsService } from './ai-metrics.service';

// Admin: this reports failure rates and generation provenance across every
// startup, which is a research/operations surface rather than a tenant one.
@UseGuards(JwtGuard, AdminGuard)
@Controller('ai/metrics')
export class AiMetricsController {
  constructor(private readonly metrics: AiMetricsService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 100;
    return this.metrics.getRecent(n);
  }
}
