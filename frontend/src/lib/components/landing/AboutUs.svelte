<script lang="ts">
  import { reveal } from './reveal';

  // Provenance of the scoring rubric, as seeded in rag_contexts. Only the TRL
  // rows are transcribed from a public standard — the rest say so plainly.
  const rubric = [
    { name: 'Technology', code: 'TRL', source: 'EU Horizon Europe, ISO 16290' },
    { name: 'Market', code: 'MRL', source: 'Authored against BRLa (2021)' },
    { name: 'Acceptance', code: 'ARL', source: 'Authored against BRLa (2021)' },
    {
      name: 'Organizational',
      code: 'ORL',
      source: 'Authored against BRLa (2021)'
    },
    { name: 'Regulatory', code: 'RRL', source: 'Authored against BRLa (2021)' },
    {
      name: 'Investment',
      code: 'IRL',
      source: 'Authored in-house, no external standard',
      flag: true
    }
  ];
</script>

<section id="aboutus" class="scroll-mt-16">
  <div
    class="mx-auto grid w-[min(72rem,88vw)] items-center gap-12 py-24 lg:grid-cols-[1fr_0.92fr] lg:gap-16"
  >
    <div use:reveal>
      <p class="lu-chip">About the platform</p>
      <h2
        class="lu-d-xw mt-6 text-[32px] leading-[1.08] text-white sm:text-[42px]"
      >
        About LaunchUp
      </h2>
      <p class="mt-5 max-w-[56ch] text-[17.5px] leading-[1.75] text-[#94a3b8]">
        LaunchUp is a dedicated program designed to support startups on their
        path to success. It provides essential resources and guidance to
        innovative entrepreneurs, with a specific focus on incubation and
        acceleration.
      </p>

      <dl class="mt-8 grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl border border-[#1f2c47] bg-[#0b1220] p-4">
          <dt class="text-[13px] text-[#94a3b8]">Focus</dt>
          <dd class="lu-d-md mt-1.5 text-[15px] text-white">Founders first</dd>
        </div>
        <div class="rounded-2xl border border-[#1f2c47] bg-[#0b1220] p-4">
          <dt class="text-[13px] text-[#94a3b8]">Method</dt>
          <dd class="lu-d-md mt-1.5 text-[15px] text-white">
            Grounded scoring
          </dd>
        </div>
        <div class="rounded-2xl border border-[#1f2c47] bg-[#0b1220] p-4">
          <dt class="text-[13px] text-[#94a3b8]">Outcome</dt>
          <dd class="lu-d-md mt-1.5 text-[15px] text-white">
            Clear next steps
          </dd>
        </div>
      </dl>
    </div>

    <!-- Answers the question the hero raises: where does a level come from? -->
    <div use:reveal={60}>
      <div
        class="overflow-hidden rounded-[1.75rem] border border-[#1f2c47] bg-[#0b1220]"
      >
        <div class="border-b border-[#17213a] px-6 py-4">
          <p class="lu-d-md text-[15px] text-white">
            What each scale is measured against
          </p>
        </div>

        <ul class="divide-y divide-[#17213a] text-[14px]">
          {#each rubric as r (r.code)}
            <li class="flex items-baseline justify-between gap-4 px-6 py-3.5">
              <span class="font-semibold text-[#f1f5f9]">
                {r.name}
                <span class="lu-num text-[12px] font-medium text-[#818cf8]"
                  >{r.code}</span
                >
              </span>
              <span
                class="text-right {r.flag
                  ? 'text-[#fbbf24]'
                  : 'text-[#94a3b8]'}"
              >
                {r.source}
              </span>
            </li>
          {/each}
        </ul>

        <div class="border-t border-[#17213a] bg-[#111b2e] px-6 py-4">
          <p class="text-[12.5px] leading-[1.6] text-[#94a3b8]">
            Published per scale so a score can be argued with rather than taken
            on trust.
          </p>
        </div>
      </div>
    </div>
  </div>
</section>
