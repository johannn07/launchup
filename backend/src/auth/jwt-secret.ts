import { ConfigService } from '@nestjs/config';

/**
 * Resolve `JWT_SECRET`, or refuse to start.
 *
 * Signing (auth.module) and verifying (jwt.strategy) both used to fall back to
 * a literal `'launchup-dev-secret'`. That string is in a public repo, so a
 * deployment missing the variable signed every token with a value anyone could
 * read — enough to forge an Admin token — and failed silently, since login
 * still worked. Failing at boot is the point.
 *
 * Both call sites must use this, and the frontend's `JWT_SECRET` must match:
 * it verifies the JWT itself with `jose` (see hooks.server.ts).
 */
export function requireJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET')?.trim();

  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Refusing to start rather than fall back to a ' +
        'known secret. Set it in backend/.env, and set the same value in ' +
        'frontend/.env — the frontend verifies tokens itself.',
    );
  }

  return secret;
}
