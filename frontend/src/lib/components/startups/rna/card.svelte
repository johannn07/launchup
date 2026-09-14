<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import { RnaViewEditDeleteAiDialog, RnaViewEditDeleteDialog } from '.';
  import { Cpu, TrendingUp, CheckCircle2, Building2, ShieldCheck, Wallet } from 'lucide-svelte';

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
  const Icon = $derived(
    dimensionIcon[rna.readinessLevel.readinessType] ?? Cpu
  );
</script>

<Card.Root
  class="group h-full min-w-[calc(25%-1.25rem*3/4)] cursor-pointer overflow-hidden border-border/50 bg-card/60 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
  <Card.Content class="flex h-full flex-col gap-3 p-5">
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 transition-colors group-hover:bg-primary/20"
        >
          <Icon class="h-4 w-4 text-primary" />
        </div>
        <h2 class="text-base font-semibold leading-none tracking-tight">
          {rna.readinessLevel.readinessType}
        </h2>
      </div>
      {#if rna.isAiGenerated}
        <Badge
          class="shrink-0 border border-amber-500/30 bg-amber-600/90 text-amber-100"
          >AI Draft</Badge
        >
      {:else}
        <Badge
          class="shrink-0 border border-emerald-500/30 bg-emerald-600/90 text-emerald-100"
          >Approved</Badge
        >
      {/if}
    </div>
    <p class="flex-1 break-words text-sm leading-relaxed text-muted-foreground">
      {previewText(rna.rna)}
    </p>
    <div
      class="flex items-center justify-between border-t border-border/50 pt-3 text-sm text-muted-foreground"
    >
      <span>Current Level</span>
      <Badge variant="secondary">{rna.readinessLevel.level}</Badge>
    </div>
  </Card.Content>
</Card.Root>

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
