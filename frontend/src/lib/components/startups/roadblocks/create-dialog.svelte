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
  import { TriangleAlert } from 'lucide-svelte';
  let { open, onOpenChange, create, members, startupId, status } = $props();

  const data = $state({
    description: '',
    fix: '',
    assigneeId: ''
    // startupId: startupId,
    // isAiGenerated: false,
    // status: 4
  });
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Content class="flex h-4/5 max-w-[600px] flex-col rounded-2xl">
    <Dialog.Header class="mb-1 shrink-0 text-left">
      <div class="flex items-center gap-3">
        <div
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10"
        >
          <TriangleAlert class="h-5 w-5 text-primary" />
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#6366f1]">
            Roadblocks
          </p>
          <Dialog.Title class="text-xl font-black tracking-tight text-slate-950 dark:text-white">
            Create New Roadblock
          </Dialog.Title>
        </div>
      </div>
    </Dialog.Header>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
      <div
        class="flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <Label for="username" class="text-sm font-bold text-slate-900 dark:text-white"
          >Description</Label
        >
        <Textarea rows={4} bind:value={data.description} placeholder="Describe the roadblock..." />
      </div>

      <div
        class="flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <Label for="username" class="text-sm font-bold text-slate-900 dark:text-white"
          >Fix</Label
        >
        <Textarea rows={4} bind:value={data.fix} placeholder="How can this be resolved?" />
      </div>

      <div
        class="flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <Label for="name" class="text-sm font-bold text-slate-900 dark:text-white"
          >Assignee</Label
        >
        <Select.Root type="single" bind:value={data.assigneeId}>
          <Select.Trigger class="flex w-full items-center justify-between gap-2">
            <span class={!data.assigneeId ? 'text-slate-500' : ''}>
              {data.assigneeId
                ? `${members.filter((member: any) => member.userId === data.assigneeId)[0].firstName} ${members.filter((member: any) => member.userId === data.assigneeId)[0].lastName}`
                : 'Select assignee'}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each members as member}
              <Select.Item value={member.userId}
                >{member.firstName} {member.lastName}</Select.Item
              >
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    <Dialog.Footer class="shrink-0 border-t border-slate-200/60 pt-4 dark:border-white/10">
      <Button
        class="rounded-xl bg-[#6366f1] text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6366f1] hover:shadow-[0_8px_24px_rgba(99,102,241,0.4)] disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
        onclick={() => {
          create({
            ...data,
            assigneeId: data.assigneeId ? Number(data.assigneeId) : undefined,
            startupId: Number(startupId),
            status: status,
            isAiGenerated: false
          });

          data.description = '';
          data.fix = '';
          data.assigneeId = '';
        }}
        disabled={data.description === '' || data.fix === ''}>Create</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>