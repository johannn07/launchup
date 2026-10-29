<script lang="ts">
  import { useQuery } from '@sveltestack/svelte-query';
  import axiosInstance from '$lib/axios';

  type Quota = {
    limit: number;
    remaining: number;
    resetAt: string;
  };

  // `busy` is the page's generating flag; the count is re-read when it clears.
  let { busy = false }: { busy?: boolean } = $props();

  // One pool for every user, so the count can move while the page is open.
  const quota = useQuery<Quota>(
    ['aiQuota'],
    async () => (await axiosInstance.get('/ai/quota')).data,
    { staleTime: 0, refetchInterval: 60_000 }
  );

  let wasBusy = false;
  $effect(() => {
    if (wasBusy && !busy) $quota.refetch();
    wasBusy = busy;
  });

  const resets = $derived(
    $quota.data
      ? new Date($quota.data.resetAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })
      : ''
  );
</script>

{#if $quota.isSuccess}
  <span
    class="text-[12.5px] text-[#94a3b8]"
    title="Shared by everyone using LaunchUp. One generation can use several requests."
  >
    {#if $quota.data.remaining > 0}
      About {$quota.data.remaining} of {$quota.data.limit} AI requests left today ·
      resets {resets}
    {:else}
      Daily AI limit reached · resets {resets}
    {/if}
  </span>
{/if}
