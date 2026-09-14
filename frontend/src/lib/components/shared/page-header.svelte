<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { Snippet } from 'svelte';
  import type { Component } from 'svelte';

  let {
    icon,
    title,
    description,
    actions,
    breadcrumbs,
    class: className
  }: {
    icon?: Component;
    title: string;
    description?: string;
    actions?: Snippet;
    breadcrumbs?: Snippet;
    class?: string;
  } = $props();
</script>

<div class={cn('glass-card mb-6 p-6', className)}>
  {#if breadcrumbs}
    <div class="mb-3">
      {@render breadcrumbs()}
    </div>
  {/if}
  <div class="flex items-start justify-between">
    <div class="flex items-center gap-3">
      {#if icon}
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <svelte:component this={icon} class="h-5 w-5 text-primary" />
        </div>
      {/if}
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {#if description}
          <p class="mt-1 text-sm text-muted-foreground">{description}</p>
        {/if}
      </div>
    </div>
    {#if actions}
      <div class="flex items-center gap-2">
        {@render actions()}
      </div>
    {/if}
  </div>
</div>
