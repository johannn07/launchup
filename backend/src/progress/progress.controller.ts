import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ProgressService } from './progress.service';

@UseGuards(JwtGuard)
@Controller('progress')
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @Get(':startupId/progress-report')
  async getProgressReport(@Param('startupId', ParseIntPipe) startupId: number, @Req() req: any) {
    return await this.progressService.getProgressReport(startupId, req.user);
  }
}
