import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { AiQuotaService } from './ai-quota.service';

// Any signed-in user: everyone draws on the same shared daily quota.
@UseGuards(JwtGuard)
@Controller('ai/quota')
export class AiQuotaController {
  constructor(private readonly quota: AiQuotaService) {}

  @Get()
  status() {
    return this.quota.status();
  }
}
