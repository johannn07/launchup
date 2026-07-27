import { JWT_SECRET } from '$env/static/private';
import type { Handle } from '@sveltejs/kit';
import { jwtVerify } from 'jose';
import { redirect, isRedirect } from '@sveltejs/kit';
import type { Role } from '$lib/types/user.types';

/**
 * Fail at startup if JWT_SECRET is missing, rather than falling back.
 *
 * This used to be `JWT_SECRET || 'launchup-dev-secret'` at the point of
 * verification. Two problems with that: the fallback string is committed to a
 * public repo, so anyone could mint a token this app would accept; and because
 * the verification sits inside a try/catch that redirects to /login on any
 * error, a misconfigured deployment would present as "your login didn't work"
 * rather than as a security failure.
 *
 * Checked at module scope so it surfaces when the server boots, not on the
 * first request that happens to carry a cookie.
 *
 * This value must match the backend's JWT_SECRET — the frontend verifies the
 * token itself here instead of calling the backend to do it.
 */
if (!JWT_SECRET?.trim()) {
  throw new Error(
    'JWT_SECRET is not set in the frontend environment. Refusing to start ' +
      'rather than fall back to a known secret. It must match the value in ' +
      'backend/.env — this process verifies backend-issued tokens itself.'
  );
}

const protectedRoutes = [
  '/account',
  '/analytics',
  '/applications',
  '/startups',
  '/admin'
];
const publicOnlyRoutes = ['/login', '/register', '/admin-login'];

export const handle: Handle = async ({ event, resolve }) => {
  let accessToken = event.cookies.get('Access');
  const pathname = event.url.pathname;

  // Treat protected route only if exact match or prefixed with '/'
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );
  const isPublicOnlyRoute = publicOnlyRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );
  const isAdminLogin = pathname.startsWith('/admin-login');

  if (!accessToken) {
    if (isProtectedRoute) {
      // If admin area and not logged, go to admin-login; else normal login
      if (pathname.startsWith('/admin')) {
        throw redirect(
          302,
          `/admin-login?redirectTo=${encodeURIComponent(pathname)}`
        );
      }
      throw redirect(302, `/login?redirectTo=${encodeURIComponent(pathname)}`);
    }
    return await resolve(event);
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);

    const { payload } = await jwtVerify<{
      sub: string;
      email: string;
      role?: Role;
      firstName?: string;
      lastName?: string;
    }>(accessToken, secret);

    event.locals.user = {
      id: Number(payload.sub),
      email: payload.email,
      role: payload.role!,
      firstName: payload.firstName ?? undefined,
      lastName: payload.lastName ?? undefined
    };

    if (isPublicOnlyRoute) {
      if (event.locals.user.role === 'Admin') {
        throw redirect(302, '/admin');
      }
      throw redirect(302, '/startups');
    }
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    console.error(`[ HANDLE ERROR ]`);
    console.error(error);
    if (isProtectedRoute) {
      if (pathname.startsWith('/admin')) {
        throw redirect(
          302,
          `/admin-login?redirectTo=${encodeURIComponent(pathname)}`
        );
      }
      throw redirect(302, `/login?redirectTo=${encodeURIComponent(pathname)}`);
    }

    return await resolve(event);
  }

  return await resolve(event);
};
