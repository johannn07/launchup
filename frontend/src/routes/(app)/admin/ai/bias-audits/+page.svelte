<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { ShieldAlert, ShieldCheck, ShieldQuestion, ArrowDownRight, ArrowUpRight, Database, Edit2, Check, X, SearchX, RefreshCw, UserCheck } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';

  let { data }: { data: { audits: any[]; access: string } } = $props();
  let audits = $state(data.audits ?? []);
  let overridingId: number | null = $state(null);
  let overrideValue: number | null = $state(null);
  let overrideReason = $state('');
  let overriding = $state(false);

  function closeOverride() {
    overridingId = null;
    overrideValue = null;
    overrideReason = '';
  }
  let reevaluatingId: number | null = $state(null);

  // SRS 2.1. Adds a new audit row; the original stays as the record of what ran.
  async function reevaluate(id: number) {
    reevaluatingId = id;
    try {
      const res = await fetch(`/api/admin/ai/bias-audits/${id}/reevaluate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.access}` }
      });
      if (!res.ok) throw new Error(String(res.status));
      const created = await res.json();
      audits = [created, ...audits];
      toast.success(`Re-evaluated as audit #${created.id}: ${created.rawScore} to ${created.correctedScore}`);
    } catch {
      toast.error('Re-evaluation failed. Try again later; it uses the daily AI quota.');
    } finally {
      reevaluatingId = null;
    }
  }

  // SRS 2.1: the Manager overrides a corrected score and enters a justification.
  async function overrideAudit(id: number) {
    const justification = overrideReason.trim();
    if (overrideValue === null || !justification) return;
    overriding = true;
    try {
      const res = await fetch(`/api/admin/ai/bias-audits/override/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.access}` },
        body: JSON.stringify({ correctedScore: overrideValue, justification })
      });
      if (!res.ok) throw new Error(String(res.status));
      const updated = await res.json();
      audits = audits.map(a => (a.id === id ? updated : a));
      closeOverride();
      toast.success(`Audit #${id} overridden`);
    } catch {
      toast.error('Override was not saved. Try again.');
    } finally {
      overriding = false;
    }
  }
</script>

