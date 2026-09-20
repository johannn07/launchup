<script lang="ts">
  let { canEdit = false }: { canEdit?: boolean } = $props();
</script>

<!-- The shape of the toolbar and the board's first row of columns. -->
<div class="flex flex-col gap-4" role="status" aria-label="Loading board">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <span class="lu-skel h-10 w-40 rounded-full"></span>
      <span class="lu-skel h-8 w-20 rounded-full"></span>
    </div>
    {#if canEdit}
      <div class="flex items-center gap-2">
        <span class="lu-skel h-[38px] w-24 rounded-full"></span>
        <span class="lu-skel h-[38px] w-32 rounded-full"></span>
      </div>
    {/if}
  </div>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each [3, 2, 2, 1] as cards}
      <div class="rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] p-3">
        <span class="lu-skel mx-1 mb-4 mt-1 h-4 w-24"></span>
        <div class="space-y-2.5">
          {#each Array(cards) as _}
            <span class="lu-skel h-24 rounded-2xl"></span>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
