<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte';
  import { cn } from '$lib/utils.js';
  import { AlertCircle } from 'lucide-svelte';

  let {
    title = 'Something went wrong',
    description,
    onRetry,
    class: className
  }: {
    title?: string;
    description?: string;
    onRetry?: () => void;
    class?: string;
  } = $props();
</script>

<div class={cn('glass-card flex flex-col items-center justify-center p-12 text-center', className)}>
  <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
    <AlertCircle class="h-8 w-8 text-destructive" />
  </div>
  <h3 class="text-lg font-semibold text-foreground">{title}</h3>
  {#if description}
    <p class="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
  {/if}
  {#if onRetry}
    <Button variant="outline" class="mt-6" onclick={onRetry}>
      Try Again
    </Button>
  {/if}
</div>
