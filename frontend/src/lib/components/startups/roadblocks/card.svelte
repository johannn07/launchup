<script lang="ts">
  import { WorkCard, Assignee } from '$lib/components/workspace';
  import {
    RoadblocksCreateDialog,
    RoadblocksViewEditDialog,
    RoadblocksViewEditAIDialog
  } from '.';
  import type { Actions } from '$lib/types';
  let { roadblocks, members, update, ai, deleteRoadblocks, role, index } =
    $props();

  let assignee = $derived(roadblocks.assignee);

  const assignedMember = $derived(
    members.filter((member: any) => member.userId === assignee)[0]
  );

  let open = $state(false);
  const onOpenChange = () => {
    open = !open;
  };

  let action: Actions = $state('View');
  const closeDialog = () => {
    open = false;

    if (!roadblocks.clickedByMentor && role === 'Mentor') {
      update(roadblocks.id, { ...roadblocks, clickedByMentor: true }, false);
    }
    if (!roadblocks.clickedByStartup && role === 'Startup') {
      update(roadblocks.id, { ...roadblocks, clickedByStartup: true }, false);
    }
  };

  const isNewCard = () => {
    return (
      (role == 'Mentor' && !roadblocks.clickedByMentor) ||
      (role == 'Startup' && !roadblocks.clickedByStartup)
    );
  };

  const approveDialog = () => {
    open = false;
    update(roadblocks.id, {
      ...roadblocks,
      approvalStatus: 'Unchanged',
      status: roadblocks.requestedStatus
    });
  };

  const denyDialog = () => {
    open = false;
    update(roadblocks.id, {
      ...roadblocks,
      approvalStatus: 'Unchanged',
      requestedStatus: roadblocks.status
    });
  };

  let roadblocksCopy = $state({ ...roadblocks });

  $effect(() => {
    roadblocksCopy = { ...roadblocks };
  });
</script>

<WorkCard
  onopen={() => {
    open = true;
    action = 'View';
  }}
  flag={roadblocksCopy.approvalStatus !== 'Unchanged'
    ? 'Awaiting approval'
    : isNewCard()
      ? 'New'
      : null}
>
  {#snippet chips()}
    <span class="lu-chip-sm">Risk #{roadblocks.riskNumber ?? ''}</span>
  {/snippet}

  <p>
    {@html roadblocks?.description?.substring(0, 80) +
      (roadblocks?.description?.length > 80 ? '…' : '')}
  </p>
  {#if roadblocks?.fix}
    <p class="mt-1.5 text-[12.5px] text-[#94a3b8]">
      <span class="text-[#c7d2fe]">Fix</span>
      {@html roadblocks.fix.substring(0, 80) +
        (roadblocks.fix.length > 80 ? '…' : '')}
    </p>
  {/if}

  {#snippet footer()}
    <Assignee member={assignedMember} />
  {/snippet}
</WorkCard>

{#if role === 'Startup'}
  <RoadblocksViewEditDialog
    {open}
    {onOpenChange}
    rns={roadblocks}
    {update}
    {action}
    deleteRns={deleteRoadblocks}
    {members}
    {assignedMember}
    {closeDialog}
    {ai}
    addToRoadblocks={update}
    {index}
    {role}
  />
{:else}
  <RoadblocksViewEditAIDialog
    {open}
    {onOpenChange}
    roadblock={roadblocks}
    deleteroadblock={deleteRoadblocks}
    {members}
    {closeDialog}
    {update}
    {index}
    {approveDialog}
    {denyDialog}
  />
{/if}
