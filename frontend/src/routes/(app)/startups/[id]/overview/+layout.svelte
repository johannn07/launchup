<script lang="ts">
  import { cubicInOut } from 'svelte/easing';
  import { crossfade } from 'svelte/transition';
  import { MOVE } from '$lib/motion';
  import { access } from '$lib/access';
  import { page } from '$app/stores';

  const { data, children } = $props();
  const { role } = data;

  // The indicator slides between items on navigation, like the account nav.
  const [send, receive] = crossfade({
    duration: MOVE,
    easing: cubicInOut
  });
  const currentModule = $derived(
    $page.url.pathname.slice(1).split('/')[
      $page.url.pathname.slice(1).split('/').length - 1
    ]
  );

  const modules = $derived((() => {
    const userRole = data.user?.role as 'Startup' | 'Mentor' | 'Manager';
    const roleModules = access.roles[userRole]?.modules ?? [];
    
    // Looked up by name because the module list is role-dependent.
    const startupsModule = roleModules.find(m => m.link === 'startups');
    if (!startupsModule) return [];
    
    // Find the overview submodule
    const overviewModule = startupsModule.subModule.find(s => s.link === 'overview');
    if (!overviewModule) return [];
    
    return overviewModule.subModule ?? [];
  })());
</script>

<div
  class="rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] p-5 sm:p-6"
>
  <div class="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
    <nav aria-label="Overview">
      <ul class="flex gap-1 overflow-x-auto lg:flex-col">
        {#each modules as item (item.link)}
          {@const isActive = currentModule === item.link}
          <li class="shrink-0">
            <a
              href={`/startups/${data.startupId}/overview/${item.link}`}
              data-sveltekit-noscroll
              aria-current={isActive ? 'page' : undefined}
              class="relative flex items-center rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-colors duration-quick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8] {isActive
                ? 'text-white'
                : 'text-[#94a3b8] hover:text-[#f1f5f9]'}"
            >
              {#if isActive}
                <span
                  class="absolute inset-0 rounded-[10px] border border-[#1f2c47] bg-[#111b2e]"
                  in:send={{ key: 'active-sidebar-tab' }}
                  out:receive={{ key: 'active-sidebar-tab' }}
                ></span>
              {/if}
              <span class="relative">{item.name}</span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
    <div class="min-w-0">
      {@render children()}
    </div>
  </div>
</div>
