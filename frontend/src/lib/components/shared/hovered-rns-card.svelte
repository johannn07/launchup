<script lang="ts">
  import { hoveredRNSCard } from '$lib/stores/hoveredRNSCard';
  import { onMount, onDestroy } from 'svelte';
  let unsub: (() => void) | null = null;
  let rns: any = null;
  let coords: { x: number; y: number } | null = null;
  let visible = false;
  let tooltipEl: HTMLDivElement | null = null;
  let tooltipStyle = '';
  let isBrowser = typeof window !== 'undefined';

  function updateTooltipPosition() {
    if (!isBrowser || !coords || !tooltipEl) return;
    const rect = tooltipEl.getBoundingClientRect();
    const badgeY = coords.y;
    const badgeX = coords.x;
    const padding = 8;
    let top = badgeY - rect.height + 4;
    let left = badgeX - rect.width / 3;

    // Clamp to viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (left + rect.width > viewportWidth - padding) {
      left = viewportWidth - rect.width - padding;
    }
    if (left < padding) left = padding;
    if (top < padding) top = padding;
    if (top + rect.height > viewportHeight - padding) {
      top = viewportHeight - rect.height - padding;
    }
    tooltipStyle = `top: ${top}px; left: ${left}px;`;
  }

  if (isBrowser) {
    unsub = hoveredRNSCard.subscribe((val) => {
      rns = val.rns;
      coords = val.coords;
      visible = val.visible;
      setTimeout(updateTooltipPosition, 0);
    });
  }

  onDestroy(() => {
    if (unsub) unsub();
  });
</script>

{#if visible && rns && coords}
  <div
    bind:this={tooltipEl}
    class="pointer-events-none fixed z-[100]"
    style={tooltipStyle}
  >
    <div
      class="w-80 rounded-2xl border border-[#1f2c47] bg-[#0b1220] p-4 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
    >
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="lu-chip-sm">RNS #{rns.priorityNumber ?? ''}</span>
        <span class="lu-chip-sm">{rns.readinessType}</span>
      </div>
      <p class="mt-2.5 text-[13px] font-medium leading-snug text-white">
        {rns.description?.substring(0, 60) +
          (rns.description?.length > 60 ? '…' : '')}
      </p>
      <p class="mt-2 text-[12.5px] text-[#94a3b8]">
        {#if rns.assignee}
          {(() => {
            const first = rns.assignee.firstName ?? '';
            const last = rns.assignee.lastName ?? '';
            const full = (first + (last ? ' ' + last : '')).trim();
            return full.length > 20 ? full.slice(0, 19) + '…' : full;
          })()}
        {:else}
          Unassigned
        {/if}
      </p>
    </div>
  </div>
{/if}
