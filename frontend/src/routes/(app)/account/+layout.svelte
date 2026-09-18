<script lang="ts">
  import { page } from '$app/stores';
  import { cubicInOut } from 'svelte/easing';
  import { crossfade } from 'svelte/transition';
  import { access } from '$lib/access';
  import { MOVE } from '$lib/motion';
  import { UserRound, KeyRound, Palette } from 'lucide-svelte';
  import type { LayoutData } from './$types';

  let { children, data }: { children: any; data: LayoutData } = $props();

  // The indicator slides between items on navigation: motion tied to an action.
  const [send, receive] = crossfade({ duration: MOVE, easing: cubicInOut });

  const modules =
    access.roles[`${data.user.role as 'Startup' | 'Mentor' | 'Manager'}`]
      .modules;

  const segments = $derived($page.url.pathname.slice(1).split('/'));
  const currentModule = $derived(segments[segments.length - 1]);
  const module = $derived(segments[0]);
  const items = $derived(
    modules.filter((item) => item.link === module)[0]?.subModule ?? []
  );
</script>

<div class="lu-root bg-transparent pb-12">
  <div class="pt-2">
    <h1 class="lu-d-xw text-[27px] leading-[1.15] text-white sm:text-[30px]">
      Settings
    </h1>
    <p class="mt-2 text-[15px] text-[#94a3b8]">
      Your account, sign-in and preferences.
    </p>
  </div>

  <div class="mt-8 grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
    <nav aria-label="Settings">
      <ul class="flex gap-1 overflow-x-auto lg:flex-col">
        {#each items as item (item.link)}
          {@const isActive = currentModule === item.link}
          <li class="shrink-0">
            <a
              href={`/account/${item.link}`}
              data-sveltekit-noscroll
              aria-current={isActive ? 'page' : undefined}
              class="relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8] {isActive
                ? 'text-white'
                : 'text-[#94a3b8] hover:text-[#f1f5f9]'}"
            >
              {#if isActive}
                <span
                  class="absolute inset-0 rounded-[10px] border border-[#1f2c47] bg-[#0b1220]"
                  in:send={{ key: 'account-nav' }}
                  out:receive={{ key: 'account-nav' }}
                ></span>
              {/if}
              <span class="relative flex items-center gap-3">
                {#if item.link === 'profile'}
                  <UserRound class="h-4 w-4" />
                {:else if item.link === 'appearance'}
                  <Palette class="h-4 w-4" />
                {:else}
                  <KeyRound class="h-4 w-4" />
                {/if}
                {item.name}
              </span>
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
