<script lang="ts">
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';
  import Assignee from '$lib/components/workspace/Assignee.svelte';

  let {
    mentors,
    qualificationStatus
  }: {
    mentors?: { firstName: string; lastName?: string | null }[] | null;
    qualificationStatus?: number | null;
  } = $props();

  const first = $derived(mentors?.[0] ?? null);
  const extra = $derived(Math.max((mentors?.length ?? 0) - 1, 0));
  // A Manager appoints mentors when qualifying, so earlier stages have none yet.
  const emptyLabel = $derived(
    qualificationStatus === QualificationStatus.QUALIFIED ||
      qualificationStatus === QualificationStatus.COMPLETED
      ? 'Not assigned yet'
      : 'Assigned once qualified'
  );
</script>

{#if first}
  <span class="flex min-w-0 items-center gap-1.5 text-[#f1f5f9]">
    <Assignee member={first} />
    {#if extra}
      <span
        class="shrink-0 text-[#94a3b8]"
        title={mentors!
          .slice(1)
          .map((m) => `${m.firstName} ${m.lastName ?? ''}`.trim())
          .join(', ')}>+{extra}</span
      >
    {/if}
  </span>
{:else}
  <span class="flex min-w-0 items-center gap-1.5 text-[#94a3b8]">
    <span
      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-[#2b3a5c] text-[10.5px] text-[#54648a]"
      aria-hidden="true">?</span
    >
    <span class="truncate">{emptyLabel}</span>
  </span>
{/if}
