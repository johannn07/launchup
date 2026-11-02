import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuthDto, AuthSignInDto } from './dto';
import * as argon from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { User } from 'src/entities/user.entity';
import { ActivityLog } from 'src/entities/activity-log.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private em: EntityManager,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async signup(dto: AuthDto) {
    const hash = await argon.hash(dto.password);

    const user = new User();
    user.email = dto.email;
    user.hash = hash;
    user.firstName = dto.firstName;
    user.lastName = dto.lastName;

    await this.em.persistAndFlush(user);
    return this.signToken(
      user.id,
      user.email,
      user.role,
      user.firstName,
      user.lastName,
    );
  }

  async signin(dto: AuthSignInDto) {
    const user = await this.em.findOne(User, { email: dto.email });
    if (!user) {
      await this.logFailedSignin(dto.email, 'unknown email');
      throw new ForbiddenException('User not found.');
    }

    const passwordMatches = await argon.verify(user.hash, dto.password);
    if (!passwordMatches) {
      await this.logFailedSignin(dto.email, 'wrong password');
      throw new ForbiddenException('Wrong Password');
    }

    return this.signToken(
      user.id,
      user.email,
      user.role,
      user.firstName,
      user.lastName,
    );
  }

  // SRS 1.1. Shown in the Manager's activity feed; a failed write must not
  // change the sign-in outcome.
  private async logFailedSignin(email: string, reason: string) {
    try {
      await this.em.persistAndFlush(
        this.em.create(ActivityLog, { action: 'Auth', details: `Failed sign-in (${reason})`, actor: email, createdAt: new Date() }),
      );
    } catch (err) {
      this.logger.warn(`Could not log failed sign-in: ${err instanceof Error ? err.message : err}`);
    }
  }

  async signToken(
    userId: number,
    email: string,
    role: string,
    firstName: string | undefined,
    lastName: string | undefined,
  ): Promise<{ access_token: string }> {
    const payload = {
      sub: userId,
      email,
      role,
      firstName: firstName ?? '',
      lastName: lastName ?? '',
    };

    const token = await this.jwtService.signAsync(payload);

    return {
      access_token: token,
    };
  }
}
