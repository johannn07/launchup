<script lang="ts">
  import { Header } from '$lib/components/shared';

  let { children, data } = $props();
  let scrollContainer: HTMLDivElement | null = $props();
</script>

<div class="flex h-full flex-col overflow-x-hidden">
  <div
    class="absolute inset-0 -z-10 h-full w-full bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.06),transparent_40%),linear-gradient(to_bottom,#ffffff,#f8fafc)] dark:bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.10),transparent_40%),linear-gradient(to_bottom,#020617,#050a18)]"
  ></div>
  <Header user={data.user} startup={data.startup} {scrollContainer} />
  <div class="mx-auto my-6 flex h-full w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
    <div class="min-h-16"></div>
    <div bind:this={scrollContainer} class="flex-1">
      {@render children()}
    </div>
  </div>
</div>
