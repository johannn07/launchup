import { JWT_SECRET } from '$env/static/private';
import { jwtVerify } from 'jose';
import type { Role } from '$lib/types/user.types';

export type AccessTokenClaims = {
  sub: string;
  email: string;
  role?: Role;
  firstName?: string;
  lastName?: string;
};

/**
 * Verify a backend-issued access token and return its claims.
 *
 * Both login actions gate on the role in the token, and the previous admin
 * login read it with a bare `atob` on the payload segment — an unsigned claim
 * decides who reaches the management console. Same secret and library as
 * `hooks.server.ts`, which already verifies this token on every request.
 *
 * Returns null on any failure; callers treat that as a failed sign-in.
 */
export async function verifyAccessToken(
  token: string
): Promise<AccessTokenClaims | null> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify<AccessTokenClaims>(token, secret);
    return payload;
  } catch {
    return null;
  }
}
