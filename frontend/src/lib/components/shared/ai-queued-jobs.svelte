<script lang="ts">
  import { useQuery } from '@sveltestack/svelte-query';
  import axiosInstance from '$lib/axios';
  import { toast } from 'svelte-sonner';

  type Job = {
    id: number;
    operation: string;
    status: 'queued' | 'running' | 'failed';
    attempts: number;
    nextAttemptAt: string;
    lastError: string | null;
  };

  // SRS 2.2. Generation Gemini refused is queued server-side and retried;
  // this lists that page's jobs and reloads the page's data when one finishes.
  let {
    startupId,
    operation,
    busy = false,
    onDone
  }: {
    startupId: number;
    operation: 'rna' | 'rns' | 'initiatives' | 'roadblocks';
    busy?: boolean;
    onDone?: () => void;
  } = $props();

  const jobs = useQuery<Job[]>(
    ['aiJobs', startupId],
    async () =>
      (await axiosInstance.get('/ai/jobs', { params: { startupId } })).data,
    { staleTime: 0, refetchInterval: 30_000 }
  );

  const mine = $derived(
    ($jobs.data ?? []).filter((j) => j.operation === operation)
  );

  // A failed generate call may have just queued a job.
  let wasBusy = false;
  $effect(() => {
    if (wasBusy && !busy) $jobs.refetch();
    wasBusy = busy;
  });

  // A pending job that leaves the list has completed (or was cancelled).
  let pending = new Set<number>();
  $effect(() => {
    const now = new Set(
      mine.filter((j) => j.status !== 'failed').map((j) => j.id)
    );
    if ([...pending].some((id) => !now.has(id))) onDone?.();
    pending = now;
  });

  // A daily-quota retry waits for the reset, often tomorrow.
  const at = (iso: string) => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });
    return d.toDateString() === new Date().toDateString()
      ? time
      : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  };

  async function cancel(id: number) {
    try {
      await axiosInstance.delete(`/ai/jobs/${id}`);
      pending.delete(id);
      $jobs.refetch();
    } catch {
      toast.error('Could not cancel the queued generation.');
    }
  }
</script>

{#if mine.length}
  <div class="space-y-2" aria-live="polite">
    {#each mine as job (job.id)}
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-[#1f2c47] bg-[#0b1220] px-4 py-3 text-[13px] text-[#c3ced9]"
      >
        <div class="flex min-w-0 flex-wrap items-center gap-2.5">
          <span
            class="lu-status"
            style="--st: var({job.status === 'failed'
              ? '--lu-danger'
              : '--lu-flag'})"
          >
            {job.status === 'queued'
              ? 'Queued'
              : job.status === 'running'
                ? 'Retrying now'
                : 'Gave up'}
          </span>
          <span class="min-w-0">
            {#if job.status === 'queued'}
              Generation will retry automatically at {at(job.nextAttemptAt)}.
            {:else if job.status === 'running'}
              Generating. This page updates when it finishes.
            {:else}
              {job.lastError ?? 'The queued generation could not complete.'}
            {/if}
          </span>
        </div>
        {#if job.status !== 'running'}
          <button
            type="button"
            class="lu-btn lu-btn-secondary lu-btn-sm"
            onclick={() => cancel(job.id)}
          >
            {job.status === 'failed' ? 'Dismiss' : 'Cancel'}
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}
