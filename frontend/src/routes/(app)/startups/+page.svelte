<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton';
  import Button from '$lib/components/ui/button/button.svelte';
  import { RocketIcon, TargetIcon, CheckCircleIcon, Search as SearchIcon } from 'lucide-svelte';
  import { StartupCard } from '$lib/components/startups';
  import StartupStatusCard from '$lib/components/startups/base/StartupStatusCard.svelte';
  import StartupFilterButton from '$lib/components/startups/base/StartupFilterButton.svelte';
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';
  import { Can } from '$lib/components/shared';
  import { useQuery } from '@sveltestack/svelte-query';
  import { getData } from '$lib/utils.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import Application from '$lib/components/startup/Application.svelte';
  import { page } from '$app/stores';
  import { toast } from 'svelte-sonner';
  import axiosInstance from '$lib/axios';
  import { onMount } from 'svelte';

  let { data, form } = $props();

  const queryResult = useQuery(
    ['startups', 'list'],
    () => getData(`/startups/startups`, data.access),
    {
      initialData: data.startups,
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      refetchOnMount: 'always' // Always refetch when component mounts
    }
  );

  const role = data.role;

  const isLoading = $derived($queryResult.isLoading);
  const isError = $derived($queryResult.isError);
  const hasStartups = $derived(
    Array.isArray($queryResult.data) && $queryResult.data.length > 0
  );
  const listOfStartups = $derived(() => {
    if ($queryResult.isSuccess && hasStartups) {
      if (role === 'Mentor') {
        return $queryResult.data.filter(
          (startup: any) =>
            startup.qualificationStatus !== QualificationStatus.PENDING
        );
      }
      return $queryResult.data;
    }
    return [];
  });

  let search = $state('');
  let filter = $state('All Startups');
  let allInitiatives: any[] = $state([]);
  let completedInitiativesPercentage = $state(0);

  const pendingStartups = $derived(
    listOfStartups().filter(
      (startup: any) =>
        startup.qualificationStatus === QualificationStatus.PENDING
    )
  );
  const waitlistedStartups = $derived(
    listOfStartups().filter(
      (startup: any) =>
        startup.qualificationStatus === QualificationStatus.WAITLISTED
    )
  );
  const qualifiedStartups = $derived(
    listOfStartups().filter(
      (startup: any) =>
        startup.qualificationStatus === QualificationStatus.QUALIFIED
    )
  );
  const completedStartups = $derived(
    listOfStartups().filter(
      (startup: any) =>
        startup.qualificationStatus === QualificationStatus.COMPLETED
    )
  );

  const filteredStartups = $derived(() => {
    let base;
    if (filter === 'All Startups')
      base = pendingStartups
        .concat(waitlistedStartups)
        .concat(qualifiedStartups)
        .concat(completedStartups);
    else if (filter === 'Pending') base = pendingStartups;
    else if (filter === 'Waitlisted') base = waitlistedStartups;
    else if (filter === 'Qualified') base = qualifiedStartups;
    else if (filter === 'Completed') base = completedStartups;
    else
      base = pendingStartups
        .concat(waitlistedStartups)
        .concat(qualifiedStartups)
        .concat(completedStartups);

    if (role === 'Mentor') {
      base = base.filter(
        (startup: any) =>
          startup.qualificationStatus !== QualificationStatus.PENDING
      );
    }

    if (!search) return base;
    return base.filter((startup: any) =>
      startup.name.toLowerCase().includes(search.toLowerCase())
    );
  });

  // Utility function to get initiatives for a single startup
  async function getInitiativesForStartup(startupId: number, access: string) {
    const res = await axiosInstance.get(`/initiatives?startupId=${startupId}`, {
      headers: { Authorization: `Bearer ${access}` }
    });
    return res.data;
  }

  // Fetch all initiatives for all startups
  async function getAllInitiativesForStartups(startups: any[], access: string) {
    const results = await Promise.all(
      startups.map((startup) => getInitiativesForStartup(startup.id, access))
    );
    // Flatten the array if each result is an array of initiatives
    return results.flat();
  }

  let showApplicationForm = $state(false);
  let selectedStartup = $state(null);
  const toggleApplicationForm = () => {
    showApplicationForm = !showApplicationForm;
    if (!showApplicationForm) {
      selectedStartup = null;
    }
  };

  $effect(() => {
    const handleOpenApplication = (event: CustomEvent) => {
      selectedStartup = event.detail.startup;
      showApplicationForm = true;
    };

    window.addEventListener(
      'openApplication',
      handleOpenApplication as EventListener
    );
    return () => {
      window.removeEventListener(
        'openApplication',
        handleOpenApplication as EventListener
      );
    };
  });

  // $effect(() => {
  //   const success = page.url.searchParams.get('success');

  //   if (form?.error) {
  //     let formError =
  //       form.error.length > 60
  //         ? form.error.substring(0, 60) + '...'
  //         : form.error;
  //     toast.error(formError);
  //   }

  //   if (success === 'true') {
  //     toast.success('Application successfull.');
  //     // Remove the 'success' parameter from the URL
  //     const url = new URL(page.url.href);
  //     url.searchParams.delete('success');
  //     history.replaceState(null, '', url);
  //   }
  // });

  $effect(() => {
    async function fetchInitiatives() {
      if ($queryResult.isSuccess && listOfStartups().length > 0) {
        const allInitiativesFetched = await getAllInitiativesForStartups(
          listOfStartups(),
          data.access!
        );
        allInitiatives = allInitiativesFetched;
        completedInitiativesPercentage =
          allInitiatives.length > 0
            ? (allInitiatives.filter((initiative) => initiative.status === 4)
                .length /
                allInitiatives.length) *
              100
            : 0;
      }
    }
    fetchInitiatives();
  });

  onMount(() => {
    $queryResult.refetch();
  });
