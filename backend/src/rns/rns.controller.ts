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
} from '@nestjs/common';
import { RnsService } from './rns.service';
import { CreateRnsDto, UpdateRnsDto, GenerateTasksDto } from './dto';
import { AiRunService } from '../ai/ai-run.service';

@Controller('rns')
export class RnsController {
  constructor(
    private rnsService: RnsService,
    private readonly aiRunService: AiRunService,
  ) {}

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
    const isPrivileged = req.user?.role === 'Manager' || req.user?.role === 'Admin';
    const ctx = await this.aiRunService.begin(
      dto.startup_id,
      'rns',
      pipelineConfig,
      isPrivileged,
    );
    const startedAt = Date.now();

    try {
      const result = await this.rnsService.generateTasks(dto, ctx);
      await this.aiRunService.finish(ctx, {
        status: 'completed',
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await this.aiRunService.finish(ctx, {
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
    const isPrivileged = req.user?.role === 'Manager' || req.user?.role === 'Admin';
    // No startup id is available here: the only route param is the Rns id,
    // and the service already loads the startup itself, so we don't
    // duplicate that query just to attribute this run.
    const ctx = await this.aiRunService.begin(
      null,
      'rns_refine',
      pipelineConfig,
      isPrivileged,
    );
    const startedAt = Date.now();

    try {
      const result = await this.rnsService.refineRnsDescription(
        id,
        dto.chatHistory,
        dto.latestPrompt,
        ctx,
      );
      await this.aiRunService.finish(ctx, {
        status: 'completed',
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await this.aiRunService.finish(ctx, {
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
