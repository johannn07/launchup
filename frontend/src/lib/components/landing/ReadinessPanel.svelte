<script lang="ts">
  import { onMount } from 'svelte';

  // The six scales are the real ones the backend scores. The levels are
  // illustrative — the panel is labelled as an example for that reason.
  const scales = [
    { name: 'Technology', code: 'TRL', level: 6 },
    { name: 'Market', code: 'MRL', level: 7 },
    { name: 'Acceptance', code: 'ARL', level: 5 },
    {
      name: 'Organizational',
      code: 'ORL',
      level: 3,
      gap: 'No named operations lead'
    },
    {
      name: 'Regulatory',
      code: 'RRL',
      level: 4,
      gap: 'Accreditation described as "exploring"'
    },
    { name: 'Investment', code: 'IRL', level: 5 }
  ];

  const target = scales.reduce((a, s) => a + s.level, 0) / scales.length;
  const gapCount = scales.filter((s) => s.gap).length;

  let panelEl: HTMLElement;
  let composite = $state('0.0');
  let widths = $state(scales.map(() => 0));
  let tick: ReturnType<typeof setInterval>;

  function run() {
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (reduce) {
      widths = scales.map((s) => (s.level / 9) * 100);
      composite = target.toFixed(1);
      return;
    }

    scales.forEach((s, i) => {
      setTimeout(() => (widths[i] = (s.level / 9) * 100), 80 + i * 90);
    });

    // Driven off elapsed time rather than frames: a hidden tab throttles the
    // tick, but progress still reaches 1 and the score never strands at 0.0.
    const DURATION = 1000;
    const t0 = performance.now();
    tick = setInterval(() => {
      const p = Math.min((performance.now() - t0) / DURATION, 1);
      composite = (target * (1 - Math.pow(1 - p, 3))).toFixed(1);
      if (p >= 1) clearInterval(tick);
    }, 16);
  }

  onMount(() => {
    // Already in view or scrolled past (deep link, scroll restoration): run now,
    // otherwise the observer never fires and the score is stuck at 0.0.
    if (panelEl.getBoundingClientRect().top < window.innerHeight) {
      run();
      return () => clearInterval(tick);
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          run();
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(panelEl);
    return () => {
      obs.disconnect();
      clearInterval(tick);
    };
  });
</script>

<div
  bind:this={panelEl}
  class="overflow-hidden rounded-[1.75rem] border border-[#1f2c47] bg-[#0b1220]"
>
  <div
    class="flex items-center justify-between gap-3 border-b border-[#17213a] px-5 py-4 sm:px-6"
  >
    <p class="lu-d-md text-[15px] text-white">Readiness assessment</p>
    <span
      class="rounded-full border border-[#1f2c47] px-2.5 py-1 text-[11px] font-semibold text-[#94a3b8]"
    >
      Example
    </span>
  </div>

  <div
    class="flex items-end justify-between gap-6 border-b border-[#17213a] px-5 py-5 sm:px-6"
  >
    <div>
      <p class="text-[12.5px] font-semibold text-[#818cf8]">
        Composite readiness level
      </p>
      <p class="lu-d-xw lu-num mt-1 text-[42px] leading-none text-white">
        {composite}<span class="text-[20px] text-[#94a3b8]"> / 9</span>
      </p>
    </div>
    <p
      class="inline-flex items-center gap-1.5 rounded-full border border-[#fbbf24]/30 bg-[#fbbf24]/10 px-3 py-1.5 text-[12.5px] font-semibold text-[#fbbf24]"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" />
      </svg>
      {gapCount} gaps found
    </p>
  </div>

  <div class="divide-y divide-[#17213a]">
    {#each scales as s, i (s.code)}
      <div class="px-5 py-3 sm:px-6">
        <div class="flex items-baseline justify-between gap-4">
          <p class="text-[14px] font-semibold text-[#f1f5f9]">
            {s.name}
            <span
              class="lu-num text-[12px] font-medium {s.gap
                ? 'text-[#fbbf24]'
                : 'text-[#818cf8]'}"
            >
              {s.code}
            </span>
          </p>
          <p
            class="lu-num lu-d text-[16px] {s.gap
              ? 'text-[#fbbf24]'
              : 'text-white'}"
          >
            {s.level}
          </p>
        </div>

        <div
          class="lu-meter mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#17213a]"
          aria-hidden="true"
        >
          <i
            style="width:{widths[i]}%; background:{s.gap
              ? '#fbbf24'
              : '#6366f1'}"
          ></i>
        </div>

        {#if s.gap}
          <p class="mt-1.5 text-[12.5px] text-[#fbbf24]">{s.gap}</p>
        {/if}
      </div>
    {/each}
  </div>

  <div class="border-t border-[#17213a] bg-[#111b2e] px-5 py-4 sm:px-6">
    <p class="text-[12.5px] leading-[1.6] text-[#94a3b8]">
      Each level cites the passage in the application behind it. Gaps are
      returned where no passage supports a score.
    </p>
  </div>
</div>