<div class="space-y-8 max-w-7xl mx-auto pb-12">
  <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
        <ShieldAlert class="h-8 w-8 text-primary opacity-80" />
        AI Bias Audits
      </h1>
      <p class="mt-2 text-muted-foreground">
        Review algorithmic adjustments and override AI bias audit corrections globally.
      </p>
    </div>
  </div>

  <div class="glass-card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-muted/40 border-b border-border/50">
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">ID</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Entity</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Original</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Corrected</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Bias Flagged</th>
            <th class="px-6 py-4 text-right font-semibold text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if audits.length === 0}
            <tr>
              <td colspan="6" class="px-6 py-16 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center space-y-4">
                  <div class="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <SearchX class="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p class="text-lg font-medium">No bias audits recorded yet</p>
                  <p class="text-sm opacity-80">AI evaluations will appear here if bias corrections are applied.</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each audits as a}
              <tr class="hover:bg-muted/30 group border-b border-border/50 transition-colors last:border-0">
                <td class="px-6 py-5 font-mono text-xs text-muted-foreground/70">#{a.id}</td>
                <td class="px-6 py-5">
                  <div class="flex flex-col gap-1">
                    <span class="font-medium text-foreground">{a.dimensionKey}</span>
                    <span class="text-xs text-muted-foreground flex items-center gap-1.5 opacity-80">
                      <Database class="h-3 w-3" /> Startup #{a.startup?.id ?? 'Unknown'}
                    </span>
                    {#if a.reevaluationOf}
                      <span class="text-xs text-muted-foreground opacity-80">Re-evaluation of #{a.reevaluationOf}</span>
                    {/if}
                  </div>
                </td>
                <td class="px-6 py-5 text-muted-foreground font-medium">{a.rawScore}</td>
                <td class="px-6 py-5 font-semibold">
                  <div class="flex items-center gap-2">
                    <span class:text-destructive={a.correctedScore < a.rawScore} class:text-green-500={a.correctedScore > a.rawScore}>
                      {a.correctedScore}
                    </span>
                    {#if a.correctedScore < a.rawScore}
                      <ArrowDownRight class="h-4 w-4 text-destructive" />
                    {:else if a.correctedScore > a.rawScore}
                      <ArrowUpRight class="h-4 w-4 text-green-500" />
                    {/if}
                  </div>
                  {#if a.overrideJustification}
                    <p class="mt-1 max-w-[28ch] text-xs font-normal text-muted-foreground">
                      Override reason: {a.overrideJustification}
                    </p>
                  {/if}
                </td>
                <td class="px-6 py-5">
                  <!-- SRS 2.1: the model review never ran, so this score needs a person. -->
                  {#if a.biasStatus === 'bias-unverified'}
                    <Badge variant="outline" class="flex w-fit items-center gap-1.5 text-foreground border-border bg-muted/40" title="The model review did not complete. Check this score manually.">
                      <ShieldQuestion class="h-3 w-3" /> Unverified
                    </Badge>
                  {:else if a.biasStatus === 'overridden'}
                    <Badge variant="outline" class="flex w-fit items-center gap-1.5 text-foreground border-border bg-muted/40" title="A Manager replaced the corrected score.">
                      <UserCheck class="h-3 w-3" /> Overridden
                    </Badge>
                  {:else if a.biasFlagged}
                    <Badge variant="destructive" class="flex w-fit items-center gap-1.5 bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20 shadow-none">
                      <ShieldAlert class="h-3 w-3" /> Flagged
                    </Badge>
                  {:else}
                    <Badge variant="outline" class="flex w-fit items-center gap-1.5 text-muted-foreground border-border/60 bg-muted/20">
                      <ShieldCheck class="h-3 w-3" /> Clear
                    </Badge>
                  {/if}
                </td>
                <td class="px-6 py-5 text-right">
                  {#if overridingId === a.id}
                    <div class="flex items-end justify-end gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                      <div class="flex flex-col gap-1 text-left">
                        <label for="override-score-{a.id}" class="text-xs font-medium text-muted-foreground">Score</label>
                        <Input id="override-score-{a.id}" type="number" bind:value={overrideValue} class="w-20 h-9 text-center bg-background/50" />
                      </div>
                      <div class="flex flex-col gap-1 text-left">
                        <label for="override-reason-{a.id}" class="text-xs font-medium text-muted-foreground">Justification (required)</label>
                        <Input id="override-reason-{a.id}" type="text" bind:value={overrideReason} maxlength={500} class="w-64 h-9 bg-background/50" />
                      </div>
                      <Button size="sm" onclick={() => overrideAudit(a.id)} disabled={overriding || overrideValue === null || !overrideReason.trim()} class="h-9 w-20 shadow-sm transition-all">
                        {#if overriding}
                          <span class="animate-pulse">...</span>
                        {:else}
                          <Check class="h-4 w-4 mr-1.5" /> Save
                        {/if}
                      </Button>
                      <Button size="icon" variant="ghost" class="h-9 w-9 text-muted-foreground hover:text-destructive" onclick={closeOverride} disabled={overriding} aria-label="Cancel override">
                        <X class="h-4 w-4" />
                      </Button>
                    </div>
                  {:else}
                    <div class="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onclick={() => reevaluate(a.id)} disabled={reevaluatingId !== null} title="Run the bias review again. Uses the daily AI quota." class="transition-all hover:bg-muted/80">
                        <RefreshCw class="h-3.5 w-3.5 mr-1.5 {reevaluatingId === a.id ? 'animate-spin' : ''}" />
                        {reevaluatingId === a.id ? 'Re-evaluating' : 'Re-evaluate'}
                      </Button>
                      <Button variant="outline" size="sm" onclick={() => { overridingId = a.id; overrideValue = a.correctedScore ?? a.rawScore; overrideReason = ''; }} class="transition-all hover:bg-muted/80">
                        <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Override
                      </Button>
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
