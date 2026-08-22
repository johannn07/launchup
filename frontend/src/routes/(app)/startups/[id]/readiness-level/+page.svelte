<script lang="ts">
  import { RatedRubric, Stepper } from '$lib/components/startups/readiness';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { useQueries } from '@sveltestack/svelte-query';
  import { getData, isMentor } from '$lib/utils';
  import { useQueriesState } from '$lib/stores/useQueriesState.svelte.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import Rubric from '$lib/components/startups/readiness/rubric.svelte';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton/index.js';
  import { Can } from '$lib/components/shared';
  import ReadinessDashboard from '$lib/components/dashboard/ReadinessDashboard.svelte';
  import axiosInstance from '$lib/axios';
  import { toast } from 'svelte-sonner';

  const { data } = $props();
  const { access, startupId, role } = data;

  const readinessLevelQueries = useQueries([
    {
      queryKey: ['startup', startupId],
      queryFn: () => getData(`/startups/${startupId}/`, access!)
    },
    {
      queryKey: ['readinessLevels'],
      queryFn: () => getData(`/readinesslevel/readiness-levels`, access!)
    },
    {
      queryKey: ['haveScores', startupId],
      queryFn: () =>
        getData(
          `/startups/startup-readiness-level?startupId=${startupId}`,
          access!
        )
    },
    {
      queryKey: ['readinessLevel', startupId],
      queryFn: () =>
        getData(
          `/startups/startup-readiness-level?startupId=${startupId}`,
          access!
        )
    }
  ]);
  const { isLoading, isError } = $derived(
    useQueriesState($readinessLevelQueries)
  );

  const readinessTypeOptions = [
    'Technology',
    'Acceptance',
    'Market',
    'Organizational',
    'Regulatory',
    'Investment'
  ] as const;

  let baselineScores = $state<Record<(typeof readinessTypeOptions)[number], number>>({
    Technology: 1,
    Acceptance: 1,
    Market: 1,
    Organizational: 1,
    Regulatory: 1,
    Investment: 1
  });
  let savingBaselineScores = $state(false);

  const isRated = $derived(() => {
    const q = $readinessLevelQueries[2];
    return q.isSuccess && q.data?.length > 0;
  });

  let selectedTab = $state('chart');
  let selectedReadinessTab = $state('technology');

  const rubrics = $derived(() => {
    const query = $readinessLevelQueries[1];
    if (!query.isSuccess || !query.data) {
      return {
        technology: [],
        market: [],
        acceptance: [],
        organizational: [],
        regulatory: [],
        investment: []
      };
    }

    return {
      technology: query.data.filter(
        (r: any) => r.readinessType === 'Technology'
      ),
      market: query.data.filter((r: any) => r.readinessType === 'Market'),
      acceptance: query.data.filter(
        (r: any) => r.readinessType === 'Acceptance'
      ),
      organizational: query.data.filter(
        (r: any) => r.readinessType === 'Organizational'
      ),
      regulatory: query.data.filter(
        (r: any) => r.readinessType === 'Regulatory'
      ),
      investment: query.data.filter(
        (r: any) => r.readinessType === 'Investment'
      )
    };
  });

  const scores = $derived(() => {
    const query = $readinessLevelQueries[2];
    if (!query.isSuccess || !query.data) {
      return {
        technology: [],
        market: [],
        acceptance: [],
        organizational: [],
        regulatory: [],
        investment: []
      };
    }

    return {
      technology: query.data.filter(
        (r: any) => r.readinessType === 'Technology'
      ),
      market: query.data.filter((r: any) => r.readinessType === 'Market'),
      acceptance: query.data.filter(
        (r: any) => r.readinessType === 'Acceptance'
      ),
      organizational: query.data.filter(
        (r: any) => r.readinessType === 'Organizational'
      ),
      regulatory: query.data.filter(
        (r: any) => r.readinessType === 'Regulatory'
      ),
      investment: query.data.filter(
        (r: any) => r.readinessType === 'Investment'
      )
    };
  });

  const readiness = $derived(() => {
    const query = $readinessLevelQueries[3];

    if (!query.isSuccess || !query.data || query.data.length === 0) {
      return {
        technology: 1,
        organizational: 1,
        acceptance: 1,
        market: 1,
        regulatory: 1,
        investment: 1
      };
    }

    const getLatestLevel = (type: string) => {
      const entriesForType = query.data.filter(
        (r: any) => r.readinessLevel.readinessType === type
      );

      if (entriesForType.length === 0) {
        return 1;
      }

      const latestEntry = entriesForType.reduce((latest: any, current: any) =>
        current.id > latest.id ? current : latest
      );

      return latestEntry?.readinessLevel.level ?? 1;
    };

    return {
      Technology: getLatestLevel('Technology'),
      Organizational: getLatestLevel('Organizational'),
      Acceptance: getLatestLevel('Acceptance'),
      Market: getLatestLevel('Market'),
      Regulatory: getLatestLevel('Regulatory'),
      Investment: getLatestLevel('Investment')
    };
  });

  let current = $state(0);

  const next = () => {
    if (current < 7) {
      current++;
    }
  };

  const previous = () => {
    if (current > 0) {
      current--;
    }
  };

  const updateTab = (tab: string) => {
    selectedTab = tab;
  };

  const updateReadinessTab = (tab: string) => {
    selectedReadinessTab = tab;
  };

  const submitBaselineScores = async () => {
    savingBaselineScores = true;

    try {
      await Promise.all(
        readinessTypeOptions.map((readinessType) =>
          axiosInstance.post(
            `/readinesslevel/startup/${startupId}/rate`,
            {
              readinessType,
              level: baselineScores[readinessType]
            },
            {
              headers: {
                Authorization: `Bearer ${access}`
              }
            }
          )
        )
      );

      toast.success('Baseline scores saved');
      await Promise.all([
        $readinessLevelQueries[2].refetch(),
        $readinessLevelQueries[3].refetch(),
        $readinessLevelQueries[0].refetch()
      ]);
    } catch (error: any) {
      console.error(error);
      const message =
        error.response?.data?.message || 'Failed to save baseline scores';
      toast.error(message);
    } finally {
      savingBaselineScores = false;
    }
  };

