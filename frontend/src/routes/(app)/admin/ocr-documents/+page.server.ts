import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/public';
const PUBLIC_API_URL = env.PUBLIC_API_URL || '';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ cookies, fetch, url }) => {
  const token = cookies.get('Access');
  if (!token) throw redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);

  const fetchUrl = `${PUBLIC_API_URL}/admin/ocr-documents`;
  try {
    const res = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
    const ocrs = await res.json();
    return { ocrs, access: token };
  } catch (error) {
    console.error('[Admin][OCR] Fetch error:', error);
    throw error;
  }
};
