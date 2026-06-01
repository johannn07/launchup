<script lang="ts">
  import AboutUs from './AboutUs.svelte';
  import Footer from './Footer.svelte';
  import Header from './Header.svelte';
  import Hero from './Hero.svelte';
  import HowItWorks from './HowItWorks.svelte';
</script>

<svelte:head>
  <title>LaunchUp Enhanced</title>
</svelte:head>

<div class="relative z-10 mx-auto flex flex-col overflow-x-clip overflow-y-visible">
  <div class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),linear-gradient(to_bottom,#f8fbff_0%,#ffffff_28%,#f5f9ff_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.2),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_28%),linear-gradient(to_bottom,#07111f_0%,#0b1220_28%,#050816_100%)]"></div>
  <div class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] bg-[linear-gradient(to_bottom,rgba(99,102,241,0.14),transparent_70%)] blur-3xl"></div>
  <Header />
  <Hero />
  <div class="mx-auto h-px w-[min(72rem,86vw)] bg-gradient-to-r from-transparent via-[#6366f1]/70 to-transparent"></div>
  <HowItWorks />
  <div class="mx-auto h-px w-[min(72rem,86vw)] bg-gradient-to-r from-transparent via-[#6366f1]/70 to-transparent"></div>
  <AboutUs />
  <Footer />
</div>