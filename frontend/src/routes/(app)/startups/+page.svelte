<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton';
  import {
    Search as SearchIcon,
    Inbox,
    SearchX,
    AlertCircle,
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
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import { CountUp, Segmented, arrive, dur, MOVE } from '$lib/motion';

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

  // Summary figures, derived once rather than recomputed inline in markup.
  const total = $derived(listOfStartups().length);
  const doneInitiatives = $derived(
    allInitiatives?.filter((i) => i?.status === 4)?.length || 0
  );
  const completionRate = $derived(
    total > 0 ? Math.round((completedStartups.length / total) * 100) : 0
  );
  // Tab counts follow the search box, so each tab says how many results it
  // would show for what you've typed; they tick as you type.
  const matching = (list: any[]) =>
    search
      ? list.filter((s: any) =>
          s.name.toLowerCase().includes(search.toLowerCase())
        ).length
      : list.length;
  const filterOptions = $derived([
    { value: 'All Startups', label: 'All', count: matching(listOfStartups()) },
    ...(role === 'Startup'
      ? [
          {
            value: 'Pending',
            label: 'Pending',
            count: matching(pendingStartups)
          },
          {
            value: 'Waitlisted',
            label: 'Waitlisted',
            count: matching(waitlistedStartups)
          },
          {
            value: 'Qualified',
            label: 'Qualified',
            count: matching(qualifiedStartups)
          }
        ]
      : role === 'Mentor'
        ? [
            {
              value: 'Qualified',
              label: 'Active',
              count: matching(qualifiedStartups)
            }
          ]
        : []),
    {
      value: 'Completed',
      label: 'Completed',
      count: matching(completedStartups)
    }
  ]);
  // Eight startups a page (upstream 0499f92).
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

  const pipeline = $derived([
    { key: 'pending', n: pendingStartups.length },
    { key: 'waitlisted', n: waitlistedStartups.length },
    { key: 'qualified', n: qualifiedStartups.length },
    { key: 'completed', n: completedStartups.length }
  ]);
</script>

<svelte:head>
  <title>Startups — LaunchUp</title>
</svelte:head>

<div class="lu-root bg-transparent pb-12">
  <!-- Header -->
  <div class="flex flex-wrap items-end justify-between gap-4 pt-2">
    <div>
      <h1 class="lu-d-xw text-[27px] leading-[1.15] text-white sm:text-[30px]">
        Startups
      </h1>
      <p class="mt-2 text-[15px] text-[#94a3b8]">
        {role === 'Startup'
          ? 'Your applications and where each one stands.'
          : role === 'Mentor'
            ? 'The startups you are mentoring.'
            : 'Every startup in the programme, by stage.'}
      </p>
    </div>
    <Can role={['Startup']} userRole={role}>
      <button
        type="button"
        class="lu-btn lu-btn-primary"
        onclick={openApplicationForm}
      >
        Apply with a startup
      </button>
    </Can>
  </div>

  <!-- Summary: one surface split by hairlines, not three identical icon cards -->
  <section
    class="mt-8 grid overflow-hidden rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] md:grid-cols-[1.5fr_1fr_1fr] md:divide-x md:divide-[#17213a]"
    aria-label="Summary"
  >
    <!-- Pipeline: the page's one distinctive element, and the status legend -->
    <div class="p-6">
      <p class="text-[13px] text-[#94a3b8]">
        {role === 'Mentor' ? 'Startups mentored' : 'Startups'}
      </p>
      <p class="lu-d-xw lu-num mt-1.5 text-[34px] leading-none text-white">
        <CountUp value={total} />
      </p>

      {#if total > 0}
        <div
          class="mt-5 flex h-2 w-full gap-[3px] overflow-hidden rounded-full"
          role="img"
          aria-label="Pipeline: {pendingStartups.length} pending, {waitlistedStartups.length} waitlisted, {qualifiedStartups.length} {role ===
          'Mentor'
            ? 'active'
            : 'qualified'}, {completedStartups.length} completed"
        >
          {#each pipeline as seg, i (seg.key)}
            {#if seg.n > 0}
              <span
                class="lu-fill h-full"
                data-status={seg.key}
                style="width:{(seg.n / total) *
                  100}%; background: var(--st); transition-delay:{i * 80}ms"
                use:arrive
              ></span>
            {/if}
          {/each}
        </div>
        <ul
          class="mt-3.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-[#94a3b8]"
        >
          {#if role === 'Startup'}
            <li class="lu-legend" data-status="pending">
              Pending <b>{pendingStartups.length}</b>
            </li>
            <li class="lu-legend" data-status="waitlisted">
              Waitlisted <b>{waitlistedStartups.length}</b>
            </li>
          {/if}
          <li class="lu-legend" data-status="qualified">
            {role === 'Mentor' ? 'Active' : 'Qualified'}
            <b>{qualifiedStartups.length}</b>
          </li>
          <li class="lu-legend" data-status="completed">
            Completed <b>{completedStartups.length}</b>
          </li>
        </ul>
      {/if}
    </div>

    <div class="border-t border-[#17213a] p-6 md:border-t-0">
      <p class="text-[13px] text-[#94a3b8]">Initiatives completed</p>
      <p class="lu-d-xw lu-num mt-1.5 text-[34px] leading-none text-white">
        <CountUp value={doneInitiatives} /><span
          class="text-[18px] text-[#94a3b8]"
        >
          / {allInitiatives?.length ?? 0}</span
        >
      </p>
      <div class="mt-5 h-2 w-full overflow-hidden rounded-full bg-[#17213a]">
        <div
          class="lu-fill h-full rounded-full bg-[#6366f1]"
          style="width:{completedInitiativesPercentage.toFixed(0)}%"
          use:arrive
        ></div>
      </div>
      <p class="lu-num mt-3.5 text-[12.5px] text-[#94a3b8]">
        {completedInitiativesPercentage.toFixed(0)}% across all startups
      </p>
    </div>

    <div class="border-t border-[#17213a] p-6 md:border-t-0">
      <p class="text-[13px] text-[#94a3b8]">Programme completion</p>
      <p class="lu-d-xw lu-num mt-1.5 text-[34px] leading-none text-white">
        <CountUp value={completionRate} suffix="%" />
      </p>
      <div class="mt-5 h-2 w-full overflow-hidden rounded-full bg-[#17213a]">
        <div
          class="lu-fill h-full rounded-full"
          style="width:{completionRate}%; background: var(--lu-ok); transition-delay:80ms"
          use:arrive
        ></div>
      </div>
      <p class="lu-num mt-3.5 text-[12.5px] text-[#94a3b8]">
        {completedStartups.length} of {total} completed
      </p>
    </div>
  </section>

  <!-- Controls -->
  <div class="mt-8 flex flex-wrap items-center justify-between gap-4">
    <Segmented
      options={filterOptions}
      bind:value={filter}
      label="Filter by status"
    />

    <div class="relative w-full sm:w-[20rem]">
      <SearchIcon
        class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54648a]"
      />
      <input
        class="lu-input pl-10"
        type="search"
        placeholder="Search by name"
        aria-label="Search startups by name"
        bind:value={search}
      />
    </div>
  </div>

  <!-- List -->
  <section
    class="mt-4 overflow-hidden rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220]"
    aria-label="Startups"
    aria-busy={isLoading}
  >
    <!-- Column labels, aligned to the row grid in startup-card.svelte -->
    <div
      class="hidden gap-x-5 border-b border-[#17213a] px-5 py-3 text-[12.5px] font-medium text-[#94a3b8] sm:grid sm:grid-cols-[minmax(0,1.6fr)_8.5rem_minmax(0,1fr)_1.25rem] lg:grid-cols-[minmax(0,1.6fr)_8.5rem_minmax(0,1fr)_minmax(0,1.1fr)_1.25rem]"
    >
      <span>Startup</span>
      <span>Status</span>
      <span>Progress</span>
      <span class="hidden lg:block">Next step</span>
      <span></span>
    </div>

    {#if isLoading}
      <ul class="divide-y divide-[#17213a]">
        {#each [0, 1, 2, 3, 4] as i (i)}
          <li class="flex animate-pulse items-center gap-3.5 px-5 py-4">
            <span class="h-10 w-10 shrink-0 rounded-[0.75rem] bg-[#17213a]"
            ></span>
            <span class="flex-1 space-y-2">
              <span class="block h-3.5 w-40 rounded bg-[#17213a]"></span>
              <span class="block h-3 w-24 rounded bg-[#17213a]"></span>
            </span>
            <span class="hidden h-6 w-24 rounded-full bg-[#17213a] sm:block"
            ></span>
          </li>
        {/each}
      </ul>
    {:else if isError}
      <div class="p-5">
        <p class="lu-alert" role="alert">
          <AlertCircle class="mt-0.5 h-4 w-4 flex-none" />
          <span
            >Startups could not be loaded. Refresh the page to try again.</span
          >
        </p>
      </div>
    {:else if !hasStartups}
      <div class="flex flex-col items-center px-6 py-16 text-center">
        <Inbox class="h-6 w-6 text-[#54648a]" />
        <p class="lu-d-md mt-3 text-[16px] text-white">
          {role === 'Startup'
            ? 'No applications yet'
            : 'No startups assigned yet'}
        </p>
        <p class="mt-1.5 max-w-[40ch] text-[14px] leading-[1.6] text-[#94a3b8]">
          {role === 'Startup'
            ? 'Apply with a startup and it will appear here with its status and readiness progress.'
            : 'Startups will appear here once they are assigned to you.'}
        </p>
        <Can role={['Startup']} userRole={role}>
          <button
            type="button"
            class="lu-btn lu-btn-primary mt-6"
            onclick={openApplicationForm}
          >
            Apply with a startup
          </button>
        </Can>
      </div>
    {:else if filteredStartups().length === 0}
      <!-- Previously a blank grid: the "adjust your search" copy lived in the
           no-startups branch, where no search could have applied. -->
      <div class="flex flex-col items-center px-6 py-16 text-center">
        <SearchX class="h-6 w-6 text-[#54648a]" />
        <p class="lu-d-md mt-3 text-[16px] text-white">No matches</p>
        <p class="mt-1.5 max-w-[40ch] text-[14px] leading-[1.6] text-[#94a3b8]">
          {search
            ? `Nothing matches "${search}" in this view.`
            : 'No startups have this status yet.'}
        </p>
        <button
          type="button"
          class="lu-btn lu-btn-secondary lu-btn-sm mt-6"
          onclick={() => {
            search = '';
            filter = 'All Startups';
          }}
        >
          Clear filters
        </button>
      </div>
    {:else}
      <ul class="lu-enter divide-y divide-[#17213a]">
        {#each pageStartups as startup (startup.id)}
          <li
            animate:flip={{ duration: dur(MOVE) }}
            in:fade={{ duration: dur(MOVE) }}
          >
            <StartupCard
              {startup}
              {role}
              initiatives={allInitiatives.filter(
                (i) => i.startup === startup.id
              )}
            />
          </li>
        {/each}
      </ul>

      {#if totalPages > 1}
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-[#17213a] px-5 py-3.5"
        >
          <p class="lu-num text-[13px] text-[#94a3b8]">
            Showing <span class="text-[#f1f5f9]"
              >{(currentPage - 1) * perPage + 1}</span
            >–<span class="text-[#f1f5f9]"
              >{Math.min(currentPage * perPage, filteredStartups().length)}</span
            >
            of <span class="text-[#f1f5f9]">{filteredStartups().length}</span>
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="lu-btn lu-btn-secondary lu-btn-sm !px-0 w-[38px]"
              aria-label="Previous page"
              disabled={currentPage <= 1}
              onclick={() => currentPage--}
            >
              <ArrowLeft class="h-4 w-4" />
            </button>
            <span class="lu-num min-w-[6.5rem] text-center text-[13px] text-[#94a3b8]">
              Page <span class="text-white">{currentPage}</span> of {totalPages}
            </span>
            <button
              type="button"
              class="lu-btn lu-btn-secondary lu-btn-sm !px-0 w-[38px]"
              aria-label="Next page"
              disabled={currentPage >= totalPages}
              onclick={() => currentPage++}
            >
              <ArrowRight class="h-4 w-4" />
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </section>
</div>

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
