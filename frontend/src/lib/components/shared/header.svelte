<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Badge } from '$lib/components/ui/badge';
  import { access } from '$lib/access';
  import { page } from '$app/state';
  import { Separator } from '$lib/components/ui/separator';
  import { crossfade } from 'svelte/transition';
  import { cubicInOut } from 'svelte/easing';
  import { onMount, onDestroy } from 'svelte';
  import { getProfileColor } from '$lib/utils';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { Rocket, Menu, X } from 'lucide-svelte';

  const { user, startup, scrollContainer } = $props();

  // One flag per menu: a shared flag opens both, and the hidden one keeps the page locked.
  let desktopDropdownOpen = $state(false);
  let mobileDropdownOpen = $state(false);
  let mobileMenuOpen = $state(false);

  function navigateTo(path: string) {
    desktopDropdownOpen = false;
    mobileDropdownOpen = false;
    mobileMenuOpen = false;
    goto(path);
  }

  const userRole = user?.role ?? 'Startup';
  const modules = access.roles[userRole]?.modules ?? [];

  const currentModule = $derived(
    page.url.pathname.slice(1).split('/')[
      page.url.pathname.slice(1).split('/').length - 1
    ]
  );

  const currentModulev2 = $derived(
    page.url.pathname.slice(1).split('/')[
      page.url.pathname.slice(1).split('/').length - 2
    ]
  );

  const module = $derived(page.url.pathname.slice(1).split('/')[0]);
  const subModule = $derived(
    page.url.pathname.slice(1).split('/')[
      page.url.pathname.slice(1).split('/').length - 1
    ]
  );

  const [send, receive] = crossfade({
    duration: 250,
    easing: cubicInOut
  });

  let isBlurred = $state(false);

  function handleScroll(e?: Event) {
    let scrollY = 0;
    if (scrollContainer) {
      scrollY = scrollContainer.scrollTop;
    } else {
      scrollY = window.scrollY;
    }
    isBlurred = scrollY > 100;
  }

  onMount(() => {
    if (!browser) return;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
    } else {
      window.addEventListener('scroll', handleScroll);
    }
  });

  onDestroy(() => {
    if (!browser) return;
    if (scrollContainer) {
      scrollContainer.removeEventListener('scroll', handleScroll);
    } else {
      window.removeEventListener('scroll', handleScroll);
    }
  });

  function getNavLinks() {
    if (module !== subModule && module !== 'account' && module !== 'admin' && subModule !== 'pending') {
      return (modules.filter((item) => item.link === module)[0]?.subModule ?? []).map((item) => ({
        name: item.name,
        href: `/${module}/${startup}/${item.link}${item.name === 'Overview' ? `/${item?.subModule[0].link}` : ''}`,
        isActive: currentModule === item.link || currentModulev2 === item.link
      }));
    }
    return modules.map((item) => ({
      name: item.name,
      href: `/${item.link}${item.subModule.length > 0 && item.name !== 'Startups' && item.name !== 'Admin' ? `/${item.subModule[0].link}` : ''}`,
      isActive: currentModule === item.link || currentModulev2 === item.link
    }));
  }

  const navLinks = $derived(getNavLinks());
</script>

<header
  class="fixed left-0 right-0 top-0 z-40 border-b transition-all duration-300 {isBlurred ? 'glass-strong' : 'glass-subtle'}"
