<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    onopen,
    flag = null,
    chips,
    children,
    footer
  }: {
    onopen: () => void;
    /** Needs someone's attention: new to this viewer, or awaiting approval. */
    flag?: string | null;
    chips: Snippet;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

<!-- One card for initiatives, next steps and roadblocks. A flag is a static
     indigo edge plus a label; it used to pulse, which is motion with no action
     behind it. -->
<div
  class="lu-card group relative flex cursor-pointer flex-col gap-2.5 rounded-2xl border bg-[#111b2e] p-3.5 text-left hover:border-[#2b3a5c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8] {flag
    ? 'border-[#4f46e5]/60'
    : 'border-[#1f2c47]'}"
  role="button"
  tabindex="0"
  onclick={onopen}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onopen();
    }
  }}
>
  <div class="flex flex-wrap items-center gap-1.5">
    {@render chips()}
    {#if flag}
      <span class="lu-chip-sm ml-auto" data-flag>{flag}</span>
    {/if}
  </div>
  <div class="min-w-0 break-words text-[13.5px] leading-snug text-[#f1f5f9]">
    {@render children()}
  </div>
  {#if footer}
    <div
      class="flex items-center justify-between gap-2 border-t border-[#17213a] pt-2.5 text-[12.5px] text-[#94a3b8]"
    >
      {@render footer()}
    </div>
  {/if}
</div>
