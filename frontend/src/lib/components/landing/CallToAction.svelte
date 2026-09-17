<script lang="ts">
  import { ArrowRight } from 'lucide-svelte';
  import { reveal } from './reveal';
</script>

<!-- Sits where the About section used to leave a ~42rem gap above the footer. -->
<section class="border-y border-[#17213a]">
  <div
    class="mx-auto flex w-[min(72rem,88vw)] flex-wrap items-center justify-between gap-6 py-14"
  >
    <div use:reveal>
      <h2
        class="lu-d-xw max-w-[24ch] text-[26px] leading-[1.12] text-white sm:text-[30px]"
      >
        Get a readiness signal on your application.
      </h2>
      <p class="mt-2.5 text-[15.5px] text-[#94a3b8]">
        Create an account to submit a startup for assessment.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3" use:reveal>
      <a data-sveltekit-reload href="/register" class="lu-btn lu-btn-primary">
        Get Started
        <ArrowRight class="lu-arw h-4 w-4" />
      </a>
      <a data-sveltekit-reload href="/login" class="lu-btn lu-btn-secondary"
        >Login</a
      >
    </div>
  </div>
</section>
