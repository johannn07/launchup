<script lang="ts">
  import '$lib/styles/brand.css';
  import BrandMark from '$lib/components/shared/brand-mark.svelte';
  import ReadinessDashboard from '$lib/components/dashboard/ReadinessDashboard.svelte';
  import { FlaskConical } from 'lucide-svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Readiness dashboard — LaunchUp</title>
</svelte:head>

<div
  class="lu-root relative isolate flex min-h-screen flex-col overflow-x-clip"
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,#07111f_0%,#0b1220_45%,#050816_100%)]"
  ></div>

  <header class="border-b border-[#17213a]/70">
    <div class="mx-auto flex h-16 w-[min(74rem,92vw)] items-center">
      <BrandMark />
      <a
        href="/"
        data-sveltekit-reload
        class="lu-btn lu-btn-secondary lu-btn-sm ml-auto"
      >
        Back to site
      </a>
    </div>
  </header>

  <main class="flex-1 px-5 pb-16 pt-10 sm:pt-12">
    <div class="mx-auto w-[min(74rem,92vw)]">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            class="lu-d-xw text-[27px] leading-[1.15] text-white sm:text-[30px]"
          >
            Readiness dashboard
          </h1>
          <p
            class="mt-2.5 max-w-[56ch] text-[15px] leading-[1.6] text-[#94a3b8]"
          >
            A weighted view across six dimensions, so the gap that costs you the
            most is the one you see first.
          </p>
        </div>
        <p
          class="lu-num rounded-full border border-[#1f2c47] bg-[#0b1220] px-3 py-1 text-[13px] text-[#94a3b8]"
        >
          Startup&nbsp;<span class="text-[#f1f5f9]">#1</span>
        </p>
      </div>

      {#if data.preview}
        <!-- Only reachable under `vite dev`; see +page.server.ts -->
        <p class="lu-notice mt-6">
          <FlaskConical class="mt-0.5 h-4 w-4 flex-none" />
          <span>
            <strong class="font-semibold">Dev preview.</strong> Rendered from fixtures
            so the design can be worked on without signing in. These numbers are
            not a real assessment.
          </span>
        </p>
      {/if}

      <div class="mt-8">
        <ReadinessDashboard startupId={1} previewData={data.previewData} />
      </div>
    </div>
  </main>
</div>
