<script lang="ts">
  import {
    KanbanBoardNew,
    MembersFilter,
    ShowHideColumns
  } from '$lib/components/shared';
  import {
    getData,
    getColumns,
    getReadiness,
    getSavedTab,
    getSelectedTab,
    updateTab
  } from '$lib/utils';
  import { useQueriesState } from '$lib/stores/useQueriesState.svelte.js';
  import { useQueries } from '@sveltestack/svelte-query';
  import { page } from '$app/stores';
  import axiosInstance from '$lib/axios';
  import axios from 'axios';
  import { toast } from 'svelte-sonner';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import {
    InitiativeCard,
    InitiativeCreateDialog
  } from '$lib/components/startups/initiatives';
  import { ChevronDown, Loader, Sparkles, Plus } from 'lucide-svelte';
  import { Segmented } from '$lib/motion';
  import {
    BoardSkeleton,
    StatePanel
  } from '$lib/components/workspace';
  import * as Table from '$lib/components/ui/table';
  import HoveredRNSCard from '$lib/components/shared/hovered-rns-card.svelte';


  let dropdownOpen = $state(false);

  const { data } = $props();
  const { access, startupId } = data;
  const initiativesQueries = useQueries([
    {
      queryKey: ['allowRNS', startupId],
      queryFn: () =>
        getData(`/startups/${startupId}/allow-initiatives/`, access!)
    },
    {
      queryKey: ['rnsDataInitiative', startupId],
      queryFn: () => getData(`/rns?startupId=${startupId}`, access!)
    },
    {
      queryKey: ['initiativesData', startupId],
      queryFn: () => getData(`/initiatives/?startupId=${startupId}`, access!)
    },
    {
      queryKey: ['startupData', startupId],
      queryFn: () => getData(`/startups/${startupId}`, access!)
    }
  ]);

  const { isLoading, isError } = $derived(useQueriesState($initiativesQueries));
  $initiativesQueries[0].refetch();
  const isAccessible = $derived($initiativesQueries[0].data);
  let selectedTab = $state(getSelectedTab('initiatives'));

  const updateInitiativeTab = (tab: string) => {
    selectedTab = updateTab('initiatives', tab);
  };

  const columns = $state(getColumns());
  const readiness = $state(getReadiness());
  const views = $derived(selectedTab === 'initiatives' ? columns : readiness);

  interface Member {
    userId: number;
    startupId: number;
    firstName: string;
    lastName: string;
    email: string;
    selected: boolean;
  }

  interface RNSTask {
    id: number;
    priorityNumber: number;
    description: string;
    hasInitiatives: boolean;
    readinessType: string;
    isAiGenerated: boolean;
    status: number;
  }

  const members = $derived(
    $initiativesQueries[3].isSuccess
      ? (() => {
          const data = $initiativesQueries[3].data;
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

  $initiativesQueries[1].refetch();
  const tasks = $derived(
    $initiativesQueries[1].isSuccess
      ? ($initiativesQueries[1].data as RNSTask[])
      : []
  );

  let status = $state(1);
  let selectedFormat: 'board' | 'table' = $state('board');
  const viewOptions = [
    { value: 'board' as const, label: 'Board' },
    { value: 'table' as const, label: 'Table' }
  ];
  const canEdit = $derived(data.role !== 'Startup');
  const selectedMembers: any = $state([]);

  $effect(() => {
    const searchParam = $page.url.searchParams.get('tab');
    selectedTab = getSavedTab('initiatives', searchParam);

    if (!isLoading && $initiativesQueries[2].isSuccess) {
      columns.forEach((column) => {
        column.items = $initiativesQueries[2].data
          .filter(
            (data: any) =>
              data.isAiGenerated === false &&
              data.requestedStatus === column.value
          )
          .sort((a: any, b: any) => a.initiativeNumber - b.initiativeNumber);
      });
    }

    if ($initiativesQueries[1].isSuccess && $initiativesQueries[2].isSuccess) {
      // An RNS that already has initiatives is not offered again.
      const rnsWithInitiatives = new Set(
        $initiativesQueries[2].data.map((initiative: any) => initiative.rns)
      );

      selectedRNS = tasks
        .filter((task) => !rnsWithInitiatives.has(task.id) && task.status !== 7)
        .map((task) => task.id);
    }
  });

  const createInitiative = async (payload: any) => {
    const currentItems = await axiosInstance.get(
      `/initiatives/?startupId=${startupId}`,
      {
        headers: { Authorization: `Bearer ${access}` }
      }
    );
    const updatePromises = currentItems.data.map((item: any) =>
      axiosInstance.patch(
        `/initiatives/${item.id}/`,
        {
          priorityNumber: (item.priorityNumber || 0) + 1
        },
        {
          headers: { Authorization: `Bearer ${access}` }
        }
      )
    );
    await Promise.all(updatePromises);

    await axiosInstance.post(
      '/initiatives/',
      {
        ...payload,
        priorityNumber: 1
      },
      {
        headers: {
          Authorization: `Bearer ${data.access}`
        }
      }
    );
    toast.success('Successfully created the Initiative');
    open = false;

    $initiativesQueries[2]
      .refetch()
      .then((res) => {
        columns.forEach((column) => {
          column.items = res.data.filter(
            (data: any) =>
              data.isAiGenerated === false &&
              data.requestedStatus === column.value
          );
        });
      })
      .finally(async () => await updateInitiativeNumber());
  };

  const deleteInitiative = async (id: number) => {
    await axiosInstance.delete(`/initiatives/${id}/`, {
      headers: {
        Authorization: `Bearer ${data.access}`
      }
    });
    toast.success('Successfuly deleted a task');

    $initiativesQueries[2]
      .refetch()
      .then((res) => {
        columns.forEach((column) => {
          column.items = res.data.filter(
            (data: any) =>
              data.isAiGenerated === false &&
              data.requestedStatus === column.value
          );
        });
      })
      .finally(async () => await updateInitiativeNumber());
  };

  const updatedEditInitiative = async (
    id: number,
    payload: any,
    showToast: boolean = true
  ) => {
    await axiosInstance.patch(`/initiatives/${id}/`, payload, {
      headers: {
        Authorization: `Bearer ${data.access}`
      }
    });
    if (showToast) toast.success('Successfuly updated Initiatives');
    $initiativesQueries[1].refetch();
    $initiativesQueries[2].refetch();

    updateInitiativeNumber();
  };

  function handleDndConsider(e: any, x: number) {
    columns[x].items = e.detail.items;
  }

  async function handleDndFinalize(e: any, x: number, status: number) {
    columns[x].items = e.detail.items;
    if (e.detail.info.trigger == 'droppedIntoZone') {
      const task = e.detail.items.find((t: any) => t.id == e.detail.info.id);
      await axiosInstance.patch(
        `/initiatives/${task.id}/roleDependent?role=${data.role}`,
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

    updateInitiativeNumber();
    $initiativesQueries[1].refetch();
    $initiativesQueries[2].refetch();
  }

  const updateInitiativeNumber = async () => {
    const updatePromises: any = [];

    let taskIds: any = [];
    let counters: any = [];
    // Completed
    columns[0].items.map((item: any) => {
      let indexOf = taskIds.indexOf(item.rns);

      if (indexOf === -1) {
        taskIds.push(item.rns);
        counters.push(1); // Start counter at 1
        indexOf = taskIds.length - 1; // Get the last index
      }

      const initiativeNumber = counters[indexOf]; // Get the current counter value
      item.initiativeNumber = initiativeNumber;

      updatePromises.push(
        axiosInstance.patch(
          `/initiatives/${item.id}/`,
          {
            initiativeNumber: initiativeNumber
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );

      counters[indexOf] += 1;
    });
    // Delayed
    columns[1].items.map((item: any) => {
      let indexOf = taskIds.indexOf(item.rns);

      if (indexOf === -1) {
        taskIds.push(item.rns);
        counters.push(1); // Start counter at 1
        indexOf = taskIds.length - 1; // Get the last index
      }

      const initiativeNumber = counters[indexOf]; // Get the current counter value
      item.initiativeNumber = initiativeNumber;

      updatePromises.push(
        axiosInstance.patch(
          `/initiatives/${item.id}/`,
          {
            initiativeNumber: initiativeNumber
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );

      counters[indexOf] += 1;
    });
    // Track
    columns[2].items.map((item: any) => {
      let indexOf = taskIds.indexOf(item.rns);

      if (indexOf === -1) {
        taskIds.push(item.rns);
        counters.push(1); // Start counter at 1
        indexOf = taskIds.length - 1; // Get the last index
      }

      const initiativeNumber = counters[indexOf]; // Get the current counter value
      item.initiativeNumber = initiativeNumber;

      updatePromises.push(
        axiosInstance.patch(
          `/initiatives/${item.id}/`,
          {
            initiativeNumber: initiativeNumber
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );

      counters[indexOf] += 1;
    });
    // Scheduled
    columns[3].items.map((item: any) => {
      let indexOf = taskIds.indexOf(item.rns);

      if (indexOf === -1) {
        taskIds.push(item.rns);
        counters.push(1); // Start counter at 1
        indexOf = taskIds.length - 1; // Get the last index
      }

      const initiativeNumber = counters[indexOf]; // Get the current counter value
      item.initiativeNumber = initiativeNumber;

      updatePromises.push(
        axiosInstance.patch(
          `/initiatives/${item.id}/`,
          {
            initiativeNumber: initiativeNumber
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );

      counters[indexOf] += 1;
    });
    // Discontinued
    columns[4].items.map((item: any) => {
      let indexOf = taskIds.indexOf(item.rns);

      if (indexOf === -1) {
        taskIds.push(item.rns);
        counters.push(1); // Start counter at 1
        indexOf = taskIds.length - 1; // Get the last index
      }

      const initiativeNumber = counters[indexOf]; // Get the current counter value
      item.initiativeNumber = initiativeNumber;

      updatePromises.push(
        axiosInstance.patch(
          `/initiatives/${item.id}/`,
          {
            initiativeNumber: initiativeNumber
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );

      counters[indexOf] += 1;
    });

    try {
      await Promise.all(updatePromises);
      // $rnsQueries[1].refetch();
    } catch (error) {
      $initiativesQueries[1].refetch();
      toast.error('Error updating');
      console.error('Failed to update tasks', error);
    }
  };

  const addToInitiatives = async (id: number, payload: any) => {
    await axiosInstance.patch(
      `/initiatives/${id}/`,
      {
        ...payload,
        status: 1,
        isAiGenerated: false
      },
      {
        headers: {
          Authorization: `Bearer ${data.access}`
        }
      }
    );
    toast.success('Successfuly added to Initiatives');
    $initiativesQueries[1].refetch().then(() => {
      $initiativesQueries[2]
        .refetch()
        .then((res) => {
          columns.forEach((column) => {
            column.items = res.data.filter(
              (data: any) =>
                data.isAiGenerated === false &&
                data.requestedStatus === column.value
            );
          });
        })
        .finally(async () => await updateInitiativeNumber());
    });
  };

  let generatingInitiatives = $state(false);
  let generatingType = 'Technology';
  let open = $state(false);

  const showDialog = () => {
    open = true;
  };

  const onOpenChange = () => {
    open = !open;
  };

  const updateStatus = (newStatus: number) => {
    status = newStatus;
  };

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

  let selectedRNS: number[] = $state([]);

  const toggleRNSSelection = (id: number) => {
    const index = selectedRNS.indexOf(id);
    if (index !== -1) {
      selectedRNS.splice(index, 1);
    } else {
      selectedRNS.push(id);
    }
  };

  const generateInitiativesForSelected = async () => {
    if (selectedRNS.length === 0) {
      toast.error('No RNS selected');
      return;
    }

    generatingInitiatives = true;
    try {
      const currentItems = await axiosInstance.get(
        `/initiatives/?startupId=${startupId}`,
        {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        }
      );

      // Shift existing items down so new initiatives land at the top.
      const updatePromises = currentItems.data.map((item: any) =>
        axiosInstance.patch(
          `/initiatives/${item.id}/`,
          { priorityNumber: (item.priorityNumber || 0) + selectedRNS.length }, // Increment by number of new items
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );

      await Promise.all(updatePromises);

      await axiosInstance.post(
        `/initiatives/generate-initiatives/`,
        {
          rnsIds: selectedRNS,
          no_of_initiatives_to_create: 1,
          startPriorityNumber: 1
        },
        {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        }
      );

      await Promise.all([
        $initiativesQueries[1].refetch(),
        $initiativesQueries[2].refetch()
      ]);

      // // Mark all new initiatives
      // const newInitiatives = columns[0].items.filter(item => !item.isNew);
      // for (const initiative of newInitiatives) {
      //   await axiosInstance.patch(
      //     `/initiatives/${initiative.id}/`,
      //     { isNew: true },
      //     {
      //       headers: {
      //         Authorization: `Bearer ${data.access}`
      //       }
      //     }
      //   );
      // }

      // selectedRNS = [];
      toast.success('Successfully generated initiatives for selected RNS');
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || 'Failed to generate initiatives'
      );
    } finally {
      generatingInitiatives = false;
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

<HoveredRNSCard />

<InitiativeCreateDialog
  {open}
  {onOpenChange}
  {members}
  {startupId}
  create={createInitiative}
  {tasks}
  {status}
/>

{#snippet card(initiative: any, ai: any = false, index: number)}
  <InitiativeCard
    {initiative}
    {ai}
    {members}
    update={updatedEditInitiative}
    {deleteInitiative}
    addToInitiative={addToInitiatives}
    role={data.role}
    {tasks}
    {index}
  />
{/snippet}

{#snippet loading()}
  <BoardSkeleton {canEdit} />
{/snippet}

{#snippet error()}
  <StatePanel kind="error" title="Initiatives could not be loaded">
    Refresh the page to try again.
  </StatePanel>
{/snippet}

{#snippet accessible()}
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-3">
      <Segmented options={viewOptions} bind:value={selectedFormat} label="View" />
      <MembersFilter {members} {toggleMemberSelection} {selectedMembers} />
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
            disabled={generatingInitiatives}
            onclick={() => generateInitiativesForSelected()}
          >
            {#if generatingInitiatives}
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
              disabled={generatingInitiatives}
              aria-label="Choose next steps to generate from"
            >
              <ChevronDown class="h-4 w-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              class="max-h-[320px] w-[320px] overflow-y-auto"
              closeOnItemClick={false}
            >
              <DropdownMenu.Label class="text-[12.5px] text-[#94a3b8]"
                >Next steps to generate from</DropdownMenu.Label
              >
              <DropdownMenu.Separator />
              {#each tasks
                .filter((task) => task.status !== 7)
                .sort((a, b) => a.priorityNumber - b.priorityNumber) as task}
                {@const taken = $initiativesQueries[2].data?.some(
                  (i: any) => i.rns === task.id
                )}
                <DropdownMenu.CheckboxItem
                  class="items-start gap-2.5 rounded-[10px] py-2"
                  closeOnSelect={false}
                  checked={selectedRNS.includes(task.id)}
                  onCheckedChange={() => toggleRNSSelection(task.id)}
                >
                  <span class="flex flex-col gap-0.5 {taken ? 'opacity-50' : ''}">
                    <span class="text-[13px] font-semibold text-[#f1f5f9]">
                      RNS #{task.priorityNumber}{taken ? ' · has initiatives' : ''}
                    </span>
                    <span class="line-clamp-2 text-[12.5px] text-[#94a3b8]">
                      {task.description}
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
      />
    {:else}
      <div
        class="overflow-hidden rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220]"
      >
        <Table.Root>
          <Table.Header>
            <Table.Row class="border-[#17213a] hover:bg-transparent">
              <Table.Head class="h-11 pl-5 text-[12.5px] text-[#94a3b8]"
                >Description</Table.Head
              >
              <Table.Head class="text-[12.5px] text-[#94a3b8]">RNS</Table.Head>
              <Table.Head class="text-[12.5px] text-[#94a3b8]"
                >Initiative</Table.Head
              >
              <Table.Head class="pr-5 text-[12.5px] text-[#94a3b8]"
                >Assignee</Table.Head
              >
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each $initiativesQueries[2].data.filter((item: RNSTask) => item.isAiGenerated === false) as item}
              {#if selectedMembers.includes(item.assignee) || selectedMembers.length === 0}
                <Table.Row class="h-14 border-[#17213a]">
                  <Table.Cell class="pl-5 text-[13.5px] text-[#f1f5f9]"
                    >{item.description.substring(0, 100)}</Table.Cell
                  >
                  <Table.Cell class="lu-num text-[13.5px] text-[#94a3b8]">
                    #{tasks.filter((task: RNSTask) => task.id === item.rns)[0]
                      ?.priorityNumber}
                  </Table.Cell>
                  <Table.Cell class="lu-num text-[13.5px] text-[#94a3b8]"
                    >#{item?.initiativeNumber}</Table.Cell
                  >
                  <Table.Cell class="pr-5 text-[13.5px] text-[#94a3b8]">
                    {members.filter(
                      (member: Member) => member.userId === item.assignee
                    )[0]?.firstName ?? 'Unassigned'}
                    {members.filter(
                      (member: Member) => member.userId === item.assignee
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
      Your mentor has not created any yet. Initiatives are planned against
      them, so this page opens once they exist.
    {:else}
      Create readiness and needs assessments for this startup first —
      initiatives are planned against them.
    {/if}
  </StatePanel>
{/snippet}
