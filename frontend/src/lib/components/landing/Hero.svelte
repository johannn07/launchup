<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowRight, Sparkles } from 'lucide-svelte';
  import Button from '../ui/button/button.svelte';

  let cardEl: HTMLDivElement;
  let mouseX = 0;
  let mouseY = 0;
  let cardRotateX = 0;
  let cardRotateY = 0;
  let isHovered = false;
  let mounted = false;

  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1.5,
    duration: Math.random() * 12 + 10,
    delay: Math.random() * 8,
    opacity: Math.random() * 0.4 + 0.15,
  }));

  const orbs = [
    { x: 10, y: 25, duration: 7,  delay: 0,   scale: 1,    anim: 'flyOrb1' },
    { x: 75, y: 55, duration: 9,  delay: 1.5, scale: 0.75, anim: 'flyOrb2' },
    { x: 30, y: 75, duration: 8,  delay: 0.8, scale: 0.6,  anim: 'flyOrb3' },
  ];

  function handleMouseMove(e: MouseEvent) {
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    cardRotateY = dx * 6;
    cardRotateX = -dy * 6;
    mouseX = ((e.clientX - rect.left) / rect.width) * 100;
    mouseY = ((e.clientY - rect.top) / rect.height) * 100;
  }

  function handleMouseLeave() {
    isHovered = false;
    cardRotateX = 0;
    cardRotateY = 0;
  }

  function handleMouseEnter() {
    isHovered = true;
  }

  onMount(() => {
    setTimeout(() => (mounted = true), 50);
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  });
</script>

