import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/public';
const PUBLIC_API_URL = env.PUBLIC_API_URL || '';

export const load: LayoutServerLoad = async ({ cookies, params, fetch }) => {
  const access = cookies.get('Access');

  // The header reads this from page.data to limit the nav for unqualified startups.
  let qualificationStatus: number | null = null;
  try {
    const res = await fetch(`${PUBLIC_API_URL}/startups/${params.id}`, {
      headers: { Authorization: `Bearer ${access}` }
    });
    if (res.ok) qualificationStatus = (await res.json()).qualificationStatus ?? null;
  } catch {
    // Leave the nav unrestricted; the pages surface their own load errors.
  }

  return {
    access,
    startupId: params.id,
    qualificationStatus
  };
};

// import { fetchWithAuth } from '$lib/utils';
// import type { LayoutServerLoad } from './$types';

// export const load: LayoutServerLoad = async ({ cookies, fetch, params, url }) => {
// 	try {
// 		const startup = await fetchWithAuth(`/startups/${params.id}/`, cookies, fetch);

// 		const startupData = await startup.json();

// 		if (startup.ok) {
// 			return {
// 				info: startupData,
// 				id: params.id,
// 				pathname: url.pathname.slice(1).split('/')[2],
// 				access: cookies.get('Access')
// 			};
// 		} else {
// 			console.error('Error fetching data', {
// 				startupStatus: startup.status
// 			});
// 		}
// 	} catch (error) {
// 		console.error('Error during load:', error);
// 		return {
// 			applicants: [],
// 			mentors: [],
// 			rubricsApplicants: [],
// 			access: cookies.get('Access')
// 		};
// 	}
// };
