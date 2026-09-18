<script lang="ts" generics="T extends string">
  import { onMount } from 'svelte';

  let {
    options,
    value = $bindable(),
    label
  }: {
    options: { value: T; label: string; count?: number }[];
    value: T;
    label: string;
  } = $props();

  let root: HTMLElement;
  let live = $state(false);
  let box = $state({ x: 0, y: 0, w: 0, h: 0 });

  // The indicator is one element that moves to the selected option, so the
  // selection visibly travels instead of one pill fading as another lights.
  function measure() {
    const el = root?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el) return;
    box = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    live = true;
  }

  $effect(() => {
    void value;
    void options;
    queueMicrotask(measure);
  });

  onMount(() => {
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
    value = next.value;
    queueMicrotask(() =>
      root.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
    );
  }
</script>

<div
  bind:this={root}
  class="lu-seg"
  class:lu-seg--live={live}
  role="tablist"
  aria-label={label}
  tabindex="-1"
  onkeydown={onKey}
>
  {#if live}
    <span
      class="lu-seg__ind"
      aria-hidden="true"
      style="width:{box.w}px; height:{box.h}px; transform:translate({box.x}px, {box.y}px)"
    ></span>
  {/if}
  {#each options as o (o.value)}
    <button
      type="button"
      role="tab"
      class="lu-seg__btn"
      aria-selected={value === o.value}
      tabindex={value === o.value ? 0 : -1}
      onclick={() => (value = o.value)}
    >
      {o.label}
      {#if o.count !== undefined}
        <!-- Plain: counts follow the search on every keystroke. -->
        <span class="lu-seg__count lu-num">{o.count}</span>
      {/if}
    </button>
  {/each}
</div>
