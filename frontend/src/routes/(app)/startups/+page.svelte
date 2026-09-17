<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton';
  import Button from '$lib/components/ui/button/button.svelte';
  import {
    RocketIcon,
    TargetIcon,
    CheckCircleIcon,
    Search as SearchIcon,
    ArrowLeft,
    ArrowRight
  } from 'lucide-svelte';
  import { StartupCard } from '$lib/components/startups';
  import StartupStatusCard from '$lib/components/startups/base/StartupStatusCard.svelte';
  import StartupFilterButton from '$lib/components/startups/base/StartupFilterButton.svelte';
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';
  import { Can } from '$lib/components/shared';
  import { useQuery } from '@sveltestack/svelte-query';
  import { getData } from '$lib/utils.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
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

  const perPage = 8;
  let currentPage = $state(1);

  const totalPages = $derived(
    Math.max(1, Math.ceil(filteredStartups().length / perPage))
  );
  const pageStartups = $derived(
    filteredStartups().slice((currentPage - 1) * perPage, currentPage * perPage)
  );

  // A new tab or search can have fewer pages than the one being viewed.
  $effect(() => {
    filter;
    search;
    currentPage = 1;
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
  let showDiscardConfirm = $state(false);

  const openApplicationForm = () => {
    showApplicationForm = true;
  };

  // Nothing in the application is persisted — the answers live only in this
  // page's component tree, so any reload or navigation loses them. Confirm
  // before closing so a stray click outside can't dismiss a part-filled form.
  // controlledOpen makes bits-ui ask to close instead of closing on its own.
  const handleApplicationOpenChange = (open: boolean) => {
    if (open) {
      showApplicationForm = true;
      return;
    }

    showDiscardConfirm = true;
  };

  const closeApplicationForm = () => {
    showDiscardConfirm = false;
    showApplicationForm = false;
    selectedStartup = null;
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
<div class="glass-card mb-8 bg-gradient-to-br from-primary/5 via-transparent to-transparent p-8">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-4xl font-black tracking-tight text-foreground">Startups</h2>
      <p class="mt-1 text-muted-foreground">Manage assigned startups</p>
    </div>
    <Can role={['Startup']} userRole={role}>
      <Button variant="glass-primary" onclick={openApplicationForm} class="gap-2">
        <RocketIcon class="h-4 w-4" />
        <span>Apply</span>
      </Button>
    </Can>
  </div>
</div>

<!-- Statistics Cards -->
<div class="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">

  <!-- Total Startups -->
  <div class="glass-card group flex flex-col p-7 transition-all hover:-translate-y-1">
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
  <div class="glass-card group flex flex-col p-7 transition-all hover:-translate-y-1">
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
  <div class="glass-card group flex flex-col p-7 transition-all hover:-translate-y-1">
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
  <div class="flex gap-6 border-b border-border/50 pt-3">
    <button
      onclick={() => (filter = 'All Startups')}
      class={`pb-3 text-sm font-semibold transition-colors ${
        filter === 'All Startups'
          ? 'border-b-2 border-primary text-foreground'
          : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      All Startups
    </button>

    {#if role === 'Startup'}
      <button
        onclick={() => (filter = 'Pending')}
        class={`pb-3 text-sm font-semibold transition-colors ${
          filter === 'Pending'
            ? 'border-b-2 border-primary text-foreground'
            : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Pending
      </button>
      <button
        onclick={() => (filter = 'Waitlisted')}
        class={`pb-3 text-sm font-semibold transition-colors ${
          filter === 'Waitlisted'
            ? 'border-b-2 border-primary text-foreground'
            : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Waitlisted
      </button>
      <button
        onclick={() => (filter = 'Qualified')}
        class={`pb-3 text-sm font-semibold transition-colors ${
          filter === 'Qualified'
            ? 'border-b-2 border-primary text-foreground'
            : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Qualified
      </button>
    {:else if role === 'Mentor'}
      <button
        onclick={() => (filter = 'Qualified')}
        class={`pb-3 text-sm font-semibold transition-colors ${
          filter === 'Qualified'
            ? 'border-b-2 border-primary text-foreground'
            : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Active
      </button>
    {/if}

    <button
      onclick={() => (filter = 'Completed')}
      class={`pb-3 text-sm font-semibold transition-colors ${
        filter === 'Completed'
          ? 'border-b-2 border-primary text-foreground'
          : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      Completed
    </button>
  </div>

  <div class="relative w-full max-w-[400px]">
    <SearchIcon class="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <input
      class="glass-input w-full py-3 pl-11 pr-4 text-sm placeholder:text-muted-foreground"
      type="text"
      placeholder="Search startups..."
      bind:value={search}
    />
  </div>
</div>

<!-- Startup Cards Grid -->
{#if isLoading}
  <div class="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-10">
    {#each Array(8) as _}
      <div class="glass-card animate-pulse p-5 space-y-3">
        <div class="h-4 w-3/4 rounded-full bg-muted"></div>
        <div class="space-y-2">
          <div class="h-3 w-full rounded-full bg-muted"></div>
          <div class="h-3 w-5/6 rounded-full bg-muted"></div>
        </div>
      </div>
    {/each}
  </div>
{:else if isError}
  <div class="glass-card flex flex-col items-center justify-center p-12 text-center">
    <p class="text-lg font-semibold text-foreground">Failed to load startups</p>
    <p class="mt-2 text-sm text-muted-foreground">Please try again or contact support.</p>
  </div>
{:else if hasStartups}
  <div class="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 {totalPages > 1 ? 'pb-6' : 'pb-10'}">
    {#each pageStartups as startup}
      <StartupCard
        {startup}
        {role}
        initiatives={allInitiatives.filter(
          (initiative) => initiative.startup === startup.id
        )}
      />
    {/each}
  </div>
  {#if totalPages > 1}
    <div class="flex items-center justify-between pb-10">
      <p class="text-xs text-muted-foreground">
        Showing <span class="font-medium text-foreground">{(currentPage - 1) * perPage + 1}</span>
        to <span class="font-medium text-foreground">{Math.min(currentPage * perPage, filteredStartups().length)}</span>
        of <span class="font-medium text-foreground">{filteredStartups().length}</span> startups
      </p>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-8 w-8 p-0" aria-label="Previous page" disabled={currentPage <= 1} onclick={() => currentPage--}>
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <div class="rounded-md border border-border/50 bg-background px-2 py-1 text-xs font-medium">
          Page {currentPage} of {totalPages}
        </div>
        <Button variant="outline" size="sm" class="h-8 w-8 p-0" aria-label="Next page" disabled={currentPage >= totalPages} onclick={() => currentPage++}>
          <ArrowRight class="h-4 w-4" />
        </Button>
      </div>
    </div>
  {/if}
{:else}
  <div class="mt-20 text-center">
    <div class="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
      <RocketIcon class="h-12 w-12 text-primary/50" />
    </div>
    <h3 class="mb-2 text-2xl font-bold text-foreground">No startups found</h3>
    <p class="mb-6 text-muted-foreground">
      {search ? 'Try adjusting your search criteria' : 'Get started by adding your first startup'}
    </p>
    <Can role={['Startup']} userRole={role}>
      <Button
        variant="glass-primary"
        class="gap-2"
        onclick={openApplicationForm}
      >
        <RocketIcon class="h-4 w-4" /> Apply Now
      </Button>
    </Can>
  </div>
{/if}

<Dialog.Root
  controlledOpen
  open={showApplicationForm}
  onOpenChange={handleApplicationOpenChange}
>
  <Dialog.Content size="full" class="flex p-6">
    <Application access={data.access!} startup={selectedStartup} />
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={showDiscardConfirm}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Close the application form?</AlertDialog.Title>
      <AlertDialog.Description>
        Your answers have not been submitted. Reopening the form on this page
        brings them back, but reloading or leaving the page loses them.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Keep editing</AlertDialog.Cancel>
      <AlertDialog.Action onclick={closeApplicationForm}
        >Close form</AlertDialog.Action
      >
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
