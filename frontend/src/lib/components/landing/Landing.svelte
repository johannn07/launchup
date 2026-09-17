<script lang="ts">
  import './landing.css';
  import AboutUs from './AboutUs.svelte';
  import CallToAction from './CallToAction.svelte';
  import Footer from './Footer.svelte';
  import Header from './Header.svelte';
  import Hero from './Hero.svelte';
  import HowItWorks from './HowItWorks.svelte';
</script>

<svelte:head>
  <title>LaunchUp Enhanced</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    rel="preconnect"
    href="https://fonts.gstatic.com"
    crossorigin="anonymous"
  />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Public+Sans:wght@300..800&display=swap"
  />
</svelte:head>

<!-- The landing renders dark regardless of app theme; the palette is the brand's
     navy and the copy assumes it. Theme control lives in /account/appearance. -->
<div
  class="lu-root relative isolate flex min-h-screen flex-col overflow-x-clip"
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),linear-gradient(to_bottom,#07111f_0%,#0b1220_28%,#050816_100%)]"
  ></div>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(#17213a_1px,transparent_1px)] [background-size:2.5rem_2.5rem] [mask-image:radial-gradient(ellipse_90%_50%_at_50%_0%,#000_60%,transparent_100%)]"
  ></div>

  <Header />
  <Hero />

  <div
    class="mx-auto h-px w-[min(72rem,88vw)] bg-gradient-to-r from-transparent via-[#6366f1]/60 to-transparent"
  ></div>

  <HowItWorks />

  <div
    class="mx-auto h-px w-[min(72rem,88vw)] bg-gradient-to-r from-transparent via-[#6366f1]/60 to-transparent"
  ></div>

  <AboutUs />
  <CallToAction />
  <Footer />
</div>