</script>

<svelte:head>
  <title>LaunchUp - Startups</title>
</svelte:head>

<!-- Hero Banner Header -->
<div
  class="mb-8 rounded-[2rem] border border-white/40 bg-gradient-to-br from-indigo-50 via-white to-white p-8 shadow-[0_8px_32px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-white/10 dark:from-indigo-950/40 dark:via-slate-950/60 dark:to-slate-950/60 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
>
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-4xl font-black tracking-tight text-slate-950 dark:text-white">Startups</h2>
      <p class="text-slate-600 dark:text-slate-400 mt-1">Manage assigned startups</p>
    </div>
    <Can role={['Startup']} userRole={role}>
      <div class="flex gap-5">
        <button
          onclick={toggleApplicationForm}
          class="group relative flex items-center gap-2.5 overflow-hidden rounded-xl bg-[#6366f1] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(99,102,241,0.4)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(99,102,241,0.55)] active:translate-y-0 active:shadow-[0_2px_10px_rgba(99,102,241,0.3)]"
        >
          <!-- animated shimmer -->
          <span class="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-500 group-hover:translate-x-full"></span>
          <RocketIcon class="relative h-4 w-4 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />
          <span class="relative">Apply</span>
        </button>
      </div>
    </Can>
  </div>
</div>

