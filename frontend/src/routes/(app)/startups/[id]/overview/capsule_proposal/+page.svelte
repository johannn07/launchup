<script lang="ts">
  import { Label } from '$lib/components/ui/label/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textareav2';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import axiosInstance from '$lib/axios';
  import { useQuery } from '@sveltestack/svelte-query';
  import type { PageData } from './$types';
  import { toast } from 'svelte-sonner';
  import { Save, Loader, Eye, Upload } from 'lucide-svelte';

  let { data }: { data: PageData } = $props();

  // Mentors review the proposal; founders and Managers edit it. Was a
  // substring test on the role name, which only excluded Mentor by accident.
  const readOnly = $derived(data.role === 'Mentor');

  const queryResult = useQuery(
    ['startupData', data.startupId],
    async () =>
      (
        await axiosInstance.get(`/startups/${data.startupId}`, {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        })
      ).data,
    {
      cacheTime: 0,
      staleTime: 0,
      refetchOnWindowFocus: false
    }
  );

  // Local state for editing
  let title = $state('');
  let description = $state('');
  let problemStatement = $state('');
  let targetMarket = $state('');
  let solution = $state('');
  let objectives = $state('');
  let scope = $state('');
  let methodology = $state('');
  let saving = $state(false);
  let extracting = $state(false);
  // Name of the file the unsaved fields came from; cleared on save.
  let extractedFrom = $state('');
  let fileInput: HTMLInputElement | undefined = $state();

  // Fills the form from a new file without saving, so the founder reviews the
  // extraction first. Saving goes through the same PATCH as a typed edit.
  async function extractFromFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    (event.currentTarget as HTMLInputElement).value = '';
    if (!file) return;

    extracting = true;
    try {
      const body = new FormData();
      body.append('capsuleProposal', file);
      // fetch, not axios: the instance's JSON Content-Type would override the
      // multipart boundary.
      const response = await fetch('/api/startups/parse-capsule-proposal', {
        method: 'POST',
        body
      });
      const extracted = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(
          `${extracted?.message || 'Could not read that file.'} You can still edit the fields directly.`
        );
        return;
      }
      if (extracted.legibilityStatus === 'failed') {
        toast.error(
          `That image could not be read${extracted.legibilityReason ? `: ${extracted.legibilityReason}` : '.'} Try a clearer image or a PDF.`
        );
        return;
      }

      title = extracted.title || title;
      description = extracted.startup_description || '';
      problemStatement = extracted.problem_statement || '';
      targetMarket = extracted.target_market || '';
      solution = extracted.solution_description || '';
      objectives = Array.isArray(extracted.objectives)
        ? extracted.objectives.join('\n')
        : extracted.objectives || '';
      scope = extracted.scope || '';
      methodology = extracted.methodology || '';
      extractedFrom = file.name;
    } catch {
      toast.error(
        'Network error while reading the file. You can still edit the fields directly.'
      );
    } finally {
      extracting = false;
    }
  }

  // Update local state when data loads
  $effect(() => {
    if ($queryResult.isSuccess && $queryResult.data.capsuleProposal) {
      const proposal = $queryResult.data.capsuleProposal;
      title = proposal.title || '';
      description = proposal.description || '';
      problemStatement = proposal.problemStatement || '';
      targetMarket = proposal.targetMarket || '';
      // Map solutionDescription from backend to solution in frontend
      solution = proposal.solutionDescription || '';
      // Join objectives array with newlines
      objectives = Array.isArray(proposal.objectives)
        ? proposal.objectives.join('\n')
        : proposal.objectives || '';
      scope = proposal.scope || '';
      methodology = proposal.methodology || '';
    }
  });

  async function saveCapsuleProposal() {
    saving = true;
    try {
      console.log('Saving capsule proposal with data:', {
        title,
        description,
        problemStatement,
        targetMarket,
        solution,
        objectives,
        scope,
        methodology
      });

      const response = await axiosInstance.patch(
        `/startups/${data.startupId}/capsule-proposal`,
        {
          title,
          description,
          problemStatement,
          targetMarket,
          solution,
          objectives,
          scope,
          methodology
        },
        {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        }
      );

      console.log('Capsule proposal saved successfully:', response.data);
      toast.success('Capsule proposal saved successfully');
      extractedFrom = '';
      $queryResult.refetch();
    } catch (error: any) {
      console.error('Error saving capsule proposal:', error);
      console.error('Error response:', error.response?.data);
      toast.error(
        error.response?.data?.message || 'Failed to save capsule proposal'
      );
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex h-[90vh] flex-col gap-5 overflow-y-auto">
  {#if $queryResult.isError}
    <div
      class="border-destructive/30 bg-destructive/10 rounded-md border p-4 text-destructive"
    >
      <p class="font-medium">Failed to load capsule proposal data</p>
      <p class="text-sm">Please try refreshing the page</p>
    </div>
  {:else}
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h1 class="lu-h2">Capsule Proposal</h1>
        {#if readOnly}
          <Badge variant="secondary" class="flex items-center gap-1">
            <Eye class="h-3 w-3" />
            Mentor View - Read Only
          </Badge>
        {/if}
      </div>
      {#if $queryResult.isSuccess && !readOnly}
        <div class="flex items-center gap-2">
          <input
            bind:this={fileInput}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            class="hidden"
            onchange={extractFromFile}
          />
          <Button
            variant="outline"
            onclick={() => fileInput?.click()}
            disabled={extracting || saving}
          >
            {#if extracting}
              <Loader class="mr-2 h-4 w-4 animate-spin" />
              Reading file...
            {:else}
              <Upload class="mr-2 h-4 w-4" />
              Upload new version
            {/if}
          </Button>
          <Button onclick={saveCapsuleProposal} disabled={saving || extracting}>
            {#if saving}
              <Loader class="mr-2 h-4 w-4 animate-spin" />
              Saving...
            {:else}
              <Save class="mr-2 h-4 w-4" />
              Save Changes
            {/if}
          </Button>
        </div>
      {/if}
    </div>
    {#if extractedFrom}
      <div
        class="w-[90%] rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-100/40 dark:bg-amber-900/40 dark:text-amber-100"
      >
        Filled from <span class="font-semibold">{extractedFrom}</span> by the AI.
        Not saved yet: check each field against your document, then Save Changes.
      </div>
    {/if}
    <div class="grid w-[90%] grid-cols-1 gap-5">
      <div class="grid gap-2">
        <Label for="title">Title</Label>
        {#if $queryResult.isLoading}
          <Skeleton class="h-10" />
        {:else}
          <Input
            name="title"
            id="title"
            type="text"
            required
            readonly={readOnly}
            bind:value={title}
          />
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="description">Description</Label>
        {#if $queryResult.isLoading}
          <Skeleton class="h-10" />
        {:else}
          <Textarea
            id="description"
            rows={8}
            readonly={readOnly}
            bind:value={description}
            class="text-justify text-base"
          />
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="problemStatement">Problem Statement</Label>
        {#if $queryResult.isLoading}
          <Skeleton class="h-10" />
        {:else}
          <Textarea
            id="problemStatement"
            rows={8}
            readonly={readOnly}
            bind:value={problemStatement}
            class="text-justify text-base"
          />
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="targetMarket">Target Market</Label>
        {#if $queryResult.isLoading}
          <Skeleton class="h-10" />
        {:else}
          <Textarea
            id="targetMarket"
            rows={8}
            readonly={readOnly}
            bind:value={targetMarket}
            class="text-justify text-base"
          />
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="solution">Solution</Label>
        {#if $queryResult.isLoading}
          <Skeleton class="h-10" />
        {:else}
          <Textarea
            id="solution"
            rows={8}
            readonly={readOnly}
            bind:value={solution}
            class="text-justify text-base"
          />
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="objectives">Objectives</Label>
        {#if $queryResult.isLoading}
          <Skeleton class="h-10" />
        {:else}
          <Textarea
            id="objectives"
            rows={8}
            readonly={readOnly}
            bind:value={objectives}
            class="text-justify text-base"
          />
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="scope">Scope</Label>
        {#if $queryResult.isLoading}
          <Skeleton class="h-10" />
        {:else}
          <Textarea
            id="scope"
            rows={8}
            readonly={readOnly}
            bind:value={scope}
            class="text-justify text-base"
          />
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="methodology">Methodology</Label>
        {#if $queryResult.isLoading}
          <Skeleton class="h-10" />
        {:else}
          <Textarea
            id="methodology"
            rows={8}
            readonly={readOnly}
            bind:value={methodology}
            class="text-justify text-base"
          />
        {/if}
      </div>
    </div>
  {/if}
</div>
