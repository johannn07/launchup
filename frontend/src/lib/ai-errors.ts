import { toast } from 'svelte-sonner';

/**
 * A refused generation comes back as a 503 that may say it was queued for a
 * retry (SRS 2.2); that is news, not a failure.
 */
export function toastAiError(error: unknown, fallback: string) {
  const data = (
    error as { response?: { data?: { message?: string; queued?: boolean } } }
  )?.response?.data;
  const message = data?.message || fallback;
  if (data?.queued) toast.info(message);
  else toast.error(message);
}
