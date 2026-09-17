<script lang="ts">
  import axiosInstance from '$lib/axios';
  import { onMount } from 'svelte';
  import { AlertCircle, Inbox } from 'lucide-svelte';

  type DimensionKey =
    | 'team'
    | 'market'
    | 'product'
    | 'traction'
    | 'regulatory'
    | 'funding';

  type Dimension = {
    key: DimensionKey;
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
    dimension: DimensionKey;
    title: string;
    details: string;
  };

  type WeightRationale = {
    key: DimensionKey;
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

  let {
    startupId = 1,
    previewData = null
  }: { startupId?: number; previewData?: ReadinessResponse | null } = $props();

  let data = $state<ReadinessResponse | null>(previewData);
  let loading = $state(previewData === null);
  let error = $state('');
  let activeTab = $state<'dimensions' | 'actions' | 'weights'>('dimensions');

  const TABS = [
    { id: 'dimensions', label: 'Dimension breakdown' },
    { id: 'actions', label: 'Top actions' },
    { id: 'weights', label: 'Why these weights' }
  ] as const;

  /* Status colour is the page's only licensed colour, and it is earned: it
     encodes where a score sits, not decoration. Tokens only — no new hues. */
  const OK = '#34d399';
  const WARN = '#fbbf24';
  const BAD = '#fb7185';

  function bandFor(percent: number) {
    if (percent >= 70) return { colour: OK, label: 'On track' };
    if (percent >= 45) return { colour: WARN, label: 'Needs work' };
    return { colour: BAD, label: 'At risk' };
  }

  const urgencyColour: Record<Recommendation['urgency'], string> = {
    High: BAD,
    Medium: WARN,
    Low: OK
  };

  const score = $derived(data?.compositeScore ?? 0);
  const tier = $derived(data?.tierLabel ?? '—');
  const band = $derived(bandFor(score));

  // Drawn as a ring rather than a filled disc, so the number stays the focus.
  const gauge = $derived(
    `background: conic-gradient(${band.colour} 0deg ${score * 3.6}deg, #17213a ${score * 3.6}deg 360deg);`
  );

  const weakest = $derived(
    data ? [...data.dimensions].sort((a, b) => a.percent - b.percent)[0] : null
  );

  onMount(async () => {
    if (previewData) return; // dev preview supplies its own data
    try {
      const response = await axiosInstance.post('/readiness/score', {
        startupId
      });
      data = response.data;
    } catch (err) {
      error = 'Unable to load the readiness assessment right now.';
      console.error(err);
    } finally {
      loading = false;
    }
  });
</script>

{#snippet meter(percent: number, colour: string)}
  <div class="h-1.5 w-full overflow-hidden rounded-full bg-[#17213a]">
    <div
      class="h-full rounded-full transition-[width] duration-700 ease-out"
      style="width:{percent}%; background:{colour}"
    ></div>
  </div>
{/snippet}

<section class="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
  <!-- ============ Summary: the one number that matters ============ -->
  <div class="rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] p-6">
    {#if loading}
      <div
        class="mx-auto h-40 w-40 animate-pulse rounded-full bg-[#17213a]"
      ></div>
      <div
        class="mx-auto mt-6 h-5 w-24 animate-pulse rounded bg-[#17213a]"
      ></div>
    {:else if data}
      <div
        class="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full"
        style={gauge}
        role="img"
        aria-label="Composite readiness score {score} out of 100"
      >
        <div
          class="flex h-[8.5rem] w-[8.5rem] flex-col items-center justify-center rounded-full bg-[#0b1220]"
        >
          <span class="lu-d-xw lu-num text-[42px] leading-none text-white"
            >{score}</span
          >
          <span class="mt-1 text-[12px] text-[#94a3b8]">out of 100</span>
        </div>
      </div>

      <div class="mt-6 flex items-center justify-center gap-2">
        <span class="h-2 w-2 rounded-full" style="background:{band.colour}"
        ></span>
        <span class="lu-d-md text-[17px] text-white">{tier}</span>
      </div>

      <dl
        class="mt-6 divide-y divide-[#17213a] border-t border-[#17213a] text-[13.5px]"
      >
        <div class="flex items-baseline justify-between gap-3 py-2.5">
          <dt class="text-[#94a3b8]">Status</dt>
          <dd class="font-semibold" style="color:{band.colour}">
            {band.label}
          </dd>
        </div>
        {#if weakest}
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="text-[#94a3b8]">Weakest scale</dt>
            <dd class="font-semibold text-[#f1f5f9]">{weakest.label}</dd>
          </div>
        {/if}
        <div class="flex items-baseline justify-between gap-3 py-2.5">
          <dt class="text-[#94a3b8]">Scales assessed</dt>
          <dd class="lu-num font-semibold text-[#f1f5f9]">
            {data.dimensions.length}
          </dd>
        </div>
      </dl>
    {/if}
  </div>

  <!-- ============ Detail ============ -->
  <div
    class="min-w-0 rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] p-5 sm:p-6"
  >
    <div
      class="inline-flex flex-wrap gap-1 rounded-full border border-[#1f2c47] bg-[#07111f] p-1"
      role="tablist"
    >
      {#each TABS as t (t.id)}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === t.id}
          class="rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8] {activeTab ===
          t.id
            ? 'bg-[#4f46e5] text-white'
            : 'text-[#94a3b8] hover:text-[#f1f5f9]'}"
          onclick={() => (activeTab = t.id)}
        >
          {t.label}
        </button>
      {/each}
    </div>

    <div class="mt-5 min-h-[26rem]">
      {#if loading}
        <div class="space-y-4">
          {#each [0, 1, 2, 3, 4] as i (i)}
            <div class="animate-pulse">
              <div class="mb-2 h-3.5 w-40 rounded bg-[#17213a]"></div>
              <div class="h-1.5 w-full rounded-full bg-[#17213a]"></div>
            </div>
          {/each}
        </div>
      {:else if error}
        <p class="lu-alert" role="alert">
          <AlertCircle class="mt-0.5 h-4 w-4 flex-none" />
          <span>{error}</span>
        </p>
      {:else if !data}
        <div
          class="flex flex-col items-center justify-center py-16 text-center"
        >
          <Inbox class="h-6 w-6 text-[#54648a]" />
          <p class="lu-d-md mt-3 text-[15px] text-white">No assessment yet</p>
          <p
            class="mt-1.5 max-w-[34ch] text-[13.5px] leading-[1.6] text-[#94a3b8]"
          >
            Submit an application and the six readiness scales will be scored
            here.
          </p>
        </div>
      {:else if activeTab === 'dimensions'}
        <p class="text-[13.5px] text-[#94a3b8]">
          Each bar is the dimension score. The weighted contribution to the
          composite is on the right.
        </p>
        <div class="mt-4 divide-y divide-[#17213a] border-t border-[#17213a]">
          {#each data.dimensions as d (d.key)}
            {@const b = bandFor(d.percent)}
            <div class="py-4">
              <div class="flex items-baseline justify-between gap-4">
                <p class="text-[14.5px] font-semibold text-[#f1f5f9]">
                  {d.label}
                  <span
                    class="lu-num ml-1.5 text-[12.5px] font-medium text-[#94a3b8]"
                  >
                    {Math.round(d.weight * 100)}% weight
                  </span>
                </p>
                <p
                  class="lu-num shrink-0 text-[14.5px] font-semibold text-white"
                >
                  {d.percent}%
                  <span class="font-normal text-[#94a3b8]"
                    >({d.weightedScore.toFixed(1)} pts)</span
                  >
                </p>
              </div>
              <div class="mt-2.5">{@render meter(d.percent, b.colour)}</div>
              <p class="mt-2 text-[13px] leading-[1.6] text-[#94a3b8]">
                {d.rationale}
              </p>
            </div>
          {/each}
        </div>
      {:else if activeTab === 'actions'}
        <p class="text-[13.5px] text-[#94a3b8]">
          Ordered by weakest weighted contribution.
        </p>
        <ol class="mt-4 space-y-3">
          {#each data.recommendations as r (r.priority)}
            <li
              class="rounded-[1rem] border border-[#1f2c47] bg-[#07111f] p-4 transition-colors hover:border-[#2b3a5c]"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex min-w-0 items-baseline gap-2.5">
                  <span
                    class="lu-num lu-d shrink-0 text-[15px]"
                    style="color:{urgencyColour[r.urgency]}">{r.priority}</span
                  >
                  <h3
                    class="text-[15px] font-semibold leading-[1.4] text-white"
                  >
                    {r.title}
                  </h3>
                </div>
                <span
                  class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold"
                  style="color:{urgencyColour[
                    r.urgency
                  ]}; border-color:{urgencyColour[
                    r.urgency
                  ]}40; background:{urgencyColour[r.urgency]}14"
                >
                  {r.urgency}
                </span>
              </div>
              <p
                class="mt-2.5 pl-[1.6rem] text-[13.5px] leading-[1.65] text-[#c3ced9]"
              >
                {r.details}
              </p>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="text-[13.5px] text-[#94a3b8]">
          Weights are fixed per stage, not tuned per startup, so scores stay
          comparable.
        </p>
        <div class="mt-4 divide-y divide-[#17213a] border-t border-[#17213a]">
          {#each data.weightRationale as w (w.key)}
            <div class="py-4">
              <div class="flex items-baseline justify-between gap-4">
                <p class="text-[14.5px] font-semibold text-[#f1f5f9]">
                  {w.label}
                </p>
                <p class="lu-num text-[14.5px] font-semibold text-[#818cf8]">
                  {Math.round(w.weight * 100)}%
                </p>
              </div>
              <p class="mt-1.5 text-[13px] leading-[1.6] text-[#94a3b8]">
                {w.rationale}
              </p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</section>
