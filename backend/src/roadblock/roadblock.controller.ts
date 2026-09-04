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
import { RoadblockService } from './roadblock.service';
import {
  CreateRoadblockDto,
  GenerateRoadblocksDto,
  UpdateRoadblockDto,
} from './dto/roadblock.dto';
import { AiRunService } from '../ai/ai-run.service';
import { Role } from '../entities/enums/role.enum';

@UseGuards(JwtGuard)
@Controller('roadblocks')
export class RoadblockController {
  constructor(
    private roadblockService: RoadblockService,
    private readonly aiRunService: AiRunService,
  ) {}

  @Get()
  async getByStartupId(@Query('startupId', ParseIntPipe) startupId: number) {
    return await this.roadblockService.getByStartupId(startupId);
  }

  @Post()
  async createRoadblock(@Body() dto: CreateRoadblockDto) {
    return await this.roadblockService.createRoadblock(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoadblockDto,
  ) {
    return this.roadblockService.update(id, dto);
  }

  @Delete(':id')
  async delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    return await this.roadblockService.deleteRoadblock(id);
  }

  @Post('generate-roadblocks')
  async generateRoadblocks(
    @Body() dto: GenerateRoadblocksDto,
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const isPrivileged = req.user?.role === Role.Manager;
    // GenerateRoadblocksDto carries a real startupId, so the run can be
    // attributed at open time — unlike the *_refine route below, no
    // service-side backfill is needed.
    return this.aiRunService.track(
      dto.startupId,
      'roadblocks',
      pipelineConfig,
      isPrivileged,
      (ctx) => this.roadblockService.generateRoadblocks(dto, ctx),
    );
  }

  @Post(':id/refine')
  async refineRoadblock(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      chatHistory: { role: 'User' | 'Ai'; content: string }[];
      latestPrompt: string;
    },
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const isPrivileged = req.user?.role === Role.Manager;
    // No startup id is available here: the only route param is the
    // roadblock id. RoadblockService.refineRoadblock sets ctx.run.startup
    // itself once it has loaded the roadblock's startup, rather than
    // duplicating that lookup here. Use a distinct 'roadblocks_refine'
    // operation so interactive refinement doesn't contaminate the
    // roadblocks generation arm's latency/quality statistics.
    return this.aiRunService.track(
      null,
      'roadblocks_refine',
      pipelineConfig,
      isPrivileged,
      (ctx) =>
        this.roadblockService.refineRoadblock(
          id,
          dto.chatHistory,
          dto.latestPrompt,
          ctx,
        ),
    );
  }
}
