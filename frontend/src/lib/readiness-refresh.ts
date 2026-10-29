import type { QueryClient } from '@sveltestack/svelte-query';
import axiosInstance from '$lib/axios';

/**
 * After a rating: re-score, because the stored tier only moves when
 * /readiness/score runs, then invalidate every cached query. The client caches
 * for an hour (routes/+layout.svelte), and levels are cached under many keys —
 * a named list missed the RNA page's `readinessData`. Only the page on screen
 * refetches now; the rest refetch when next opened.
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
  await queryClient.invalidateQueries();
}
