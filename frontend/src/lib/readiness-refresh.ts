import type { QueryClient } from '@sveltestack/svelte-query';
import axiosInstance from '$lib/axios';

// Every cached query showing a startup's levels or tier. The client caches for
// an hour (routes/+layout.svelte), so a rating must invalidate them by name.
const RATING_QUERY_KEYS = [
  'startup',
  'startupData',
  'haveScores',
  'readinessLevel',
  'startupReadinessLevels'
];

/**
 * After a rating: re-score, because the stored tier only moves when
 * /readiness/score runs, then refetch every view of the levels and tier.
 */
export async function refreshAfterRating(
  queryClient: QueryClient,
  startupId: string
) {
  try {
    await axiosInstance.post('/readiness/score', {
      startupId: Number(startupId)
    });
  } catch (error) {
    // The rating itself saved; a failed re-score must not read as a failed save.
    console.error('Re-scoring after a rating failed', error);
  }
  await Promise.all(
    RATING_QUERY_KEYS.map((key) =>
      queryClient.invalidateQueries([key, startupId])
    )
  );
}
