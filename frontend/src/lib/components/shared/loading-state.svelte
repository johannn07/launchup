<script lang="ts">
  import Card from '$lib/components/ui/card/card.svelte';
  import { cn } from '$lib/utils.js';

  let {
    variant = 'skeleton',
    columns = 3,
    rows = 2,
    class: className
  }: {
    variant?: 'skeleton' | 'spinner';
    columns?: number;
    rows?: number;
    class?: string;
  } = $props();
</script>

{#if variant === 'spinner'}
  <div class={cn('flex items-center justify-center py-16', className)}>
    <div class="glass-card flex flex-col items-center gap-4 p-8">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary"></div>
      <p class="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
{:else}
  <div class={cn('grid gap-4', className)} style="grid-template-columns: repeat({columns}, 1fr)">
    {#each Array(rows * columns) as _}
      <Card variant="glass">
        <div class="p-5 space-y-3">
          <div class="h-4 w-3/4 rounded-full bg-muted animate-pulse"></div>
          <div class="space-y-2">
            <div class="h-3 w-full rounded-full bg-muted animate-pulse"></div>
            <div class="h-3 w-5/6 rounded-full bg-muted animate-pulse"></div>
          </div>
          <div class="flex gap-2 pt-2">
            <div class="h-6 w-16 rounded-full bg-muted animate-pulse"></div>
            <div class="h-6 w-20 rounded-full bg-muted animate-pulse"></div>
          </div>
        </div>
      </Card>
    {/each}
  </div>
{/if}
