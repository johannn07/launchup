<script lang="ts">
  import '$lib/styles/brand.css';
  import BrandMark from '$lib/components/shared/brand-mark.svelte';
  import type { Snippet } from 'svelte';

  let {
    title,
    subtitle,
    switchPrompt,
    switchHref,
    switchLabel,
    children
  }: {
    title: string;
    subtitle: string;
    switchPrompt: string;
    switchHref: string;
    switchLabel: string;
    children: Snippet;
  } = $props();

  // The scales the backend actually scores. Real product substance rather than
  // decoration, and already shown on the landing page's About section.
  const scales = [
    ['Technology', 'TRL'],
    ['Market', 'MRL'],
    ['Acceptance', 'ARL'],
    ['Organizational', 'ORL'],
    ['Regulatory', 'RRL'],
    ['Investment', 'IRL']
  ];
</script>

<!--
  Composition, not decoration. One shell width governs the header, the content
  and the footer, so the page stops having two competing measures. Content is
  anchored to a fixed top offset rather than vertically centred, so the heading
  lands in the same place on login and register instead of jumping between them.
  The right column is quiet type on the page ground — no card, no fill, no icons.
-->
<div
  class="lu-root relative isolate flex min-h-screen flex-col overflow-x-clip"
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.07),transparent_30%),linear-gradient(to_bottom,#07111f_0%,#0b1220_40%,#050816_100%)]"
  ></div>

  <header class="border-b border-[#17213a]/70">
    <div class="mx-auto flex h-16 w-[min(48rem,90vw)] items-center">
      <BrandMark />
      <a href="/" class="lu-btn lu-btn-secondary lu-btn-sm ml-auto"
        >Back to site</a
      >
    </div>
  </header>

  <main class="flex-1 px-5 pb-16 pt-12 sm:pt-16">
    <div
      class="mx-auto grid w-[min(48rem,90vw)] gap-x-12 lg:grid-cols-[minmax(0,25rem)_minmax(0,15rem)]"
    >
      <!-- Form column -->
      <div class="min-w-0">
        <h1
          class="lu-d-xw text-[27px] leading-[1.15] text-white sm:text-[30px]"
        >
          {title}
        </h1>
        <p class="mt-2.5 text-[15px] leading-[1.6] text-[#94a3b8]">
          {subtitle}
        </p>

        <div
          class="mt-8 rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220]/70 p-6 sm:p-7"
        >
          {@render children()}
        </div>

        <p class="mt-6 text-[14.5px] text-[#94a3b8]">
          {switchPrompt}
          <a href={switchHref} data-sveltekit-reload class="lu-link"
            >{switchLabel}</a
          >
        </p>
      </div>

      <!-- Context column: sits on the page ground, separated by a hairline -->
      <aside
        class="hidden lg:block lg:border-l lg:border-[#17213a] lg:pl-12 lg:pt-1"
      >
        <p class="lu-d-md text-[14px] text-white">Assessed on six scales</p>

        <ul
          class="mt-4 divide-y divide-[#17213a] border-y border-[#17213a] text-[13.5px]"
        >
          {#each scales as [name, code] (code)}
            <li class="flex items-baseline justify-between gap-3 py-2.5">
              <span class="text-[#c3ced9]">{name}</span>
              <span class="lu-num text-[12px] font-medium text-[#818cf8]"
                >{code}</span
              >
            </li>
          {/each}
        </ul>

        <p class="mt-4 text-[13px] leading-[1.6] text-[#94a3b8]">
          Every application is scored on all six, and each level cites the
          passage behind it.
        </p>
      </aside>
    </div>
  </main>

  <footer class="border-t border-[#17213a]/70">
    <div
      class="mx-auto flex w-[min(48rem,90vw)] flex-wrap items-center justify-between gap-3 py-6"
    >
      <p class="lu-num text-[13px] text-[#94a3b8]">
        © {new Date().getFullYear()} LaunchUp
      </p>
      <nav class="flex gap-5 text-[13px] text-[#94a3b8]" aria-label="Footer">
        <a href="/#howitwork" class="transition-colors hover:text-[#818cf8]"
          >How it Works</a
        >
        <a href="/#aboutus" class="transition-colors hover:text-[#818cf8]"
          >About LaunchUp</a
        >
      </nav>
    </div>
  </footer>
</div>
