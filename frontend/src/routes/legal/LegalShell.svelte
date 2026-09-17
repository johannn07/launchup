<script lang="ts">
  import '$lib/styles/brand.css';
  import BrandMark from '$lib/components/shared/brand-mark.svelte';
  import { ArrowLeft, AlertTriangle } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  let {
    title,
    summary,
    lastUpdated,
    children
  }: {
    title: string;
    summary: string;
    lastUpdated: string;
    children: Snippet;
  } = $props();

  const formatted = new Date(lastUpdated).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  let proseEl: HTMLElement;
  let sections = $state<{ id: string; text: string }[]>([]);
  let activeId = $state('');

  // Derived from the rendered headings rather than a hand-kept list, so the
  // rail can't drift out of sync with the document. The ids themselves are in
  // the markup, so deep links still work without JS.
  onMount(() => {
    const headings = [...proseEl.querySelectorAll<HTMLElement>('h2[id]')];
    sections = headings.map((h) => ({
      id: h.id,
      text: h.textContent?.trim() ?? ''
    }));
    activeId = headings[0]?.id ?? '';

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) activeId = visible[0].target.id;
      },
      { rootMargin: '-88px 0px -65% 0px' }
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  });
</script>

<div
  class="lu-root relative isolate flex min-h-screen flex-col overflow-x-clip"
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,#07111f_0%,#0b1220_45%,#050816_100%)]"
  ></div>

  <header
    class="sticky top-0 z-40 border-b border-[#17213a]/70 bg-[#07111f]/85 backdrop-blur-lg"
  >
    <div class="mx-auto flex h-16 w-[min(62rem,90vw)] items-center">
      <BrandMark />
      <a
        href="/"
        data-sveltekit-reload
        class="lu-btn lu-btn-secondary lu-btn-sm ml-auto"
      >
        <ArrowLeft class="h-4 w-4" />
        Back to site
      </a>
    </div>
  </header>

  <main class="flex-1 px-5 py-12 sm:py-16">
    <div
      class="mx-auto grid w-full max-w-[62rem] gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,36rem)_minmax(0,13rem)] lg:justify-center"
    >
      <!-- Document -->
      <div class="min-w-0">
        <h1
          class="lu-d-xw text-[30px] leading-[1.15] text-white sm:text-[34px]"
        >
          {title}
        </h1>
        <p class="mt-3 max-w-[36rem] text-[16px] leading-[1.65] text-[#94a3b8]">
          {summary}
        </p>

        <p
          class="lu-num mt-5 inline-flex items-center rounded-full border border-[#1f2c47] bg-[#0b1220] px-3 py-1 text-[13px] text-[#94a3b8]"
        >
          Last updated&nbsp;<time datetime={lastUpdated} class="text-[#f1f5f9]"
            >{formatted}</time
          >
        </p>

        <p class="lu-notice mt-7 max-w-[36rem]">
          <AlertTriangle class="mt-0.5 h-4 w-4 flex-none" />
          <span>
            <strong class="font-semibold">Placeholder draft.</strong> Complete first-draft
            wording, written to be reacted to rather than relied on. It has not been
            reviewed by a lawyer, it is not legal advice, and it is not enforceable
            as written. Have counsel review and replace it before LaunchUp goes live.
          </span>
        </p>

        <!-- Below lg the rail has nowhere to sit, so it becomes a block here. -->
        {#if sections.length}
          <nav
            class="lu-toc mt-9 max-w-[36rem] rounded-[1rem] border border-[#1f2c47] bg-[#0b1220]/60 p-5 lg:hidden"
            aria-label="On this page"
          >
            <p class="lu-d-md mb-3 text-[13.5px] text-white">On this page</p>
            <ol>
              {#each sections as s, i (s.id)}
                <li>
                  <a
                    href="#{s.id}"
                    aria-current={activeId === s.id ? 'true' : undefined}
                  >
                    <span class="lu-num text-[#818cf8]">{i + 1}.</span>
                    {s.text}
                  </a>
                </li>
              {/each}
            </ol>
          </nav>
        {/if}

        <div class="lu-prose mt-10" bind:this={proseEl}>
          {@render children()}
        </div>

        <div
          class="mt-16 flex max-w-[36rem] flex-wrap gap-x-6 gap-y-2 border-t border-[#17213a] pt-6 text-[14.5px]"
        >
          <a href="/legal/terms" class="lu-link">Terms of Service</a>
          <a href="/legal/privacy" class="lu-link">Privacy Policy</a>
          <a href="/register" data-sveltekit-reload class="lu-link"
            >Create an account</a
          >
        </div>
      </div>

      <!-- Rail -->
      {#if sections.length}
        <aside class="hidden lg:block">
          <nav class="lu-toc sticky top-24" aria-label="On this page">
            <p class="lu-d-md mb-3 text-[13px] text-white">On this page</p>
            <ol>
              {#each sections as s, i (s.id)}
                <li>
                  <a
                    href="#{s.id}"
                    aria-current={activeId === s.id ? 'true' : undefined}
                  >
                    <span class="lu-num text-[#818cf8]">{i + 1}.</span>
                    {s.text}
                  </a>
                </li>
              {/each}
            </ol>
          </nav>
        </aside>
      {/if}
    </div>
  </main>

  <footer class="border-t border-[#17213a]/70">
    <div
      class="mx-auto flex w-[min(62rem,90vw)] items-center justify-between gap-3 py-6"
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
