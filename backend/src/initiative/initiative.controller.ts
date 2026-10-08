import {
  BadRequestException,
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
import { InitiativeService } from './initiative.service';
import {
  CreateInitiativeDto,
  GenerateInitiativeDto,
  UpdateInitiativeDto,
} from './dto/initiative.dto';
import { AiRunService } from '../ai/ai-run.service';
import { Role } from '../entities/enums/role.enum';
import { StartupService } from '../startup/startup.service';
import { Initiative } from '../entities/initiative.entity';

@UseGuards(JwtGuard)
@Controller('initiatives')
export class InitiativeController {
  constructor(
    private initiativeService: InitiativeService,
    private readonly aiRunService: AiRunService,
    private readonly startupService: StartupService,
  ) {}

  private async assertAccess(entity: { startup: { id: number } | number }, req: any) {
    const startupId = typeof entity.startup === 'number' ? entity.startup : entity.startup.id;
    await this.startupService.assertCanAccessStartup(startupId, req.user);
  }

  @Get()
  async getStartupInitiative(
    @Query('startupId', ParseIntPipe) startupId: number,
    @Req() req: any,
  ) {
    await this.startupService.assertCanAccessStartup(startupId, req.user);
    return await this.initiativeService.getStartupInitiative(startupId);
  }

  @Post()
  async createInitiative(@Body() dto: CreateInitiativeDto, @Req() req: any) {
    // CreateInitiativeDto doesn't have startupId directly; it has rnsId
    // The service will load the RNS to get the startup
    return await this.initiativeService.createInitiative(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInitiativeDto,
    @Req() req: any,
  ) {
    const initiative = await this.initiativeService.findOneWithStartup(id);
    await this.assertAccess(initiative, req);
    return this.initiativeService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const initiative = await this.initiativeService.findOneWithStartup(id);
    await this.assertAccess(initiative, req);
    return this.initiativeService.delete(id);
  }

  @Post('generate-initiatives')
  async generateInitiatives(
    @Body() dto: GenerateInitiativeDto,
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    // GenerateInitiativeDto carries no startup id (only rnsId/rnsIds) — the
    // startup is only known once InitiativeService loads the referenced Rns,
    // so the run is opened startup-less and InitiativeService.generateInitiatives
    // attributes it itself, same as the *_refine routes below.
    // We need to check access via the RNS
    const rnsId = dto.rnsId || dto.rnsIds?.[0];
    if (!rnsId) {
      throw new BadRequestException('rnsId or rnsIds is required');
    }
    const rns = await this.initiativeService.getRnsWithStartup(rnsId);
    await this.assertAccess(rns, req);

    const isPrivileged = req.user?.role === Role.Manager;
    return this.aiRunService.track(
      null,
      'initiatives',
      pipelineConfig,
      isPrivileged,
      (ctx) => this.initiativeService.generateInitiatives(dto, ctx),
    );
  }

  @Post(':id/refine')
  async refineInitiative(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      chatHistory: { role: 'User' | 'Ai'; content: string }[];
      latestPrompt: string;
    },
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const initiative = await this.initiativeService.findOneWithStartup(id);
    await this.assertAccess(initiative, req);

    const isPrivileged = req.user?.role === Role.Manager;
    // No startup id is available here: the only route param is the
    // initiative id. InitiativeService.refineInitiative sets ctx.run.startup
    // itself once it has loaded the initiative's startup, rather than
    // duplicating that lookup here.
    return this.aiRunService.track(
      null,
      'initiatives_refine',
      pipelineConfig,
      isPrivileged,
      (ctx) => this.initiativeService.refineInitiative(id, dto.chatHistory, dto.latestPrompt, ctx),
    );
  }

  @Patch(':id/roleDependent')
  async roleStatusUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Query('role') role: string,
    @Body() dto: UpdateInitiativeDto,
    @Req() req: any,
  ) {
    const initiative = await this.initiativeService.findOneWithStartup(id);
    await this.assertAccess(initiative, req);
    return this.initiativeService.statusChange(id, role, dto);
  }
}
