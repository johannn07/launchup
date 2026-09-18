<script lang="ts">
  import { page } from '$app/stores';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import { getData } from '$lib/utils';
  import { useQuery } from '@sveltestack/svelte-query';
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';

  const { children, data } = $props();
  const { access, startupId } = data;

  const startupQuery = useQuery(['startupData', startupId], () =>
    getData(`/startups/${startupId}`, access!)
  );

  const info: any = $derived($startupQuery.isSuccess ? $startupQuery.data : {});
  // The server load already has the name, so nothing waits on the client query.
  const name: string | null = $derived(data.startupName ?? info.name ?? null);

  // One name per section, shared by the breadcrumb and the tab title.
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

  const section = $derived.by(() => {
    const segments = $page.url.pathname.split('/').filter(Boolean);
    return SECTIONS[segments[segments.length - 1]] ?? 'Overview';
  });
</script>

<svelte:head>
  <title>{section}{name ? ` · ${name}` : ''} — LaunchUp</title>
</svelte:head>

<div class="flex max-h-full flex-1 flex-col gap-3">
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Link href="/startups">Startups</Breadcrumb.Link>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>
          {#if name}
            {name}
          {:else if $startupQuery.isLoading}
            <span class="lu-skel h-3.5 w-28" aria-hidden="true"></span>
          {:else}
            Startup
          {/if}
        </Breadcrumb.Page>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>{section}</Breadcrumb.Page>
      </Breadcrumb.Item>
    </Breadcrumb.List>
  </Breadcrumb.Root>
  <div class="flex flex-col items-center gap-2 py-2">
  <span
    class="rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide text-indigo-300"
    style="background: rgba(124, 111, 240, 0.1)"
  >
    STARTUP
  </span>
  {#if name}
    <h2 class="text-4xl font-bold tracking-tight text-white">{name}</h2>
  {:else if $startupQuery.isLoading}
    <span
      class="lu-skel my-1 h-9 w-72 max-w-full"
      role="status"
      aria-label="Loading startup"
    ></span>
  {:else}
    <h2 class="text-4xl font-bold tracking-tight text-white">Startup</h2>
  {/if}
</div>
  {#if data.qualificationStatus === QualificationStatus.PENDING || data.qualificationStatus === QualificationStatus.WAITLISTED}
    <div class="glass-card px-5 py-3 text-sm text-muted-foreground">
      {data.qualificationStatus === QualificationStatus.PENDING
        ? 'This startup is pending evaluation.'
        : 'This startup is waitlisted.'}
      Assessments and readiness become available once it is qualified.
    </div>
  {/if}
  {@render children()}
</div>
