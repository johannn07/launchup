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
  ParseArrayPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { RnaService } from './rna.service';
import { CreateStartupRnaDto, UpdateStartupRnaDto } from './dto/rna.dto';
import { AiRunService } from '../ai/ai-run.service';
import { Role } from '../entities/enums/role.enum';
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { StartupService } from '../startup/startup.service';
import { StartupRNA } from '../entities/rna.entity';

@UseGuards(JwtGuard)
@Controller('rna')
export class RnaController {
  constructor(
    private readonly rnaService: RnaService,
    private readonly aiRunService: AiRunService,
    private readonly startupService: StartupService,
  ) {}

  private async assertAccess(entity: { startup: { id: number } | number }, req: any) {
    const startupId = typeof entity.startup === 'number' ? entity.startup : entity.startup.id;
    await this.startupService.assertCanAccessStartup(startupId, req.user);
  }

  @Post()
  async create(@Body() dto: CreateStartupRnaDto, @Req() req: any) {
    await this.startupService.assertCanAccessStartup(dto.startup_id, req.user);
    return this.rnaService.create(dto);
  }

  @Get()
  async getStartupRna(@Query('startupId', ParseIntPipe) startupId: number, @Req() req: any) {
    await this.startupService.assertCanAccessStartup(startupId, req.user);
    return await this.rnaService.getRNAbyId(startupId);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStartupRnaDto, @Req() req: any) {
    const rna = await this.rnaService.findOneWithStartup(id);
    await this.assertAccess(rna, req);
    return this.rnaService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const rna = await this.rnaService.findOneWithStartup(id);
    await this.assertAccess(rna, req);
    return this.rnaService.delete(id);
  }

  @Get(':id/generate-rna')
  async generateTasks(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Query(
      'readinessTypes',
      new ParseArrayPipe({ items: String, separator: ',', optional: true }),
    )
    readinessTypes?: string[],
    // Dry run: assemble and return the prompt, spending no generation quota.
    @Query('debug') debug?: string,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    await this.startupService.assertCanAccessStartup(id, req.user);

    const selected = readinessTypes?.map((type) => type.trim()).filter(Boolean);
    const unknown = selected?.filter(
      (type) => !Object.values(ReadinessType).includes(type as ReadinessType),
    );
    if (unknown?.length)
      throw new BadRequestException(
        `Unknown readiness type(s): ${unknown.join(', ')}`,
      );

    const isPrivileged = req.user?.role === Role.Manager;
    return this.aiRunService.track(
      id,
      'rna',
      pipelineConfig,
      isPrivileged,
      (ctx) =>
        this.rnaService.generateRNA(
          id,
          ctx,
          selected as ReadinessType[],
          debug === 'true',
        ),
    );
  }

  @Get(':id/check-complete')
  async checkIfAllReadinessTypesHaveRNA(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.startupService.assertCanAccessStartup(id, req.user);
    return await this.rnaService.checkIfAllReadinessTypesHaveRNA(id);
  }

  @Post(':id/refine')
  async refineRna(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { chatHistory: any[]; latestPrompt: string },
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const rna = await this.rnaService.findOneWithStartup(id);
    await this.assertAccess(rna, req);

    const isPrivileged = req.user?.role === Role.Manager;
    // No startup id is available here: the only route param is the RNA id.
    // RnaService.refineRna sets ctx.run.startup itself once it has loaded
    // the RNA's startup, rather than duplicating that lookup here.
    return this.aiRunService.track(
      null,
      'rna_refine',
      pipelineConfig,
      isPrivileged,
      (ctx) => this.rnaService.refineRna(id, body.chatHistory, body.latestPrompt, ctx),
    );
  }
}