<div class="relative h-full w-full pt-10 md:pt-16">
  <div
    class="absolute inset-0 -z-10 h-full w-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.82),transparent_70%),radial-gradient(#ecf3fc_1px,transparent_1px)] [background-size:auto,2.5rem_2.5rem] [mask-image:radial-gradient(ellipse_100%_56%_at_50%_44%,#000_72%,transparent_110%)] dark:bg-[radial-gradient(circle_at_center,rgba(7,17,31,0.84),transparent_70%),radial-gradient(#17213a_1px,transparent_1px)]"
  ></div>

  <div
    class="mx-auto grid w-[min(72rem,86vw)] items-center gap-10 py-6 pb-14 lg:grid-cols-[1.15fr_0.85fr]"
    id="hero"
  >
    <!-- Left content -->
    <div class="flex flex-col gap-5" class:hero-entered={mounted}>
      <div class="hero-item flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-600 shadow-[0_12px_36px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-200">
        <Sparkles class="h-4 w-4 text-[#6366f1]" />
        Precision for founders who need clarity fast
      </div>

      <div class="space-y-4 hero-item">
        <p class="max-w-3xl text-5xl font-black tracking-[-0.05em] sm:text-6xl lg:text-[4.5rem] leading-none">
          <span class="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 bg-clip-text text-transparent dark:from-white dark:via-slate-200 dark:to-slate-400">
            A better way to launch, judge, and grow serious startups.
          </span>
        </p>
        <p class="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-300">
          LaunchUp Enhanced gives founders a sharper application journey, a clearer readiness signal, and a calmer path from first impression to funding conversation.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3 hero-item">
        <a data-sveltekit-reload href="/register">
          <Button class="group h-11 rounded-full bg-gradient-to-b from-slate-800 to-slate-950 px-6 text-white shadow-[0_8px_30px_rgba(15,23,42,0.25),inset_0_1px_1px_rgba(255,255,255,0.15)] ring-1 ring-slate-950/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.35)] dark:from-white dark:to-slate-200 dark:text-slate-950 dark:shadow-[0_8px_30px_rgba(255,255,255,0.1)]">
            Get Started
            <ArrowRight class="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Button>
        </a>
        <a href="#howitwork" class="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white/75 px-5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition-all duration-200 hover:border-[#6366f1]/30 hover:text-[#4f46e5] dark:border-white/10 dark:bg-slate-950/45 dark:text-slate-200">
          See the flow
        </a>
      </div>

      <div class="grid gap-3 sm:grid-cols-3 hero-item">
        <div class="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
          <p class="text-xs font-semibold uppercase tracking-widest text-[#6366f1] dark:text-[#818cf8]">AI grounded</p>
          <p class="mt-1.5 text-xl font-black text-slate-950 dark:text-white">Less noise</p>
        </div>
        <div class="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
          <p class="text-xs font-semibold uppercase tracking-widest text-[#6366f1] dark:text-[#818cf8]">Readiness</p>
          <p class="mt-1.5 text-xl font-black text-slate-950 dark:text-white">Sharper signal</p>
        </div>
        <div class="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
          <p class="text-xs font-semibold uppercase tracking-widest text-[#6366f1] dark:text-[#818cf8]">Outcome</p>
          <p class="mt-1.5 text-xl font-black text-slate-950 dark:text-white">Better decisions</p>
        </div>
      </div>
    </div>

    <!-- Right panel — animated illustration -->
    <div
      class="relative hidden items-center justify-center lg:flex card-entrance"
      class:card-entered={mounted}
    >
      <!-- Animated gradient glow -->
      <div class="glow-ring absolute inset-0 -z-10 rounded-[2.5rem] blur-3xl"></div>

      <!-- Tilt + hover lift card -->
      <div
        bind:this={cardEl}
        role="img"
        aria-label="Startup collaboration illustration"
        onmouseenter={handleMouseEnter}
        onmouseleave={handleMouseLeave}
        class="illustration-card relative w-full max-w-[34rem] rounded-[2rem] border border-white/60 bg-white/75 p-6 backdrop-blur dark:border-white/10 dark:bg-slate-950/55"
        style="
          transform: perspective(900px) rotateX({cardRotateX}deg) rotateY({cardRotateY}deg) translateY({isHovered ? '-8px' : '0px'});
          transition: transform 0.15s ease, box-shadow 0.3s ease;
          box-shadow: {isHovered
            ? '0 40px 90px rgba(15,23,42,0.22), 0 0 0 1px rgba(99,102,241,0.15)'
            : '0 28px 70px rgba(15,23,42,0.12)'};
        "
      >
        <!-- Corner glows -->
        <div class="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-[#6366f1]/30 blur-[2.5rem] mix-blend-multiply dark:mix-blend-screen"></div>
        <div class="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-[#0ea5e9]/30 blur-[2.5rem] mix-blend-multiply dark:mix-blend-screen"></div>

        <!-- Floating particles inside card -->
        <div class="particle-container pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]">
          {#each particles as p (p.id)}
            <div
              class="particle absolute rounded-full bg-[#6366f1]"
              style="
                left: {p.x}%;
                top: {p.y}%;
                width: {p.size}px;
                height: {p.size}px;
                opacity: {p.opacity};
                animation: floatParticle {p.duration}s {p.delay}s infinite ease-in-out alternate;
              "
            ></div>
          {/each}
        </div>

        <!-- Flying arrow orbs -->
        {#each orbs as orb (orb.anim)}
          <div
            class="arrow-orb absolute z-20 flex items-center justify-center rounded-full bg-[#1d6fe8] shadow-[0_4px_20px_rgba(29,111,232,0.55)]"
            style="
              left: {orb.x}%;
              top: {orb.y}%;
              width: {36 * orb.scale}px;
              height: {36 * orb.scale}px;
              animation: {orb.anim} {orb.duration}s {orb.delay}s infinite linear;
            "
          >
            <svg
              width="{14 * orb.scale}"
              height="{14 * orb.scale}"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 12L12 2M12 2H5M12 2V9"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
        {/each}

        <!-- Mouse-follow shine -->
        {#if isHovered}
          <div
            class="pointer-events-none absolute inset-0 rounded-[2rem] opacity-40"
            style="background: radial-gradient(circle at {mouseX}% {mouseY}%, rgba(99,102,241,0.25) 0%, transparent 60%);"
          ></div>
        {/if}

        <img
          src="/startup.svg"
          alt="Startup collaboration"
          class="relative z-10 w-full drop-shadow-[0_24px_50px_rgba(15,23,42,0.12)]"
        />
      </div>
    </div>
  </div>
</div>

<style>
  .hero-item {
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.55s ease, transform 0.55s ease;
  }
  .hero-entered .hero-item:nth-child(1) { opacity: 1; transform: none; transition-delay: 0.05s; }
  .hero-entered .hero-item:nth-child(2) { opacity: 1; transform: none; transition-delay: 0.15s; }
  .hero-entered .hero-item:nth-child(3) { opacity: 1; transform: none; transition-delay: 0.25s; }
  .hero-entered .hero-item:nth-child(4) { opacity: 1; transform: none; transition-delay: 0.35s; }

  .card-entrance {
    opacity: 0;
    transform: translateY(24px) scale(0.97);
    transition: opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s;
  }
  .card-entered {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .glow-ring {
    background: radial-gradient(circle at center, rgba(99,102,241,0.22), rgba(14,165,233,0.14), transparent 68%);
    animation: glowPulse 4s ease-in-out infinite alternate;
  }
  @keyframes glowPulse {
    from { opacity: 0.7; transform: scale(0.95); }
    to   { opacity: 1;   transform: scale(1.08); }
  }

  @keyframes floatParticle {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(0, -28px) scale(1.3); }
  }

  @keyframes flyOrb1 {
    0%   { transform: translate(0px,   0px)  scale(1)    rotate(-45deg); opacity: 0.9; }
    25%  { transform: translate(55px, -35px) scale(1.08) rotate(-38deg); opacity: 1;   }
    50%  { transform: translate(120px,-15px) scale(1.04) rotate(-50deg); opacity: 0.95;}
    75%  { transform: translate(80px,  30px) scale(1.1)  rotate(-40deg); opacity: 1;   }
    100% { transform: translate(0px,   0px)  scale(1)    rotate(-45deg); opacity: 0.9; }
  }
  @keyframes flyOrb2 {
    0%   { transform: translate(0px,   0px)  scale(0.9)  rotate(30deg); opacity: 0.8; }
    30%  { transform: translate(-60px,-25px) scale(1)    rotate(22deg); opacity: 1;   }
    60%  { transform: translate(-30px, 40px) scale(0.95) rotate(35deg); opacity: 0.9; }
    100% { transform: translate(0px,   0px)  scale(0.9)  rotate(30deg); opacity: 0.8; }
  }
  @keyframes flyOrb3 {
    0%   { transform: translate(0px,  0px)  scale(0.8)  rotate(-20deg); opacity: 0.7;  }
    35%  { transform: translate(45px,-50px) scale(0.9)  rotate(-12deg); opacity: 1;    }
    70%  { transform: translate(90px,-20px) scale(0.85) rotate(-25deg); opacity: 0.85; }
    100% { transform: translate(0px,  0px)  scale(0.8)  rotate(-20deg); opacity: 0.7;  }
  }
</style>