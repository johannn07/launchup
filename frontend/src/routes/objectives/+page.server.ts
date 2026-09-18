import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Internal build-status tracker. hooks.server.ts already requires a session;
// this narrows it to Managers. A 404 rather than a 403, so the page doesn't
// advertise that it exists to anyone who can't use it. The backend endpoint it
// reads (GET /design/status) is guarded the same way.
export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role !== 'Manager') {
    throw error(404, 'Not found');
  }
  return {};
};
