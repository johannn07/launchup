<script lang="ts">
  import {
    RatedRubric,
    ReadinessLevelGuide,
    Stepper
  } from '$lib/components/startups/readiness';
  import * as Select from '$lib/components/ui/select';
  import { Segmented, SubmitButton } from '$lib/motion';
  import { StatePanel } from '$lib/components/workspace';
  import { useQueries } from '@sveltestack/svelte-query';
  import { getData, canRateReadiness } from '$lib/utils';
  import { useQueriesState } from '$lib/stores/useQueriesState.svelte.js';
  import Rubric from '$lib/components/startups/readiness/rubric.svelte';
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

  let selectedTab: 'chart' | 'detailed' = $state('chart');
  let selectedReadinessTab = $state('technology');
  const viewOptions = [
    { value: 'chart' as const, label: 'Dashboard' },
    { value: 'detailed' as const, label: 'Levels' }
  ];
  // Spec order, from the one module that declares it.
  const dimensionOptions = READINESS_TYPES.map((name) => ({
    value: name.toLowerCase(),
    label: name
  }));

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
    <StatePanel title="Readiness levels are not rated yet">
      Your mentor sets a baseline level for each dimension. The dashboard and
      the assessment open once that is done.
    </StatePanel>
  {/if}
</div>

{#snippet loading()}
  <div class="flex flex-col gap-4" role="status" aria-label="Loading readiness">
    {#if role !== 'Startup'}
      <span class="lu-skel h-10 w-44 rounded-full"></span>
    {/if}
    <div class="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <span class="lu-skel h-[22rem] rounded-[1.25rem]"></span>
      <span class="lu-skel h-[22rem] rounded-[1.25rem]"></span>
    </div>
  </div>
{/snippet}

{#snippet error()}
  <StatePanel kind="error" title="Readiness data could not be loaded">
    Refresh the page to try again.
  </StatePanel>
{/snippet}

{#snippet rated()}
  <div class="flex h-full flex-col gap-3">
    {#if canRateReadiness(role)}
      {#if revising}
        {@render mentor(true)}
      {:else}
        <div class="flex justify-end">
          <button
            type="button"
            class="lu-btn lu-btn-secondary lu-btn-sm"
            onclick={startRevision}
          >
            Revise baseline levels
          </button>
        </div>
      {/if}
    {/if}
    {#if !revising}
    <Can role={['Mentor', 'Manager']} userRole={role}>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={viewOptions} bind:value={selectedTab} label="View" />
        {#if selectedTab === 'detailed'}
          <Segmented
            options={dimensionOptions}
            bind:value={selectedReadinessTab}
            label="Dimension"
          />
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
    class="mx-auto w-full max-w-4xl space-y-6 rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] p-6 sm:p-7"
  >
    <div>
      <h3 class="lu-d-md text-[18px] leading-tight text-white">
        {isRevision ? 'Revise baseline levels' : 'Assign baseline levels'}
      </h3>
      <p class="mt-1.5 text-[14px] leading-relaxed text-[#94a3b8]">
        {isRevision
          ? 'These are the levels on record. Saving overwrites every dimension.'
          : 'One baseline level per dimension. These unlock the weighted dashboard and the readiness and needs assessment.'}
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      {#each readinessTypeOptions as readinessType}
        <div
          class="flex flex-col gap-2 rounded-2xl border border-[#1f2c47] bg-[#111b2e] p-4"
        >
          <span class="text-[13.5px] font-semibold text-[#f1f5f9]"
            >{readinessType}</span
          >
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
        <button
          type="button"
          class="lu-btn lu-btn-secondary lu-btn-sm"
          onclick={cancelRevision}
          disabled={savingBaselineScores}
        >
          Cancel
        </button>
      {/if}
      <SubmitButton
        small
        type="button"
        status={savingBaselineScores ? 'busy' : 'idle'}
        label="Save baseline levels"
        busyLabel="Saving…"
        doneLabel="Saved"
        onclick={submitBaselineScores}
      />
    </div>
  </div>
{/snippet}
