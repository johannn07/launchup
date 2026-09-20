<script lang="ts">
  import { useQueriesState } from '$lib/stores/useQueriesState.svelte.js';
  import { getData } from '$lib/utils';
  import { useQueries } from '@sveltestack/svelte-query';
  import { RnaCard, RnaCreateDialog } from '$lib/components/startups/rna';
  import { ChevronDown, Loader, Plus, Sparkles } from 'lucide-svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import axiosInstance from '$lib/axios';
  import { toast } from 'svelte-sonner';
  import { StatePanel } from '$lib/components/workspace';
  import { READINESS_TYPES } from '$lib/readiness-dimensions';

  const { data } = $props();
  const { access, startupId } = data;

  const rnaQueries = useQueries([
    {
      queryKey: ['allowRNA', startupId],
      queryFn: () => getData(`/startups/${startupId}/allow-rnas/`, access)
    },
    {
      queryKey: ['rnaData', startupId],
      queryFn: () => getData(`/rna/?startupId=${startupId}`, access)
    },
    {
      queryKey: ['readinessData', startupId],
      queryFn: () =>
        getData(
          `/startups/startup-readiness-level?startupId=${startupId}`,
          access
        )
    },
    {
      queryKey: ['startupData', startupId],
      queryFn: () => getData(`/startups/${startupId}`, access)
    }
  ]);

  const { isLoading, isError } = $derived(useQueriesState($rnaQueries));

  // Cards follow the canonical dimension order, like everything else that
  // lists dimensions.
  const ordered = $derived(
    [...($rnaQueries[1].data ?? [])].sort(
      (a: any, b: any) =>
        READINESS_TYPES.indexOf(a.readinessLevel.readinessType) -
        READINESS_TYPES.indexOf(b.readinessLevel.readinessType)
    )
  );
  $rnaQueries[0].refetch();
  const isAccessible = $derived($rnaQueries[0].data);

  let open = $state(false);
  const onOpenChange = () => {
    open = !open;
  };

  let generatingRNA = $state(false);

  const generateRNA = async () => {
    if (selectedTypes.length === 0) {
      toast.error('Select at least one dimension to generate');
      return;
    }

    generatingRNA = true;
    try {
      await axiosInstance.get(`/rna/${data.startupId}/generate-rna/`, {
        params: { readinessTypes: selectedTypes.join(',') },
        headers: {
          Authorization: `Bearer ${data.access}`
        }
      });
      toast.success('Successfully generated RNA');
      $rnaQueries[1].refetch();
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.message || 'Failed to generate RNA';
      toast.error(msg);
    } finally {
      generatingRNA = false;
    }
  };

  const addToRNA = async (id: number) => {
    try {
      const toBeAdded = $rnaQueries[1].data.find(
        (item: any) => item.id === id
      );
      const existingItem = $rnaQueries[1].data.find(
        (d: any) =>
          d.isAiGenerated === false &&
          d.readinessLevel.readinessType ===
            toBeAdded.readinessLevel.readinessType
      );

      if (existingItem) {
        await axiosInstance.delete(`/rna/${existingItem.id}/`, {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        });
        toast.info('Existing RNA data with the same readiness type deleted');
      }

      await axiosInstance.patch(
        `/rna/${id}/`,
        {
          isAiGenerated: false
        },
        {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        }
      );
      toast.success('Successfully added to RNA');
      $rnaQueries[1].refetch().then(() => (open = false));
    } catch (error: any) {
      console.error(error);
      const msg =
        error.response?.data?.message || 'Failed to add this RNA';
      toast.error(msg);
    }
  };

  const createRNA = async (payload: any) => {
    try {
      const cleanPayload = {
        ...payload,
        readiness_level_id: Number(payload.readiness_level_id),
        startup_id: Number(payload.startup_id)
      };

      await axiosInstance.post(
        '/rna',
        { ...cleanPayload, status },
        {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        }
      );
      toast.success('Successfully created the RNA');
      open = false;
      $rnaQueries[1].refetch();
    } catch (error: any) {
      console.error(error);
      const msg =
        error.response?.data?.message || 'Failed to create the RNA';
      toast.error(msg);
    }
  };

  const editRNA = async (id: number, payload: any) => {
    try {
      await axiosInstance.patch(`/rna/${id}/`, payload, {
        headers: {
          Authorization: `Bearer ${data.access}`
        }
      });
      toast.success('Successfully updated the RNA');
      open = false;
      $rnaQueries[1].refetch();
    } catch (error: any) {
      console.error(error);
      const msg =
        error.response?.data?.message || 'Failed to update the RNA';
      toast.error(msg);
    }
  };

  const deleteRNA = async (id: number, index: number) => {
    try {
      await axiosInstance.delete(`/rna/${Number(id)}/`, {
        headers: {
          Authorization: `Bearer ${data.access}`
        }
      });
      toast.success('Successfully deleted the RNA');
      $rnaQueries[1].refetch();
    } catch (error: any) {
      console.error(error);
      const msg =
        error.response?.data?.message || 'Failed to delete the RNA';
      toast.error(msg);
    }
  };

  const readinessData = $derived(
    $rnaQueries[2].isSuccess
      ? $rnaQueries[2].data
          .slice(-6)
          .sort((a: any, b: any) =>
            a.readinessLevel.readinessType.localeCompare(
              b.readinessLevel.readinessType
            )
          )
      : []
  );

  // Covered dimensions stay listed so a mentor can regenerate one.
  const dimensionOptions = $derived(
    readinessData.map((d: any) => ({
      readinessType: d.readinessLevel.readinessType,
      level: d.readinessLevel.level,
      hasRna:
        $rnaQueries[1].isSuccess &&
        $rnaQueries[1].data.some(
          (rna: any) =>
            rna.readinessLevel.readinessType === d.readinessLevel.readinessType
        )
    }))
  );

  let selectedTypes: string[] = $state([]);

  // Default to the gaps, so "fill what's missing" stays a single click.
  $effect(() => {
    selectedTypes = dimensionOptions
      .filter((d: any) => !d.hasRna)
      .map((d: any) => d.readinessType);
  });

  const toggleDimension = (readinessType: string, checked: boolean) => {
    selectedTypes = checked
      ? [...selectedTypes, readinessType]
      : selectedTypes.filter((t) => t !== readinessType);
  };
