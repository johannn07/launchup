<script lang="ts">
  import { useQueriesState } from '$lib/stores/useQueriesState.svelte.js';
  import { cn, getData } from '$lib/utils';
  import { useQueries } from '@sveltestack/svelte-query';
  import { RnaCard, RnaCreateDialog } from '$lib/components/startups/rna';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { ChevronDown, Loader, Plus, Sparkles } from 'lucide-svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import axiosInstance from '$lib/axios';
  import { toast } from 'svelte-sonner';
  import { Skeleton } from '$lib/components/ui/skeleton';

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
    const toBeAdded = $rnaQueries[1].data.find((item: any) => item.id === id);
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
    toast.success('Successfuly added to RNA');
    $rnaQueries[1].refetch().then(() => (open = false));
  };

  const createRNA = async (payload: any) => {
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
  };

  const editRNA = async (id: number, payload: any) => {
    await axiosInstance.patch(`/rna/${id}/`, payload, {
      headers: {
        Authorization: `Bearer ${data.access}`
      }
    });
    toast.success('Successfuly updated the RNA');
    open = false;
    $rnaQueries[1].refetch();
  };

  const deleteRNA = async (id: number, index: number) => {
    await axiosInstance.delete(`/rna/${Number(id)}/`, {
      headers: {
        Authorization: `Bearer ${data.access}`
      }
    });
    toast.success('Successfuly deleted the RNA');
    $rnaQueries[1].refetch();
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

<svelte:head>
  <title
    >{$rnaQueries[3].isSuccess
      ? `${$rnaQueries[3].data.name} - Readiness and Needs Assessment`
      : 'Loading'}</title
  >
</svelte:head>

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
  <div class="flex h-full flex-col gap-3">
    {#if data.role !== 'Startup'}
      <div class="flex justify-between">
        <div class="bg-background">
          <Skeleton class="h-9 w-[127px]" />
        </div>
        <div class="ml-auto bg-background">
          <Skeleton class="h-9 w-[82px]" />
        </div>
      </div>
    {/if}

    <div class="grid h-full grid-cols-4 gap-5">
      <div class="h-full w-full bg-background">
        <Skeleton class="h-[180px]" />
      </div>
      <div class="h-full w-full bg-background">
        <Skeleton class="h-[180px]" />
      </div>
      <div class="h-full w-full bg-background">
        <Skeleton class="h-[180px]" />
      </div>
    </div>
  </div>
{/snippet}

{#snippet error()}{/snippet}

{#snippet accessible()}
  <div class="flex items-center justify-between">
    <div class="ml-auto flex items-center gap-3">
      {#if data.role !== 'Startup'}
        <Button onclick={() => (open = true)}
          ><Plus class="h-4 w-4" />Add</Button
        >

        <div class="flex">
          <Button
            class="rounded-r-none"
            onclick={generateRNA}
            disabled={generatingRNA || selectedTypes.length === 0}
          >
            {#if generatingRNA}
              <Loader class="mr-2 h-4 w-4 animate-spin" />
              Generating...
            {:else}
              <Sparkles class="h-4 w-4" />
              Generate{selectedTypes.length ? ` (${selectedTypes.length})` : ''}
            {/if}
          </Button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class={cn(
                buttonVariants(),
                'border-primary-foreground/25 rounded-l-none border-l px-2'
              )}
              disabled={generatingRNA}
            >
              <span class="sr-only">Choose dimensions</span>
              <ChevronDown class="h-4 w-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              class="w-64"
              preventScroll={false}
            >
              <DropdownMenu.Label>Dimensions to generate</DropdownMenu.Label>
              <DropdownMenu.Separator />
              {#each dimensionOptions as dimension}
                <DropdownMenu.CheckboxItem
                  closeOnSelect={false}
                  checked={selectedTypes.includes(dimension.readinessType)}
                  onCheckedChange={(checked) =>
                    toggleDimension(dimension.readinessType, checked)}
                >
                  <div class="flex w-full items-center justify-between gap-3">
                    <span>{dimension.readinessType}</span>
                    <span class="text-xs text-muted-foreground">
                      Level {dimension.level}{dimension.hasRna
                        ? ' · has RNA'
                        : ''}
                    </span>
                  </div>
                </DropdownMenu.CheckboxItem>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      {/if}
    </div>
  </div>

  <div
    class="mt-5 grid max-h-[40rem] w-full grid-cols-4 gap-5 overflow-auto rounded-xl border-2 p-10"
  >
    {#if $rnaQueries[1].data.length === 0}
      <h1 class="text-gray-600">There are currently no RNAs created...</h1>
    {/if}
    {#each $rnaQueries[1].data as rna}
      <RnaCard
        {rna}
        {readinessData}
        update={editRNA}
        addToRna={addToRNA}
        deleteRna={deleteRNA}
        role={data.role}
      ></RnaCard>
    {/each}
  </div>
{/snippet}

{#snippet inaccessible()}
  <div class="mt-10 text-center text-2xl font-bold">
    {#if data.role === 'Startup'}
      Your mentor has not yet rated your startup's readiness levels.
    {:else if data.role === 'Mentor'}
      Please rate your startup's readiness levels to access the Readiness and
      Needs Assessment.
    {:else}
      Something went wrong...
    {/if}
  </div>
{/snippet}

{#snippet fallback()}
  <div class="mt-10 text-center text-2xl font-bold">
    Something went wrong...
  </div>
{/snippet}
