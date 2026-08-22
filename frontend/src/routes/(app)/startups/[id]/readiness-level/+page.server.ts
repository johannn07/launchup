import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, params }) => {
  return {
    startupId: params.id,
    access: cookies.get('Access'),
    role: locals.user.role
  };
};