</script>


{#if isLoading}
  {@render loading()}
{:else if isError}
  {@render error()}
{:else if isAccessible}
  {@render accessible()}
{:else if !isAccessible}
  {@render inaccessible()}
{:else}
  {@render fallback()}
{/if}

<RnaCreateDialog
  {open}
  {onOpenChange}
  create={createRNA}
  {startupId}
  {readinessData}
/>

{#snippet loading()}
  <div class="flex flex-col gap-4" role="status" aria-label="Loading assessments">
    {#if data.role !== 'Startup'}
      <div class="flex justify-end gap-2.5">
        <span class="lu-skel h-[38px] w-24 rounded-full"></span>
        <span class="lu-skel h-[38px] w-36 rounded-full"></span>
      </div>
    {/if}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each [0, 1, 2] as i (i)}
        <span class="lu-skel h-[11.5rem] rounded-2xl"></span>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet error()}
  <StatePanel kind="error" title="This assessment could not be loaded">
    Refresh the page to try again.
  </StatePanel>
{/snippet}

{#snippet accessible()}
  {#if data.role !== 'Startup'}
    <div class="flex flex-wrap items-center justify-end gap-2.5">
      <button
        type="button"
        class="lu-btn lu-btn-secondary lu-btn-sm"
        onclick={() => (open = true)}
      >
        <Plus class="h-4 w-4" />
        Add
      </button>
      <div class="lu-split">
        <button
          type="button"
          class="lu-btn lu-btn-primary lu-btn-sm"
          onclick={generateRNA}
          disabled={generatingRNA || selectedTypes.length === 0}
        >
          {#if generatingRNA}
            <Loader class="h-4 w-4 animate-spin" />
            Generating…
          {:else}
            <Sparkles class="h-4 w-4" />
            Generate{selectedTypes.length ? ` (${selectedTypes.length})` : ''}
          {/if}
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="lu-btn lu-btn-primary lu-btn-sm"
            disabled={generatingRNA}
            aria-label="Choose dimensions to generate"
          >
            <ChevronDown class="h-4 w-4" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-72">
            <DropdownMenu.Label class="text-[12.5px] text-[#94a3b8]"
              >Dimensions to generate</DropdownMenu.Label
            >
            <DropdownMenu.Separator />
            {#each dimensionOptions as dimension}
              <DropdownMenu.CheckboxItem
                class="rounded-[10px] py-2"
                closeOnSelect={false}
                checked={selectedTypes.includes(dimension.readinessType)}
                onCheckedChange={(checked) =>
                  toggleDimension(dimension.readinessType, checked)}
              >
                <span class="flex w-full items-center justify-between gap-3">
                  <span class="text-[13.5px] font-medium text-[#f1f5f9]"
                    >{dimension.readinessType}</span
                  >
                  <span class="lu-num text-[12px] text-[#94a3b8]">
                    Level {dimension.level}{dimension.hasRna ? ' · has one' : ''}
                  </span>
                </span>
              </DropdownMenu.CheckboxItem>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  {/if}

  {#if $rnaQueries[1].data.length === 0}
    <StatePanel title="No assessments written yet">
      {#if data.role === 'Startup'}
        Your mentor has not written any yet.
      {:else}
        Generate one per dimension, or add your own.
      {/if}
    </StatePanel>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each ordered as rna (rna.id)}
        <RnaCard
          {rna}
          {readinessData}
          update={editRNA}
          addToRna={addToRNA}
          deleteRna={deleteRNA}
          role={data.role}
        />
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet inaccessible()}
  <StatePanel title="Readiness levels are not rated yet">
    {#if data.role === 'Startup'}
      Your mentor rates each dimension first. This assessment is written from
      those levels.
    {:else}
      Rate this startup's readiness levels first — the assessment is written
      from them.
    {/if}
  </StatePanel>
{/snippet}

{#snippet fallback()}
  <StatePanel kind="error" title="This assessment could not be loaded">
    Refresh the page to try again.
  </StatePanel>
{/snippet}
