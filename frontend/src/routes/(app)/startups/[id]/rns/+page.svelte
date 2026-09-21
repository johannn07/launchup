<script lang="ts">
  import { tick } from 'svelte';
  import {
    KanbanBoardNew,
    MembersFilter,
    ShowHideColumns
  } from '$lib/components/shared';
  import { getData, getColumns, getReadiness } from '$lib/utils';
  import { useQueriesState } from '$lib/stores/useQueriesState.svelte.js';
  import { useQueries } from '@sveltestack/svelte-query';
  import { toast } from 'svelte-sonner';
  import axiosInstance from '$lib/axios.js';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import {
    RnsCard,
    RnsCreateDialog
  } from '$lib/components/startups/rns/index.js';
  import { Loader, ChevronDown, Sparkles, Plus } from 'lucide-svelte';
  import * as Table from '$lib/components/ui/table';
  import { Segmented } from '$lib/motion';
  // flash from core, not the barrel: the barrel pulls components back in and
  // Vite SSR fails on the cycle (see lib/motion/core.ts).
  import { flash } from '$lib/motion/core';
  import { BoardSkeleton, StatePanel } from '$lib/components/workspace';
  import { goto } from '$app/navigation';

  let dropdownOpen = $state(false);

  interface Member {
    userId: number;
    startupId: number;
    firstName: string;
    lastName: string;
    email: string;
    selected: boolean;
  }

  const { data } = $props();
  const { access, startupId } = data;

  const queryArray = [
    {
      queryKey: ['allowRNS', startupId],
      queryFn: () => getData(`/startups/${startupId}/allow-tasks/`, access!)
    },
    {
      queryKey: ['rnsData', startupId],
      queryFn: () => getData(`/rns/?startupId=${startupId}`, access!)
    },
    {
      queryKey: ['readinessData'],
      queryFn: () => getData(`/readinesslevel/readiness-levels/`, access!)
    },
    {
      queryKey: ['startupData', startupId],
      queryFn: () => getData(`/startups/${startupId}`, access!)
    },
    {
      queryKey: ['rnaData', startupId],
      queryFn: () => getData(`/rna/?startupId=${startupId}`, access!)
    }
  ];

  const rnsQueries = useQueries(queryArray);
  const { isLoading, isError } = $derived(useQueriesState(queryArray));
  $rnsQueries[0].refetch();
  const isAccessible = $derived($rnsQueries[0].data);

  const columns = $state(getColumns());
  const readiness = $state(getReadiness());

  const members = $derived(
    $rnsQueries[3].isSuccess
      ? (() => {
          const data = $rnsQueries[3].data;
          const baseMembers: Member[] = data.members.map(
            ({
              id,
              email,
              firstName,
              lastName
            }: {
              id: number;
              email: string;
              firstName: string;
              lastName: string;
            }) => ({
              userId: id,
              startupId: data.id,
              firstName,
              lastName,
              email,
              selected: false
            })
          );

          // Check if user is already in members
          const isUserInMembers = baseMembers.some(
            (member: Member) => member.userId === data.user.id
          );

          if (!isUserInMembers) {
            baseMembers.push({
              userId: data.user.id,
              startupId: data.id,
              firstName: data.user.firstName,
              lastName: data.user.lastName,
              email: data.user.email,
              selected: false
            });
          }

          return baseMembers;
        })()
      : []
  );

  const views = $derived(columns);

  let generatingRNS = $state(false);
  let open = $state(false);
  const generateRNSForSelected = async () => {
    if (selectedRNA.length === 0) {
      toast.error('No RNS selected');
      return;
    }

    generatingRNS = true;
    try {
      // First, get all current RNS items
      const currentItems = await axiosInstance.get(
        `/rns/?startupId=${data.startupId}`,
        {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        }
      );

      // Increment priority numbers of all existing items
      const updatePromises = currentItems.data.map((item: any) =>
        axiosInstance.patch(
          `/rns/${item.id}/`,
          { priorityNumber: (item.priorityNumber || 0) + selectedRNA.length },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );

      await Promise.all(updatePromises);

      // Now generate new items with priority numbers starting from 1
      await axiosInstance.post(
        `/rns/generate-tasks/`, // Assuming this endpoint can handle rns_ids
        {
          startup_id: data.startupId,
          rnaIds: selectedRNA, // Pass selected RNS IDs
          no_of_tasks_to_create: 1,
          startPriorityNumber: 1
        },
        {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        }
      );

      await $rnsQueries[1].refetch();
      selectedRNA = []; // Clear selected RNS after generation

      generatingRNS = false;
      toast.success(`Successfully generated RNS`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to generate RNS');
      generatingRNS = false;
    }
  };

  const addToRNS = async (id: number, payload: any) => {
    const length = columns[0].items.length;
    try {
      const response = await axiosInstance.patch(
        `/rns/${id}/`,
        {
          priorityNumber: length + 1,
          description: payload.description,
          isAiGenerated: false,
          assigneeId: payload.assigneeId,
          readinessType: payload.readinessType,
          targetLevel: payload.targetLevelId
        },
        {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        }
      );
      toast.success('Successfully added to RNS');

      $rnsQueries[1]
        .refetch()
        .then((res) => {
          columns.forEach((column) => {
            const filteredItems = res.data
              .filter(
                (data: any) =>
                  data.isAiGenerated === false &&
                  data.requestedStatus === column.value
              )
              .sort((a: any, b: any) => a.priorityNumber - b.priorityNumber);
            column.items = filteredItems;
          });
        })
        .finally(async () => await updatePriorityNumber());
      goto('rns');
    } catch (error) {
      console.error('Error in addToRNS:', error);
      toast.error('Failed to add to RNS');
    }
  };

  const createRns = async (payload: any) => {
    await axiosInstance.post(
      '/rns',
      {
        ...payload,
        status
      },
      {
        headers: {
          Authorization: `Bearer ${data.access}`
        }
      }
    );
    toast.success('Successfully created the RNS');
    open = false;
    $rnsQueries[1]
      .refetch()
      .then((res) => {
        columns.forEach((column) => {
          column.items = res.data
            .filter(
              (data: any) =>
                data.isAiGenerated === false &&
                data.requestedStatus === column.value
            )
            .sort((a: any, b: any) => a.priorityNumber - b.priorityNumber);
        });
      })
      .finally(async () => {
        await updatePriorityNumber();
      });
  };

  const updatedEditRNS = async (
    id: number,
    payload: {
      readinessType: string;
      description: string;
      targetLevelId: number;
      assigneeId: number;
      isAiGenerated: boolean;
      clickedByMentor: boolean;
    },
    showToast: boolean = true
  ) => {
    await axiosInstance.patch(`/rns/${id}/`, payload, {
      headers: {
        Authorization: `Bearer ${data.access}`
      }
    });

    if (showToast) toast.success('Successfully updated the RNS');
    open = false;
    $rnsQueries[1].refetch().then((res) => {
      columns.forEach((column) => {
        column.items = res.data
          .filter(
            (data: any) =>
              data.isAiGenerated === false &&
              data.requestedStatus === column.value
          )
          .sort((a: any, b: any) => a.priorityNumber - b.priorityNumber);
      });
    });
    // goto('rns');
  };

  const deleteRNS = async (id: number, index: number) => {
    try {
      await axiosInstance.delete(`/rns/${id}/`, {
        headers: {
          Authorization: `Bearer ${data.access}`
        }
      });
      toast.success('Successfuly deleted a task');
      columns.forEach((column) => {
        column.items = column.items.filter((item: any) => item.id !== id);
      });

      await $rnsQueries[1].refetch();
      await updatePriorityNumber();
    } catch (error) {
      console.error('Error deleting RNS: ', error);
      toast.error('Failed to delete RNS');
    }
  };

  function handleDndConsider(e: CustomEvent<DndEvent<any>>, x: number) {
    columns[x].items = e.detail.items;
  }

  async function handleDndFinalize(
    e: CustomEvent<DndEvent<any>>,
    x: number,
    status: number
  ) {
    columns[x].items = e.detail.items;
    if (e.detail.info.trigger === 'droppedIntoZone') {
      const task = e.detail.items.find((t: any) => t.id == e.detail.info.id);
      if (task) {
        await axiosInstance.patch(
          `/rns/${task.id}/roleDependent?role=${data.role}`,
          {
            status
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        );
      }

      updatePriorityNumber();
      $rnsQueries[1].refetch();
      // setTimeout(() => $rnsQueries[1].refetch(), 250);
    }
  }

  const updatePriorityNumber = async () => {
    const updatePromises: any = [];

    let counter = 1;

    columns.forEach((column) => {
      column.items.forEach((item: any) => {
        item.priorityNumber = counter;
        updatePromises.push(
          axiosInstance.patch(
            `/rns/${item.id}/`,
            { priorityNumber: counter },
            { headers: { Authorization: `Bearer ${data.access}` } }
          )
        );
        counter++;
      });
    });

    try {
      await Promise.all(updatePromises);
    } catch (error) {
      $rnsQueries[1].refetch();
      toast.error('Error updating');
      console.error('Failed to update tasks', error);
    }
  };

  $effect(() => {
    if (
      !isLoading &&
      $rnsQueries[1].isSuccess &&
      Array.isArray($rnsQueries[1].data)
    ) {
      columns.forEach((column) => {
        column.items = $rnsQueries[1].data
          ? $rnsQueries[1].data
              .filter(
                (data: any) =>
                  data.isAiGenerated === false &&
                  data.requestedStatus === column.value
              )
              .sort((a: any, b: any) => a.priorityNumber - b.priorityNumber)
          : [];
      });
    }

    if ($rnsQueries[1].data && $rnsQueries[4].data)
      selectedRNA = $rnsQueries[4].data
        .filter(
          (rna: any) =>
            !$rnsQueries[1].data.some(
              (rns: any) =>
                rns.readinessType === rna.readinessLevel.readinessType
            )
        )
        .map((rna: any) => rna.id);
  });

  const onOpenChange = () => {
    open = !open;
  };

  const showDialog = () => {
    open = true;
  };

  let status = $state(1);

  const updateStatus = (newStatus: number) => {
    status = newStatus;
  };
  const selectedMembers: any = $state([]);

  const toggleMemberSelection = (index: number) => {
    if (index === 999) {
      const userIndex = selectedMembers.indexOf(999);
      if (userIndex !== -1) {
        selectedMembers.splice(userIndex, 1);
      } else {
        selectedMembers.push(index);
      }
    } else {
      const userId = members[index].userId;
      const userIndex = selectedMembers.indexOf(userId);

      if (userIndex !== -1) {
        selectedMembers.splice(userIndex, 1);
      } else {
        selectedMembers.push(userId);
      }
    }
  };

  let selectedFormat: 'board' | 'table' = $state('board');
  const viewOptions = [
    { value: 'board' as const, label: 'Board' },
    { value: 'table' as const, label: 'Table' }
  ];
  const canEdit = $derived(data.role !== 'Startup');
  // Waiting on a mentor's decision; counted from the same rows the board shows.
  let awaitingOnly = $state(false);
  const awaitingCount = $derived(
    ($rnsQueries[1].data ?? []).filter(
      (i: any) =>
        i.isAiGenerated === false &&
        i.approvalStatus &&
        i.approvalStatus !== 'Unchanged'
    ).length
  );

  // A table row is a summary of a card. Clicking one switches to the board and
  // flashes that card, so there is one dialog implementation, not two.
  async function openOnBoard(id: number | string) {
    selectedFormat = 'board';
    await tick();
    const el = document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flash(el?.querySelector('.lu-card') ?? null);
  }

  let taskType = $state(3);

  const updateTaskType = (newType: number) => {
    taskType = newType;
  };

  let selectedRNA: number[] = $state([]);

  const toggleRNSSelection = (id: number) => {
    const index = selectedRNA.indexOf(id);
    if (index !== -1) {
      selectedRNA.splice(index, 1);
    } else {
      selectedRNA.push(id);
    }
  };
</script>

{#if isLoading}
  {@render loading()}
{:else if isError}
  {@render error()}
{:else if isAccessible}
  {@render accessible()}
{:else}
  {@render fallback()}
{/if}

<RnsCreateDialog
  {open}
  {onOpenChange}
  create={createRns}
  {startupId}
  {members}
  {status}
/>

{#snippet card(rns: any, ai = false, index: number)}
  <RnsCard
    {rns}
    {members}
    update={updatedEditRNS}
    {ai}
    addToRns={addToRNS}
    deleteRns={deleteRNS}
    {index}
    role={data.role}
  />
{/snippet}

{#snippet loading()}
  <BoardSkeleton {canEdit} />
{/snippet}

{#snippet error()}
  <StatePanel kind="error" title="Recommended next steps could not be loaded">
    Refresh the page to try again.
    {#snippet action()}
      <button
        type="button"
        class="lu-btn lu-btn-secondary lu-btn-sm"
        onclick={() => $rnsQueries.forEach((q) => q.refetch())}
      >
        Try again
      </button>
    {/snippet}
  </StatePanel>
{/snippet}

{#snippet accessible()}
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-3">
      <Segmented
        options={viewOptions}
        bind:value={selectedFormat}
        label="View"
      />
      <MembersFilter {members} {toggleMemberSelection} {selectedMembers} />
      {#if canEdit && awaitingCount > 0}
        <button
          type="button"
          class="lu-chip-sm h-9 px-3 transition-colors duration-quick"
          data-flag={awaitingOnly ? '' : undefined}
          aria-pressed={awaitingOnly}
          onclick={() => (awaitingOnly = !awaitingOnly)}
        >
          {awaitingCount} awaiting approval
        </button>
      {/if}
    </div>
    <div class="flex flex-wrap items-center gap-2.5">
      {#if selectedFormat === 'board'}
        <ShowHideColumns {views} />
      {/if}
      {#if canEdit}
        <button
          type="button"
          class="lu-btn lu-btn-secondary lu-btn-sm"
          onclick={() => showDialog()}
        >
          <Plus class="h-4 w-4" />
          Add
        </button>
        <div class="lu-split">
          <button
            type="button"
            class="lu-btn lu-btn-primary lu-btn-sm"
            disabled={generatingRNS}
            onclick={() => generateRNSForSelected()}
          >
            {#if generatingRNS}
              <Loader class="h-4 w-4 animate-spin" />
              Generating…
            {:else}
              <Sparkles class="h-4 w-4" />
              Generate
            {/if}
          </button>
          <DropdownMenu.Root bind:open={dropdownOpen}>
            <DropdownMenu.Trigger
              class="lu-btn lu-btn-primary lu-btn-sm"
              disabled={generatingRNS}
              title={selectedRNA.length === 0
                ? 'Select at least one assessment first'
                : undefined}
              aria-label="Choose assessments to generate from"
            >
              <ChevronDown class="h-4 w-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              class="max-h-[320px] w-[320px] overflow-y-auto"
              closeOnItemClick={false}
            >
              <DropdownMenu.Label class="text-[12.5px] text-[#94a3b8]"
                >Assessments to generate from</DropdownMenu.Label
              >
              <DropdownMenu.Separator />
              {#each $rnsQueries[4].data as rna}
                {@const taken = $rnsQueries[1].data.some(
                  (rns: any) =>
                    rns.readinessType === rna.readinessLevel.readinessType
                )}
                <DropdownMenu.CheckboxItem
                  class="items-start gap-2.5 rounded-[10px] py-2"
                  closeOnSelect={false}
                  checked={selectedRNA.includes(rna.id)}
                  onCheckedChange={() => toggleRNSSelection(rna.id)}
                >
                  <span
                    class="flex flex-col gap-0.5 {taken ? 'opacity-50' : ''}"
                  >
                    <span class="text-[13px] font-semibold text-[#f1f5f9]">
                      {rna.readinessLevel.readinessType}{taken
                        ? ' · has next steps'
                        : ''}
                    </span>
                    <span class="line-clamp-2 text-[12.5px] text-[#94a3b8]">
                      {rna.rna.substring(0, 60)}…
                    </span>
                  </span>
                </DropdownMenu.CheckboxItem>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      {/if}
    </div>
  </div>
  {#if canEdit}
    <p class="-mt-1 text-[12.5px] text-[#94a3b8]">
      Generates next steps from the selected assessments. Drafts are editable,
      and you can delete them.
    </p>
  {/if}

  <div class="block w-full">
    {#if selectedFormat === 'board'}
      <KanbanBoardNew
        {columns}
        {handleDndFinalize}
        {handleDndConsider}
        {card}
        {showDialog}
        role={data.role}
        {updateStatus}
        {selectedMembers}
        {awaitingOnly}
        {taskType}
      />
    {:else}
      <div
        class="overflow-hidden rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220]"
      >
        <Table.Root>
          <Table.Header>
            <Table.Row class="border-[#17213a] hover:bg-transparent">
              <Table.Head class="h-11 pl-5 text-[12.5px] text-[#94a3b8]"
                >Dimension</Table.Head
              >
              <Table.Head class="text-[12.5px] text-[#94a3b8]"
                >Description</Table.Head
              >
              <Table.Head class="text-[12.5px] text-[#94a3b8]"
                >Target level</Table.Head
              >
              <Table.Head class="text-[12.5px] text-[#94a3b8]">Term</Table.Head>
              <Table.Head class="pr-5 text-[12.5px] text-[#94a3b8]"
                >Assignee</Table.Head
              >
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each $rnsQueries[1].data.filter((data: any) => data.isAiGenerated === false) as item}
              {#if selectedMembers.includes(item.assignee.id) || selectedMembers.length === 0}
                <Table.Row
                  class="lu-row h-14 cursor-pointer border-[#17213a]"
                  tabindex={0}
                  onclick={() => openOnBoard(item.id)}
                  onkeydown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openOnBoard(item.id);
                    }
                  }}
                >
                  <Table.Cell class="pl-5 text-[13.5px] text-[#f1f5f9]"
                    >{item.readinessType}</Table.Cell
                  >
                  <Table.Cell class="text-[13.5px] text-[#94a3b8]"
                    >{item.description.substring(0, 100)}</Table.Cell
                  >
                  <Table.Cell class="lu-num text-[13.5px] text-[#94a3b8]"
                    >{item.targetLevelScore}</Table.Cell
                  >
                  <Table.Cell>
                    <span class="lu-chip-sm"
                      >{item.status !== 7 ? 'Short' : 'Long'} term</span
                    >
                  </Table.Cell>
                  <Table.Cell class="pr-5 text-[13.5px] text-[#94a3b8]">
                    {members.filter(
                      (member: any) => member.userId === item.assignee.id
                    )[0]?.firstName ?? 'Unassigned'}
                    {members.filter(
                      (member: any) => member.userId === item.assignee.id
                    )[0]?.lastName ?? ''}
                  </Table.Cell>
                </Table.Row>
              {/if}
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet fallback()}
  <StatePanel title="No readiness and needs assessments yet">
    {#if data.role === 'Startup'}
      Your mentor has not created any yet. Next steps are recommended from them,
      so this page opens once they exist.
    {:else}
      Create readiness and needs assessments for this startup first — next steps
      are recommended from them.
    {/if}
    {#snippet action()}
      {#if data.role !== 'Startup'}
        <a
          class="lu-btn lu-btn-secondary lu-btn-sm"
          href="/startups/{startupId}/rna">Go to the assessment</a
        >
      {/if}
    {/snippet}
  </StatePanel>
{/snippet}
