<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte';
  import { cn } from '$lib/utils.js';
  import type { Component } from 'svelte';

  let {
    icon,
    title,
    description,
    actionLabel,
    onAction,
    class: className
  }: {
    icon?: Component;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    class?: string;
  } = $props();
</script>

<div class={cn('glass-card flex flex-col items-center justify-center p-12 text-center', className)}>
  {#if icon}
    <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
      <svelte:component this={icon} class="h-8 w-8 text-primary" />
    </div>
  {/if}
  <h3 class="text-lg font-semibold text-foreground">{title}</h3>
  {#if description}
    <p class="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
  {/if}
  {#if actionLabel && onAction}
    <Button variant="default" class="mt-6" onclick={onAction}>
      {actionLabel}
    </Button>
  {/if}
</div>
