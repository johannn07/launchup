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
</script>

<!-- Same tokens as the landing page, quieter chrome: no marketing nav, no
     section anchors, no hero-scale type. The brand wash is dialled back from
     0.20/0.14 to 0.10/0.07 so the form stays the loudest thing on screen. -->
<div
  class="lu-root relative isolate flex min-h-screen flex-col overflow-x-clip"
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.07),transparent_30%),linear-gradient(to_bottom,#07111f_0%,#0b1220_40%,#050816_100%)]"
  ></div>

  <header class="border-b border-[#17213a]/70">
    <div class="mx-auto flex h-16 w-[min(72rem,88vw)] items-center">
      <BrandMark />
      <a href="/" class="lu-btn lu-btn-secondary lu-btn-sm ml-auto"
        >Back to site</a
      >
    </div>
  </header>

  <main class="flex flex-1 items-center justify-center px-5 py-12 sm:py-16">
    <div class="w-full max-w-[26.5rem]">
      <h1 class="lu-d-xw text-[27px] leading-[1.15] text-white sm:text-[30px]">
        {title}
      </h1>
      <p class="mt-2.5 text-[15px] leading-[1.6] text-[#94a3b8]">{subtitle}</p>

      <div
        class="mt-8 rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220]/70 p-6 sm:p-7"
      >
        {@render children()}
      </div>

      <p class="mt-6 text-center text-[14.5px] text-[#94a3b8]">
        {switchPrompt}
        <a href={switchHref} data-sveltekit-reload class="lu-link"
          >{switchLabel}</a
        >
      </p>
    </div>
  </main>

  <footer class="border-t border-[#17213a]/70">
    <div
      class="mx-auto flex w-[min(72rem,88vw)] flex-wrap items-center justify-between gap-3 py-6"
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
