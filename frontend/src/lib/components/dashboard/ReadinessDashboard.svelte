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

  const tierPalette: Record<string, string> = {
    Strong: '#0f766e',
    Ready: '#2563eb',
    Emerging: '#b45309',
    Developing: '#c2410c',
    Early: '#b91c1c',
  };

  function urgencyClass(urgency: Recommendation['urgency']) {
    if (urgency === 'High') return 'border-red-200 bg-red-50 text-red-700';
    if (urgency === 'Medium') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  $: score = data?.compositeScore ?? 0;
  $: tier = data?.tierLabel ?? 'Early';
  $: tierColor = tierPalette[tier] ?? '#334155';
  $: gaugeStyle = `background: conic-gradient(${tierColor} 0deg ${score * 3.6}deg, rgba(148, 163, 184, 0.18) ${score * 3.6}deg 360deg);`;

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

<section class="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.24)]">
  <div class="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.96)_55%,rgba(15,118,110,0.92))] px-6 py-6 text-white">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs uppercase tracking-[0.24em] text-teal-200/80">Startup Readiness</p>
        <h2 class="mt-2 text-2xl font-black">Readiness dashboard</h2>
        <p class="mt-1 max-w-2xl text-sm text-slate-200/90">
          A weighted view across team, market, product, traction, regulatory, and funding so the strongest gaps are obvious at a glance.
        </p>
      </div>
      <div class="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90">
        Startup #{startupId}
      </div>
    </div>
  </div>

  {#if loading}
    <div class="grid gap-6 p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div class="animate-pulse rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
        <div class="mx-auto h-48 w-48 rounded-full bg-slate-200"></div>
      </div>
      <div class="space-y-4">
        <div class="h-32 rounded-3xl bg-slate-100"></div>
        <div class="h-32 rounded-3xl bg-slate-100"></div>
      </div>
    </div>
  {:else if error}
    <div class="px-6 py-10 text-sm text-red-600">{error}</div>
  {:else if data}
    <div class="grid gap-6 p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div class="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
        <div class="relative mx-auto flex h-48 w-48 items-center justify-center rounded-full" style={gaugeStyle}>
          <div class="flex h-32 w-32 flex-col items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
            <div class="text-4xl font-black text-slate-900">{score}</div>
            <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">out of 100</div>
          </div>
        </div>

        <div class="mt-5 text-center">
          <div class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Tier</div>
          <div class="mt-1 text-xl font-black" style={`color: ${tierColor};`}>{tier}</div>
        </div>

        <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <div class="flex items-center justify-between font-semibold text-slate-900">
            <span>Weighted score</span>
            <span>{score}%</span>
          </div>
          <p class="mt-2 leading-6">
            The composite score emphasizes the dimensions that matter most for execution and investability.
          </p>
        </div>
      </div>

      <div class="space-y-6">
        <div class="rounded-[1.5rem] border border-slate-200 bg-white p-5">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h3 class="text-lg font-bold text-slate-900">Dimension breakdown</h3>
              <p class="text-sm text-slate-500">Bars show the underlying dimension score with the weighted contribution attached.</p>
            </div>
          </div>

          <div class="mt-5 space-y-4">
            {#each data.dimensions as dimension}
              <div>
                <div class="mb-2 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <span class="font-semibold text-slate-900">{dimension.label}</span>
                    <span class="ml-2 text-slate-500">{Math.round(dimension.weight * 100)}% weight</span>
                  </div>
                  <div class="font-semibold text-slate-700">
                    {dimension.percent}% <span class="text-slate-400">({dimension.weightedScore.toFixed(1)} pts)</span>
                  </div>
                </div>
                <div class="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    style={`width: ${dimension.percent}%; background: linear-gradient(90deg, ${tierColor}, rgba(14, 165, 233, 0.75));`}
                  ></div>
                </div>
                <p class="mt-2 text-xs leading-5 text-slate-500">{dimension.rationale}</p>
              </div>
            {/each}
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div class="rounded-[1.5rem] border border-slate-200 bg-white p-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h3 class="text-lg font-bold text-slate-900">Top action recommendations</h3>
                <p class="text-sm text-slate-500">Ordered by the weakest weighted contribution.</p>
              </div>
            </div>

            <div class="mt-5 space-y-3">
              {#each data.recommendations as recommendation}
                <article class={`rounded-2xl border p-4 ${urgencyClass(recommendation.urgency)}`}>
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">Priority {recommendation.priority}</div>
                      <h4 class="mt-1 text-base font-bold text-slate-900">{recommendation.title}</h4>
                    </div>
                    <span class="rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]">
                      {recommendation.urgency}
                    </span>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-slate-700">{recommendation.details}</p>
                </article>
              {/each}
            </div>
          </div>

          <div class="rounded-[1.5rem] border border-slate-200 bg-white p-5">
            <h3 class="text-lg font-bold text-slate-900">Why these weights</h3>
            <div class="mt-4 space-y-3">
              {#each data.weightRationale as item}
                <div class="rounded-2xl bg-slate-50 p-4">
                  <div class="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                    <span>{item.label}</span>
                    <span>{Math.round(item.weight * 100)}%</span>
                  </div>
                  <p class="mt-2 text-sm leading-6 text-slate-600">{item.rationale}</p>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</section>
