<script lang="ts">
  import { tick } from 'svelte';
  import {
    KanbanBoardNew,
    MembersFilter,
    ShowHideColumns
  } from '$lib/components/shared';
  import {
    getData,
    getColumns
    // getReadiness
  } from '$lib/utils';
  import { useQueriesState } from '$lib/stores/useQueriesState.svelte.js';
  import { useQueries } from '@sveltestack/svelte-query';
  import { page } from '$app/stores';
  import axiosInstance from '$lib/axios.js';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { toast } from 'svelte-sonner';
  import { RoadblocksCard } from '$lib/components/startups/roadblocks';
  import { RoadblocksCreateDialog } from '$lib/components/startups/roadblocks';
  import { Loader, Sparkles, ChevronDown, Plus } from 'lucide-svelte';
  import * as Table from '$lib/components/ui/table';
  import { Segmented } from '$lib/motion';
  // flash from core, not the barrel: the barrel pulls components back in and
  // Vite SSR fails on the cycle (see lib/motion/core.ts).
  import { flash } from '$lib/motion/core';
  import { BoardSkeleton, StatePanel } from '$lib/components/workspace';

  let dropdownOpen = $state(false);

  interface Member {
    userId: number;
    startupId: number;
    firstName: string;
    lastName: string;
    email: string;
    selected: boolean;
  }

  interface Roadblock {
    id: number;
    description: string;
    fix: string;
    isAiGenerated: boolean;
    status: number;
    requestedStatus: number;
    riskNumber: number;
    assignee: number;
  }

  const { data } = $props();
  const { access, startupId } = data;

  const roadblocksQueries = useQueries([
    {
      queryKey: ['allowRoadblocks', startupId],
      queryFn: () =>
        getData(`/startups/${startupId}/allow-roadblocks/`, access!)
    },
    {
      queryKey: ['roadblocksData', startupId],
      queryFn: () => getData(`/roadblocks/?startupId=${startupId}`, access!)
    },
    {
      queryKey: ['startupData', startupId],
      queryFn: () => getData(`/startups/${startupId}`, access!)
    }
  ]);

  const { isLoading, isError } = $derived(useQueriesState($roadblocksQueries));
  $roadblocksQueries[0].refetch();
  const isAccessible = $derived($roadblocksQueries[0].data);

  const columns = $state(getColumns());
  const members = $derived(
    $roadblocksQueries[2].isSuccess
      ? (() => {
          const data = $roadblocksQueries[2].data;
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

  let numToGenerate = $state(3);

  $effect(() => {
    if ($roadblocksQueries[1].isSuccess) {
      const roadblocksCount = ($roadblocksQueries[1].data as Roadblock[])
        .length;
      if (roadblocksCount >= 3) {
        numToGenerate = 1;
      } else if (roadblocksCount >= 1) {
        numToGenerate = 2;
      } else {
        numToGenerate = 3;
      }
    }

    if (!isLoading) {
      columns.forEach((column) => {
        column.items = ($roadblocksQueries[1].data as Roadblock[]).filter(
          (data: Roadblock) => data.requestedStatus === column.value
        );
      });
    }
  });

  const updatedEditRoadblock = async (
    id: number,
    payload: any,
    showToast: boolean = true
  ) => {
    await axiosInstance.patch(`/roadblocks/${id}/`, payload, {
      headers: {
        Authorization: `Bearer ${data.access}`
      }
    });

    if (showToast) toast.success('Successfuly updated the RNA');
    $roadblocksQueries[1].refetch().then((res) => {
      columns.forEach((column) => {
        column.items = (res.data as Roadblock[]).filter(
          (data: Roadblock) => data.requestedStatus === column.value
        );
      });
    });
    $roadblocksQueries[2].refetch();
    updateRiskNumber();
  };

  const deleteRoadblock = async (id: number) => {
    await axiosInstance.delete(`/roadblocks/${id}/`, {
      headers: {
        Authorization: `Bearer ${data.access}`
      }
    });
    toast.success('Successfuly deleted a task');
    $roadblocksQueries[1]
      .refetch()
      .then((res) => {
        columns.forEach((column) => {
          column.items = (res.data as Roadblock[]).filter(
            (data: Roadblock) => data.requestedStatus === column.value
          );
        });
      })
      .finally(async () => await updateRiskNumber());
    $roadblocksQueries[2].refetch();
  };

  function handleDndConsider(e: any, x: number) {
    columns[x].items = e.detail.items;
  }

  async function handleDndFinalize(e: any, x: number, status: number) {
    columns[x].items = e.detail.items;
    if (e.detail.info.trigger == 'droppedIntoZone') {
      const task = e.detail.items.find((t: any) => t.id == e.detail.info.id);
      await axiosInstance.patch(
        `/roadblocks/${task.id}/roleDependent?role=${data.role}`,
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

    updateRiskNumber();
    $roadblocksQueries[1].refetch();
    $roadblocksQueries[2].refetch();
  }

  const updateRiskNumber = async () => {
    const updatePromises: any = [];

    let counter = 1;
    // Completed
    columns[0].items.map((item: any) => {
      item.riskNumber = counter;
      updatePromises.push(
        axiosInstance.patch(
          `/roadblocks/${item.id}/`,
          {
            riskNumber: counter
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );
      counter++;
    });
    // Delayed
    columns[1].items.map((item: any) => {
      item.riskNumber = counter;
      updatePromises.push(
        axiosInstance.patch(
          `/roadblocks/${item.id}/`,
          {
            riskNumber: counter
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );
      counter++;
    });
    // Track
    columns[2].items.map((item: any) => {
      item.riskNumber = counter;
      updatePromises.push(
        axiosInstance.patch(
          `/roadblocks/${item.id}/`,
          {
            riskNumber: counter
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );
      counter++;
    });
    // Scheduled
    columns[3].items.map((item: any) => {
      item.riskNumber = counter;
      updatePromises.push(
        axiosInstance.patch(
          `/roadblocks/${item.id}/`,
          {
            riskNumber: counter
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );
      counter++;
    });
    // Discontinued
    columns[4].items.map((item: any) => {
      item.riskNumber = counter;
      updatePromises.push(
        axiosInstance.patch(
          `/roadblocks/${item.id}/`,
          {
            riskNumber: counter
          },
          {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          }
        )
      );
      counter++;
    });

    try {
      await Promise.all(updatePromises);
    } catch (error) {
      $roadblocksQueries[1].refetch();
      toast.error('Error updating');
      console.error('Failed to update tasks', error);
    }
  };

  let generatingRoadblocks: boolean = $state(false);
  let open = $state(false);

  const showDialog = () => {
    open = true;
  };

  const onOpenChange = () => {
    open = !open;
  };

  const createRoadblock = async (payload: any) => {
    // Shift existing rows so new roadblocks take the low risk numbers.
    const currentItems = await axiosInstance.get(
      `/roadblocks/?startupId=${startupId}`,
      {
        headers: { Authorization: `Bearer ${access}` }
      }
    );
    const updatePromises = currentItems.data.map((item: any) =>
      axiosInstance.patch(
        `/roadblocks/${item.id}/`,
        {
          riskNumber: (item.riskNumber || 0) + 1
        },
        {
          headers: { Authorization: `Bearer ${access}` }
        }
      )
    );
    await Promise.all(updatePromises);

    await axiosInstance.post(
      '/roadblocks/',
      {
        ...payload,
        riskNumber: 1,
        status: 1
      },
      {
        headers: {
          Authorization: `Bearer ${data.access}`
        }
      }
    );
    toast.success('Successfully created the Roadblock');
    open = false;
    $roadblocksQueries[1]
      .refetch()
      .then((res) => {
        columns.forEach((column) => {
          column.items = (res.data as Roadblock[])
            .filter((data: Roadblock) => data.status === column.value)
            .sort((a: any, b: any) => b.riskNumber - a.riskNumber);
        });
      })
      .finally(async () => {
        await updateRiskNumber();
      });
  };

  const generateRoadblocks = async (count: number) => {
    generatingRoadblocks = true;
    try {
      // Shift existing rows so new roadblocks take the low risk numbers.
      const currentItems = await axiosInstance.get(
        `/roadblocks/?startupId=${startupId}`,
        {
          headers: { Authorization: `Bearer ${access}` }
        }
      );
      const updatePromises = currentItems.data.map((item: any) =>
        axiosInstance.patch(
          `/roadblocks/${item.id}/`,
          {
            riskNumber: (item.riskNumber || 0) + count
          },
          {
            headers: { Authorization: `Bearer ${access}` }
          }
        )
      );
      await Promise.all(updatePromises);

      await axiosInstance.post(
        `/roadblocks/generate-roadblocks/`,
        {
          startupId: data.startupId,
          no_of_roadblocks_to_create: count
        },
        {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        }
      );

      await $roadblocksQueries[1].refetch(); // Refetch all roadblocks including new AI-generated ones
      await updateRiskNumber();

      toast.success(`Successfully generated ${count} Roadblocks`);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || 'Failed to generate roadblocks'
      );
    } finally {
      generatingRoadblocks = false;
    }
  };

  let status = $state(4);
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
    ($roadblocksQueries[1].data ?? []).filter(
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

<RoadblocksCreateDialog
  {open}
  {onOpenChange}
  create={createRoadblock}
  {startupId}
  {members}
  {status}
/>

{#snippet card(roadblocks: any, index: number)}
  <RoadblocksCard
    {roadblocks}
    {members}
    ai={false}
    update={updatedEditRoadblock}
    deleteRoadblocks={deleteRoadblock}
    role={data.role}
    {index}
  />
{/snippet}

{#snippet loading()}
  <BoardSkeleton {canEdit} />
{/snippet}

{#snippet error()}
  <StatePanel kind="error" title="Roadblocks could not be loaded">
    Refresh the page to try again.
    {#snippet action()}
      <button
        type="button"
        class="lu-btn lu-btn-secondary lu-btn-sm"
        onclick={() => $roadblocksQueries.forEach((q) => q.refetch())}
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
        <ShowHideColumns views={columns} />
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
            disabled={generatingRoadblocks}
            onclick={() => generateRoadblocks(numToGenerate)}
          >
            {#if generatingRoadblocks}
              <Loader class="h-4 w-4 animate-spin" />
              Generating…
            {:else}
              <Sparkles class="h-4 w-4" />
              Generate {numToGenerate}
            {/if}
          </button>
          <DropdownMenu.Root bind:open={dropdownOpen}>
            <DropdownMenu.Trigger
              class="lu-btn lu-btn-primary lu-btn-sm"
              disabled={generatingRoadblocks}
              aria-label="How many to generate"
            >
              <ChevronDown class="h-4 w-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-40">
              <DropdownMenu.Label class="text-[12.5px] text-[#94a3b8]"
                >How many</DropdownMenu.Label
              >
              <DropdownMenu.Separator />
              <DropdownMenu.RadioGroup
                value={numToGenerate.toString()}
                onValueChange={(val) => (numToGenerate = Number(val))}
              >
                {#each [1, 2, 3, 4, 5] as count}
                  <DropdownMenu.RadioItem
                    value={count.toString()}
                    class="cursor-pointer rounded-[10px]"
                  >
                    {count}
                  </DropdownMenu.RadioItem>
                {/each}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      {/if}
    </div>
  </div>
  {#if canEdit}
    <p class="-mt-1 text-[12.5px] text-[#94a3b8]">
      Generates the chosen number of roadblocks. Drafts are editable, and you
      can delete them.
    </p>
  {/if}

  <div class="block w-full">
    {#if selectedFormat === 'board'}
      <KanbanBoardNew
        {columns}
        {handleDndFinalize}
        {handleDndConsider}
        {card}
        role={data.role}
        {updateStatus}
        {selectedMembers}
        {awaitingOnly}
        {showDialog}
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
              <Table.Head class="text-[12.5px] text-[#94a3b8]">Risk</Table.Head>
              <Table.Head class="pr-5 text-[12.5px] text-[#94a3b8]"
                >Assignee</Table.Head
              >
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each ($roadblocksQueries[1].data as Roadblock[]).filter((item: Roadblock) => item.isAiGenerated === false) as item}
              {#if selectedMembers.includes(item.assignee) || selectedMembers.length === 0}
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
                    >{item.description.substring(0, 100)}</Table.Cell
                  >
                  <Table.Cell class="lu-num text-[13.5px] text-[#94a3b8]"
                    >#{item.riskNumber}</Table.Cell
                  >
                  <Table.Cell class="pr-5 text-[13.5px] text-[#94a3b8]">
                    {members.filter((m: any) => m.userId === item.assignee)[0]
                      ?.firstName ?? 'Unassigned'}
                    {members.filter((m: any) => m.userId === item.assignee)[0]
                      ?.lastName ?? ''}
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
      Your mentor has not created any yet. Roadblocks are raised against them,
      so this page opens once they exist.
    {:else}
      Create readiness and needs assessments for this startup first — roadblocks
      are raised against them.
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
