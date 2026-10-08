<script lang="ts">
  import { READINESS_TYPES } from '$lib/readiness-dimensions';
  import { CountUp, arrive } from '$lib/motion';

  // The six scales are the real ones the backend scores. The levels are
  // illustrative — the panel is labelled as an example for that reason.
  const scalesUnordered = [
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
  // Spec order, from the one module that declares it (upstream d9c7a4a).
  const scales = [...scalesUnordered].sort(
    (a, b) =>
      READINESS_TYPES.indexOf(a.name as (typeof READINESS_TYPES)[number]) -
      READINESS_TYPES.indexOf(b.name as (typeof READINESS_TYPES)[number])
  );

  const target = scales.reduce((a, s) => a + s.level, 0) / scales.length;
  const gapCount = scales.filter((s) => s.gap).length;
</script>

<div
  class="overflow-hidden rounded-[1.75rem] border border-[var(--lu-line-2)] bg-[var(--lu-navy-2)]"
>
  <div
    class="flex items-center justify-between gap-3 border-b border-[var(--lu-line)] px-5 py-4 sm:px-6"
  >
    <p class="lu-d-md text-[15px] text-white">Readiness assessment</p>
    <span
      class="rounded-full border border-[var(--lu-line-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--lu-mute)]"
    >
      Example
    </span>
  </div>

  <div
    class="flex items-end justify-between gap-6 border-b border-[var(--lu-line)] px-5 py-5 sm:px-6"
  >
    <div>
      <p class="text-[12.5px] font-semibold text-[var(--lu-indigo-lite)]">
        Composite readiness level
      </p>
      <p class="lu-d-xw lu-num mt-1 text-[42px] leading-none text-white">
        <CountUp value={target} decimals={1} /><span
          class="text-[20px] text-[var(--lu-mute)]"
        >
          / 9</span
        >
      </p>
    </div>
    <p
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--lu-flag)]/30 bg-[var(--lu-flag)]/10 px-3 py-1.5 text-[12.5px] font-semibold text-[var(--lu-flag)]"
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

  <div class="divide-y divide-[var(--lu-line)]">
    {#each scales as s, i (s.code)}
      <div class="px-5 py-3 transition-colors hover:bg-[#0f1a2c] sm:px-6">
        <div class="flex items-baseline justify-between gap-4">
          <p class="text-[14px] font-semibold text-[var(--lu-cloud)]">
            {s.name}
            <span
              class="lu-num text-[12px] font-medium {s.gap
                ? 'text-[var(--lu-flag)]'
                : 'text-[var(--lu-indigo-lite)]'}"
            >
              {s.code}
            </span>
          </p>
          <p
            class="lu-num lu-d text-[16px] {s.gap
              ? 'text-[var(--lu-flag)]'
              : 'text-white'}"
          >
            {s.level}
          </p>
        </div>

        <div
          class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--lu-line)]"
          aria-hidden="true"
        >
          <!-- Fills when first seen, each bar 60ms after the one above. -->
          <div
            class="lu-fill h-full rounded-full"
            style="width:{(s.level / 9) * 100}%; background:{s.gap
              ? 'var(--lu-flag)'
              : 'var(--lu-indigo)'}; transition-delay:{i * 60}ms"
            use:arrive
          ></div>
        </div>

        {#if s.gap}
          <p class="mt-1.5 text-[12.5px] text-[var(--lu-flag)]">{s.gap}</p>
        {/if}
      </div>
    {/each}
  </div>

  <div class="border-t border-[var(--lu-line)] bg-[var(--lu-navy-3)] px-5 py-4 sm:px-6">
    <p class="text-[12.5px] leading-[1.6] text-[var(--lu-mute)]">
      Each level cites the passage in the application behind it. Gaps are
      returned where no passage supports a score.
    </p>
  </div>
</div>
