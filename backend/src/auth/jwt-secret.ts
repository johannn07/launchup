import { ConfigService } from '@nestjs/config';

/**
 * Resolve `JWT_SECRET`, or refuse to start.
 *
 * Both the signing side (auth.module) and the verifying side (jwt.strategy)
 * previously fell back to the literal `'launchup-dev-secret'` when the variable
 * was unset. That string is committed to a public repository, so a deployment
 * missing the variable would sign every token with a value anyone can read —
 * enough to forge an Admin token. The `||` is what made it dangerous: it failed
 * *silently*, and a working login gave no hint the secret was public.
 *
 * Failing at boot is the whole point. A misconfigured auth secret that starts
 * cleanly is worse than one that does not start at all.
 *
 * Both call sites must use this, and both must resolve the same value — the
 * frontend verifies the JWT itself with `jose` rather than calling the backend
 * (see hooks.server.ts), so its `JWT_SECRET` has to match too.
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
