<script lang="ts">
  import { Header } from '$lib/components/shared';
  import { onMount, onDestroy } from 'svelte';

  let { children, data } = $props();
  let scrollContainer: HTMLDivElement | null = null;

  function handleScroll() {}

  onMount(() => {
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
    }
  });

  onDestroy(() => {
    if (scrollContainer) {
      scrollContainer.removeEventListener('scroll', handleScroll);
    }
  });
</script>

<div class="flex h-full flex-col overflow-x-hidden">
  <div
    class="absolute inset-0 -z-10 h-full w-full bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_36%),linear-gradient(to_bottom,#ffffff,#f7f9ff)] dark:bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_36%),linear-gradient(to_bottom,#020617,#050816)]"
  ></div>
  <Header user={data.user} startup={data.startup} {scrollContainer} />
  <div class="mx-auto my-5 flex h-full w-4/5 flex-col">
    <div class="min-h-14"></div>
    <div bind:this={scrollContainer} class="flex-1" style="height: 100%;">
      {@render children()}
    </div>
  </div>
</div>
