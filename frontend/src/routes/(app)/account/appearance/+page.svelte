<script lang="ts" module>
  // The preview bar re-fills on every replay: start empty, then mark ready on
  // the next frame so the width transition runs from zero.
  export function arriveNow(node: HTMLElement) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => (node.dataset.ready = ''))
    );
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { SavedNote } from '$lib/motion';

  type Pref = 'system' | 'reduce';

  let pref = $state<Pref>('system');
  let deviceReduces = $state(false);
  let saved = $state(0);
  let replay = $state(0);

  onMount(() => {
    try {
      pref =
        localStorage.getItem('lu-motion') === 'reduce' ? 'reduce' : 'system';
    } catch {}
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    deviceReduces = mq.matches;
    const onChange = () => {
      deviceReduces = mq.matches;
      apply();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  // Mirrors the inline script in app.html, which applies the same rule on the
  // next page load before first paint.
  function apply() {
    const reduce = pref === 'reduce' || deviceReduces;
    if (reduce) document.documentElement.dataset.motion = 'reduce';
    else delete document.documentElement.dataset.motion;
  }

  function choose(next: Pref) {
    if (next === pref) return;
    pref = next;
    try {
      if (next === 'reduce') localStorage.setItem('lu-motion', 'reduce');
      else localStorage.removeItem('lu-motion');
    } catch {}
    apply();
    saved++;
    replay++;
  }

  const effective = $derived(
    pref === 'reduce' || deviceReduces ? 'reduced' : 'full'
  );
</script>

<svelte:head>
  <title>Appearance — LaunchUp</title>
</svelte:head>

<div class="space-y-6">
  <section
    class="rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220]"
    aria-labelledby="motion-heading"
  >
    <div
      class="flex flex-wrap items-start justify-between gap-4 border-b border-[#17213a] px-6 py-5"
    >
      <div>
        <h2 id="motion-heading" class="lu-d-md text-[17px] text-white">
          Motion
        </h2>
        <p class="mt-1 max-w-[56ch] text-[13.5px] text-[#94a3b8]">
          LaunchUp animates numbers, progress bars and state changes so you can
          see what moved. Reduce it if that motion is distracting or
          uncomfortable.
        </p>
      </div>
      <SavedNote trigger={saved} />
    </div>

    <fieldset class="grid gap-3 px-6 py-6 sm:grid-cols-2">
      <legend class="sr-only">Motion preference</legend>

      {#each [{ v: 'system', t: 'Match my device', d: deviceReduces ? 'Your device asks for reduced motion, so this currently reduces it.' : 'Full motion, unless your device asks for less.' }, { v: 'reduce', t: 'Reduce motion', d: 'Changes happen instantly. Nothing counts, slides or fades.' }] as o (o.v)}
        <label
          class="group flex cursor-pointer gap-3 rounded-[1rem] border p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#818cf8] {pref ===
          o.v
            ? 'border-[#4f46e5]/70 bg-[#4f46e5]/10'
            : 'border-[#1f2c47] hover:border-[#2b3a5c]'}"
        >
          <input
            type="radio"
            name="motion"
            value={o.v}
            checked={pref === o.v}
            onchange={() => choose(o.v as Pref)}
            class="sr-only"
          />
          <span
            class="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors {pref ===
            o.v
              ? 'border-[#4f46e5] bg-[#4f46e5]'
              : 'border-[#2b3a5c]'}"
            aria-hidden="true"
          >
            <span
              class="h-1.5 w-1.5 rounded-full bg-white transition-transform {pref ===
              o.v
                ? 'scale-100'
                : 'scale-0'}"
            ></span>
          </span>
          <span>
            <span class="block text-[15px] font-semibold text-white">{o.t}</span
            >
            <span class="mt-1 block text-[13.5px] leading-[1.55] text-[#94a3b8]"
              >{o.d}</span
            >
          </span>
        </label>
      {/each}
    </fieldset>

    <!-- A live sample, so the choice is felt rather than described. -->
    <div
      class="flex flex-wrap items-center gap-4 border-t border-[#17213a] px-6 py-4"
    >
      <span class="text-[13px] text-[#94a3b8]">
        Preview: <span class="text-white">{effective} motion</span>
      </span>
      <div
        class="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-[#17213a]"
        aria-hidden="true"
      >
        {#key replay}
          <div
            class="lu-fill h-full rounded-full bg-[#6366f1]"
            style="width:72%"
            use:arriveNow
          ></div>
        {/key}
      </div>
      <button
        type="button"
        class="lu-btn lu-btn-secondary lu-btn-sm"
        onclick={() => replay++}
      >
        Replay
      </button>
    </div>
  </section>

  <section
    class="rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] px-6 py-5"
    aria-labelledby="theme-heading"
  >
    <h2 id="theme-heading" class="lu-d-md text-[17px] text-white">Theme</h2>
    <p class="mt-1 text-[13.5px] text-[#94a3b8]">
      LaunchUp uses a single dark theme across every page, so there is nothing
      to choose here.
    </p>
  </section>
</div>
