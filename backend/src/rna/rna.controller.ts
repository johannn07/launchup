import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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

@UseGuards(JwtGuard)
@Controller('rna')
export class RnaController {
  constructor(
    private readonly rnaService: RnaService,
    private readonly aiRunService: AiRunService,
  ) {}

  @Post()
  async create(@Body() dto: CreateStartupRnaDto) {
    return this.rnaService.create(dto);
  }

  @Get()
  async getStartupRna(@Query('startupId', ParseIntPipe) startupId: number) {
    return await this.rnaService.getRNAbyId(startupId);
  }

  @Patch(':id')
  async update(@Param('id') id: number, @Body() dto: UpdateStartupRnaDto) {
    return this.rnaService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
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
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const selected = readinessTypes?.map((type) => type.trim()).filter(Boolean);
    const unknown = selected?.filter(
      (type) => !Object.values(ReadinessType).includes(type as ReadinessType),
    );
    if (unknown?.length)
      throw new BadRequestException(
        `Unknown readiness type(s): ${unknown.join(', ')}`,
      );

    const isPrivileged = req.user?.role === Role.Manager || req.user?.role === Role.Admin;
    return this.aiRunService.track(
      id,
      'rna',
      pipelineConfig,
      isPrivileged,
      (ctx) =>
        this.rnaService.generateRNA(id, ctx, selected as ReadinessType[]),
    );
  }

  @Get(':id/check-complete')
  async checkIfAllReadinessTypesHaveRNA(@Param('id', ParseIntPipe) id: number) {
    return await this.rnaService.checkIfAllReadinessTypesHaveRNA(id);
  }

  @Post(':id/refine')
  async refineRna(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { chatHistory: any[]; latestPrompt: string },
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const isPrivileged = req.user?.role === Role.Manager || req.user?.role === Role.Admin;
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
