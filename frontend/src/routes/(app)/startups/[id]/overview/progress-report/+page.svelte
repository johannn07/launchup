<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { ChevronDown, Download } from 'lucide-svelte';
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { dur, MOVE } from '$lib/motion';
  import { RadarChartV2 } from '$lib/components/shared';
  import { useQuery } from '@sveltestack/svelte-query';
  import { getData, getStatusName } from '$lib/utils.js';
  import { READINESS_TYPES } from '$lib/readiness-dimensions';
  import * as Table from '$lib/components/ui/table';
  import html2canvas from 'html2canvas';
  import { PDFDocument } from 'pdf-lib';

  let { data } = $props();

  // Keyed by startup: one shared key served the first startup's report to the
  // next one for the cache's hour.
  const queryResult = useQuery(
    ['startupDataProgressReport', data.startupId],
    () => getData(`/progress/${data.startupId}/progress-report`, data.access!)
  );

  const downloadMultiPagePDF = async () => {
    // Every section goes into the PDF, collapsed or not.
    exporting = true;
    await tick();
    await new Promise((r) => setTimeout(r, dur(MOVE) + 150));
    try {
      const pages = document.querySelectorAll('.pdf-page');
      const tables = document.querySelectorAll('.pdf-table');
      if (pages.length === 0) {
        alert('No pages found!');
        return;
      }
      // pages.forEach((page) => {
      // 	page.style.backgroundColor = 'white';
      // 	page.style.color = 'black'
      // });

      // tables.forEach((page) => {
      // 	page.style.backgroundColor = 'white';
      // 	page.style.color = 'black'
      // });
      const pdfDoc = await PDFDocument.create();

      for (const pageElement of pages) {
        const canvas = await html2canvas(pageElement, {
          scale: 2, // Increases the resolution
          useCORS: true // Avoid cross-origin issues
        });

        const imageData = canvas.toDataURL('image/png');

        const { width, height } = canvas;

        // Page is sized to the canvas so nothing is cropped or scaled.
        const pdfPage = pdfDoc.addPage([width, height]);

        const pngImage = await pdfDoc.embedPng(imageData);
        pdfPage.drawImage(pngImage, {
          x: 0,
          y: 0,
          width,
          height
        });
      }

      const pdfBytes = await pdfDoc.save();

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${$queryResult.data.startup.name} - Progress Report.pdf`;
      link.click();

      // pages.forEach((page) => {
      // 	page.style.backgroundColor = '#020817';
      // 	page.style.color = 'white'
      // });

      // tables.forEach((page) => {
      // 	page.style.backgroundColor = '#020817';
      // 	page.style.color = 'white'
      // });
    } catch (error) {
      console.error('Error generating multi-page PDF:', error);
    } finally {
      exporting = false;
    }
  };

  type Row = { id: number; readinessType: string; [key: string]: any };

  // Latest row per dimension, in the canonical order. The API returns rows in
  // no set order and can hold more than one per dimension.
  function latestPerType<T extends Row>(rows: T[] = []): T[] {
    const latest = new Map<string, T>();
    for (const row of rows) {
      const kept = latest.get(row.readinessType);
      if (!kept || row.id > kept.id) latest.set(row.readinessType, row);
    }
    return READINESS_TYPES.flatMap((t) => latest.get(t) ?? []);
  }

  const report = $derived($queryResult.isSuccess ? $queryResult.data : null);
  const levels = $derived(latestPerType(report?.readinessLevels));
  const rnaRows = $derived(latestPerType(report?.rna));
  // Accepted items only; AI suggestions not yet accepted are left out.
  const steps = $derived(
    (report?.rns ?? [])
      .filter((r: any) => !r.isAiGenerated)
      .sort((a: any, b: any) => a.priorityNumber - b.priorityNumber)
  );
  const shortTerm = $derived(steps.filter((r: any) => r.status !== 7));
  const longTerm = $derived(steps.filter((r: any) => r.status === 7));
  const priorities = $derived(
    steps
      .map((r: any) => ({
        ...r,
        initiatives: (r.initiatives ?? []).filter((i: any) => !i.isAiGenerated)
      }))
      .filter((r: any) => r.initiatives.length > 0)
  );
  const roadblocks = $derived(
    [...(report?.roadblocks ?? [])].sort(
      (a: any, b: any) => a.riskNumber - b.riskNumber
    )
  );

  const initiativeCount = $derived(
    priorities.reduce((n: number, s: any) => n + s.initiatives.length, 0)
  );

  type SectionKey =
    | 'chart'
    | 'rna'
    | 'short'
    | 'long'
    | 'initiatives'
    | 'risks';
  const KEYS: SectionKey[] = [
    'chart',
    'rna',
    'short',
    'long',
    'initiatives',
    'risks'
  ];
  let open = $state<Record<SectionKey, boolean>>({
    chart: true,
    rna: false,
    short: false,
    long: false,
    initiatives: false,
    risks: false
  });
  let exporting = $state(false);
  const isOpen = (k: SectionKey) => exporting || open[k];
  const allOpen = $derived(KEYS.every((k) => open[k]));
  function toggleAll() {
    const next = !allOpen;
    for (const k of KEYS) open[k] = next;
  }
  const head =
    'h-11 text-left text-[12.5px] font-semibold text-[#94a3b8] first:pl-5 last:pr-5';
  const cell =
    'py-3.5 align-top text-[14px] text-[#c3ced9] first:pl-5 last:pr-5';
  const num = 'lu-num whitespace-nowrap';
</script>

<!-- One card per section: each .pdf-page becomes its own page in the PDF. -->
{#snippet empty(cols: number, text: string)}
  <Table.Row>
    <Table.Cell
      colspan={cols}
      class="py-6 text-center text-[14px] text-[#94a3b8]">{text}</Table.Cell
    >
  </Table.Row>
{/snippet}

<div class="flex items-center justify-between gap-4">
  <h1 class="lu-h2">Progress</h1>
  <div class="flex items-center gap-2">
    <button
      type="button"
      class="lu-btn lu-btn-secondary lu-btn-sm"
      onclick={toggleAll}
      disabled={!report}
    >
      {allOpen ? 'Collapse all' : 'Expand all'}
    </button>
    <button
      type="button"
      class="lu-btn lu-btn-secondary lu-btn-sm"
      onclick={downloadMultiPagePDF}
      disabled={!report || exporting}
    >
      <Download class="h-4 w-4" />
      {exporting ? 'Preparing' : 'Download PDF'}
    </button>
  </div>
</div>

{#if $queryResult.isLoading}
  <span
    class="lu-skel mt-5 h-[32rem] rounded-[1.25rem]"
    role="status"
    aria-label="Loading progress report"
  ></span>
{:else if !report}
  <p class="mt-5 text-[14px] text-[#94a3b8]">
    The progress report could not be loaded. Reload the page to try again.
  </p>
{:else}
  <div class="mt-5 grid min-w-0 gap-3">
    <Card.Root class="pdf-page min-w-0 overflow-hidden">
      {#if exporting}
        <p
          class="lu-d-xw px-4 pt-5 text-[22px] leading-tight text-white sm:px-6"
        >
          {report.startup.name} progress report
        </p>
      {/if}
      <h3>
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors duration-quick hover:bg-[#0f1a2c] sm:px-6"
          aria-expanded={isOpen('chart')}
          aria-controls="progress-chart"
          onclick={() => (open.chart = !open.chart)}
        >
          <span class="lu-d-md flex-1 text-[16px] text-white"
            >I. Readiness chart</span
          >
          <ChevronDown
            class="h-4 w-4 shrink-0 text-[#94a3b8] transition-transform duration-move {isOpen(
              'chart'
            )
              ? 'rotate-180'
              : ''}"
          />
        </button>
      </h3>
      {#if isOpen('chart')}
        <div
          id="progress-chart"
          transition:slide={{ duration: dur(MOVE) }}
          class="grid min-w-0 gap-4 border-t border-[#17213a] p-4 sm:p-6"
        >
          {#if levels.length}
            <div
              class="relative mx-auto h-[280px] w-full min-w-0 max-w-[460px] sm:h-[380px]"
            >
              <RadarChartV2
                id={Number(data.startupId)}
                min={0}
                max={9}
                data={levels.map((l: any) => l.level)}
                labels={levels.map((l: any) => l.readinessType)}
              />
            </div>
          {:else}
            <p class="text-[14px] text-[#94a3b8]">
              No readiness levels rated yet.
            </p>
          {/if}
        </div>
      {/if}
    </Card.Root>

    <Card.Root class="pdf-page min-w-0 overflow-hidden">
      <h3>
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors duration-quick hover:bg-[#0f1a2c] sm:px-6"
          aria-expanded={isOpen('rna')}
          aria-controls="progress-rna"
          onclick={() => (open.rna = !open.rna)}
        >
          <span class="lu-d-md flex-1 text-[16px] text-white">II. RNA</span>
          <span
            class="lu-num rounded-full border border-[#1f2c47] px-2 py-0.5 text-[12px] text-[#94a3b8]"
            >{rnaRows.length}</span
          >
          <ChevronDown
            class="h-4 w-4 shrink-0 text-[#94a3b8] transition-transform duration-move {isOpen(
              'rna'
            )
              ? 'rotate-180'
              : ''}"
          />
        </button>
      </h3>
      {#if isOpen('rna')}
        <div
          id="progress-rna"
          transition:slide={{ duration: dur(MOVE) }}
          class="grid min-w-0 gap-4 border-t border-[#17213a] p-4 sm:p-6"
        >
          <div
            class="min-w-0 overflow-x-auto rounded-[12px] border border-[#1f2c47]"
          >
            <Table.Root class="pdf-table">
              <Table.Header>
                <Table.Row>
                  <Table.Head class={head}>Dimension</Table.Head>
                  <Table.Head class={head}>Level</Table.Head>
                  <Table.Head class={head}>Assessment</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each rnaRows as rna (rna.id)}
                  <Table.Row>
                    <Table.Cell class="{cell} w-40"
                      >{rna.readinessType}</Table.Cell
                    >
                    <Table.Cell class="{cell} {num} w-20"
                      >{rna.readinessLevel.level}</Table.Cell
                    >
                    <Table.Cell class={cell}>{rna.rna}</Table.Cell>
                  </Table.Row>
                {:else}
                  {@render empty(3, 'No assessments yet.')}
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      {/if}
    </Card.Root>

    <Card.Root class="pdf-page min-w-0 overflow-hidden">
      <h3>
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors duration-quick hover:bg-[#0f1a2c] sm:px-6"
          aria-expanded={isOpen('short')}
          aria-controls="progress-short"
          onclick={() => (open.short = !open.short)}
        >
          <span class="lu-d-md flex-1 text-[16px] text-white"
            >III. RNS: Short Term</span
          >
          <span
            class="lu-num rounded-full border border-[#1f2c47] px-2 py-0.5 text-[12px] text-[#94a3b8]"
            >{shortTerm.length}</span
          >
          <ChevronDown
            class="h-4 w-4 shrink-0 text-[#94a3b8] transition-transform duration-move {isOpen(
              'short'
            )
              ? 'rotate-180'
              : ''}"
          />
        </button>
      </h3>
      {#if isOpen('short')}
        <div
          id="progress-short"
          transition:slide={{ duration: dur(MOVE) }}
          class="grid min-w-0 gap-4 border-t border-[#17213a] p-4 sm:p-6"
        >
          <div
            class="min-w-0 overflow-x-auto rounded-[12px] border border-[#1f2c47]"
          >
            <Table.Root class="pdf-table">
              <Table.Header>
                <Table.Row>
                  <Table.Head class={head}>#</Table.Head>
                  <Table.Head class={head}>Dimension</Table.Head>
                  <Table.Head class={head}>Target</Table.Head>
                  <Table.Head class={head}>Description</Table.Head>
                  <Table.Head class={head}>Status</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each shortTerm as step (step.id)}
                  <Table.Row>
                    <Table.Cell class="{cell} {num} w-12"
                      >{step.priorityNumber}</Table.Cell
                    >
                    <Table.Cell class="{cell} w-36"
                      >{step.readinessType}</Table.Cell
                    >
                    <Table.Cell class="{cell} {num} w-20"
                      >Level {step.targetLevelScore}</Table.Cell
                    >
                    <Table.Cell class={cell}>{step.description}</Table.Cell>
                    <Table.Cell class="{cell} w-28 whitespace-nowrap"
                      >{getStatusName(step.status)}</Table.Cell
                    >
                  </Table.Row>
                {:else}
                  {@render empty(5, 'No short-term next steps yet.')}
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      {/if}
    </Card.Root>

    <Card.Root class="pdf-page min-w-0 overflow-hidden">
      <h3>
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors duration-quick hover:bg-[#0f1a2c] sm:px-6"
          aria-expanded={isOpen('long')}
          aria-controls="progress-long"
          onclick={() => (open.long = !open.long)}
        >
          <span class="lu-d-md flex-1 text-[16px] text-white"
            >IV. RNS: Long Term</span
          >
          <span
            class="lu-num rounded-full border border-[#1f2c47] px-2 py-0.5 text-[12px] text-[#94a3b8]"
            >{longTerm.length}</span
          >
          <ChevronDown
            class="h-4 w-4 shrink-0 text-[#94a3b8] transition-transform duration-move {isOpen(
              'long'
            )
              ? 'rotate-180'
              : ''}"
          />
        </button>
      </h3>
      {#if isOpen('long')}
        <div
          id="progress-long"
          transition:slide={{ duration: dur(MOVE) }}
          class="grid min-w-0 gap-4 border-t border-[#17213a] p-4 sm:p-6"
        >
          <div
            class="min-w-0 overflow-x-auto rounded-[12px] border border-[#1f2c47]"
          >
            <Table.Root class="pdf-table">
              <Table.Header>
                <Table.Row>
                  <Table.Head class={head}>#</Table.Head>
                  <Table.Head class={head}>Dimension</Table.Head>
                  <Table.Head class={head}>Target</Table.Head>
                  <Table.Head class={head}>Description</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each longTerm as step (step.id)}
                  <Table.Row>
                    <Table.Cell class="{cell} {num} w-12"
                      >{step.priorityNumber}</Table.Cell
                    >
                    <Table.Cell class="{cell} w-36"
                      >{step.readinessType}</Table.Cell
                    >
                    <Table.Cell class="{cell} {num} w-20"
                      >Level {step.targetLevelScore}</Table.Cell
                    >
                    <Table.Cell class={cell}>{step.description}</Table.Cell>
                  </Table.Row>
                {:else}
                  {@render empty(4, 'No long-term next steps yet.')}
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      {/if}
    </Card.Root>

    <Card.Root class="pdf-page min-w-0 overflow-hidden">
      <h3>
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors duration-quick hover:bg-[#0f1a2c] sm:px-6"
          aria-expanded={isOpen('initiatives')}
          aria-controls="progress-initiatives"
          onclick={() => (open.initiatives = !open.initiatives)}
        >
          <span class="lu-d-md flex-1 text-[16px] text-white"
            >V. Initiatives</span
          >
          <span
            class="lu-num rounded-full border border-[#1f2c47] px-2 py-0.5 text-[12px] text-[#94a3b8]"
            >{initiativeCount}</span
          >
          <ChevronDown
            class="h-4 w-4 shrink-0 text-[#94a3b8] transition-transform duration-move {isOpen(
              'initiatives'
            )
              ? 'rotate-180'
              : ''}"
          />
        </button>
      </h3>
      {#if isOpen('initiatives')}
        <div
          id="progress-initiatives"
          transition:slide={{ duration: dur(MOVE) }}
          class="grid min-w-0 gap-4 border-t border-[#17213a] p-4 sm:p-6"
        >
          {#each priorities as step (step.id)}
            <div class="grid min-w-0 gap-2">
              <p class="text-[13.5px] font-semibold text-[#c3ced9]">
                Next step #{step.priorityNumber}
                <span class="font-normal text-[#94a3b8]"
                  >{step.readinessType}</span
                >
              </p>
              <div
                class="min-w-0 overflow-x-auto rounded-[12px] border border-[#1f2c47]"
              >
                <Table.Root class="pdf-table">
                  <Table.Header>
                    <Table.Row>
                      <Table.Head class={head}>#</Table.Head>
                      <Table.Head class={head}>Description</Table.Head>
                      <Table.Head class={head}>Measures</Table.Head>
                      <Table.Head class={head}>Targets</Table.Head>
                      <Table.Head class={head}>Status</Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {#each step.initiatives as initiative (initiative.id)}
                      <Table.Row>
                        <Table.Cell class="{cell} {num} w-12"
                          >{initiative.initiativeNumber}</Table.Cell
                        >
                        <Table.Cell class={cell}
                          >{initiative.description}</Table.Cell
                        >
                        <Table.Cell class={cell}
                          >{initiative.measures}</Table.Cell
                        >
                        <Table.Cell class={cell}
                          >{initiative.targets}</Table.Cell
                        >
                        <Table.Cell class="{cell} w-28 whitespace-nowrap"
                          >{getStatusName(initiative.status)}</Table.Cell
                        >
                      </Table.Row>
                    {/each}
                  </Table.Body>
                </Table.Root>
              </div>
            </div>
          {:else}
            <p class="text-[14px] text-[#94a3b8]">No initiatives yet.</p>
          {/each}
        </div>
      {/if}
    </Card.Root>

    <Card.Root class="pdf-page min-w-0 overflow-hidden">
      <h3>
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors duration-quick hover:bg-[#0f1a2c] sm:px-6"
          aria-expanded={isOpen('risks')}
          aria-controls="progress-risks"
          onclick={() => (open.risks = !open.risks)}
        >
          <span class="lu-d-md flex-1 text-[16px] text-white"
            >VI. Risks and Roadblocks</span
          >
          <span
            class="lu-num rounded-full border border-[#1f2c47] px-2 py-0.5 text-[12px] text-[#94a3b8]"
            >{roadblocks.length}</span
          >
          <ChevronDown
            class="h-4 w-4 shrink-0 text-[#94a3b8] transition-transform duration-move {isOpen(
              'risks'
            )
              ? 'rotate-180'
              : ''}"
          />
        </button>
      </h3>
      {#if isOpen('risks')}
        <div
          id="progress-risks"
          transition:slide={{ duration: dur(MOVE) }}
          class="grid min-w-0 gap-4 border-t border-[#17213a] p-4 sm:p-6"
        >
          <div
            class="min-w-0 overflow-x-auto rounded-[12px] border border-[#1f2c47]"
          >
            <Table.Root class="pdf-table">
              <Table.Header>
                <Table.Row>
                  <Table.Head class={head}>#</Table.Head>
                  <Table.Head class={head}>Risk</Table.Head>
                  <Table.Head class={head}>Fix or mitigation</Table.Head>
                  <Table.Head class={head}>Assignee</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each roadblocks as roadblock (roadblock.id)}
                  <Table.Row>
                    <Table.Cell class="{cell} {num} w-12"
                      >{roadblock.riskNumber}</Table.Cell
                    >
                    <Table.Cell class={cell}>{roadblock.description}</Table.Cell
                    >
                    <Table.Cell class={cell}>{roadblock.fix}</Table.Cell>
                    <Table.Cell class="{cell} w-36"
                      >{roadblock.assignee
                        ? `${roadblock.assignee.firstName} ${roadblock.assignee.lastName}`
                        : 'Unassigned'}</Table.Cell
                    >
                  </Table.Row>
                {:else}
                  {@render empty(4, 'No roadblocks recorded.')}
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      {/if}
    </Card.Root>
  </div>
{/if}
