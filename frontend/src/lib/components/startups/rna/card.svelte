<script lang="ts">
  import RnaViewEditDeleteAiDialog from './view-edit-delete-ai-dialog.svelte';
  import RnaViewEditDeleteDialog from './view-edit-delete-dialog.svelte';
  import {
    Cpu,
    TrendingUp,
    CheckCircle2,
    Building2,
    ShieldCheck,
    Wallet
  } from 'lucide-svelte';

  let { rna, update, deleteRna, addToRna, role, readinessData } = $props();

  let open = $state(false);

  const closeDialog = () => {
    open = false;
  };

  // Card preview strips tags first — slicing raw HTML by character count can
  // cut mid-tag and hand @html malformed markup.
  const previewText = (html: string, limit = 150): string => {
    const plain = html.replace(/<[^>]*>/g, '');
    return plain.length > limit ? `${plain.slice(0, limit)}...` : plain;
  };

  const dimensionIcon: Record<string, any> = {
    Technology: Cpu,
    Market: TrendingUp,
    Acceptance: CheckCircle2,
    Organizational: Building2,
    Regulatory: ShieldCheck,
    Investment: Wallet
  };
  const Icon = $derived(dimensionIcon[rna.readinessLevel.readinessType] ?? Cpu);
</script>

<div
  class="lu-card group flex h-full cursor-pointer flex-col gap-3 rounded-2xl border border-[#1f2c47] bg-[#0b1220] p-5 hover:border-[#2b3a5c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
  role="button"
  tabindex={0}
  onclick={() => {
    open = true;
  }}
  onkeydown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open = true;
    }
  }}
>
  <div class="flex items-start justify-between gap-2">
    <div class="flex min-w-0 items-center gap-3">
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] border border-[#2b3a5c] bg-[#111b2e] transition-colors duration-quick group-hover:border-[#4f46e5]/70"
        aria-hidden="true"
      >
        <Icon class="h-4 w-4 text-[#c7d2fe]" />
      </span>
      <h3 class="truncate text-[15px] font-semibold text-white">
        {rna.readinessLevel.readinessType}
      </h3>
    </div>
    <span class="lu-chip-sm shrink-0">
      {rna.isAiGenerated ? 'AI draft' : 'Approved'}
    </span>
  </div>

  <p class="flex-1 break-words text-[13.5px] leading-relaxed text-[#94a3b8]">
    {previewText(rna.rna)}
  </p>

  <div
    class="flex items-center justify-between border-t border-[#17213a] pt-3 text-[12.5px] text-[#94a3b8]"
  >
    <span>Current level</span>
    <span class="lu-chip-sm">{rna.readinessLevel.level}</span>
  </div>
</div>

{#if role === 'Startup'}
  <RnaViewEditDeleteDialog
    bind:open
    {rna}
    {update}
    {deleteRna}
    {readinessData}
    {closeDialog}
    {addToRna}
    {role}
  />
{:else}
  <RnaViewEditDeleteAiDialog
    bind:open
    {rna}
    {update}
    {deleteRna}
    {readinessData}
    {closeDialog}
    {addToRna}
    {role}
  />
{/if}
