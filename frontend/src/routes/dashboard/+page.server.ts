import { dev } from '$app/environment';
import { previewReadiness } from './preview-data';
import type { PageServerLoad } from './$types';

/**
 * Dev-only dashboard preview.
 *
 * `/dashboard?preview` renders the dashboard from fixtures so the design can be
 * iterated on without signing in. The real page fetches POST /readiness/score,
 * which sits behind the backend's JwtGuard, so without a token it only ever
 * shows its error state.
 *
 * Gating: `dev` comes from $app/environment and is `true` only under `vite dev`.
 * Vite replaces it with the literal `false` in a production build, so the
 * fixture import is tree-shaken out and `preview` can never be true in prod —
 * the query parameter is inert there. This bypasses no authentication: it
 * substitutes sample data for a request, it does not grant access to real data,
 * and /dashboard was already reachable without a session (it is absent from
 * `protectedRoutes` in hooks.server.ts).
 */
export const load: PageServerLoad = async ({ url }) => {
  const preview = dev && url.searchParams.has('preview');

  return {
    preview,
    previewData: preview ? previewReadiness : null
  };
};
