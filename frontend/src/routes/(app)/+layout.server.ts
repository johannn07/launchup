import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({
  url,
  locals,
  params,
  cookies
}) => {
  if (!locals.user) {
    throw redirect(302, '/');
  }

  return {
    startup: params.id,
    user: locals.user,
    role: locals.user.role,
    currentModule: url.pathname.slice(1)
  };
};
