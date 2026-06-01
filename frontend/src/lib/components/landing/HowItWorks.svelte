<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { ArrowRight, Sparkles, FileText, Rocket, TrendingUp } from 'lucide-svelte';

  const steps = [
    {
      number: '01',
      title: 'Application',
      body: 'Start by submitting your startup application to LaunchUp for evaluation and confirmation.',
      icon: FileText,
    },
    {
      number: '02',
      title: 'Incubation and Acceleration',
      body: 'Accepted startups enter the program, gaining mentorship and resources to nurture their concepts towards success.',
      icon: Rocket,
    },
    {
      number: '03',
      title: 'Investment-Ready',
      body: 'Incubation and acceleration make your startup investment-ready, benefiting your business and the startup ecosystem.',
      icon: TrendingUp,
    }
  ];
</script>

<div class="mx-auto w-[min(72rem,86vw)] py-24" id="howitwork">
  <div class="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
    <div class="max-w-xl space-y-5">
      <div class="inline-flex items-center gap-2 rounded-full border border-[#6366f1]/15 bg-[#6366f1]/8 px-4 py-2 text-sm font-semibold text-[#4f46e5] dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
        <Sparkles class="h-4 w-4" />
        Designed to reduce friction
      </div>
      <p class="text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
        How it works should feel obvious, not administrative.
      </p>
      <p class="text-lg leading-8 text-slate-600 dark:text-slate-300">
        LaunchUp turns the startup review journey into a clear sequence with enough structure to trust and enough warmth to feel human.
      </p>
    </div>
    <div class="flex justify-start lg:justify-end">
      <a href="/register" class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition-all duration-200 hover:border-[#6366f1]/30 hover:text-[#4f46e5] dark:border-white/10 dark:bg-slate-950/45 dark:text-slate-200">
        Get started
        <ArrowRight class="h-4 w-4" />
      </a>
    </div>
  </div>

  <div class="mt-10 grid gap-5 lg:grid-cols-3">
    {#each steps as step}
      <Card.Root class="group relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 p-7 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(99,102,241,0.16)] dark:border-white/10 dark:bg-slate-950/60">
        <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#6366f1]/60 to-transparent"></div>
        <div class="flex items-center justify-between">
          <p class="text-5xl font-black tracking-tight text-slate-200 transition-colors duration-300 group-hover:text-[#6366f1]/25 dark:text-slate-800">
            {step.number}
          </p>
          <!-- Icon circle -->
          <div class="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50/80 opacity-90 transition-all duration-300 group-hover:rotate-12 group-hover:border-[#6366f1]/40 group-hover:bg-[#6366f1]/10 dark:border-white/10 dark:bg-white/5 group-hover:dark:bg-[#6366f1]/20">
            <svelte:component
              this={step.icon}
              class="h-4 w-4 text-slate-400 transition-colors duration-300 group-hover:text-[#6366f1] dark:text-slate-500 dark:group-hover:text-[#818cf8]"
              strokeWidth={1.75}
            />
          </div>
        </div>
        <p class="mt-7 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          {step.title}
        </p>
        <p class="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
          {step.body}
        </p>
      </Card.Root>
    {/each}
  </div>
</div>