<!-- Statistics Cards -->
<div class="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">

  <!-- Total Startups -->
  <div class="group flex flex-col rounded-[2rem] border border-white/40 bg-white/60 p-7 shadow-[0_8px_32px_rgba(15,23,42,0.04),inset_0_1px_1px_rgba(255,255,255,0.7)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/50 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-muted-foreground">Total Startups</span>
      <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
        <RocketIcon class="h-4 w-4 text-primary" />
      </div>
    </div>

    <span class="mt-3 text-4xl font-bold leading-none tracking-tight">{listOfStartups().length}</span>

    <div class="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border/50 pt-4">
      {#if role === 'Startup'}
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-2 text-xs text-muted-foreground">
            <span class="h-2 w-2 rounded-full bg-yellow-500"></span>Pending
          </span>
          <span class="text-sm font-semibold">{pendingStartups.length}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-2 text-xs text-muted-foreground">
            <span class="h-2 w-2 rounded-full bg-orange-500"></span>Waitlisted
          </span>
          <span class="text-sm font-semibold">{waitlistedStartups.length}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-2 text-xs text-muted-foreground">
            <span class="h-2 w-2 rounded-full bg-green-500"></span>Qualified
          </span>
          <span class="text-sm font-semibold">{qualifiedStartups.length}</span>
        </div>
      {:else if role === 'Mentor'}
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-2 text-xs text-muted-foreground">
            <span class="h-2 w-2 rounded-full bg-blue-500"></span>Active
          </span>
          <span class="text-sm font-semibold">{qualifiedStartups.length}</span>
        </div>
      {/if}
      <div class="flex items-center justify-between">
        <span class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="h-2 w-2 rounded-full bg-purple-500"></span>Completed
        </span>
        <span class="text-sm font-semibold">{completedStartups.length}</span>
      </div>
    </div>
  </div>

  <!-- Initiatives Progress -->
  <div class="group flex flex-col rounded-[2rem] border border-white/40 bg-white/60 p-7 shadow-[0_8px_32px_rgba(15,23,42,0.04),inset_0_1px_1px_rgba(255,255,255,0.7)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/50 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-muted-foreground">Initiatives Progress</span>
      <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
        <TargetIcon class="h-4 w-4 text-primary" />
      </div>
    </div>

    <div class="mt-3 flex items-baseline gap-1.5">
      <span class="text-4xl font-bold leading-none tracking-tight">
        {allInitiatives?.filter((initiative) => initiative?.status === 4)?.length || 0}
      </span>
      <span class="text-lg text-muted-foreground">/ {allInitiatives?.length ?? 0}</span>
    </div>

    <div class="mt-5 border-t border-border/50 pt-4">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs text-muted-foreground">Completion</span>
        <span class="text-sm font-semibold text-primary">{completedInitiativesPercentage.toFixed(0)}%</span>
      </div>
      <div class="h-3 w-full rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out shadow-sm"
          style="width:{completedInitiativesPercentage.toFixed(0)}%"
        ></div>
      </div>
    </div>
  </div>

  <!-- Completion Rate -->
  <div class="group flex flex-col rounded-[2rem] border border-white/40 bg-white/60 p-7 shadow-[0_8px_32px_rgba(15,23,42,0.04),inset_0_1px_1px_rgba(255,255,255,0.7)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/50 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-muted-foreground">Completion Rate</span>
      <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
        <CheckCircleIcon class="h-4 w-4 text-primary" />
      </div>
    </div>

    <span class="mt-3 text-4xl font-bold leading-none tracking-tight">
      {listOfStartups().length > 0
        ? Math.round((completedStartups.length / listOfStartups().length) * 100)
        : 0}%
    </span>

    <div class="mt-5 border-t border-border/50 pt-4">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs text-muted-foreground">Completed</span>
        <span class="text-sm font-semibold">
          <span class="text-foreground">{completedStartups.length}</span>
          <span class="text-muted-foreground"> of {listOfStartups().length}</span>
        </span>
      </div>
      <div class="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out"
          style="width:{listOfStartups().length > 0 ? Math.round((completedStartups.length / listOfStartups().length) * 100) : 0}%"
        ></div>
      </div>
    </div>
  </div>

</div>

<!-- Search + Underline Tab Navigation -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div class="flex gap-6 border-b border-slate-200/60 pt-3 dark:border-white/10">
    <button
      onclick={() => (filter = 'All Startups')}
      class={`pb-3 text-sm font-semibold transition-colors ${
        filter === 'All Startups'
          ? 'border-b-2 border-[#6366f1] text-slate-950 dark:text-white'
          : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
      }`}
    >
      All Startups
    </button>

    {#if role === 'Startup'}
      <button
        onclick={() => (filter = 'Pending')}
        class={`pb-3 text-sm font-semibold transition-colors ${
          filter === 'Pending'
            ? 'border-b-2 border-[#6366f1] text-slate-950 dark:text-white'
            : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        Pending
      </button>
      <button
        onclick={() => (filter = 'Waitlisted')}
        class={`pb-3 text-sm font-semibold transition-colors ${
          filter === 'Waitlisted'
            ? 'border-b-2 border-[#6366f1] text-slate-950 dark:text-white'
            : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        Waitlisted
      </button>
      <button
        onclick={() => (filter = 'Qualified')}
        class={`pb-3 text-sm font-semibold transition-colors ${
          filter === 'Qualified'
            ? 'border-b-2 border-[#6366f1] text-slate-950 dark:text-white'
            : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        Qualified
      </button>
    {:else if role === 'Mentor'}
      <button
        onclick={() => (filter = 'Qualified')}
        class={`pb-3 text-sm font-semibold transition-colors ${
          filter === 'Qualified'
            ? 'border-b-2 border-[#6366f1] text-slate-950 dark:text-white'
            : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        Active
      </button>
    {/if}

    <button
      onclick={() => (filter = 'Completed')}
      class={`pb-3 text-sm font-semibold transition-colors ${
        filter === 'Completed'
          ? 'border-b-2 border-[#6366f1] text-slate-950 dark:text-white'
          : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
      }`}
    >
      Completed
    </button>
  </div>

  <div class="relative w-full max-w-[400px]">
    <SearchIcon class="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
    <input
      class="w-full rounded-2xl border border-white/50 bg-white/70 py-3 pl-11 pr-4 text-sm placeholder:text-slate-500 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-4 focus:ring-[#6366f1]/10 focus:border-[#6366f1]/50 dark:border-white/10 dark:bg-slate-950/60 dark:text-white dark:placeholder:text-slate-400"
      type="text"
      placeholder="Search startups..."
      bind:value={search}
    />
  </div>
</div>

<!-- Startup Cards Grid -->
{#if isLoading}
  <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-10">
    {#each Array(8) as _, i}
      <div class="animate-pulse">
        <div class="rounded-xl bg-muted/50 border border-border">
          <Skeleton class="h-48 rounded-xl" />
        </div>
      </div>
    {/each}
  </div>
{:else if isError}
  <div>
    <p>Error fetching data. Contact support</p>
  </div>
{:else if hasStartups}
  <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-10">
    {#each filteredStartups() as startup}
      <StartupCard
        {startup}
        {role}
        initiatives={allInitiatives.filter(
          (initiative) => initiative.startup === startup.id
        )}
      />
    {/each}
  </div>
{:else}
  <div class="mt-20 text-center">
    <div class="mx-auto w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mb-6">
      <RocketIcon class="h-12 w-12 text-muted-foreground/50" />
    </div>
    <h3 class="text-2xl font-bold mb-2">No startups found</h3>
    <p class="text-muted-foreground mb-6">
      {search ? 'Try adjusting your search criteria' : 'Get started by adding your first startup'}
    </p>
    <Can role={['Startup']} userRole={role}>
      <Button
        class="gap-2 rounded-xl bg-[#6366f1] text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)]"
        onclick={toggleApplicationForm}
      >
        <RocketIcon class="h-4 w-4" /> Apply Now
      </Button>
    </Can>
  </div>
{/if}

<Dialog.Root open={showApplicationForm} onOpenChange={toggleApplicationForm}>
  <Dialog.Content class="flex flex-col h-[90vh] max-w-4xl rounded-3xl border-slate-200/70 bg-white/95 p-6 shadow-[0_32px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95">
    <Application access={data.access!} startup={selectedStartup} />
  </Dialog.Content>
</Dialog.Root>