</script>

<svelte:head>
  <title
    >{$readinessLevelQueries[0].isSuccess
      ? `${$readinessLevelQueries[0].data.name} - Readiness Levels`
      : 'Loading'}</title
  >
</svelte:head>

<div class="flex h-full flex-col">
  {#if isLoading}
    {@render loading()}
  {:else if isError}
    {@render error()}
  {:else if isRated()}
    {@render rated()}
  {:else}
    {#if isMentor(role)}
      {@render mentor()}
    {:else}
      <div class="mt-10 text-center text-2xl font-bold">
        <p>Looks like you haven't been rated yet...</p>
      </div>
    {/if}
  {/if}
</div>

{#snippet loading()}
  <div class="flex h-full flex-col gap-3">
    {#if role !== 'Startup'}
      <div class="bg-background">
        <Skeleton class="h-9 w-[147px]" />
      </div>
    {/if}
    <div class="h-full w-full bg-background">
      <Skeleton class="h-full w-full" />
    </div>
  </div>
{/snippet}

{#snippet error()}
  ERROR
{/snippet}

{#snippet rated()}
  <div class="flex h-full flex-col gap-3">
    <Can role={['Mentor', 'Manager as Mentor']} userRole={role}>
      <div class="flex justify-between">
        <div class="flex h-fit justify-between rounded-lg bg-background"></div>
        {#if selectedTab === 'detailed'}
          <div class="flex h-fit justify-between rounded-lg bg-background">
            <Tabs.Root value={selectedReadinessTab}>
              <Tabs.List class="bg-flutter-gray/20 border">
                <Tabs.Trigger
                  value="technology"
                  class="capitalize"
                  onclick={() => updateReadinessTab('technology')}
                  >Technology</Tabs.Trigger
                >
                <Tabs.Trigger
                  value="acceptance"
                  class="capitalize"
                  onclick={() => updateReadinessTab('acceptance')}
                  >Acceptance</Tabs.Trigger
                >
                <Tabs.Trigger
                  value="market"
                  class="capitalize"
                  onclick={() => updateReadinessTab('market')}
                  >Market</Tabs.Trigger
                >
                <Tabs.Trigger
                  value="organizational"
                  class="capitalize"
                  onclick={() => updateReadinessTab('organizational')}
                  >Organizational</Tabs.Trigger
                >
                <Tabs.Trigger
                  value="regulatory"
                  class="capitalize"
                  onclick={() => updateReadinessTab('regulatory')}
                  >Regulatory</Tabs.Trigger
                >
                <Tabs.Trigger
                  value="investment"
                  class="capitalize"
                  onclick={() => updateReadinessTab('investment')}
                  >Investment</Tabs.Trigger
                >
              </Tabs.List>
            </Tabs.Root>
          </div>
        {/if}
      </div>
    </Can>
    {#if selectedTab === 'chart'}
      <ReadinessDashboard startupId={Number(startupId)} />
    {:else}
      <div class="flex h-full flex-col gap-3">
        <div class="flex h-full flex-col overflow-scroll">
          <div class="flex flex-1 flex-col">
            <RatedRubric
              questionnaires={rubrics().technology}
              type={'technology'}
              current={selectedReadinessTab}
              scores={scores().technology}
            />
            <RatedRubric
              questionnaires={rubrics().acceptance}
              type={'acceptance'}
              current={selectedReadinessTab}
              scores={scores().acceptance}
            />
            <RatedRubric
              questionnaires={rubrics().market}
              type={'market'}
              current={selectedReadinessTab}
              scores={scores().market}
            />
            <RatedRubric
              questionnaires={rubrics().regulatory}
              type={'regulatory'}
              current={selectedReadinessTab}
              scores={scores().regulatory}
            />
            <RatedRubric
              questionnaires={rubrics().organizational}
              type={'organizational'}
              current={selectedReadinessTab}
              scores={scores().organizational}
            />
            <RatedRubric
              questionnaires={rubrics().investment}
              type={'investment'}
              current={selectedReadinessTab}
              scores={scores().investment}
            />
          </div>
        </div>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet mentor()}
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-2xl border bg-background p-6 shadow-sm">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Mentor action</p>
      <h2 class="mt-2 text-2xl font-bold">Assign baseline scores</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Set one baseline level per readiness dimension. These values unlock the weighted readiness dashboard and RNA generation.
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      {#each readinessTypeOptions as readinessType}
        <label class="flex flex-col gap-2 rounded-xl border p-4">
          <span class="text-sm font-semibold">{readinessType}</span>
          <select
            class="h-10 rounded-md border bg-background px-3 text-sm"
            value={baselineScores[readinessType]}
            onchange={(event) => {
              baselineScores = {
                ...baselineScores,
                [readinessType]: Number(
                  (event.currentTarget as HTMLSelectElement).value
                )
              };
            }}
          >
            {#each Array.from({ length: 9 }, (_, index) => index + 1) as level}
              <option value={level}>Level {level}</option>
            {/each}
          </select>
        </label>
      {/each}
    </div>

    <div class="flex justify-end">
      <Button onclick={submitBaselineScores} disabled={savingBaselineScores}>
        {#if savingBaselineScores}
          Saving...
        {:else}
          Save baseline scores
        {/if}
      </Button>
    </div>
  </div>
{/snippet}
