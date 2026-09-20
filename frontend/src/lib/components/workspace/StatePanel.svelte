<script lang="ts">
  import type { Snippet } from 'svelte';
  import { AlertCircle } from 'lucide-svelte';

  let {
    kind = 'empty',
    title,
    children,
    action
  }: {
    kind?: 'empty' | 'error';
    title: string;
    children?: Snippet;
    action?: Snippet;
  } = $props();
</script>

<!-- Empty and error states share one surface; an error only adds the alert
     role and the danger icon. -->
<div
  class="flex flex-col items-start gap-3 rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] px-6 py-7 sm:px-8"
  role={kind === 'error' ? 'alert' : undefined}
>
  <p class="flex items-center gap-2 text-[15px] font-semibold text-white">
    {#if kind === 'error'}
      <AlertCircle class="h-4 w-4 text-[#fb7185]" />
    {/if}
    {title}
  </p>
  {#if children}
    <p class="max-w-prose text-[14px] leading-relaxed text-[#94a3b8]">
      {@render children()}
    </p>
  {/if}
  {#if action}
    <div class="mt-1">{@render action()}</div>
  {/if}
</div>
