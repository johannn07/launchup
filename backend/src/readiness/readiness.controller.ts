import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ReadinessService } from './readiness.service';

@UseGuards(JwtGuard)
@Controller('readiness')
export class ReadinessController {
  constructor(private readonly readinessService: ReadinessService) {}

  @Get(':startupId')
  async get(@Param('startupId', ParseIntPipe) startupId: number) {
    return this.readinessService.getReadinessForStartup(startupId);
  }

  @Post('score')
  async score(@Body('startupId', ParseIntPipe) startupId: number) {
    return this.readinessService.getReadinessForStartup(startupId);
  }
}