>
  <nav class="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
    <div class="flex flex-1 items-center gap-2">
      <a
        data-sveltekit-preload-data="tap"
        href={`/${modules[0]?.link ?? ''}`}
        class="flex items-center gap-2 text-xl font-black normal-case text-primary"
      >
        <Rocket class="h-5 w-5" />
        <span class="hidden sm:inline">LaunchUp</span>
      </a>
    </div>

    <div class="hidden items-center gap-5 md:flex">
      <ul class="flex items-center gap-1">
        {#each navLinks as link}
          <li>
            <a
              data-sveltekit-preload-data="tap"
              href={link.href}
              class="relative flex h-16 items-center px-3 text-sm font-medium transition-colors hover:text-primary {link.isActive ? 'text-primary' : 'text-muted-foreground'}"
            >
              {link.name}
              {#if link.isActive}
                <div
                  class="absolute bottom-0 h-[2px] w-full rounded-full bg-primary"
                  in:send={{ key: 'active-sidebar-tab' }}
                  out:receive={{ key: 'active-sidebar-tab' }}
                ></div>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
      <Separator orientation="vertical" class="h-6" />
      <Badge variant="glass" class="h-7 rounded-full text-xs font-normal">
        {user?.role ?? 'Anonymous'}
      </Badge>
      <DropdownMenu.Root bind:open={desktopDropdownOpen}>
        <DropdownMenu.Trigger>
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-white transition-transform hover:scale-105 {getProfileColor(user.firstName)}"
          >
            {user.firstName.charAt(0)}
          </div>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="glass-card w-56">
          <DropdownMenu.Group>
            <DropdownMenu.Label>
              <p class="font-medium">My Account</p>
              <p class="text-xs text-muted-foreground">{user?.email}</p>
            </DropdownMenu.Label>
            <DropdownMenu.Separator />
            {#each modules as module}
              <DropdownMenu.Item
                class="cursor-pointer rounded-lg"
                onclick={() =>
                  navigateTo(
                    `/${module.link}${module.subModule.length > 0 && module.name !== 'Startups' ? `/${module.subModule[0].link}` : ''}`
                  )}
              >
                {module.name}
              </DropdownMenu.Item>
            {/each}
            <form action="/logout" method="post" class="w-full">
              <button type="submit" class="w-full">
                <DropdownMenu.Item class="cursor-pointer rounded-lg">
                  Logout
                </DropdownMenu.Item>
              </button>
            </form>
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>

    <div class="flex items-center gap-2 md:hidden">
      <Badge variant="glass" class="h-7 rounded-full text-xs font-normal">
        {user?.role ?? 'Anonymous'}
      </Badge>
      <DropdownMenu.Root bind:open={mobileDropdownOpen}>
        <DropdownMenu.Trigger>
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-white {getProfileColor(user.firstName)}"
          >
            {user.firstName.charAt(0)}
          </div>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="glass-card w-56">
          <DropdownMenu.Group>
            <DropdownMenu.Label>
              <p class="font-medium">My Account</p>
              <p class="text-xs text-muted-foreground">{user?.email}</p>
            </DropdownMenu.Label>
            <DropdownMenu.Separator />
            {#each modules as mod}
              <DropdownMenu.Item
                class="cursor-pointer rounded-lg"
                onclick={() =>
                  navigateTo(
                    `/${mod.link}${mod.subModule.length > 0 && mod.name !== 'Startups' ? `/${mod.subModule[0].link}` : ''}`
                  )}
              >
                {mod.name}
              </DropdownMenu.Item>
            {/each}
            <form action="/logout" method="post" class="w-full">
              <button type="submit" class="w-full">
                <DropdownMenu.Item class="cursor-pointer rounded-lg">
                  Logout
                </DropdownMenu.Item>
              </button>
            </form>
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <button
        class="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
      >
        {#if mobileMenuOpen}
          <X class="h-5 w-5" />
        {:else}
          <Menu class="h-5 w-5" />
        {/if}
      </button>
    </div>
  </nav>

  {#if mobileMenuOpen}
    <div class="glass-strong border-t px-4 py-3 md:hidden">
      <ul class="flex flex-col gap-1">
        {#each navLinks as link}
          <li>
            <a
              data-sveltekit-preload-data="tap"
              href={link.href}
              class="flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors {link.isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
              onclick={() => (mobileMenuOpen = false)}
            >
              {link.name}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</header>
