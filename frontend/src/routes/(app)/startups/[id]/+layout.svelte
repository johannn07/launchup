<script lang="ts">
  import { page } from '$app/stores';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import { getData } from '$lib/utils';
  import { useQuery } from '@sveltestack/svelte-query';

  const { children, data } = $props();
  const { access, startupId } = data;

  const startupQuery = useQuery(['startupData', startupId], () =>
    getData(`/startups/${startupId}`, access!)
  );

  const info: any = $derived($startupQuery.isSuccess ? $startupQuery.data : {});

  type m =
    | 'readiness-level'
    | 'progress-report'
    | 'rns'
    | 'rna'
    | 'initiatives'
    | 'roadblocks';

  const getModule = (segment: string): string => {
    const modules: Record<string, string> = {
      'readiness-level': 'Readiness Level',
      'progress-report': 'Progress Report',
      rns: 'Recommended Next Steps',
      rna: 'Readiness and Needs Assessment',
      initiatives: 'Initiatives',
      roadblocks: 'Roadblocks',
      assessment: 'Assessments',
      pending: 'Pending Approval',
      overview: 'Overview'
    };
    return modules[segment] || segment;
  };
</script>

<div class="flex max-h-full flex-1 flex-col gap-3">
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Link href="/startups">Startups</Breadcrumb.Link>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page
          >{$startupQuery.isLoading ? 'Loading...' : info.name}</Breadcrumb.Page
        >
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>
          {@const currentPath = $page.url.pathname.split('/').slice(-1)[0]}
          {currentPath === 'assessment'
            ? 'Assessments'
            : currentPath === 'pending'
              ? 'Pending Approval'
              : getModule(currentPath as m) || 'Overview'}
        </Breadcrumb.Page>
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
  <h2 class="text-4xl font-bold tracking-tight text-white">
    {$startupQuery.isLoading ? 'Loading...' : info.name}
  </h2>
</div>
  {@render children()}
</div>
