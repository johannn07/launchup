<script lang="ts">
  import { page } from '$app/state';
  import { access } from '$lib/access';

  let { children } = $props();

  // Sourced from access.ts so the admin pages are declared once, alongside
  // every other module in the Manager's nav.
  const links =
    access.roles.Manager.modules.find((m) => m.link === 'admin')?.subModule ?? [];

  const current = $derived(page.url.pathname.replace(/^\/admin\/?/, ''));
</script>

<div class="mx-auto w-full max-w-7xl p-4">
  <nav class="mb-6 border-b">
    <ul class="flex flex-wrap items-center gap-6 text-sm">
      {#each links as l}
        <li>
          <a
            href={l.link ? `/admin/${l.link}` : '/admin'}
            class="hover:text-flutter-blue relative flex h-10 items-center"
            class:text-flutter-blue={current === l.link}
            class:font-medium={current === l.link}
          >
            {l.name}
            {#if current === l.link}
              <div class="absolute bottom-0 h-[1px] w-full bg-primary"></div>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </nav>
  {@render children()}
</div>
