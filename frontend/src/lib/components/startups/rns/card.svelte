<script lang="ts">
  import { Target } from 'lucide-svelte';
  import WorkCard from '$lib/components/workspace/WorkCard.svelte';
  import Assignee from '$lib/components/workspace/Assignee.svelte';
  import RnsViewEditDeleteDialog from './view-edit-delete-dialog.svelte';
  import RnsViewEditDeleteAiDialog from './view-edit-delete-ai-dialog.svelte';
  import type { Actions } from '$lib/types';
  let { rns, members, update, ai, addToRns, deleteRns, role, index } = $props();

  let assignee = $derived(rns.assignee.id);

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

    if (!rns.clickedByMentor && role === 'Mentor') {
      update(rns.id, { ...rns, clickedByMentor: true }, false);
    }
    if (!rns.clickedByStartup && role === 'Startup') {
      update(rns.id, { ...rns, clickedByStartup: true }, false);
    }
  };

  const isNewCard = () => {
    return (
      (role == 'Mentor' && !rns.clickedByMentor) ||
      (role == 'Startup' && !rns.clickedByStartup)
    );
  };

  let rnsCopy = $state({ ...rns });

  $effect(() => {
    rnsCopy = { ...rns };
  });

  const approveDialog = () => {
    open = false;
    update(rns.id, {
      ...rns,
      approvalStatus: 'Unchanged',
      status: rns.requestedStatus
    });
  };

  const denyDialog = () => {
    open = false;
    update(rns.id, {
      ...rns,
      approvalStatus: 'Unchanged',
      requestedStatus: rns.status
    });
  };
</script>

<WorkCard
  onopen={() => {
    open = true;
    action = 'View';
  }}
  flag={rnsCopy.approvalStatus !== 'Unchanged'
    ? 'Awaiting approval'
    : isNewCard()
      ? 'New'
      : null}
>
  {#snippet chips()}
    <span class="lu-chip-sm">#{rns.priorityNumber ?? ''}</span>
    <span class="lu-chip-sm">{rns.readinessType}</span>
    <span class="lu-chip-sm"
      >{rns.status === 7 ? 'Long term' : 'Short term'}</span
    >
  {/snippet}

  <p>
    {@html rns.description.substring(0, 110) +
      (rns.description.length > 110 ? '…' : '')}
  </p>

  {#snippet footer()}
    <span class="flex items-center gap-1.5">
      <Target class="h-3.5 w-3.5" />
      Target level {rns.targetLevelScore}
    </span>
    <Assignee member={assignedMember} />
  {/snippet}
</WorkCard>

{#if role === 'Startup'}
  <RnsViewEditDeleteDialog
    {open}
    {onOpenChange}
    {rns}
    {deleteRns}
    {update}
    {action}
    {members}
    {closeDialog}
    {index}
    {role}
  />
{:else}
  <RnsViewEditDeleteAiDialog
    {open}
    {onOpenChange}
    {rns}
    {deleteRns}
    {members}
    {closeDialog}
    {index}
    {addToRns}
    isEdit={!ai}
    {approveDialog}
    {denyDialog}
  />
{/if}
