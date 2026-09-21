<script lang="ts">
  import { dndzone, TRIGGERS } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import Column from './column.svelte';
  import { dur, MOVE } from '$lib/motion/core';
  import type { RNSItem } from '$lib/types/rns.types';

  let {
    handleDndConsider,
    handleDndFinalize,
    columns,
    card,
    showDialog,
    role,
    updateStatus,
    selectedMembers
  }: {
    handleDndConsider: any;
    handleDndFinalize: any;
    columns: any;
    card: any;
    showDialog: any;
    role: any;
    updateStatus: any;
    selectedMembers: any;
  } = $props();

  // Reorders use the move token; dur() makes it 0 under reduced motion.
  // cubicOut is the closest built-in to --lu-ease.
  const flipDurationMs = dur(MOVE);

  // Only the column under the card lights up. The library's dropTargetClasses
  // mark every column that could accept it, which says nothing.
  let overIndex: number | null = $state(null);
  let settlingId: number | string | null = $state(null);

  function consider(e: CustomEvent<DndEvent<RNSItem>>, index: number) {
    const t = e.detail.info.trigger;
    if (
      t === TRIGGERS.DRAG_STARTED ||
      t === TRIGGERS.DRAGGED_ENTERED ||
      t === TRIGGERS.DRAGGED_OVER_INDEX
    ) {
      overIndex = index;
    } else if (
      (t === TRIGGERS.DRAGGED_LEFT || t === TRIGGERS.DRAGGED_LEFT_ALL) &&
      overIndex === index
    ) {
      overIndex = null;
    }
    handleDndConsider(e, index);
  }

  function finalize(
    e: CustomEvent<DndEvent<RNSItem>>,
    index: number,
    value: number
  ) {
    overIndex = null;
    if (e.detail.info.trigger === TRIGGERS.DROPPED_INTO_ZONE) {
      const id = e.detail.info.id;
      settlingId = id;
      setTimeout(
        () => {
          if (settlingId === id) settlingId = null;
        },
        dur(MOVE) + 60
      );
    }
    handleDndFinalize(e, index, value);
  }

  const isHidden = (item: any) =>
    !selectedMembers.includes(item.assigneeId ? item.assigneeId : 999) &&
    selectedMembers.length !== 0;

  // An empty board says so once, rather than seven times over.
  const boardEmpty = $derived(columns.every((c: any) => c.items.length === 0));

  // Four working columns across the top, the two exits beneath, long-term
  // last. Wide columns lay their cards out in a grid rather than one tall list.
  const PLACE: Record<string, { cls: string; wide: boolean }> = {
    Delayed: { cls: 'sm:col-span-2 lg:col-start-1 lg:row-start-2', wide: true },
    Discontinued: {
      cls: 'sm:col-span-2 lg:col-start-3 lg:row-start-2',
      wide: true
    },
    'Long Term': {
      cls: 'sm:col-span-2 lg:col-span-4 lg:row-start-3',
      wide: true
    }
  };
</script>

{#if boardEmpty}
  <p
    class="lu-enter rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] px-6 py-5 text-[14px] text-[#94a3b8]"
  >
    Nothing on the board yet. Anything added or generated lands in the first
    column.
  </p>
{/if}

<div
  class="lu-board lu-enter mb-4 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4"
>
  {#each columns as column, index}
    {#if column.show}
      {@const place = PLACE[column.name] ?? {
        cls: 'lg:row-start-1',
        wide: false
      }}
      <div class="min-w-0 {place.cls}">
        <Column
          name={column.name}
          itemCount={column.items.filter((i: any) => !i.isDndShadowItem).length}
          {showDialog}
          {updateStatus}
          statusId={column.value}
          {role}
          over={overIndex === index}
        >
          <div
            use:dndzone={{
              items: column.items,
              flipDurationMs,
              dropTargetStyle: {}
            }}
            onconsider={(e: any) => consider(e, index)}
            onfinalize={(e: any) => finalize(e, index, column.value)}
            class="max-h-[34rem] min-h-[6.5rem] gap-2.5 overflow-y-auto rounded-2xl {place.wide
              ? 'grid content-start [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]'
              : 'flex flex-col'}"
          >
            {#each column.items as item (item.id)}
              <div
                animate:flip={{ duration: flipDurationMs, easing: cubicOut }}
                class:hidden={isHidden(item)}
                data-settling={settlingId === item.id || undefined}
              >
                {@render card(item, false, index)}
              </div>
            {/each}
          </div>
        </Column>
      </div>
    {/if}
  {/each}
</div>
