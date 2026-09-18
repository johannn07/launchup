<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { access } from '$lib/access';
  import { page } from '$app/state';
  import { crossfade } from 'svelte/transition';
  import { cubicInOut } from 'svelte/easing';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { Rocket, Menu, X } from 'lucide-svelte';
  import { MOVE } from '$lib/motion';
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';

  const { user, startup, scrollContainer } = $props();

  // One flag per menu: a shared flag opens both, and the hidden one keeps the
  // page locked (upstream 59a5781).
  let desktopDropdownOpen = $state(false);
  let mobileDropdownOpen = $state(false);
  let mobileMenuOpen = $state(false);
  const logoutForms: Record<'desktop' | 'mobile', HTMLFormElement | undefined> =
    $state({ desktop: undefined, mobile: undefined });

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
    duration: MOVE,
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

  // Pending and waitlisted startups have nothing to assess yet, only their
  // overview (upstream 139026c).
  const isUnqualifiedStartup = $derived(
    page.data.qualificationStatus === QualificationStatus.PENDING ||
      page.data.qualificationStatus === QualificationStatus.WAITLISTED
  );

  function getNavLinks() {
    if (module !== subModule && module !== 'account' && module !== 'admin') {
      return (
        modules.filter((item) => item.link === module)[0]?.subModule ?? []
      )
        .filter(
          (item: { link: string }) =>
            !isUnqualifiedStartup || item.link === 'overview'
        )
        .map((item) => ({
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

<!-- Matches the landing header: navy at 85% with blur, hairline rule. The
     blur is functional here, since page content scrolls beneath it. -->
<header
  class="lu-root fixed left-0 right-0 top-0 z-40 border-b backdrop-blur-lg transition-colors duration-move {isBlurred
    ? 'border-[#1f2c47]'
    : 'border-[#17213a]/70'}"
  style="background: rgba(7, 17, 31, 0.85)"
>
  <nav
    class="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8"
  >
    <div class="flex flex-1 items-center">
      <a
        data-sveltekit-preload-data="tap"
        href={`/${modules[0]?.link ?? ''}`}
        class="flex items-center gap-2"
      >
        <Rocket class="h-4 w-4 -rotate-12 text-[#6366f1]" />
        <span class="lu-d-xw hidden text-xl text-white sm:inline">LaunchUp</span
        >
      </a>
    </div>

    <div class="hidden items-center gap-5 md:flex">
      <ul class="flex items-center gap-1">
        {#each navLinks as link}
          <li>
            <a
              data-sveltekit-preload-data="tap"
              href={link.href}
              class="relative flex h-16 items-center px-3 text-[14px] font-medium transition-colors hover:text-[#f1f5f9] {link.isActive
                ? 'text-white'
                : 'text-[#94a3b8]'}"
            >
              {link.name}
              {#if link.isActive}
                <div
                  class="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[#6366f1]"
                  in:send={{ key: 'active-sidebar-tab' }}
                  out:receive={{ key: 'active-sidebar-tab' }}
                ></div>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
      <span class="h-6 w-px bg-[#1f2c47]" aria-hidden="true"></span>
      <span
        class="rounded-full border border-[#1f2c47] bg-[#0b1220] px-2.5 py-1 text-[12px] font-medium text-[#94a3b8]"
      >
        {user?.role ?? 'Anonymous'}
      </span>
      {@render account('desktop')}
    </div>

    <div class="flex items-center gap-2 md:hidden">
      <span
        class="rounded-full border border-[#1f2c47] bg-[#0b1220] px-2.5 py-1 text-[12px] font-medium text-[#94a3b8]"
      >
        {user?.role ?? 'Anonymous'}
      </span>
      {@render account('mobile')}
      <button
        class="flex h-10 w-10 items-center justify-center rounded-full text-[#94a3b8] transition-colors hover:bg-[#0b1220] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
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
    <div class="border-t border-[#17213a] px-4 py-3 md:hidden">
      <ul class="flex flex-col gap-1">
        {#each navLinks as link}
          <li>
            <a
              data-sveltekit-preload-data="tap"
              href={link.href}
              class="flex items-center rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-colors {link.isActive
                ? 'bg-[#4f46e5]/15 text-white'
                : 'text-[#94a3b8] hover:bg-[#0b1220] hover:text-white'}"
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

<!-- One account menu, rendered in both the desktop and mobile slots. Inside a
     startup the nav shows its sections, so this is the way back to modules. -->
{#snippet account(which: 'desktop' | 'mobile')}
  {@const item =
    'flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] font-medium text-[#cbd5e1] outline-none transition-colors duration-quick data-[highlighted]:bg-[#111b2e] data-[highlighted]:text-white'}
  <DropdownMenu.Root
    bind:open={
      () => (which === 'desktop' ? desktopDropdownOpen : mobileDropdownOpen),
      (v) =>
        which === 'desktop'
          ? (desktopDropdownOpen = v)
          : (mobileDropdownOpen = v)
    }
  >
    <DropdownMenu.Trigger
      class="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
      aria-label="Account menu"
    >
      <div
        class="flex h-9 w-9 items-center justify-center rounded-full border border-[#4f46e5]/50 bg-[#4f46e5]/20 text-[14px] font-semibold text-white transition-colors hover:bg-[#4f46e5]/30"
      >
        {user.firstName.charAt(0)}
      </div>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content
      align="end"
      sideOffset={8}
      class="w-64 rounded-2xl border-[#1f2c47] bg-[#0b1220] p-1.5 text-[#f1f5f9] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
      style="font-family: 'Public Sans', ui-sans-serif, system-ui, sans-serif"
    >
      <div class="flex items-center gap-3 px-3 pb-3 pt-2.5">
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#4f46e5]/50 bg-[#4f46e5]/20 text-[14px] font-semibold text-white"
          aria-hidden="true"
        >
          {user.firstName.charAt(0)}
        </span>
        <div class="min-w-0">
          <p class="truncate text-[14px] font-semibold text-white">
            {user.firstName}
            {user.lastName ?? ''}
          </p>
          <p class="truncate text-[12.5px] text-[#94a3b8]">{user?.email}</p>
        </div>
      </div>
      <DropdownMenu.Separator class="-mx-1.5 my-1 bg-[#17213a]" />
      {#each modules.filter((m: { link: string }) => m.link !== 'account') as mod (mod.link)}
        <DropdownMenu.Item
          class={item}
          onSelect={() =>
            navigateTo(
              `/${mod.link}${mod.subModule.length > 0 && mod.name !== 'Startups' ? `/${mod.subModule[0].link}` : ''}`
            )}
        >
          {mod.name}
        </DropdownMenu.Item>
      {/each}
      <DropdownMenu.Separator class="-mx-1.5 my-1 bg-[#17213a]" />
      <DropdownMenu.Item
        class={item}
        onSelect={() => navigateTo('/account/profile')}
      >
        Profile
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class={item}
        onSelect={() => navigateTo('/account/appearance')}
      >
        Appearance
      </DropdownMenu.Item>
      <DropdownMenu.Separator class="-mx-1.5 my-1 bg-[#17213a]" />
      <!-- The item submits the form itself; a menu item inside a button was
           two nested controls. -->
      <form action="/logout" method="post" bind:this={logoutForms[which]}>
        <DropdownMenu.Item
          class={item}
          onSelect={() => logoutForms[which]?.requestSubmit()}
        >
          Log out
        </DropdownMenu.Item>
      </form>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}
