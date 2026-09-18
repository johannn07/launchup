<script lang="ts">
  import {
    ArrowRight,
    Sparkles,
    FileText,
    Rocket,
    TrendingUp
  } from 'lucide-svelte';
  import { reveal } from './reveal';

  const steps = [
    {
      number: '01',
      title: 'Application',
      body: 'Start by submitting your startup application to LaunchUp for evaluation and confirmation.',
      icon: FileText
    },
    {
      number: '02',
      title: 'Incubation and Acceleration',
      body: 'Accepted startups enter the program, gaining mentorship and resources to nurture their concepts towards success.',
      icon: Rocket
    },
    {
      number: '03',
      title: 'Investment-Ready',
      body: 'Incubation and acceleration make your startup investment-ready, benefiting your business and the startup ecosystem.',
      icon: TrendingUp
    }
  ];
</script>

<section id="howitwork" class="scroll-mt-16">
  <div class="mx-auto w-[min(72rem,88vw)] py-24">
    <div class="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
      <div class="max-w-xl" use:reveal>
        <p class="lu-chip">
          <Sparkles class="h-4 w-4 text-[#6366f1]" />
          Designed to reduce friction
        </p>
        <h2
          class="lu-d-xw mt-6 text-[32px] leading-[1.08] text-white sm:text-[42px]"
        >
          How it works should feel obvious, not administrative.
        </h2>
        <p class="mt-5 max-w-[56ch] text-[17px] leading-[1.7] text-[#94a3b8]">
          LaunchUp turns the startup review journey into a clear sequence with
          enough structure to trust and enough warmth to feel human.
        </p>
      </div>

      <div class="flex lg:justify-end" use:reveal>
        <a
          data-sveltekit-reload
          href="/register"
          class="lu-btn lu-btn-secondary"
        >
          Get started
          <ArrowRight class="lu-arw h-4 w-4" />
        </a>
      </div>
    </div>

    <ol class="mt-12 grid gap-5 lg:grid-cols-3">
      {#each steps as step, i (step.number)}
        <li
          class="group relative overflow-hidden rounded-[1.75rem] border border-[#1f2c47] bg-[#0b1220] p-7 transition-colors duration-quick hover:border-[#6366f1]/45"
          use:reveal={i * 60}
        >
          <div
            class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#6366f1]/60 to-transparent"
          ></div>

          <div class="flex items-center justify-between">
            <p
              class="lu-d-xw lu-num text-[44px] leading-none text-[#54648a] transition-colors duration-quick group-hover:text-[#818cf8]"
            >
              {step.number}
            </p>
            <span
              class="flex h-10 w-10 items-center justify-center rounded-full border border-[#1f2c47] bg-[#111b2e] text-[#94a3b8] transition-colors duration-quick group-hover:border-[#6366f1]/40 group-hover:text-[#818cf8]"
            >
              <step.icon class="h-4 w-4" strokeWidth={1.75} />
            </span>
          </div>

          <h3 class="lu-d mt-7 text-[22px] text-white">{step.title}</h3>
          <p class="mt-3.5 text-[15.5px] leading-[1.65] text-[#94a3b8]">
            {step.body}
          </p>
        </li>
      {/each}
    </ol>
  </div>
</section>
