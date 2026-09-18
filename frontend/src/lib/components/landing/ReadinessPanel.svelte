<script lang="ts">
  import { CountUp, arrive } from '$lib/motion';

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
</script>

<div
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
        <CountUp value={target} decimals={1} /><span
          class="text-[20px] text-[#94a3b8]"
        >
          / 9</span
        >
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
      <div class="px-5 py-3 transition-colors hover:bg-[#0f1a2c] sm:px-6">
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
          class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#17213a]"
          aria-hidden="true"
        >
          <!-- Fills when first seen, each bar 60ms after the one above. -->
          <div
            class="lu-fill h-full rounded-full"
            style="width:{(s.level / 9) * 100}%; background:{s.gap
              ? '#fbbf24'
              : '#6366f1'}; transition-delay:{i * 60}ms"
            use:arrive
          ></div>
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
