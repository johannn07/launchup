import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ReadinessService } from './readiness.service';
import { StartupService } from '../startup/startup.service';

@UseGuards(JwtGuard)
@Controller('readiness')
export class ReadinessController {
  constructor(
    private readonly readinessService: ReadinessService,
    private readonly startupService: StartupService,
  ) {}

  @Get(':startupId')
  async get(@Param('startupId', ParseIntPipe) startupId: number, @Req() req: any) {
    await this.startupService.assertCanAccessStartup(startupId, req.user);
    return this.readinessService.getReadinessForStartup(startupId);
  }

  @Post('score')
  async score(@Body('startupId', ParseIntPipe) startupId: number, @Req() req: any) {
    await this.startupService.assertCanAccessStartup(startupId, req.user);
    return this.readinessService.getReadinessForStartup(startupId);
  }
}
