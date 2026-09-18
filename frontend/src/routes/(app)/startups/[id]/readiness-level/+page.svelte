<script lang="ts">
  import {
    RatedRubric,
    ReadinessLevelGuide,
    Stepper
  } from '$lib/components/startups/readiness';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import * as Select from '$lib/components/ui/select';
  import { useQueries } from '@sveltestack/svelte-query';
  import { getData, canRateReadiness } from '$lib/utils';
  import { useQueriesState } from '$lib/stores/useQueriesState.svelte.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import Rubric from '$lib/components/startups/readiness/rubric.svelte';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton/index.js';
  import { Can } from '$lib/components/shared';
  import ReadinessDashboard from '$lib/components/dashboard/ReadinessDashboard.svelte';
  import axiosInstance from '$lib/axios';
  import { toast } from 'svelte-sonner';
  import {
    READINESS_TYPES,
    baselineFromStoredLevels,
    unratedBaseline
  } from '$lib/readiness-baseline';

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
    },
    {
      queryKey: ['readinessRubrics'],
      queryFn: () => getData(`/readinesslevel/rubrics`, access!)
    }
  ]);
  const { isLoading, isError } = $derived(
    useQueriesState($readinessLevelQueries)
  );

  const readinessTypeOptions = READINESS_TYPES;

  const levelRubrics = $derived($readinessLevelQueries[4]?.data ?? []);

  let baselineScores = $state(unratedBaseline());
  let savingBaselineScores = $state(false);
  let revising = $state(false);

  // Seed from the stored rows before showing the form. Without this the six
  // selects sit at 1 and a Save overwrites every real level.
  const startRevision = () => {
    baselineScores = baselineFromStoredLevels($readinessLevelQueries[3].data);
    revising = true;
  };

  const cancelRevision = () => {
    revising = false;
  };

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

    // Ascending, because the endpoint returns insertion order and the levels
    // rendered 9, 6, 5, 7, 3 down the page.
    const forType = (type: string) =>
      query.data
        .filter((r: any) => r.readinessType === type)
        .sort((a: any, b: any) => a.level - b.level);

    return {
      technology: forType('Technology'),
      market: forType('Market'),
      acceptance: forType('Acceptance'),
      organizational: forType('Organizational'),
      regulatory: forType('Regulatory'),
      investment: forType('Investment')
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
        (r: any) => r.readinessLevel?.readinessType === 'Technology'
      ),
      market: query.data.filter(
        (r: any) => r.readinessLevel?.readinessType === 'Market'
      ),
      acceptance: query.data.filter(
        (r: any) => r.readinessLevel?.readinessType === 'Acceptance'
      ),
      organizational: query.data.filter(
        (r: any) => r.readinessLevel?.readinessType === 'Organizational'
      ),
      regulatory: query.data.filter(
        (r: any) => r.readinessLevel?.readinessType === 'Regulatory'
      ),
      investment: query.data.filter(
        (r: any) => r.readinessLevel?.readinessType === 'Investment'
      )
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
      revising = false;
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


<div class="flex h-full flex-col">
  {#if isLoading}
    {@render loading()}
  {:else if isError}
    {@render error()}
  {:else if isRated()}
    {@render rated()}
  {:else if canRateReadiness(role)}
    {@render mentor()}
  {:else}
    <div class="mt-10 text-center text-2xl font-bold">
      <p>Looks like you haven't been rated yet...</p>
    </div>
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
  <div class="glass-card flex flex-col items-center justify-center p-12 text-center">
    <p class="text-lg font-semibold text-foreground">Failed to load readiness data</p>
    <p class="mt-2 text-sm text-muted-foreground">Please try again or contact support.</p>
  </div>
{/snippet}

{#snippet rated()}
  <div class="flex h-full flex-col gap-3">
    {#if canRateReadiness(role)}
      {#if revising}
        {@render mentor(true)}
      {:else}
        <div class="flex justify-end">
          <Button variant="outline" onclick={startRevision}>
            Revise baseline scores
          </Button>
        </div>
      {/if}
    {/if}
    {#if !revising}
    <Can role={['Mentor', 'Manager']} userRole={role}>
      <div class="flex justify-between">
        <div class="flex h-fit justify-between rounded-lg bg-background">
          <Tabs.Root value={selectedTab}>
            <Tabs.List class="border border-border">
              <Tabs.Trigger value="chart" onclick={() => updateTab('chart')}>
                Dashboard
              </Tabs.Trigger>
              <Tabs.Trigger
                value="detailed"
                onclick={() => updateTab('detailed')}
              >
                Levels
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
        </div>
        {#if selectedTab === 'detailed'}
          <div class="flex h-fit justify-between rounded-lg bg-background">
            <Tabs.Root value={selectedReadinessTab}>
              <Tabs.List class="border border-border">
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
    {/if}
  </div>
{/snippet}

{#snippet mentor(isRevision = false)}
  <div
    class="glass-card mx-auto w-full max-w-4xl p-6"
  >
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        Mentor action
      </p>
      <h2 class="mt-2 text-2xl font-black tracking-tight text-foreground">
        {isRevision ? 'Revise baseline scores' : 'Assign baseline scores'}
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {isRevision
          ? 'These are the levels currently on record. Saving overwrites them for every dimension.'
          : 'Set one baseline level per readiness dimension. These values unlock the weighted readiness dashboard and RNA generation.'}
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      {#each readinessTypeOptions as readinessType}
        <div class="glass-card flex flex-col gap-2 p-4">
          <span class="text-sm font-bold text-foreground">{readinessType}</span>
          <Select.Root
            type="single"
            value={String(baselineScores[readinessType])}
            onValueChange={(value) => {
              baselineScores = {
                ...baselineScores,
                [readinessType]: Number(value)
              };
            }}
          >
            <Select.Trigger class="h-10 w-full">
              Level {baselineScores[readinessType]}
            </Select.Trigger>
            <Select.Content>
              {#each Array.from({ length: 9 }, (_, index) => index + 1) as level}
                <Select.Item value={String(level)}>Level {level}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <ReadinessLevelGuide
            {readinessType}
            rubrics={levelRubrics}
            selectedLevel={baselineScores[readinessType]}
          />
        </div>
      {/each}
    </div>

    <div class="flex justify-end gap-2">
      {#if isRevision}
        <Button
          variant="outline"
          onclick={cancelRevision}
          disabled={savingBaselineScores}
        >
          Cancel
        </Button>
      {/if}
      <Button
        variant="glass-primary"
        onclick={submitBaselineScores}
        disabled={savingBaselineScores}
      >
        {#if savingBaselineScores}
          Saving...
        {:else}
          Save baseline scores
        {/if}
      </Button>
    </div>
  </div>
{/snippet}
