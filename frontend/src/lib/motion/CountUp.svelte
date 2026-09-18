<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { onMount } from 'svelte';
  import { arrive, reducedMotion, SETTLE } from './core';

  let {
    value,
    decimals = 0,
    suffix = '',
    class: cls = ''
  }: { value: number; decimals?: number; suffix?: string; class?: string } = $props();

  const tween = new Tween(0, { duration: SETTLE, easing: cubicOut });
  let arrived = $state(false);
  let mounted = $state(false);

  onMount(() => (mounted = true));

  // Counts up the first time it is seen, then from its current figure to any
  // new value (a filter narrowing a count, a save changing a number).
  $effect(() => {
    const target = value;
    if (!arrived) return;
    tween.set(target, { duration: reducedMotion() ? 0 : SETTLE });
  });

  // SSR and the hydration pass render the real value, so the markup matches
  // and a no-JS reader sees the number. brand.css keeps it hidden until ready.
  const shown = $derived(
    (mounted ? tween.current : value).toLocaleString('en', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  );
  const final = $derived(
    value.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  );
</script>

<!-- The ticking figure is hidden from screen readers; they get the final one. -->
<span class="lu-count lu-num {cls}" use:arrive={() => (arrived = true)}
  ><span aria-hidden="true">{shown}{suffix}</span><span class="sr-only">{final}{suffix}</span
  ></span
>
