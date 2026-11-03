import { EntityManager } from '@mikro-orm/core';
import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetUser } from 'src/auth/decorator';
import { JwtGuard } from 'src/auth/guard';
import { Startup } from 'src/entities/startup.entity';
import { canAccessStartup } from 'src/startup/startup-access';
import { AiJobQueueService } from './ai-job-queue.service';
import { AiJobOperation } from 'src/entities/ai-generation-job.entity';

type Requester = { id?: number; role?: string };

@UseGuards(JwtGuard)
@Controller('ai/jobs')
export class AiJobController {
  constructor(
    private readonly jobs: AiJobQueueService,
    private readonly em: EntityManager,
  ) {}

  private async assertAccess(startupId: number, user: Requester) {
    const startup = await this.em.findOne(
      Startup,
      { id: startupId },
      { populate: ['members', 'mentors'] },
    );
    if (!startup) throw new NotFoundException('Startup not found');
    if (!canAccessStartup(startup, user))
      throw new ForbiddenException('You do not have access to this startup.');
  }

  @Get()
  async list(
    @Query('startupId', ParseIntPipe) startupId: number,
    @GetUser() user: Requester,
  ) {
    await this.assertAccess(startupId, user);
    return this.jobs.listForStartup(startupId);
  }

  // Before a startup exists only the requester can see their job (SRS 2.4).
  @Get('mine')
  async mine(
    @Query('operation') operation: AiJobOperation,
    @GetUser() user: Requester,
  ) {
    if (!user?.id) throw new ForbiddenException();
    return this.jobs.listMine(user.id, operation);
  }

  @Post(':id/collect')
  async collect(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: Requester,
  ) {
    const job = await this.jobs.findOne(id);
    if (!job) throw new NotFoundException('Job not found');
    if (job.requestedById !== user?.id) throw new ForbiddenException();
    return this.jobs.collect(id);
  }

  @Delete(':id')
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: Requester,
  ) {
    const job = await this.jobs.findOne(id);
    if (!job) throw new NotFoundException('Job not found');
    if (job.startup) await this.assertAccess(job.startup.id, user);
    else if (user?.role !== 'Manager' && job.requestedById !== user?.id)
      throw new ForbiddenException();
    return this.jobs.cancel(id);
  }
}
