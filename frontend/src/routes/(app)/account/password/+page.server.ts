import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// This page never worked (no form, no action; its button did nothing) and was
// already hidden from the settings nav. Changing a password lives on the
// profile page, so old links and bookmarks land there instead of on a 404.
export const load: PageServerLoad = () => {
  throw redirect(308, '/account/profile#security');
};
