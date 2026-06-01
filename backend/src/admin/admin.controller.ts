import {
  Controller,
  Get,
  UseGuards,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateStartupDto } from './dto/create-startup.dto';
import { UpdateStartupDto } from './dto/update-startup.dto';
import { EntityManager } from '@mikro-orm/core';
import { ActivityLog } from '../entities/activity-log.entity';
import { JwtGuard, AdminGuard } from '../auth/guard';
import { TierConfig } from '../entities/tier-config.entity';
import { IsArray, IsObject, IsString, IsNumber, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class TierConfigItemDto {
  @IsString()
  tierLabel!: string;

  @IsNumber()
  threshold!: number;

  @IsObject()
  @IsOptional()
  weights?: Record<string, number>;
}

class TierConfigUpdateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierConfigItemDto)
  configs!: TierConfigItemDto[];
}

@UseGuards(JwtGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly em: EntityManager,
  ) {}

  // JSON endpoint for recent activity
  @Get('recent-activity')
  async recentActivity() {
    const items = await this.em.find(
      ActivityLog,
      {},
      { orderBy: { createdAt: 'DESC' }, limit: 25 },
    );
    return items.map((i) => ({
      date: i.createdAt.toISOString(),
      action: i.action,
      details: i.details,
    }));
  }

  // --- Users ---
  @Get('users-json')
  async getUsersJson() {
    const users = await this.adminService.getAllUsers();
    return users.sort((a: any, b: any) => a.id - b.id);
  }

  @Get('users/:id-json')
  async getUserJson(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getUserById(id);
  }

  @Post('users/create-json')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      stopAtFirstError: true,
    }),
  )
  async createUserJson(@Body() dto: CreateUserDto) {
    const user = await this.adminService.createUser(dto);
    return { message: 'User created', user };
  }

  @Post('users/edit-json/:id')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      stopAtFirstError: true,
    }),
  )
  async updateUserJson(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.adminService.updateUser(id, dto);
    return { message: 'User updated', user };
  }

  @Post('users/delete-json/:id')
  async deleteUserJson(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.adminService.deleteUser(id);
      return { message: 'User deleted' };
    } catch (e: any) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw e;
    }
  }

  // --- Startups ---
  @Get('startups-json')
  async getStartupsJson() {
    const startups = await this.adminService.getAllStartups();
    return startups.sort((a: any, b: any) => a.id - b.id);
  }

  @Get('startups/:id-json')
  async getStartupJson(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getStartupById(id);
  }

  // --- Tier config ---
  @Get('tiers/check-evals')
  async checkEvals() {
    const conn = this.adminService['em'].getConnection();
    const res = await conn.execute(`SELECT id, startup_id, composite_score, tier_label FROM readiness_evaluations`);
    return res;
  }

  @Get('tiers')
  async getTierConfigs() {
    return this.adminService.getTierConfigs();
  }

  @Post('tiers/update')
  async updateTiers(@Body() body: any) {
    // Basic validation performed in service; accept array of configs
    if (!Array.isArray(body)) {
      throw new BadRequestException('Expected an array of tier configs');
    }
    const sanitized = body.map((b: any) => ({ tierLabel: String(b.tierLabel), threshold: Number(b.threshold), weights: b.weights ?? null }));
    return this.adminService.upsertTierConfigs(sanitized);
  }

  // --- AI bias audits ---
  @Get('ai/bias-audits')
  async getBiasAudits() {
    return this.adminService.getBiasAudits();
  }

  @Post('ai/bias-audits/override/:id')
  async overrideBiasAudit(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    const payload = {
      correctedScore: body.correctedScore !== undefined ? Number(body.correctedScore) : undefined,
      biasFlagged: typeof body.biasFlagged === 'boolean' ? body.biasFlagged : undefined,
      biasStatus: body.biasStatus,
      justification: body.justification,
    };
    return this.adminService.overrideBiasAudit(id, payload);
  }

  // OCR documents
  @Get('ocr-documents')
  async getOcrDocuments() {
    return this.adminService.getOcrDocuments();
  }

  @Post('ocr-documents/flag/:id')
  async flagOcrDocument(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    const payload = {
      sketchDetected: typeof body.sketchDetected === 'boolean' ? body.sketchDetected : undefined,
      sketchConfidence: body.sketchConfidence !== undefined ? Number(body.sketchConfidence) : undefined,
      legibilityStatus: body.legibilityStatus,
      note: body.note,
    };
    return this.adminService.flagOcrDocument(id, payload);
  }

  @Post('startups/create-json')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      stopAtFirstError: true,
    }),
  )
  async createStartupJson(@Body() dto: CreateStartupDto) {
    const startup = await this.adminService.createStartup(dto);
    return { message: 'Startup created', startup };
  }

  @Post('startups/edit-json/:id')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      stopAtFirstError: true,
    }),
  )
  async updateStartupJson(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStartupDto,
  ) {
    const startup = await this.adminService.updateStartup(id, dto);
    return { message: 'Startup updated', startup };
  }

  @Post('startups/delete-json/:id')
  async deleteStartupJson(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.adminService.deleteStartup(id);
      return { message: 'Startup deleted' };
    } catch (e: any) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw e;
    }
  }
}
