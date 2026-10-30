<script lang="ts">
  import { onMount } from 'svelte';
  import { Rocket } from 'lucide-svelte';

  const sections = ['howitwork', 'aboutus'];
  let activeSection = $state('');

  // A band just under the sticky header; whichever section crosses it is active.
  onMount(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) activeSection = e.target.id;
          else if (activeSection === e.target.id) activeSection = '';
        }
      },
      { rootMargin: '-80px 0px -85% 0px' }
    );
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  });
</script>

<header
  class="sticky top-0 z-40 border-b border-[#17213a]/70 bg-[#07111f]/80 backdrop-blur-lg"
>
  <nav class="mx-auto flex h-16 w-[min(72rem,88vw)] items-center">
    <a href="/" class="flex items-center gap-2">
      <Rocket class="h-4 w-4 -rotate-12 text-[#6366f1]" />
      <span class="lu-d-xw text-xl text-white">LaunchUp</span>
    </a>

    <ul
      class="ml-auto hidden items-center gap-7 text-[15px] font-medium md:flex"
    >
      <li>
        <a
          href="#howitwork"
          class="transition-colors hover:text-[#818cf8] {activeSection ===
          'howitwork'
            ? 'text-[#f1f5f9]'
            : 'text-[#94a3b8]'}">How it Works</a
        >
      </li>
      <li>
        <a
          href="#aboutus"
          class="transition-colors hover:text-[#818cf8] {activeSection ===
          'aboutus'
            ? 'text-[#f1f5f9]'
            : 'text-[#94a3b8]'}">About Us</a
        >
      </li>
      <li>
        <a
          data-sveltekit-reload
          href="/login"
          class="text-[#94a3b8] transition-colors hover:text-[#818cf8]">Login</a
        >
      </li>
    </ul>

    <a
      data-sveltekit-reload
      href="/register"
      class="lu-btn lu-btn-primary lu-btn-sm ml-auto md:ml-7">Get Started</a
    >
  </nav>
</header>
