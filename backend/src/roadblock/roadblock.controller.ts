import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
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
import { StartupService } from '../startup/startup.service';
import { Roadblock } from '../entities/roadblock.entity';

@UseGuards(JwtGuard)
@Controller('roadblocks')
export class RoadblockController {
  constructor(
    private roadblockService: RoadblockService,
    private readonly aiRunService: AiRunService,
    private readonly startupService: StartupService,
  ) {}

  private async assertAccess(entity: { startup: { id: number } | number }, req: any) {
    const startupId = typeof entity.startup === 'number' ? entity.startup : entity.startup.id;
    await this.startupService.assertCanAccessStartup(startupId, req.user);
  }

  @Get()
  async getByStartupId(@Query('startupId', ParseIntPipe) startupId: number, @Req() req: any) {
    await this.startupService.assertCanAccessStartup(startupId, req.user);
    return await this.roadblockService.getByStartupId(startupId);
  }

  @Post()
  async createRoadblock(@Body() dto: CreateRoadblockDto, @Req() req: any) {
    await this.startupService.assertCanAccessStartup(dto.startupId, req.user);
    return await this.roadblockService.createRoadblock(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoadblockDto,
    @Req() req: any,
  ) {
    const roadblock = await this.roadblockService.findOneWithStartup(id);
    await this.assertAccess(roadblock, req);
    return this.roadblockService.update(id, dto);
  }

  // Role comes from the token: the board's ?role= is client-controlled, and
  // trusting it would let a startup skip mentor approval.
  @Patch(':id/roleDependent')
  async roleStatusUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() dto: UpdateRoadblockDto,
  ) {
    const roadblock = await this.roadblockService.findOneWithStartup(id);
    await this.assertAccess(roadblock, req);
    return this.roadblockService.statusChange(id, req.user?.role, dto);
  }

  @Delete(':id')
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<{ message: string }> {
    const roadblock = await this.roadblockService.findOneWithStartup(id);
    await this.assertAccess(roadblock, req);
    return await this.roadblockService.deleteRoadblock(id);
  }

  @Post('generate-roadblocks')
  async generateRoadblocks(
    @Body() dto: GenerateRoadblocksDto,
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    await this.startupService.assertCanAccessStartup(dto.startupId, req.user);

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
    const roadblock = await this.roadblockService.findOneWithStartup(id);
    await this.assertAccess(roadblock, req);

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
