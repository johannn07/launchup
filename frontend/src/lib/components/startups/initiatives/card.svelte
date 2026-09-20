<script lang="ts">
  import { WorkCard, Assignee } from '$lib/components/workspace';
  import {
    InitiativeViewEditDeleteDialog,
    InitiativeViewEditDeleteAiDialog
  } from '.';
  import type { Actions } from '$lib/types';
  import { goto } from '$app/navigation';
  import { hoveredRNSCard } from '$lib/stores/hoveredRNSCard';
  import { RnsStatus } from '$lib/components/shared/rns.enum';
  let {
    initiative,
    ai,
    members,
    update,
    addToInitiative,
    deleteInitiative,
    role,
    tasks,
    index
  } = $props();

  const assignedRNS = tasks.filter(
    (task: any) => task.id === initiative.rns
  )[0];
  const assignedMember = assignedRNS.assignee;

  let open = $state(false);
  const onOpenChange = () => {
    open = !open;
  };

  let action: Actions = $state('View');
  const closeDialog = () => {
    open = false;
    if (!initiative.clickedByMentor && role === 'Mentor') {
      update(initiative.id, { ...initiative, clickedByMentor: true }, false);
    }
    if (!initiative.clickedByStartup && role === 'Startup') {
      update(initiative.id, { ...initiative, clickedByStartup: true }, false);
    }
  };

  const approveDialog = () => {
    open = false;
    update(initiative.id, {
      ...initiative,
      approvalStatus: 'Unchanged',
      status: initiative.requestedStatus
    });
  };

  const denyDialog = () => {
    open = false;
    update(initiative.id, {
      ...initiative,
      approvalStatus: 'Unchanged',
      requestedStatus: initiative.status
    });
  };

  function handleMouseEnter(event: MouseEvent) {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    hoveredRNSCard.set({
      rns: assignedRNS,
      coords: { x: rect.left + rect.width / 2, y: rect.top },
      visible: true
    });
  }
  function handleMouseLeave() {
    hoveredRNSCard.set({ rns: null, coords: null, visible: false });
  }

  const isNewCard = () => {
    return (
      (role == 'Mentor' && !initiative.clickedByMentor) ||
      (role == 'Startup' && !initiative.clickedByStartup)
    );
  };

  let initiativesCopy = $state({ ...initiative });

  const fields = $derived([
    ['Description', initiative.description],
    ['Measures', initiative.measures],
    ['Targets', initiative.targets],
    ['Remarks', initiative.remarks]
  ] as [string, string | null][]);

  $effect(() => {
    initiativesCopy = { ...initiative };
  });
</script>

<WorkCard
  onopen={() => {
    open = true;
    action = 'View';
  }}
  flag={initiativesCopy.approvalStatus !== 'Unchanged'
    ? 'Awaiting approval'
    : isNewCard()
      ? 'New'
      : null}
>
  {#snippet chips()}
    <span class="lu-chip-sm">#{initiative.initiativeNumber ?? ''}</span>
    <button
      type="button"
      class="lu-chip-sm transition-colors duration-quick hover:border-[#4f46e5] hover:text-white"
      onmouseenter={handleMouseEnter}
      onmouseleave={handleMouseLeave}
      onclick={(e) => {
        e.stopPropagation();
        goto(`rns?tab=rns`);
      }}
    >
      RNS #{assignedRNS?.priorityNumber ?? ''}
    </button>
    <span class="lu-chip-sm">{assignedRNS.readinessType}</span>
  {/snippet}

  <p>
    <span class="text-[#94a3b8]">Task</span>
    {@html assignedRNS?.description?.substring(0, 60) +
      (assignedRNS?.description?.length > 60 ? '…' : '')}
  </p>
  {#each fields as [label, value]}
    {#if value}
      <p class="mt-1.5 text-[12.5px] text-[#94a3b8]">
        <span class="text-[#c7d2fe]">{label}</span>
        {@html value.substring(0, 60) + (value.length > 60 ? '…' : '')}
      </p>
    {/if}
  {/each}

  {#snippet footer()}
    <Assignee member={assignedMember} />
  {/snippet}
</WorkCard>

{#if role === 'Startup'}
  <InitiativeViewEditDeleteDialog
    {open}
    {onOpenChange}
    rns={initiative}
    {update}
    {action}
    deleteRns={deleteInitiative}
    {members}
    {assignedMember}
    {closeDialog}
    {tasks}
    {addToInitiative}
    {ai}
    {index}
    {role}
  />
{:else}
  <InitiativeViewEditDeleteAiDialog
    {open}
    {onOpenChange}
    {initiative}
    {deleteInitiative}
    {members}
    {closeDialog}
    {addToInitiative}
    {index}
    {tasks}
    isEdit={!ai}
    {approveDialog}
    {denyDialog}
  />
{/if}
