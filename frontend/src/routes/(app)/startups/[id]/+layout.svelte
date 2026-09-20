<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getData } from '$lib/utils';
  import { useQuery } from '@sveltestack/svelte-query';
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';
  import { statusOf, tierOf, tierLine } from '$lib/startup-status';

  const { children, data } = $props();
  const { access, startupId } = data;

  const startupQuery = useQuery(['startupData', startupId], () =>
    getData(`/startups/${startupId}`, access!)
  );

  const info: any = $derived($startupQuery.isSuccess ? $startupQuery.data : {});
  // The server load already has the name and tier, so nothing waits on the
  // client query.
  const name: string | null = $derived(data.startupName ?? info.name ?? null);
  const tier = $derived(
    $startupQuery.isSuccess ? tierOf(info) : (data.tier ?? null)
  );
  // Absent evaluations mean "not loaded", which is not the same as "not
  // scored" — say nothing rather than something false.
  const tierKnown = $derived(
    Array.isArray(
      ($startupQuery.isSuccess ? info : { readinessEvaluations: undefined })
        .readinessEvaluations
    ) || tier !== null
  );
  const status = $derived(
    statusOf($startupQuery.isSuccess ? info.qualificationStatus : data.qualificationStatus)
  );
  // Mentors only ever see qualified startups as the ones they are working with.
  const statusLabel = $derived(
    status.key === 'qualified' && data.role === 'Mentor' ? 'Active' : status.label
  );
  const unqualified = $derived(
    data.qualificationStatus === QualificationStatus.PENDING ||
      data.qualificationStatus === QualificationStatus.WAITLISTED
  );

  const initials = $derived(
    (name ?? '')
      .split(' ')
      .filter(Boolean)
      .map((w: string) => w.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2)
  );

  // One name per section, shared by the heading, breadcrumb and tab title.
  const SECTIONS: Record<string, string> = {
    assessment: 'Assessment',
    'readiness-level': 'Readiness levels',
    rna: 'Readiness and needs assessment',
    rns: 'Recommended next steps',
    initiatives: 'Initiatives',
    roadblocks: 'Roadblocks',
    'progress-report': 'Progress report',
    pending: 'Pending approval',
    overview: 'Overview',
    general: 'Overview',
    members: 'Members',
    capsule_proposal: 'Capsule proposal',
    elevate: 'Elevate'
  };

  const BLURBS: Record<string, string> = {
    assessment: 'Evidence for each readiness dimension, submitted by the startup.',
    'readiness-level': 'Baseline levels per dimension and the weighted score they add up to.',
    rna: 'Where the startup stands on each dimension, and what it needs to move up.',
    rns: 'Recommended next steps, tracked from proposal to completion.',
    initiatives: 'The work planned against each next step, tracked by status.',
    roadblocks: 'What is blocking progress, and the fix for each.'
  };

  const segments = $derived($page.url.pathname.split('/').filter(Boolean));
  const leaf = $derived(segments[segments.length - 1]);
  const section = $derived(SECTIONS[leaf] ?? 'Overview');
  // Overview has its own heading and sub-navigation.
  const inOverview = $derived(segments.includes('overview'));

  // Dialogs and menus render outside this tree; give them the same theme.
  onMount(() => {
    document.body.classList.add('lu-ws');
    return () => document.body.classList.remove('lu-ws');
  });
</script>

<svelte:head>
  <title>{section}{name ? ` · ${name}` : ''} — LaunchUp</title>
</svelte:head>

<div class="lu-root lu-ws flex flex-1 flex-col bg-transparent pb-12">
  <nav aria-label="Breadcrumb" class="pt-2 text-[13px] text-[#94a3b8]">
    <ol class="flex min-w-0 items-center gap-2">
      <li>
        <a
          href="/startups"
          class="rounded transition-colors duration-quick hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
          >Startups</a
        >
      </li>
      <li aria-hidden="true" class="text-[#54648a]">/</li>
      <li aria-current="page" class="min-w-0 truncate text-[#c7d2fe]">
        {#if name}
          {name}
        {:else if $startupQuery.isLoading}
          <span class="lu-skel h-3.5 w-28" aria-hidden="true"></span>
        {:else}
          Startup
        {/if}
      </li>
    </ol>
  </nav>

  <!-- Identity: the same tile, badge and readiness line as the /startups row,
       so the startup is recognisably the one that was clicked. -->
  <header class="mt-4 flex items-center gap-4">
    {#if name}
      <span
        class="lu-d flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.9rem] border border-[#2b3a5c] bg-[#111b2e] text-[16px] text-[#c7d2fe]"
        aria-hidden="true">{initials}</span
      >
      <div class="min-w-0">
        <h1
          class="lu-d-xw truncate text-[24px] leading-[1.15] text-white sm:text-[28px]"
          title={name}
        >
          {name}
        </h1>
        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span class="lu-status" data-status={status.key}>{statusLabel}</span>
          {#if tierKnown}
            <span class="text-[13px] text-[#94a3b8]">{tierLine(tier)}</span>
          {/if}
        </div>
      </div>
    {:else if $startupQuery.isLoading}
      <div class="flex items-center gap-4" role="status" aria-label="Loading startup">
        <span class="lu-skel h-12 w-12 rounded-[0.9rem]"></span>
        <span class="space-y-2.5">
          <span class="lu-skel h-7 w-72 max-w-[60vw]"></span>
          <span class="lu-skel h-5 w-44 rounded-full"></span>
        </span>
      </div>
    {:else}
      <h1 class="lu-d-xw text-[24px] text-white sm:text-[28px]">Startup</h1>
    {/if}
  </header>

  {#if unqualified}
    <p
      class="mt-5 rounded-2xl border border-[#1f2c47] bg-[#0b1220] px-5 py-3.5 text-[14px] leading-relaxed text-[#94a3b8]"
    >
      {data.qualificationStatus === QualificationStatus.PENDING
        ? 'This application is still being evaluated.'
        : 'This application is waitlisted.'}
      Assessments and readiness open once the startup is qualified.
    </p>
  {/if}

  {#if !inOverview}
    <div class="mt-8 border-t border-[#17213a] pt-7">
      <h2 class="lu-d-md text-[20px] leading-tight text-white">{section}</h2>
      {#if BLURBS[leaf]}
        <p class="mt-1.5 text-[14px] text-[#94a3b8]">{BLURBS[leaf]}</p>
      {/if}
    </div>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col gap-4 {inOverview ? 'mt-8' : 'mt-6'}">
    {@render children()}
  </div>
</div>
