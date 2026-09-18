<script lang="ts">
  import { fade } from 'svelte/transition';
  import { dur, MOVE } from './core';

  // Increment `trigger` after each successful save to show the note again.
  let { trigger = 0, text = 'Saved' }: { trigger?: number; text?: string } = $props();

  let visible = $state(false);
  $effect(() => {
    if (trigger < 1) return;
    visible = true;
    const t = setTimeout(() => (visible = false), 2600);
    return () => clearTimeout(t);
  });
</script>

<span role="status" aria-live="polite">
  {#if visible}
    <span class="lu-saved" transition:fade={{ duration: dur(MOVE) }}>
      <svg class="lu-tick h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      {text}
    </span>
  {/if}
</span>
