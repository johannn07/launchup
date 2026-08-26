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
    if (urgency === 'High') return 'border-red-500/20 bg-red-500/10 text-red-300';
    if (urgency === 'Medium') return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  }

  function urgencyBadgeClass(urgency: Recommendation['urgency']) {
    if (urgency === 'High') return 'border-red-500/30 bg-red-500/10 text-red-300';
    if (urgency === 'Medium') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }

  $: score = data?.compositeScore ?? 0;
  $: tier = data?.tierLabel ?? 'Early';
  $: tierColor = tierPalette[tier] ?? '#94a3b8';
  $: gaugeStyle = `background: conic-gradient(${tierColor} 0deg ${score * 3.6}deg, rgba(99,102,241,0.12) ${score * 3.6}deg 360deg);`;

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

<section class="overflow-hidden rounded-[2rem] border border-indigo-500/10 bg-[#0d0d1f] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]">
  <div class="border-b border-indigo-500/10 bg-[#0a0a18] px-6 py-6 text-white">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs uppercase tracking-[0.24em] text-indigo-400">Startup Readiness</p>
        <h2 class="mt-2 text-2xl font-black">Readiness dashboard</h2>
        <p class="mt-1 max-w-2xl text-sm text-slate-400">
          A weighted view across team, market, product, traction, regulatory, and funding so the strongest gaps are obvious at a glance.
        </p>
      </div>
      <div class="rounded-full border border-indigo-500/10 bg-indigo-500/5 px-4 py-2 text-sm font-semibold text-white/90">
        Startup #{startupId}
      </div>
    </div>
  </div>

  {#if loading}
    <div class="grid gap-6 p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div class="animate-pulse rounded-[1.75rem] border border-indigo-500/10 bg-indigo-500/[0.04] p-6">
        <div class="mx-auto h-48 w-48 rounded-full bg-indigo-500/10"></div>
      </div>
      <div class="space-y-4">
        <div class="h-32 rounded-3xl bg-indigo-500/[0.05]"></div>
        <div class="h-32 rounded-3xl bg-indigo-500/[0.05]"></div>
      </div>
    </div>
  {:else if error}
    <div class="px-6 py-10 text-sm text-red-400">{error}</div>
  {:else if data}
    <div class="grid gap-6 p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div class="rounded-[1.75rem] border border-indigo-500/10 bg-indigo-500/[0.04] p-6">
        <div class="relative mx-auto flex h-48 w-48 items-center justify-center rounded-full" style={gaugeStyle}>
          <div class="flex h-32 w-32 flex-col items-center justify-center rounded-full border border-indigo-500/10 bg-[#0d0d1f] shadow-sm">
            <div class="text-4xl font-black text-white">{score}</div>
            <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">out of 100</div>
          </div>
        </div>

        <div class="mt-5 text-center">
          <div class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Tier</div>
          <div class="mt-1 text-xl font-black" style={`color: ${tierColor};`}>{tier}</div>
        </div>

        <div class="mt-5 rounded-2xl border border-indigo-500/10 bg-[#0a0a18]/60 p-4 text-sm text-slate-400">
          <div class="flex items-center justify-between font-semibold text-white">
            <span>Weighted score</span>
            <span>{score}%</span>
          </div>
          <p class="mt-2 leading-6">
            The composite score emphasizes the dimensions that matter most for execution and investability.
          </p>
        </div>
      </div>

      <div class="rounded-[1.5rem] border border-indigo-500/10 bg-indigo-500/[0.04] p-5">
        <div class="inline-flex flex-wrap gap-1 rounded-full border border-indigo-500/10 bg-[#0a0a18]/60 p-1">
          <button
            class={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'dimensions' ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            on:click={() => (activeTab = 'dimensions')}
          >
            Dimension breakdown
          </button>
          <button
            class={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'actions' ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            on:click={() => (activeTab = 'actions')}
          >
            Top actions
          </button>
          <button
            class={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'weights' ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            on:click={() => (activeTab = 'weights')}
          >
            Why these weights
          </button>
        </div>

        <!-- min-h keeps the card from jumping size when switching tabs -->
        <div class="mt-4 min-h-[420px] transition-all duration-300">
          {#if activeTab === 'dimensions'}
            <p class="text-sm text-slate-500">Bars show the underlying dimension score; the weighted contribution is on the right.</p>
            <div class="mt-4 space-y-3">
              {#each data.dimensions as dimension}
                <div class="rounded-2xl border border-indigo-500/10 bg-[#0a0a18]/60 p-4">
                  <div class="mb-2 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <span class="font-semibold text-white">{dimension.label}</span>
                      <span class="ml-2 text-slate-500">{Math.round(dimension.weight * 100)}% weight</span>
                    </div>
                    <div class="font-semibold text-slate-300">
                      {dimension.percent}% <span class="text-slate-500">({dimension.weightedScore.toFixed(1)} pts)</span>
                    </div>
                  </div>
                  <div class="h-3 overflow-hidden rounded-full bg-indigo-500/[0.08]">
                    <div
                      class="h-full rounded-full transition-all duration-500"
                      style={`width: ${dimension.percent}%; background: linear-gradient(90deg, #0f766e, #2dd4bf);`}
                    ></div>
                  </div>
                  <p class="mt-2 text-xs leading-5 text-slate-500">{dimension.rationale}</p>
                </div>
              {/each}
            </div>
          {:else if activeTab === 'actions'}
            <p class="text-sm text-slate-500">Ordered by the weakest weighted contribution.</p>
            <div class="mt-4 space-y-3">
              {#each data.recommendations as recommendation}
                <article class={`rounded-2xl border p-4 ${urgencyClass(recommendation.urgency)}`}>
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">Priority {recommendation.priority}</div>
                      <h4 class="mt-1 text-base font-bold text-white">{recommendation.title}</h4>
                    </div>
                    <span class={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${urgencyBadgeClass(recommendation.urgency)}`}>
                      {recommendation.urgency}
                    </span>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-slate-300">{recommendation.details}</p>
                </article>
              {/each}
            </div>
          {:else}
            <div class="space-y-3">
              {#each data.weightRationale as item}
                <div class="rounded-2xl border border-indigo-500/10 bg-[#0a0a18]/60 p-4">
                  <div class="flex items-center justify-between gap-3 text-sm font-semibold text-white">
                    <span>{item.label}</span>
                    <span class="text-indigo-300">{Math.round(item.weight * 100)}%</span>
                  </div>
                  <p class="mt-2 text-sm leading-6 text-slate-400">{item.rationale}</p>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</section>