import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/public';
import { tierOf } from '$lib/startup-status';
const PUBLIC_API_URL = env.PUBLIC_API_URL || '';

export const load: LayoutServerLoad = async ({ cookies, params, fetch }) => {
  const access = cookies.get('Access');

  // The header reads qualificationStatus from page.data to limit the nav for
  // unqualified startups; the name lets the title and heading render with the
  // page instead of flashing "Loading".
  let qualificationStatus: number | null = null;
  let startupName: string | null = null;
  let tier: string | null = null;
  try {
    const res = await fetch(`${PUBLIC_API_URL}/startups/${params.id}`, {
      headers: { Authorization: `Bearer ${access}` }
    });
    if (res.ok) {
      const startup = await res.json();
      qualificationStatus = startup.qualificationStatus ?? null;
      startupName = startup.name ?? null;
      tier = tierOf(startup);
    }
  } catch {
    // Leave the nav unrestricted; the pages surface their own load errors.
  }

  return {
    access,
    startupId: params.id,
    qualificationStatus,
    startupName,
    tier
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
