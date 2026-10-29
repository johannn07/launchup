<script lang="ts">
  import { Sparkles, ArrowRight } from 'lucide-svelte';
  import ReadinessPanel from './ReadinessPanel.svelte';
</script>

<!-- No scroll reveal here: it is already in view, and hiding it until hydration
     made the server-rendered hero blink out and back. -->
<section id="hero" class="scroll-mt-16">
  <div
    class="mx-auto grid w-[min(72rem,88vw)] items-center gap-12 pb-20 pt-12 sm:pb-24 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14"
  >
    <div>
      <p class="lu-chip">
        <Sparkles class="h-4 w-4 text-[#6366f1]" />
        Precision for founders who need clarity fast
      </p>

      <h1
        class="lu-d-xw mt-6 text-[32px] leading-[1.05] text-white sm:text-[44px] lg:text-[50px]"
      >
        A better way to launch, judge, and grow serious startups.
      </h1>

      <p class="mt-6 max-w-[54ch] text-[17px] leading-[1.7] text-[#94a3b8]">
        LaunchUp Enhanced gives founders a sharper application journey, a
        clearer readiness signal, and a calmer path from first impression to
        funding conversation.
      </p>

      <div class="mt-8 flex flex-wrap items-center gap-3">
        <a data-sveltekit-reload href="/register" class="lu-btn lu-btn-primary">
          Get Started
          <ArrowRight class="lu-arw h-4 w-4" />
        </a>
        <a href="#howitwork" class="lu-btn lu-btn-secondary">See the flow</a>
      </div>
    </div>

    <ReadinessPanel />
  </div>
</section>
