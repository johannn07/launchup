<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { PUBLIC_API_URL } from '$env/static/public';
  import { Layers, Plus, Save, Trash2, Settings2, Code, Loader2, Check } from 'lucide-svelte';

  import { toast } from 'svelte-sonner';

  export let data: { tiers: any[]; access: string };
  // Store the string representation of weights for editing
  let tiers = (data.tiers ?? []).map(t => ({
    ...t,
    weightsStr: t.weights ? JSON.stringify(t.weights, null, 2) : ''
  }));
  let saving = false;
  let saveSuccess = false;

  function addTier() {
    tiers = [...tiers, { tierLabel: 'New', threshold: 0, weights: null, weightsStr: '' }];
  }

  function removeTier(i: number) {
    tiers = tiers.filter((_, idx) => idx !== i);
  }

  async function save() {
    saving = true;
    saveSuccess = false;
    try {
      const payload = tiers.map(t => {
        let w = null;
        if (t.weightsStr && t.weightsStr.trim().length > 0) {
          try {
            w = JSON.parse(t.weightsStr);
          } catch(e) {
            throw new Error(`Invalid JSON in weights for ${t.tierLabel}`);
          }
        }
        return { tierLabel: t.tierLabel, threshold: Number(t.threshold), weights: w };
      });

      const res = await fetch(`${PUBLIC_API_URL}/admin/tiers/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.access}` },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to save');
      }
      
      saveSuccess = true;
      toast.success('Tier configs saved successfully!');
      setTimeout(() => { saveSuccess = false; }, 2000);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-8 max-w-7xl mx-auto pb-12">
  <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
        <Layers class="h-8 w-8 text-primary opacity-80" />
        Dynamic Tiers
      </h1>
      <p class="mt-2 text-muted-foreground">
        Configure thresholds and mathematical weights for startup classification tiers.
      </p>
    </div>
    <div class="flex gap-2">
      <Button variant="outline" onclick={addTier} class="gap-2 shadow-sm transition-all hover:-translate-y-0.5">
        <Plus class="h-4 w-4" />
        Add Tier
      </Button>
      <Button onclick={save} disabled={saving} class="relative w-32 overflow-hidden transition-all duration-300 shadow-sm hover:-translate-y-0.5">
        {#if saving}
          <div class="absolute inset-0 flex items-center justify-center bg-primary">
            <Loader2 class="h-4 w-4 animate-spin text-primary-foreground" />
          </div>
        {:else if saveSuccess}
          <div class="absolute inset-0 flex items-center justify-center bg-green-500 text-white transition-transform duration-300">
            <Check class="h-5 w-5" />
          </div>
        {:else}
          <span class="flex items-center gap-2 transition-opacity duration-300">
            <Save class="h-4 w-4" /> Save Configs
          </span>
        {/if}
      </Button>
    </div>
  </div>

  <div class="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
    <div class="bg-muted/40 flex items-center justify-between border-b border-border/50 px-6 py-4">
      <h2 class="font-semibold text-foreground flex items-center gap-2">
        <Settings2 class="h-4 w-4 text-muted-foreground" />
        Tier Configurations
      </h2>
      {#if tiers.length}
        <span class="text-xs font-medium text-muted-foreground bg-background/50 px-2.5 py-1 rounded-full border border-border/30">
          {tiers.length} {tiers.length === 1 ? 'tier' : 'tiers'}
        </span>
      {/if}
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-muted/40 border-b border-border/50">
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground w-[20%]">Label</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground w-[20%]">Threshold</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Weights (JSON)</th>
            <th class="px-6 py-4 text-right font-semibold text-muted-foreground w-[10%]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if tiers.length === 0}
            <tr>
              <td colspan="4" class="px-6 py-16 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center space-y-4">
                  <div class="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center border border-border/50">
                    <Layers class="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p class="text-lg font-medium">No tiers configured</p>
                  <p class="text-sm opacity-80">Add a tier to define classification thresholds.</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each tiers as t, i}
              <tr class="hover:bg-muted/30 group border-b border-border/50 transition-colors last:border-0">
                <td class="px-6 py-4">
                  <Input bind:value={t.tierLabel} class="bg-background/50 font-medium" placeholder="e.g. Gold" />
                </td>
                <td class="px-6 py-4">
                  <Input type="number" bind:value={t.threshold} class="bg-background/50" />
                </td>
                <td class="px-6 py-4">
                  <div class="relative">
                    <Code class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/50" />
                    <Input bind:value={t.weightsStr} placeholder={`{"engagement":0.5}`} class="bg-background/50 pl-9 font-mono text-xs" />
                  </div>
                </td>
                <td class="px-6 py-4 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onclick={() => removeTier(i)}
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
