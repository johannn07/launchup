import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from 'src/entities/user.entity';
import { requireJwtSecret } from '../jwt-secret';

/**
 * Read the JWT from the `Access` cookie the frontend sets at login.
 *
 * Needed because that cookie is `httpOnly`, so browser JavaScript cannot read
 * it to build an `Authorization` header — and the shared axios instance
 * (`frontend/src/lib/axios.ts`) therefore sends no credentials at all. Without
 * this extractor, putting a guard on any controller the UI calls from the
 * client would 401 every one of those calls.
 *
 * Keeping the token in an httpOnly cookie and reading it here is the stronger
 * arrangement anyway: the alternative is exposing the token to any script on
 * the page. The Bearer header still works, for server-side loads and for
 * anything driving the API directly.
 *
 * Parsed by hand rather than pulling in cookie-parser — one header, one name.
 */
const accessCookieExtractor = (req: {
  headers?: { cookie?: string };
}): string | null => {
  const raw = req?.headers?.cookie;
  if (!raw) return null;

  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === 'Access') {
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    }
  }
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private em: EntityManager,
  ) {
    super({
      // Header first: an explicit Authorization header is a deliberate act and
      // should win over whatever cookie the browser happens to attach.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        accessCookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(config),
    });
  }

  async validate(payload: { sub: number; email: string }) {
    const user = await this.em.findOne(
      User,
      { id: payload.sub },
      { exclude: ['hash'] },
    );

    return user;
  }
}
