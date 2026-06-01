<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { ShieldAlert, ShieldCheck, ArrowDownRight, ArrowUpRight, Database, Edit2, Check, X, SearchX } from 'lucide-svelte';
  import { env } from '$env/dynamic/public';
  const PUBLIC_API_URL = env.PUBLIC_API_URL || '';

  export let data: { audits: any[]; access: string };
  let audits = data.audits ?? [];
  let overridingId: number | null = null;
  let overrideValue: number | null = null;
  let overriding = false;

  async function overrideAudit(id: number) {
    if (overrideValue === null) return;
    overriding = true;
    try {
      const res = await fetch(`${PUBLIC_API_URL}/admin/ai/bias-audits/override/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.access}` },
        body: JSON.stringify({ correctedScore: overrideValue })
      });
      if (res.ok) {
        const updated = await res.json();
        audits = audits.map(a => (a.id === id ? updated : a));
        overridingId = null;
        overrideValue = null;
      }
    } catch (e) {
      // ignore
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

  <div class="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
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
                </td>
                <td class="px-6 py-5">
                  {#if a.biasFlagged}
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
                    <div class="flex items-center justify-end gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                      <Input type="number" bind:value={overrideValue} class="w-20 h-9 text-center bg-background/50" />
                      <Button size="sm" onclick={() => overrideAudit(a.id)} disabled={overriding} class="h-9 w-20 shadow-sm transition-all">
                        {#if overriding}
                          <span class="animate-pulse">...</span>
                        {:else}
                          <Check class="h-4 w-4 mr-1.5" /> Save
                        {/if}
                      </Button>
                      <Button size="icon" variant="ghost" class="h-9 w-9 text-muted-foreground hover:text-destructive" onclick={() => { overridingId = null; overrideValue = null; }} disabled={overriding}>
                        <X class="h-4 w-4" />
                      </Button>
                    </div>
                  {:else}
                    <Button variant="outline" size="sm" onclick={() => { overridingId = a.id; overrideValue = a.correctedScore ?? a.rawScore; }} class="transition-all hover:bg-muted/80">
                      <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Override
                    </Button>
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
