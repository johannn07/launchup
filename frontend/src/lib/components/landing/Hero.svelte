<script lang="ts">
  import { Sparkles, ArrowRight } from 'lucide-svelte';
  import ReadinessPanel from './ReadinessPanel.svelte';
  import { reveal } from './reveal';
</script>

<section id="hero" class="scroll-mt-16">
  <div
    class="mx-auto grid w-[min(72rem,88vw)] items-center gap-12 pb-20 pt-14 sm:pb-24 sm:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14"
  >
    <div>
      <p class="lu-chip" use:reveal>
        <Sparkles class="h-4 w-4 text-[var(--lu-indigo)]" />
        Precision for founders who need clarity fast
      </p>

      <h1
        class="lu-d-xw mt-6 text-[38px] leading-[1.02] text-white sm:text-[50px] lg:text-[56px]"
        use:reveal={60}
      >
        A better way to launch, judge, and grow serious startups.
      </h1>

      <p
        class="mt-6 max-w-[54ch] text-[17px] leading-[1.7] text-[var(--lu-mute)]"
        use:reveal={120}
      >
        LaunchUp Enhanced gives founders a sharper application journey, a
        clearer readiness signal, and a calmer path from first impression to
        funding conversation.
      </p>

      <div class="mt-8 flex flex-wrap items-center gap-3" use:reveal={180}>
        <a data-sveltekit-reload href="/register" class="lu-btn lu-btn-primary">
          Get Started
          <ArrowRight class="lu-arw h-4 w-4" />
        </a>
        <a href="#howitwork" class="lu-btn lu-btn-secondary">See the flow</a>
      </div>

      <dl class="mt-10 grid gap-3 sm:grid-cols-3" use:reveal={180}>
        <div class="rounded-2xl border border-[var(--lu-line-2)] bg-[var(--lu-navy-2)] p-4">
          <dt class="text-[12.5px] font-semibold text-[var(--lu-indigo-lite)]">
            AI grounded
          </dt>
          <dd class="lu-d mt-1.5 text-[19px] text-white">Less noise</dd>
        </div>
        <div class="rounded-2xl border border-[var(--lu-line-2)] bg-[var(--lu-navy-2)] p-4">
          <dt class="text-[12.5px] font-semibold text-[var(--lu-indigo-lite)]">Readiness</dt>
          <dd class="lu-d mt-1.5 text-[19px] text-white">Sharper signal</dd>
        </div>
        <div class="rounded-2xl border border-[var(--lu-line-2)] bg-[var(--lu-navy-2)] p-4">
          <dt class="text-[12.5px] font-semibold text-[var(--lu-indigo-lite)]">Outcome</dt>
          <dd class="lu-d mt-1.5 text-[19px] text-white">Better decisions</dd>
        </div>
      </dl>
    </div>

    <div use:reveal={120}>
      <ReadinessPanel />
    </div>
  </div>
</section>
