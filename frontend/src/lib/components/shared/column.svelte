<script lang="ts">
  import type { Role } from '$lib/types/user.types';
  let {
    children,
    name,
    itemCount = 0,
    showDialog,
    updateStatus,
    statusId,
    role,
    classNames = '',
    over = false
  }: {
    children: any;
    name: string;
    itemCount?: number;
    showDialog: any;
    updateStatus: any;
    statusId: number;
    role: Role;
    classNames?: string;
    /** A card is being dragged over this column. */
    over?: boolean;
  } = $props();

  // Status colour only where the status means something: done, late, stopped.
  const TONES: Record<string, string> = {
    Completed: 'done',
    Delayed: 'late',
    Discontinued: 'stopped'
  };
</script>

<section
  class="lu-col flex h-full min-w-0 flex-col rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] {classNames}"
  data-tone={TONES[name]}
  data-over={over || undefined}
  aria-label="{name}, {itemCount} {itemCount === 1 ? 'item' : 'items'}"
>
  <header class="flex items-center justify-between gap-2 px-4 pb-3 pt-3.5">
    <h3
      class="flex items-center gap-2 text-[13.5px] font-semibold text-[#f1f5f9]"
    >
      <span class="h-2 w-2 rounded-full" style="background: var(--st)"></span>
      {name}
    </h3>
    <span
      class="lu-num rounded-full bg-[#17213a] px-2 text-[12px] font-semibold text-[#94a3b8]"
      >{itemCount}</span
    >
  </header>
  <!-- flex so the drop zone can grow to the column's full height -->
  <div class="relative flex min-h-0 flex-1 flex-col px-2.5 pb-2.5">
    {@render children()}
  </div>
</section>
