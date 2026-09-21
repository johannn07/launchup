<script lang="ts">
  import '$lib/styles/brand.css';
  import { Header } from '$lib/components/shared';

  let { children, data } = $props();
  let scrollContainer = $state<HTMLDivElement | null>(null);

  // The authenticated app is dark-only, like every other branded page. `dark`
  // on the wrapper below covers everything rendered inside it; this covers what
  // is portalled to <body> (dialogs, dropdowns, toasts), which follows <html>.
  // Removed on leave only if it wasn't already set, so a user whose stored mode
  // is dark is untouched. mode-watcher 0.4 has no forced-mode option.
  $effect(() => {
    const html = document.documentElement;
    const added = !html.classList.contains('dark');
    html.classList.add('dark');
    // .lu-ws points the shadcn variables at brand tokens; on <body> it reaches
    // the portalled surfaces too.
    document.body.classList.add('lu-ws');
    return () => {
      if (added) html.classList.remove('dark');
      document.body.classList.remove('lu-ws');
    };
  });
</script>

<div class="dark lu-ws flex h-full flex-col overflow-x-hidden bg-[#07111f]">
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,#07111f_0%,#0b1220_45%,#050816_100%)]"
  ></div>
  <Header user={data.user} startup={data.startup} {scrollContainer} />
  <div
    class="mx-auto my-6 flex h-full w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8"
  >
    <div class="min-h-16"></div>
    <div bind:this={scrollContainer} class="flex-1">
      {@render children()}
    </div>
  </div>
</div>
