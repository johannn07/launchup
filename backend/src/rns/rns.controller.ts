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
import { RnsService } from './rns.service';
import { CreateRnsDto, UpdateRnsDto, GenerateTasksDto } from './dto';
import { AiRunService } from '../ai/ai-run.service';
import { Role } from '../entities/enums/role.enum';
import { StartupService } from '../startup/startup.service';
import { Rns } from '../entities/rns.entity';

@UseGuards(JwtGuard)
@Controller('rns')
export class RnsController {
  constructor(
    private rnsService: RnsService,
    private readonly aiRunService: AiRunService,
    private readonly startupService: StartupService,
  ) {}

  private async assertAccess(entity: { startup: { id: number } | number }, req: any) {
    const startupId = typeof entity.startup === 'number' ? entity.startup : entity.startup.id;
    await this.startupService.assertCanAccessStartup(startupId, req.user);
  }

  @Get()
  async getStartupRns(@Query('startupId', ParseIntPipe) startupId: number, @Req() req: any) {
    await this.startupService.assertCanAccessStartup(startupId, req.user);
    return await this.rnsService.getStartupRns(startupId);
  }

  @Post()
  async createRns(@Body() dto: CreateRnsDto, @Req() req: any) {
    await this.startupService.assertCanAccessStartup(dto.startupId, req.user);
    return await this.rnsService.createRns(dto);
  }

  @Post('generate-tasks')
  async generateTasks(
    @Body() dto: GenerateTasksDto,
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    await this.startupService.assertCanAccessStartup(dto.startup_id, req.user);

    const isPrivileged = req.user?.role === Role.Manager;
    return this.aiRunService.track(
      dto.startup_id,
      'rns',
      pipelineConfig,
      isPrivileged,
      (ctx) => this.rnsService.generateTasks(dto, ctx),
    );
  }

  @Delete(':id')
  async deleteRns(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const rns = await this.rnsService.findOneWithStartup(id);
    await this.assertAccess(rns, req);
    return await this.rnsService.deleteRns(id);
  }

  @Patch(':id')
  async updateRns(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRnsDto,
    @Req() req: any,
  ) {
    const rns = await this.rnsService.findOneWithStartup(id);
    await this.assertAccess(rns, req);
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
    const rns = await this.rnsService.findOneWithStartup(id);
    await this.assertAccess(rns, req);

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
    @Req() req: any,
  ) {
    const rns = await this.rnsService.findOneWithStartup(id);
    await this.assertAccess(rns, req);
    return this.rnsService.statusChange(id, role, dto);
  }
}
