<script lang="ts">
  import axiosInstance from '$lib/axios';
  import { onMount } from 'svelte';

  type Dimension = {
    key: 'team' | 'market' | 'product' | 'traction' | 'regulatory' | 'funding';
    label: string;
    score: number;
    percent: number;
    weight: number;
    weightedScore: number;
    rationale: string;
  };

  type Recommendation = {
    priority: number;
    urgency: 'High' | 'Medium' | 'Low';
    dimension: Dimension['key'];
    title: string;
    details: string;
  };

  type WeightRationale = {
    key: Dimension['key'];
    label: string;
    weight: number;
    rationale: string;
  };

  type ReadinessResponse = {
    compositeScore: number;
    tierLabel: string;
    dimensions: Dimension[];
    recommendations: Recommendation[];
    weightRationale: WeightRationale[];
  };

  export let startupId = 1;

  let data: ReadinessResponse | null = null;
  let loading = true;
  let error = '';
  let activeTab: 'dimensions' | 'actions' | 'weights' = 'dimensions';

  const tierPalette: Record<string, string> = {
    Strong: '#2dd4bf',
    Ready: '#38bdf8',
    Emerging: '#fbbf24',
    Developing: '#fb923c',
    Early: '#f87171',
  };

  function urgencyClass(urgency: Recommendation['urgency']) {
    if (urgency === 'High') return 'border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-300';
    if (urgency === 'Medium') return 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-300';
    return 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300';
  }

  function urgencyBadgeClass(urgency: Recommendation['urgency']) {
    if (urgency === 'High') return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300';
    if (urgency === 'Medium') return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300';
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
  }

  $: score = data?.compositeScore ?? 0;
  $: tier = data?.tierLabel ?? 'Early';
  $: tierColor = tierPalette[tier] ?? '#94a3b8';
  $: gaugeStyle = `background: conic-gradient(${tierColor} 0deg ${score * 3.6}deg, rgba(99,102,241,0.14) ${score * 3.6}deg 360deg);`;
  $: barStyle = (percent: number) =>
    `width: ${percent}%; background: linear-gradient(90deg, #4f46e5, #6366f1);`;

  onMount(async () => {
    try {
      const response = await axiosInstance.post('/readiness/score', { startupId });
      data = response.data;
    } catch (err) {
      error = 'Unable to load readiness dashboard right now.';
      console.error(err);
    } finally {
      loading = false;
    }
  });
</script>

