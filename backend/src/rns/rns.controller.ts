import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { RnsService } from './rns.service';
import { CreateRnsDto, UpdateRnsDto, GenerateTasksDto } from './dto';
import { AiRunService } from '../ai/ai-run.service';
import { AiJobQueueService } from '../ai/ai-job-queue.service';
import { Role } from '../entities/enums/role.enum';

@UseGuards(JwtGuard)
@Controller('rns')
export class RnsController {
  constructor(
    private rnsService: RnsService,
    private readonly aiRunService: AiRunService,
    private readonly jobs: AiJobQueueService,
  ) {
    jobs.register('rns', (p, ctx) =>
      this.rnsService.generateTasks({ ...p, debug: false } as GenerateTasksDto, ctx),
    );
  }

  @Get()
  async getStartupRns(@Query('startupId', ParseIntPipe) startupId: number) {
    return await this.rnsService.getStartupRns(startupId);
  }

  @Post()
  async createRns(@Body() dto: CreateRnsDto) {
    return await this.rnsService.createRns(dto);
  }

  @Post('generate-tasks')
  async generateTasks(
    @Body() dto: GenerateTasksDto,
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const isPrivileged = req.user?.role === Role.Manager;
    const run = () =>
      this.aiRunService.track(dto.startup_id, 'rns', pipelineConfig, isPrivileged, (ctx) =>
        this.rnsService.generateTasks(dto, ctx),
      );
    if (dto.debug) return run();
    return this.jobs.runOrQueue(
      { operation: 'rns', startupId: dto.startup_id, payload: { ...dto }, user: req.user },
      run,
    );
  }

  @Delete(':id')
  async deleteRns(@Param('id', ParseIntPipe) id: number) {
    return await this.rnsService.deleteRns(id);
  }

  @Patch(':id')
  async updateRns(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRnsDto,
  ) {
    return await this.rnsService.updateRns(id, dto);
  }

  @Post(':id/refine')
  async refineRnsDescription(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      chatHistory: {
        role: 'User' | 'Ai';
        content: string;
        refinedDescription: string | null;
      }[];
      latestPrompt: string;
    },
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const isPrivileged = req.user?.role === Role.Manager;
    // No startup id is available here: the only route param is the Rns id.
    // We still open the run with startupId: null rather than duplicating a
    // startup lookup the service already performs — RnsService.refineRnsDescription
    // sets ctx.run.startup itself once it has loaded the Rns's startup.
    return this.aiRunService.track(
      null,
      'rns_refine',
      pipelineConfig,
      isPrivileged,
      (ctx) => this.rnsService.refineRnsDescription(id, dto.chatHistory, dto.latestPrompt, ctx),
    );
  }

  @Patch(':id/roleDependent')
  async roleStatusUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Query('role') role: string,
    @Body() dto: UpdateRnsDto,
  ) {
    return this.rnsService.statusChange(id, role, dto);
  }
}
