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
 * The cookie is `httpOnly`, so browser JS cannot read it to build an
 * `Authorization` header and the shared axios instance sends no credentials.
 * Without this extractor, any guarded controller the UI calls client-side 401s.
 *
 * The alternative — exposing the token to page scripts — is weaker anyway. The
 * Bearer header still works for server-side loads and direct API use.
 *
 * Parsed by hand rather than adding cookie-parser: one header, one name.
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
      // Header first — an explicit Authorization header is deliberate and
      // should beat whatever cookie the browser happens to attach.
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
