<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import { Badge } from '$lib/components/ui/badge';
  import {
    getProfileColor,
    getReadinessLevels,
    getReadinessTypes,
    getStatusName,
    zIndex
  } from '$lib/utils';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Sparkles } from 'lucide-svelte';
  let { open, onOpenChange, create, startupId, readinessData } = $props();

  let data = $state({
    readiness_level_id: '',
    startup_id: startupId,
    rna: '',
    is_ai_generated: false
  });

  $effect(() => {
    if (!open) {
      data = {
        readiness_level_id: '',
        startup_id: startupId,
        rna: '',
        is_ai_generated: false
      };
    }
  });
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Content class="flex h-4/5 max-w-[600px] flex-col rounded-2xl">
    <Dialog.Header class="mb-1 shrink-0 text-left">
      <div class="flex items-center gap-3">
        <div
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10"
        >
          <Sparkles class="h-5 w-5 text-primary" />
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#6366f1]">
            Readiness and Needs Assessment
          </p>
          <Dialog.Title class="text-xl font-black tracking-tight text-slate-950 dark:text-white">
            Create RNA
          </Dialog.Title>
        </div>
      </div>
    </Dialog.Header>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
      <div
        class="flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <div class="flex items-center justify-between gap-3">
          <Label for="name" class="text-sm font-bold text-slate-900 dark:text-white"
            >Type</Label
          >
          {#if data.readiness_level_id}
            <Badge variant="secondary">
              Current Level {readinessData.find(
                (d: any) =>
                  d.readinessLevel.id === Number(data.readiness_level_id)
              )?.readinessLevel.level}
            </Badge>
          {/if}
        </div>
        <Select.Root type="single" bind:value={data.readiness_level_id}>
          <Select.Trigger class="flex w-full items-center justify-between gap-2">
            <span class={!data.readiness_level_id ? 'text-slate-500' : ''}>
              {data.readiness_level_id
                ? readinessData.find(
                    (d: any) =>
                      d.readinessLevel.id === Number(data.readiness_level_id)
                  )?.readinessLevel.readinessType
                : 'Select type'}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each readinessData as type}
              <Select.Item value={`${type.readinessLevel.id}`}
                >{type.readinessLevel.readinessType}</Select.Item
              >
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div
        class="flex flex-1 flex-col gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <Label for="username" class="text-sm font-bold text-slate-900 dark:text-white"
          >Description</Label
        >
        <Textarea rows={10} bind:value={data.rna} placeholder="Describe the RNA..." />
      </div>
    </div>

    <Dialog.Footer class="shrink-0 border-t border-slate-200/60 pt-4 dark:border-white/10">
      <Button
        class="rounded-xl bg-[#6366f1] text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6366f1] hover:shadow-[0_8px_24px_rgba(99,102,241,0.4)] disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
        onclick={() => create(data)}
        disabled={data.readiness_level_id === '' || data.rna === ''}
        >Create</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>