<section class="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/60 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/40">
  <div class="border-b border-slate-200/60 px-6 py-6 dark:border-white/10">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#6366f1]">Startup Readiness</p>
        <h2 class="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Readiness dashboard</h2>
        <p class="mt-1 max-w-2xl text-sm text-slate-500 dark:text-white/50">
          A weighted view across team, market, product, traction, regulatory, and funding so the strongest gaps are obvious at a glance.
        </p>
      </div>
      <div class="rounded-full border border-slate-200/70 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-white/80">
        Startup #{startupId}
      </div>
    </div>
  </div>

  {#if loading}
    <div class="grid gap-6 p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div class="animate-pulse rounded-2xl border border-slate-200/70 bg-slate-100/60 p-6 dark:border-white/10 dark:bg-white/[0.03]">
        <div class="mx-auto h-48 w-48 rounded-full bg-slate-200 dark:bg-white/10"></div>
      </div>
      <div class="space-y-4">
        <div class="h-32 rounded-2xl bg-slate-100/60 dark:bg-white/[0.03]"></div>
        <div class="h-32 rounded-2xl bg-slate-100/60 dark:bg-white/[0.03]"></div>
      </div>
    </div>
  {:else if error}
    <div class="px-6 py-10 text-sm text-red-500 dark:text-red-400">{error}</div>
  {:else if data}
    <div class="grid gap-6 p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div class="rounded-2xl border border-slate-200/70 bg-white/60 p-6 backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
        <div class="relative mx-auto flex h-48 w-48 items-center justify-center rounded-full" style={gaugeStyle}>
          <div class="flex h-32 w-32 flex-col items-center justify-center rounded-full border border-slate-200/70 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950">
            <div class="text-4xl font-black text-slate-950 dark:text-white">{score}</div>
            <div class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">out of 100</div>
          </div>
        </div>

        <div class="mt-5 text-center">
          <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">Tier</div>
          <div class="mt-1 text-2xl font-black" style={`color: ${tierColor};`}>{tier}</div>
        </div>

        <p class="mt-4 text-center text-xs leading-5 text-slate-500 dark:text-white/50">
          The composite score emphasizes the dimensions that matter most for execution and investability.
        </p>
      </div>

      <div class="rounded-2xl border border-slate-200/70 bg-white/60 p-5 backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
        <div class="inline-flex flex-wrap gap-1 rounded-full border border-slate-200/70 bg-white/60 p-1 dark:border-white/10 dark:bg-slate-950/40">
          <button
            class={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'dimensions' ? 'bg-[#6366f1]/15 text-[#6366f1]' : 'text-slate-500 hover:text-slate-800 dark:text-white/40 dark:hover:text-white/70'
            }`}
            on:click={() => (activeTab = 'dimensions')}
          >
            Dimension breakdown
          </button>
          <button
            class={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'actions' ? 'bg-[#6366f1]/15 text-[#6366f1]' : 'text-slate-500 hover:text-slate-800 dark:text-white/40 dark:hover:text-white/70'
            }`}
            on:click={() => (activeTab = 'actions')}
          >
            Top actions
          </button>
          <button
            class={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'weights' ? 'bg-[#6366f1]/15 text-[#6366f1]' : 'text-slate-500 hover:text-slate-800 dark:text-white/40 dark:hover:text-white/70'
            }`}
            on:click={() => (activeTab = 'weights')}
          >
            Why these weights
          </button>
        </div>

        <!-- min-h keeps the card from jumping size when switching tabs -->
        <div class="mt-4 min-h-[420px] transition-all duration-300">
          {#if activeTab === 'dimensions'}
            <p class="text-sm text-slate-500 dark:text-white/50">Bars show the underlying dimension score; the weighted contribution is on the right.</p>
            <div class="mt-2 divide-y divide-slate-200/60 dark:divide-white/10">
              {#each data.dimensions as dimension}
                <div class="py-4 first:pt-2">
                  <div class="mb-2 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <span class="font-bold text-slate-900 dark:text-white">{dimension.label}</span>
                      <span class="ml-2 text-slate-400 dark:text-white/40">{Math.round(dimension.weight * 100)}% weight</span>
                    </div>
                    <div class="font-semibold text-slate-700 dark:text-white/70">
                      {dimension.percent}% <span class="text-slate-400 dark:text-white/40">({dimension.weightedScore.toFixed(1)} pts)</span>
                    </div>
                  </div>
                  <div class="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                    <div class="h-full rounded-full transition-all duration-500" style={barStyle(dimension.percent)}></div>
                  </div>
                  <p class="mt-2 text-xs leading-5 text-slate-500 dark:text-white/50">{dimension.rationale}</p>
                </div>
              {/each}
            </div>
          {:else if activeTab === 'actions'}
            <p class="text-sm text-slate-500 dark:text-white/50">Ordered by the weakest weighted contribution.</p>
            <div class="mt-4 space-y-3">
              {#each data.recommendations as recommendation}
                <article class={`rounded-2xl border p-4 ${urgencyClass(recommendation.urgency)}`}>
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">Priority {recommendation.priority}</div>
                      <h4 class="mt-1 text-base font-bold text-slate-950 dark:text-white">{recommendation.title}</h4>
                    </div>
                    <span class={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${urgencyBadgeClass(recommendation.urgency)}`}>
                      {recommendation.urgency}
                    </span>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-white/70">{recommendation.details}</p>
                </article>
              {/each}
            </div>
          {:else}
            <div class="mt-2 divide-y divide-slate-200/60 dark:divide-white/10">
              {#each data.weightRationale as item}
                <div class="py-4 first:pt-2">
                  <div class="flex items-center justify-between gap-3 text-sm font-bold text-slate-900 dark:text-white">
                    <span>{item.label}</span>
                    <span class="text-[#6366f1]">{Math.round(item.weight * 100)}%</span>
                  </div>
                  <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-white/50">{item.rationale}</p>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</section>