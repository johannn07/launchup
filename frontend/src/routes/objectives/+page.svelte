<script lang="ts">
  import axiosInstance from '$lib/axios';
  import { onMount } from 'svelte';

  type ObjectiveStatus = {
    id: string;
    title: string;
    summary: string;
    backend: string[];
    frontend: string[];
    tables: string[];
    status: 'implemented' | 'partial';
  };

  type DesignStatus = {
    project: string;
    neonDbReady: boolean;
    objectives: ObjectiveStatus[];
  };

  let data: DesignStatus | null = null;
  let loading = true;
  let error = '';

  const statusTone: Record<ObjectiveStatus['status'], string> = {
    implemented: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    partial: 'border-amber-200 bg-amber-50 text-amber-700'
  };

  onMount(async () => {
    try {
      const response = await axiosInstance.get('/design/status');
      data = response.data;
    } catch (err) {
      error = 'Unable to load design status right now.';
      console.error(err);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>LaunchUp objectives</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <div class="rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.2)]">
    <div class="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.94)_50%,rgba(8,145,178,0.92))] px-6 py-8 text-white sm:px-8">
      <p class="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Software Design Description</p>
      <h1 class="mt-3 text-3xl font-black tracking-tight sm:text-4xl">LaunchUp objectives and implementation status</h1>
      <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-200/90">
        This page mirrors the SDD objectives and shows where the backend, frontend, and NeonDB schema currently carry them.
      </p>
    </div>

    {#if loading}
      <div class="grid gap-4 p-6 sm:p-8 lg:grid-cols-2">
        {#each Array.from({ length: 4 }) as _}
          <div class="h-48 animate-pulse rounded-[1.5rem] border border-slate-200 bg-slate-50"></div>
        {/each}
      </div>
    {:else if error}
      <div class="px-6 py-10 text-sm text-red-600 sm:px-8">{error}</div>
    {:else if data}
      <div class="px-6 py-6 sm:px-8">
        <div class="mb-6 flex flex-wrap items-center gap-3">
          <div class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            NeonDB ready
          </div>
          <div class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
            {data.project}
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          {#each data.objectives as objective}
            <article class="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">General Objective {objective.id}</p>
                  <h2 class="mt-2 text-xl font-black text-slate-950">{objective.title}</h2>
                </div>
                <span class={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${statusTone[objective.status]}`}>
                  {objective.status}
                </span>
              </div>

              <p class="mt-4 text-sm leading-6 text-slate-600">{objective.summary}</p>

              <div class="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Backend</p>
                  <ul class="mt-2 space-y-1 text-sm text-slate-700">
                    {#each objective.backend as item}
                      <li>{item}</li>
                    {/each}
                  </ul>
                </div>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Frontend</p>
                  <ul class="mt-2 space-y-1 text-sm text-slate-700">
                    {#each objective.frontend as item}
                      <li>{item}</li>
                    {/each}
                  </ul>
                </div>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tables</p>
                  <ul class="mt-2 space-y-1 text-sm text-slate-700">
                    {#each objective.tables as item}
                      <li>{item}</li>
                    {/each}
                  </ul>
                </div>
              </div>
            </article>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>