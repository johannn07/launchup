import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common'; // Added BadRequestException
import { UserService } from '../user/user.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from '../entities/user.entity';
import * as argon from 'argon2';
import { StartupService } from '../startup/startup.service'; // Import StartupService
import { Startup } from '../entities/startup.entity'; // Import Startup entity
import { CreateStartupDto } from './dto/create-startup.dto'; // Import CreateStartupDto
import { UpdateStartupDto } from './dto/update-startup.dto'; // Import UpdateStartupDto
import { EntityManager } from '@mikro-orm/core';
import { ActivityLog } from '../entities/activity-log.entity';
import { AiBiasAudit } from '../entities/ai-bias-audit.entity';
import { OcrDocument } from '../entities/ocr-document.entity';
import { TierConfig } from '../entities/tier-config.entity';

@Injectable()
export class AdminService {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly startupService: StartupService,
    private readonly em: EntityManager,
  ) {}

  private async log(action: string, details: string, actor?: string) {
    const entry = this.em.create(ActivityLog, {
      action,
      details,
      actor,
      createdAt: new Date(),
    });
    await this.em.persistAndFlush(entry);
  }

  async getAllUsers(): Promise<User[]> {
    return this.userService.findAll();
  }

  async getUserById(id: number): Promise<User> {
    const user = await this.userService.findOneById(id);
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user;
  }

  async createUser(createUserDto: CreateUserDto) {
    const { email, password, firstName, lastName, role } = createUserDto;

    // If user exists, just update role/password as needed
    const existing = await this.userService.findOneByEmail(email);
    if (existing) {
      throw new InternalServerErrorException('User already exists');
      // const updateData: Partial<User> = { firstName, lastName, role };
      // if (password) {
      //   updateData.hash = await argon.hash(password);
      // }
      // const updated = await this.userService.update(existing.id, updateData);
      // if (!updated) throw new InternalServerErrorException('Could not update existing user.');
      // await this.log('Admin', `Updated existing user ${email}`, 'admin');
      // return updated;
    }

    // Otherwise sign up and then set role if needed
    await this.authService.signup({
      email,
      password,
      firstName: firstName ?? '',
      lastName: lastName ?? '',
    });
    const created = await this.userService.findOneByEmail(email);
    if (!created)
      throw new InternalServerErrorException(
        'Could not retrieve created user.',
      );

    if (created.role !== role) {
      const withRole = await this.userService.update(created.id, { role });
      if (!withRole)
        throw new InternalServerErrorException(
          'Could not set role for created user.',
        );
      await this.log(
        'Admin',
        `Created user ${email} with role ${role}`,
        'admin',
      );
      return withRole;
    }

    await this.log('Admin', `Created user ${email}`, 'admin');
    return created;
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto) {
    await this.getUserById(id);

    const { password: newPassword, ...userData } = updateUserDto;
    const updateData: Partial<User> = { ...userData };

    if (newPassword && newPassword.trim().length > 0) {
      updateData.hash = await argon.hash(newPassword);
    }

    try {
      const updatedUser = await this.userService.update(id, updateData);
      if (!updatedUser) {
        throw new InternalServerErrorException(
          `User with ID "${id}" could not be updated`,
        );
      }
      await this.log('Admin', `Updated user ${updatedUser.email}`, 'admin');
      return updatedUser;
    } catch (error: any) {
      // Handle unique constraint violation for email
      if (
        error?.code === '23505' ||
        (typeof error?.message === 'string' && error.message.includes('unique'))
      ) {
        throw new BadRequestException('Email already exists');
      }
      throw error;
    }
  }

  async deleteUser(id: number): Promise<void> {
    const user = await this.getUserById(id);
    await this.userService.remove(id);
    await this.log('Admin', `Deleted user ${user.email}`, 'admin');
  }

  async getAllStartups(): Promise<Startup[]> {
    return this.startupService.findAll();
  }

  async getStartupById(id: number): Promise<Startup> {
    const startup = await this.startupService.getStartupById(id);
    if (!startup) {
      throw new NotFoundException(`Startup with ID "${id}" not found`);
    }
    return startup;
  }

  async createStartup(createStartupDto: CreateStartupDto) {
    try {
      const s = await this.startupService.adminCreate(createStartupDto);
      await this.log('Admin', `Created startup ${s.name}`, 'admin');
      return s;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Could not create startup. ' + (error?.message ?? ''),
      );
    }
  }

  async updateStartup(id: number, updateStartupDto: UpdateStartupDto) {
    await this.getStartupById(id); // Ensures startup exists

    try {
      const updatedStartup = await this.startupService.update(
        id,
        updateStartupDto,
      );
      if (!updatedStartup) {
        throw new InternalServerErrorException(
          `Startup with ID "${id}" could not be updated`,
        );
      }
      await this.log(
        'Admin',
        `Updated startup ${updatedStartup.name}`,
        'admin',
      );
      return updatedStartup;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Could not update startup. ' + (error?.message ?? ''),
      );
    }
  }

  async deleteStartup(id: number): Promise<void> {
    const s = await this.getStartupById(id);
    await this.startupService.remove(id);
    await this.log('Admin', `Deleted startup ${s.name}`, 'admin');
  }

  // Tier config accessors
  async getTierConfigs(): Promise<TierConfig[]> {
    return this.em.find(TierConfig, {}, { orderBy: { id: 'ASC' } });
  }

  async upsertTierConfigs(configs: { tierLabel: string; threshold: number; weights?: Record<string, number> }[]) {
    // naive replace-all strategy: delete existing and insert provided
    const existing = await this.em.find(TierConfig, {});
    for (const e of existing) {
      await this.em.remove(e);
    }
    await this.em.flush();

    const created: TierConfig[] = [];
    for (const cfg of configs) {
      const ent = this.em.create(TierConfig, {
        tierLabel: cfg.tierLabel,
        threshold: cfg.threshold,
        weights: cfg.weights ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      this.em.persist(ent);
      created.push(ent);
    }
    await this.em.flush();

    // Retroactively apply the new tier labels to all existing readiness evaluations
    if (configs.length > 0) {
      const sortedConfigs = [...configs].sort((a, b) => b.threshold - a.threshold);
      let caseSql = 'CASE ';
      for (const cfg of sortedConfigs) {
        // Escape single quotes just in case
        const safeLabel = cfg.tierLabel.replace(/'/g, "''");
        caseSql += `WHEN composite_score >= ${cfg.threshold} THEN '${safeLabel}' `;
      }
      caseSql += `ELSE 'Pending' END`;
      
      const conn = this.em.getConnection();
      await conn.execute(`UPDATE readiness_evaluations SET tier_label = ${caseSql}`);
    }

    await this.log('Admin', `Updated tier configs`, 'admin');
    return created;
  }

  // AI bias audits
  async getBiasAudits(): Promise<AiBiasAudit[]> {
    return this.em.find(AiBiasAudit, {}, { orderBy: { createdAt: 'DESC' }, populate: ['startup'] });
  }

  async overrideBiasAudit(id: number, payload: { correctedScore?: number; biasFlagged?: boolean; biasStatus?: string; justification?: string }) {
    const audit = await this.em.findOne(AiBiasAudit, { id });
    if (!audit) throw new NotFoundException(`Audit with ID ${id} not found`);
    if (payload.correctedScore !== undefined) audit.correctedScore = payload.correctedScore;
    if (payload.biasFlagged !== undefined) audit.biasFlagged = payload.biasFlagged;
    if (payload.biasStatus !== undefined) audit.biasStatus = payload.biasStatus;
    if (payload.justification !== undefined) audit.justification = payload.justification;
    await this.em.flush();
    await this.log('Admin', `Overrode bias audit ${id}`, 'admin');
    return audit;
  }

  async getOcrDocuments(): Promise<OcrDocument[]> {
    return this.em.find(OcrDocument, {}, { orderBy: { createdAt: 'DESC' } });
  }

  async flagOcrDocument(id: number, payload: { sketchDetected?: boolean; sketchConfidence?: number; legibilityStatus?: string; note?: string }) {
    const doc = await this.em.findOne(OcrDocument, { id });
    if (!doc) throw new NotFoundException(`OCR document ${id} not found`);
    if (payload.sketchDetected !== undefined) doc.sketchDetected = payload.sketchDetected;
    if (payload.sketchConfidence !== undefined) doc.sketchConfidence = payload.sketchConfidence;
    if (payload.legibilityStatus !== undefined) doc.legibilityStatus = payload.legibilityStatus;
    await this.em.flush();
    await this.log('Admin', `Flagged OCR doc ${id} (${payload.note ?? 'no note'})`, 'admin');
    return doc;
  }
}
